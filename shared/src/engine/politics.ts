import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import type { LobbyFocus } from '../types/politics.js';
import { LOBBY_COST, LOBBY_LABELS } from '../types/politics.js';
import { stream } from './rng.js';
import { schedule } from './stateHelpers.js';

/**
 * Politik-Engine (Phase 22). Lobbying baut politisches Kapital auf (skaliert mit
 * Governance), das Steuererleichterung, Subventionen und Zugang freischaltet —
 * gegen ein wachsendes Skandal-Risiko. Golden-Master-sicher: ohne Lobbying
 * bleiben Kapital & Exposure inert, tickPolitics ist dann ein No-op.
 */

const MAX_TAX_RELIEF = 0.03; // max. 3 Prozentpunkte auf den effektiven Steuersatz

/** Kapitalzuwachs eines Lobby-Zugs (skaliert mit Governance-Kompetenz). */
export function lobbyGain(state: CompanyState): number {
  const gov = state.ceo.skills.governance ?? 50;
  return Math.round(6 + gov / 12); // ~10..14
}

/** Führt einen Lobby-Zug aus (Kosten via schedule; Kapital/Exposure/Boni). */
export function doLobby(state: CompanyState, focus: LobbyFocus, occ: Occurrence[], decisionId: string | null): { summaryDe: string; notesDe: string[] } {
  const pol = state.politics;
  const cost = LOBBY_COST[focus];
  schedule(state, 0, `Lobbying ${LOBBY_LABELS[focus]} W${state.meta.week}`, decisionId, { kind: 'ONE_OFF_COST', amount: cost, labelDe: `Lobbying: ${LOBBY_LABELS[focus]}` });
  pol.lobbyingSpendTotal += cost;
  pol.politicalCapital = clamp(pol.politicalCapital + lobbyGain(state), 0, 100);
  pol.exposure = clamp(pol.exposure + (focus === 'zugang' ? 4 : 7), 0, 100);

  const notes: string[] = [`Politisches Kapital: ${Math.round(pol.politicalCapital)}/100 · Skandal-Risiko: ${Math.round(pol.exposure)}/100.`];
  let summary = `Lobbying (${LOBBY_LABELS[focus]}) — Einfluss +${lobbyGain(state)}`;

  if (focus === 'steuern' && pol.politicalCapital >= 55 && pol.taxReliefPct < MAX_TAX_RELIEF) {
    pol.taxReliefPct = MAX_TAX_RELIEF;
    pol.logDe.unshift(`W${state.meta.week}: Steuererleichterung erwirkt (−${(MAX_TAX_RELIEF * 100).toFixed(0)} Pp. effektiver Satz).`);
    summary = 'Lobbyerfolg: Steuererleichterung erwirkt';
    notes.push('Ein günstiger Passus in der Steuerreform senkt euren effektiven Satz dauerhaft um 3 Prozentpunkte.');
    occ.push({ icon: '🏛️', textDe: 'Lobbyerfolg: eine Steuererleichterung senkt euren effektiven Steuersatz um 3 Pp.', severity: 'good' });
  } else if (focus === 'subvention' && pol.politicalCapital >= 45) {
    const grant = Math.round(60_000 + pol.politicalCapital * 1600);
    // Bilanzkonform: Zufluss auf Cash + Gegenbuchung in die Gewinnrücklage.
    state.finance.cash += grant;
    state.finance.retainedEarnings += grant;
    pol.subsidiesWon += grant;
    pol.logDe.unshift(`W${state.meta.week}: Fördermittel erhalten (${Math.round(grant / 1000)} k€).`);
    summary = `Lobbyerfolg: Fördermittel ${Math.round(grant / 1000)} k€`;
    notes.push('Ein Förderprogramm zahlt einen einmaligen Zuschuss aufs Firmenkonto.');
    occ.push({ icon: '🏦', textDe: `Fördermittel bewilligt: ${Math.round(grant / 1000)} k€ Zuschuss fließen aufs Firmenkonto.`, severity: 'good' });
  } else if (focus === 'zugang') {
    pol.exposure = clamp(pol.exposure - 2, 0, 100); // Beziehungspflege wirkt diskreter
    pol.regulatoryPressure = clamp(pol.regulatoryPressure - 8, 0, 100); // Zugang senkt regulatorische Aufmerksamkeit
    notes.push('Türen öffnen sich: mehr Zugang, weniger Angriffsfläche und geringerer Regulierungsdruck — die Grundlage für spätere Erfolge.');
  } else {
    notes.push(`Noch nicht genug Einfluss für einen ${focus === 'steuern' ? 'Steuer-' : 'Förder-'}erfolg — weiter aufbauen (Schwelle ${focus === 'steuern' ? 55 : 45}).`);
  }
  return { summaryDe: summary, notesDe: notes };
}

// ── Wochentick ──────────────────────────────────────────────────────
export function tickPolitics(state: CompanyState, occ: Occurrence[]): void {
  const pol = state.politics;
  if (pol.politicalCapital <= 8 && pol.exposure <= 0) return; // inert ohne Lobbying

  // Kapital & Exposure klingen langsam ab.
  pol.politicalCapital = clamp(pol.politicalCapital - 0.3, 0, 100);
  pol.exposure = clamp(pol.exposure - 1.2, 0, 100);

  // Hohe Exposure ⇒ Risiko eines Lobbyismus-Skandals (seed-gerollt).
  if (pol.exposure >= 55 && state.meta.week - pol.lastScandalWeek > 8) {
    const rng = stream(state.meta.seed, 'politics-scandal', state.meta.week);
    if (rng() < (pol.exposure - 45) / 300) {
      pol.lastScandalWeek = state.meta.week;
      pol.exposure = clamp(pol.exposure - 25, 0, 100);
      pol.politicalCapital = clamp(pol.politicalCapital - 12, 0, 100);
      state.reputation.press = clamp(state.reputation.press - 8, 0, 100);
      state.reputation.investors = clamp(state.reputation.investors - 6, 0, 100);
      state.ceo.reputation = clamp(state.ceo.reputation - 5, 0, 100);
      pol.logDe.unshift(`W${state.meta.week}: Lobbyismus-Skandal — die Presse deckt eure Einflussnahme auf.`);
      occ.push({ icon: '🔥', textDe: 'Lobbyismus-Skandal: Recherchen legen eure Einflussnahme offen — Presse & Investoren reagieren empört.', severity: 'bad' });
    }
  }
}

/** Effektive Steuererleichterung aus Lobbying (0..0,03). */
export function politicsTaxRelief(state: CompanyState): number {
  return clamp(state.politics?.taxReliefPct ?? 0, 0, MAX_TAX_RELIEF);
}

export function politicsSummaryDe(state: CompanyState): string {
  const pol = state.politics;
  return `Politisches Kapital ${Math.round(pol.politicalCapital)}/100, Skandal-Risiko ${Math.round(pol.exposure)}/100${pol.taxReliefPct > 0 ? `, Steuererleichterung −${(pol.taxReliefPct * 100).toFixed(0)} Pp.` : ''}`;
}

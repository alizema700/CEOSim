import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import { MACRO_SHOCK_SPECS, type MacroShockKind } from '../types/macro.js';
import { stream } from './rng.js';
import { addMessage, assistantSender } from './comms.js';
import { nextId } from './stateHelpers.js';

/**
 * Wirtschaftsschock-Episoden (Phase 22, M4). Benannte Großereignisse (Zinsschock,
 * Tech-Hype, Energiekrise, …) mit mehrwöchigem Bogen und echten Effekten auf
 * Stimmung, Inflation, Kapitalmarkt und Nachfrage.
 *
 * Läuft NACH tickMacro (das die Basiswerte setzt) und legt seine Effekte darüber:
 * einmalige Impulse (Onset) auf die Treiber Stimmung/Inflation/Kapitalmarkt plus
 * Nachfrage-Modifikatoren, solange die Episode aktiv ist. Keine Direkt-Buchungen
 * ⇒ bilanz-/cashflow-invariant-sicher.
 *
 * Golden-Master-sicher: eine neue Episode wird erst ab SHOCK_MIN_WEEK ausgewürfelt.
 * Der Golden-Master-Lauf endet in Woche 25 — er sieht daher nie einen Schock.
 */

const SHOCK_SOURCE = 'Wirtschaftsschock';
const SHOCK_MIN_WEEK = 26; // Aufwärmphase: hält früh + Golden-Master (25 Wo.) schockfrei.
const SHOCK_COOLDOWN = 14; // Wochen Ruhe zwischen zwei Episoden.
const SHOCK_ROLL_PROB = 0.05; // pro berechtigter Woche.

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Gewichtete Auswahl der Schock-Art (etwas mehr Gegenwind als Rückenwind). */
function pickShockKind(r: number): MacroShockKind {
  if (r < 0.2) return 'zinsschock';
  if (r < 0.37) return 'energiekrise';
  if (r < 0.52) return 'bankenbeben';
  if (r < 0.64) return 'lieferkette';
  if (r < 0.84) return 'techhype';
  return 'wachstumswunder';
}

export function tickMacroShocks(state: CompanyState, occ: Occurrence[]): void {
  const m = state.macro;
  const week = state.meta.week;
  // Schock-Modifikatoren der Vorwoche zurücksetzen (werden bei aktiver Episode neu gesetzt).
  state.activeModifiers = state.activeModifiers.filter((mm) => mm.sourceDe !== SHOCK_SOURCE);

  // ── Neue Episode auswürfeln (streng gegated) ─────────────────────────
  if (!m.shock && week >= SHOCK_MIN_WEEK && week - m.lastShockEpisodeWeek >= SHOCK_COOLDOWN) {
    const rng = stream(state.meta.seed, 'macro-shock', week);
    if (rng() < SHOCK_ROLL_PROB) {
      const kind = pickShockKind(rng());
      const spec = MACRO_SHOCK_SPECS[kind];
      m.shock = { kind, startWeek: week, endWeek: week + spec.durationWeeks, headlineDe: spec.headlineDe };
      // Einmalige Impulse auf die Treiber (wirken nach, klingen über tickMacro ab).
      m.sentiment = clamp(m.sentiment + spec.sentimentKick, -100, 100);
      m.inflationPct = round1(clamp(m.inflationPct + spec.inflationKick, 0.2, 12));
      m.capitalIndex = round1(clamp(m.capitalIndex + spec.capKick, 35, 260));
      // Zins sofort an die neue Inflations-/Stimmungslage anpassen (spiegelt tickMacro,
      // hier bis 12 % offen, damit ein Zinsschock diese Woche schon durchschlägt).
      m.interestRatePct = round1(clamp(0.6 + m.inflationPct * 0.9 + m.sentiment / 90, 1, 12));
      m.lastHeadlineDe = spec.headlineDe;
      occ.push({ icon: spec.emoji, textDe: `${spec.labelDe}: ${spec.headlineDe}`, severity: spec.tone === 'good' ? 'good' : spec.tone === 'warn' ? 'warn' : 'bad' });
      addMessage(state, {
        from: assistantSender(state),
        subjectDe: `Wirtschaftsschock: ${spec.labelDe}`,
        bodyDe: `eine Meldung von den Märkten: ${spec.headlineDe} Das prägt die kommenden ~${spec.durationWeeks} Wochen — Stimmung ${Math.round(m.sentiment)}, Inflation ${m.inflationPct.toFixed(1)} %, Referenzzins ${m.interestRatePct.toFixed(1)} %, Kapitalmarkt-Index ${Math.round(m.capitalIndex)}. Wirkung auf Nachfrage, Finanzierungsklima und Bewertungen siehst du im Markt.`,
        kind: 'system', eventInstanceId: null, delegable: false, suggestedActionType: null, templateId: 'macro-shock', priority: spec.tone === 'bad' ? 'hoch' : 'normal',
      });
    }
  }

  // ── Laufende Episode: Ablauf zuerst, sonst Nachfrage-Modifikatoren ────
  if (m.shock) {
    const spec = MACRO_SHOCK_SPECS[m.shock.kind];
    if (week >= m.shock.endWeek) {
      m.shock = null;
      m.lastShockEpisodeWeek = week;
      m.lastHeadlineDe = spec.recoveryDe;
      occ.push({ icon: '🌤️', textDe: `Entspannung: ${spec.recoveryDe}`, severity: 'good' });
    } else {
      if (spec.leadFactor !== 1) state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'leadGen', factor: spec.leadFactor, startWeek: week, endWeek: week + 1, sourceDe: SHOCK_SOURCE });
      if (spec.winFactor !== 1) state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'trialWinRate', factor: spec.winFactor, startWeek: week, endWeek: week + 1, sourceDe: SHOCK_SOURCE });
    }
  }
}

/** Kurzstatus der aktiven Schock-Episode (fürs UI/Personas), sonst ''. */
export function macroShockSummaryDe(state: CompanyState): string {
  const s = state.macro.shock;
  if (!s) return '';
  const spec = MACRO_SHOCK_SPECS[s.kind];
  const left = Math.max(0, s.endWeek - state.meta.week);
  return `${spec.labelDe} (noch ~${left} Wo.): ${spec.headlineDe}`;
}

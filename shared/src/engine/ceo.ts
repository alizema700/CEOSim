import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import type { CeoFocus } from '../types/ceo.js';
import { FOCUS_POINTS } from '../types/ceo.js';
import { computeValuation } from './kpis.js';
import { nextId } from './stateHelpers.js';

/**
 * „Der CEO als Mensch" (Phase 12). Deterministische Schicht rund um die Person:
 * - persönliches Netto-Vermögen (Gehalt nach Steuer + erhaltene Dividenden),
 * - Energie/Gesundheit mit Burnout-Risiko bei Dauerlast,
 * - wöchentliche Fokus-Verteilung mit echten Trade-offs.
 *
 * Golden-Master-sicher: bei ausgeglichenem Fokus (Default) entstehen KEINE
 * Modifikatoren und keine Vertrauens-/Reputations-Nudges; Energie & Netto-Cash
 * sind nicht Teil der eingefrorenen Kennwerte.
 */

const WEEKS_PER_MONTH = 52 / 12;
/** Vereinfachter persönlicher Grenzsteuersatz (ESt + Soli) auf das CEO-Gehalt. */
export const PERSONAL_TAX_RATE = 0.42;
const ENERGY_BASELINE = 78;
const FOCUS_SOURCE = 'CEO-Fokus';

/** Persönliches Vermögen des CEO: kumuliertes Netto + Wert des Anteils. */
export function ceoNetWorth(state: CompanyState): { netCash: number; equityValue: number; total: number; sharePrice: number | null } {
  const ipo = state.ipo;
  let equityValue: number;
  let sharePrice: number | null = null;
  if (ipo.status === 'public' && ipo.sharePrice !== null) {
    equityValue = state.ceo.equityShare * ipo.sharePrice * ipo.sharesOutstanding;
    sharePrice = ipo.sharePrice;
  } else {
    equityValue = state.ceo.equityShare * computeValuation(state).value;
  }
  return { netCash: state.ceo.personalNetCash, equityValue, total: state.ceo.personalNetCash + equityValue, sharePrice };
}

/** Zuspitzung des Fokus: 0 = ausgeglichen, →1 = alles auf ein Feld. */
export function focusIntensity(f: CeoFocus): number {
  const vals = [f.produkt, f.vertrieb, f.team, f.investoren, f.aussenwirkung];
  const over = vals.reduce((s, v) => s + Math.max(0, v - 1), 0);
  return clamp(over / (FOCUS_POINTS - 1), 0, 1);
}

/** Ziel-Energie aus der Unternehmenslage (Stress senkt, Ruhe & Coaching heben). */
function energyTarget(state: CompanyState): number {
  let t = ENERGY_BASELINE;
  t -= state.openEvents.filter((e) => e.status === 'open').length * 6;
  if (state.ceo.probation) t -= 12;
  t -= focusIntensity(state.ceo.focus) * 8; // zugespitzter Fokus ist anstrengend
  if (state.ceo.coach) t += 4; // Coaching stärkt Resilienz
  return clamp(t, 10, 100);
}

// ── Wochentick (früh im closeWeek, VOR Personal/Kunden) ────────────────
export function tickCeo(state: CompanyState, occ: Occurrence[]): void {
  const ceo = state.ceo;
  const wf = 1 / WEEKS_PER_MONTH;

  // 1) Persönliches Netto-Vermögen: Gehalt nach Steuer akkumulieren.
  ceo.personalNetCash += ceo.salaryMonthly * wf * (1 - PERSONAL_TAX_RATE);

  // 2) Energie driftet zum Zielwert.
  const prev = ceo.energy;
  ceo.energy = clamp(ceo.energy + (energyTarget(state) - ceo.energy) * 0.25, 0, 100);
  if (prev >= 25 && ceo.energy < 25) {
    occ.push({ icon: '🪫', textDe: 'Warnsignal: Deine Energie ist im roten Bereich. Dauerlast kostet Urteilskraft — Erholung oder mehr Delegation wären jetzt klug.', severity: 'warn' });
  }

  // 3) Fokus-Modifikatoren für die laufende Woche setzen (bei Default: keine).
  applyFocusModifiers(state);

  // 4) Coaching hebt die Zielkompetenz langsam (energieabhängig).
  if (ceo.coach) {
    ceo.skills[ceo.coach.skill] = clamp(ceo.skills[ceo.coach.skill] + 0.25 * (ceo.energy / ENERGY_BASELINE), 0, 100);
  }

  // 5) Privatleben & Netzwerk driften passiv (Golden-Master-sicher: schreibt
  //    NUR personal.*, greift nicht in Energie/Vertrauen/KPIs ein).
  tickCeoPersonal(state);
}

/** Passive Drift von Gesundheit, Work-Life-Balance & Netzwerk. */
export function tickCeoPersonal(state: CompanyState): void {
  const p = state.ceo.personal;
  const energy = state.ceo.energy;
  const openLoad = state.openEvents.filter((e) => e.status === 'open').length;
  const healthTarget = clamp(52 + energy * 0.38, 20, 96); // niedrige Energie zieht Gesundheit
  const wlTarget = clamp(74 - focusIntensity(state.ceo.focus) * 26 - openLoad * 4, 15, 90);
  p.health = clamp(p.health + (healthTarget - p.health) * 0.06, 0, 100);
  p.workLife = clamp(p.workLife + (wlTarget - p.workLife) * 0.06, 0, 100);
  p.network = clamp(p.network + (36 - p.network) * 0.02, 0, 100); // verfällt ohne Pflege
}

/** Erholungs-Multiplikator aus Gesundheit & Work-Life (für die Auszeit). */
export function restQuality(state: CompanyState): number {
  const p = state.ceo.personal;
  return clamp(0.7 + (p.health + p.workLife) / 400, 0.7, 1.35);
}

function applyFocusModifiers(state: CompanyState): void {
  const week = state.meta.week;
  state.activeModifiers = state.activeModifiers.filter((m) => m.sourceDe !== FOCUS_SOURCE);
  const f = state.ceo.focus;
  const scale = clamp(state.ceo.energy / ENERGY_BASELINE, 0.3, 1.2);
  const addMod = (target: import('../types/effects.js').ModifierTarget, points: number, per: number) => {
    const delta = points - 1;
    if (delta === 0) return;
    state.activeModifiers.push({ id: nextId(state, 'mod'), target, factor: 1 + delta * per * scale, startWeek: week, endWeek: week + 1, sourceDe: FOCUS_SOURCE });
  };
  addMod('velocity', f.produkt, 0.05);
  addMod('leadGen', f.vertrieb, 0.05);
  addMod('trialWinRate', f.vertrieb, 0.02);
  addMod('attritionRisk', f.team, -0.06); // mehr Team-Fokus senkt das Kündigungsrisiko
  // Investoren-/Außenwirkung als kleine direkte Nudges (nur bei Abweichung von 1).
  const nudge = (points: number, per: number) => (points - 1) * per * scale;
  if (f.investoren !== 1) {
    state.ceo.boardTrust = clamp(state.ceo.boardTrust + nudge(f.investoren, 0.4), 0, 100);
  }
  if (f.aussenwirkung !== 1) {
    state.reputation.press = clamp(state.reputation.press + nudge(f.aussenwirkung, 0.5), 0, 100);
    state.reputation.laborMarket = clamp(state.reputation.laborMarket + nudge(f.aussenwirkung, 0.3), 0, 100);
  }
}

/** Menschenlesbarer Status für UI/Personas. */
export function ceoLifeSummaryDe(state: CompanyState): string {
  const nw = ceoNetWorth(state);
  const eur = (v: number) => Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)} M€` : `${Math.round(v / 1000)} k€`;
  return `Energie ${Math.round(state.ceo.energy)}/100 · Netto-Vermögen ~${eur(nw.total)} (Anteil ${(state.ceo.equityShare * 100).toFixed(1)} %)`;
}

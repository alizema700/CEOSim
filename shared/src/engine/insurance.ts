import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import { INSURANCE_KINDS, INSURANCE_SPECS, type ClaimKind, type InsuranceKind } from '../types/insurance.js';

/**
 * Versicherungs-Engine (Phase 22, V1). Prämien der aktiven Policen fließen als
 * G&A-Kosten in die GuV; im Schadensfall deckt die passende Police einen Teil des
 * Schadens (fileInsuranceClaim). Golden-Master-sicher: ohne aktive Police 0 Prämie
 * und 0 Deckung.
 */

/** Summe der monatlichen Prämien aller aktiven Policen (fließt in die G&A-Kosten). */
export function insurancePremiumMonthly(state: CompanyState): number {
  const ins = state.insurance;
  if (!ins) return 0;
  let sum = 0;
  for (const kind of INSURANCE_KINDS) {
    if (ins.policies[kind]?.active) sum += INSURANCE_SPECS[kind].monthlyPremium;
  }
  return sum;
}

/** Klassifiziert eine Skandal-/Schaden-Schlagzeile in eine Schadensart. */
export function classifyClaim(topicDe: string): ClaimKind {
  const t = topicDe.toLowerCase();
  if (/daten|cyber|breach|panne|hack|it-|meldepflicht/.test(t)) return 'cyber';
  if (/betrug|untreue|unterschlag|fraud|veruntreu/.test(t)) return 'fraud';
  return 'legal';
}

/**
 * Meldet einen Schaden und gibt die von der besten aktiven Police gedeckte Summe
 * zurück (bucht sie NICHT selbst — der Aufrufer verrechnet sie mit dem Ledger/Kosten).
 * Aktualisiert Versicherungs-Buchhaltung, Chronik und Occurrence.
 */
export function fileInsuranceClaim(state: CompanyState, claimKind: ClaimKind, grossLoss: number, reasonDe: string, occ: Occurrence[]): number {
  const ins = state.insurance;
  if (!ins || grossLoss <= 0) return 0;
  let bestCovered = 0;
  let bestKind: InsuranceKind | null = null;
  for (const kind of INSURANCE_KINDS) {
    const pol = ins.policies[kind];
    const spec = INSURANCE_SPECS[kind];
    if (!pol?.active || !spec.covers.includes(claimKind)) continue;
    const covered = Math.min(grossLoss * spec.coverage, spec.capPerClaim);
    if (covered > bestCovered) { bestCovered = covered; bestKind = kind; }
  }
  if (bestKind === null || bestCovered <= 0) return 0;
  bestCovered = Math.round(bestCovered);
  ins.policies[bestKind].claimsPaid += bestCovered;
  ins.claimsPaidTotal += bestCovered;
  ins.logDe.unshift(`W${state.meta.week}: ${INSURANCE_SPECS[bestKind].labelDe} zahlt ${Math.round(bestCovered / 1000)} k€ (${reasonDe}).`);
  occ.push({ icon: '🛡️', textDe: `Versicherung greift: ${INSURANCE_SPECS[bestKind].labelDe} übernimmt ${Math.round(bestCovered / 1000)} k€ des Schadens.`, severity: 'good' });
  return bestCovered;
}

/** Police abschließen. */
export function buyInsurance(state: CompanyState, kind: InsuranceKind): void {
  const pol = state.insurance.policies[kind];
  pol.active = true;
  pol.sinceWeek = state.meta.week;
  state.insurance.logDe.unshift(`W${state.meta.week}: Police abgeschlossen — ${INSURANCE_SPECS[kind].labelDe} (${INSURANCE_SPECS[kind].monthlyPremium.toLocaleString('de-DE')} €/Monat).`);
}

/** Police kündigen. */
export function cancelInsurance(state: CompanyState, kind: InsuranceKind): void {
  state.insurance.policies[kind].active = false;
  state.insurance.logDe.unshift(`W${state.meta.week}: Police gekündigt — ${INSURANCE_SPECS[kind].labelDe}.`);
}

/** Kurzstatus fürs UI/Personas. */
export function insuranceSummaryDe(state: CompanyState): string {
  const ins = state.insurance;
  if (!ins) return 'keine Versicherungen';
  const active = INSURANCE_KINDS.filter((k) => ins.policies[k].active);
  if (active.length === 0) return 'keine Policen aktiv (volles Eigenrisiko)';
  return `${active.length} Police(n) aktiv (${Math.round(insurancePremiumMonthly(state) / 1000 * 10) / 10} k€/Monat), Deckung bisher ${Math.round(ins.claimsPaidTotal / 1000)} k€`;
}

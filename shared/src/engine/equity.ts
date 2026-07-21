import type { CompanyState } from '../types/company.js';
import type { EquityGrant, Employee } from '../types/people.js';

/**
 * ESOP-Beteiligung (Phase 10). Deterministische Vesting-Rechnung mit Cliff.
 * Der ESOP-Pool ist der cap-table-Eintrag „esop"; Einzel-Grants allokieren
 * innerhalb dieses Pools (die Cap-Table-Summe bleibt unberührt). Bei Abgang
 * verschwindet der Grant mit der Person — der unverdiente Teil ist damit
 * automatisch wieder frei.
 */

export const ESOP_CLIFF_WEEKS = 52; // 1 Jahr
export const ESOP_VEST_WEEKS = 208; // 4 Jahre

/** Gevesteter Anteil des Grants (0..1) zur gegebenen Woche. */
export function vestedFraction(grant: EquityGrant, week: number): number {
  const elapsed = week - grant.grantWeek;
  if (elapsed < grant.cliffWeeks) return 0; // Cliff: noch nichts
  if (elapsed >= grant.vestWeeks) return 1; // voll gevestet
  return elapsed / grant.vestWeeks; // linear (am Cliff bereits cliff/vest, z. B. 25 %)
}

/** Gevesteter Unternehmensanteil (0..1) einer Person. */
export function vestedPercent(grant: EquityGrant, week: number): number {
  return grant.percent * vestedFraction(grant, week);
}

/** Gesamter ESOP-Pool laut Cap Table (0..1). */
export function esopPool(state: CompanyState): number {
  return state.capTable.filter((e) => e.kind === 'esop').reduce((a, e) => a + e.share, 0);
}

/** Bereits an Personen zugeteilter Anteil des Pools. */
export function esopAllocated(state: CompanyState): number {
  return state.people.employees.reduce((a, e) => a + (e.equityGrant?.percent ?? 0), 0);
}

/** Freier, noch nicht zugeteilter ESOP-Anteil. */
export function esopUnallocated(state: CompanyState): number {
  return Math.max(0, esopPool(state) - esopAllocated(state));
}

/** Standard-Grant für eine Person je Seniorität (Anteil am Unternehmen). */
export function defaultGrantPercent(e: Employee): number {
  switch (e.seniority) {
    case 'lead':
      return 0.006;
    case 'senior':
      return 0.0035;
    case 'mid':
      return 0.0018;
    case 'junior':
      return 0.0009;
    default:
      return 0.0004; // Werkstudent:in
  }
}

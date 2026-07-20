import { DEPARTMENTS, WEEKS_PER_MONTH, type Department } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { LocationId, LocationProfile } from '../types/identity.js';
import { EMPLOYER_COST_FACTOR } from '../types/people.js';
import type { ModifierTarget } from '../types/effects.js';
import { LOCATIONS } from './scenarios/locations.js';

/** Reine Selektoren — lesen den State, verändern nie etwas. */

/**
 * Aktives Standortprofil (Phase 7): das beim Spielstart fixierte Profil;
 * Alt-Spielstände fallen auf die Kern-Presets zurück.
 */
export function locationOf(state: CompanyState): LocationProfile {
  return state.identity.location ?? LOCATIONS[state.identity.locationId as LocationId] ?? LOCATIONS.muenchen;
}

export function cohortMrr(state: CompanyState): number {
  return state.customers.cohorts.reduce(
    (s, c) => s + (c.logosMonthly + c.logosAnnual) * c.arpaMonthly,
    0,
  );
}

export function keyAccountMrr(state: CompanyState): number {
  return state.customers.keyAccounts
    .filter((k) => k.status !== 'churned')
    .reduce((s, k) => s + k.mrr, 0);
}

export function totalMrr(state: CompanyState): number {
  return cohortMrr(state) + keyAccountMrr(state);
}

export function totalLogos(state: CompanyState): number {
  const cohortLogos = state.customers.cohorts.reduce((s, c) => s + c.logosMonthly + c.logosAnnual, 0);
  return cohortLogos + state.customers.keyAccounts.filter((k) => k.status !== 'churned').length;
}

export function headcount(state: CompanyState): number {
  return state.people.employees.length;
}

export function payrollMonthlyByDept(state: CompanyState): Record<Department, number> {
  const out = Object.fromEntries(DEPARTMENTS.map((d) => [d, 0])) as Record<Department, number>;
  for (const e of state.people.employees) {
    out[e.dept] += e.salaryMonthly * EMPLOYER_COST_FACTOR;
  }
  return out;
}

export function payrollMonthlyTotal(state: CompanyState): number {
  const byDept = payrollMonthlyByDept(state);
  const staff = DEPARTMENTS.reduce((s, d) => s + byDept[d], 0);
  return staff + state.ceo.salaryMonthly * EMPLOYER_COST_FACTOR;
}

export function officeCostMonthly(state: CompanyState): number {
  return (headcount(state) + 1) * locationOf(state).officeCostPerEmployeeMonthly;
}

/** Monatliche OpEx (Personal + Sachkosten + Büro), ohne COGS. */
export function opexMonthlyTotal(state: CompanyState): number {
  const b = state.finance.budgetsMonthly;
  return (
    payrollMonthlyTotal(state) +
    b.marketing +
    b.customerSuccess +
    b.rndTools +
    b.gaOther +
    officeCostMonthly(state)
  );
}

/** EBITDA-Run-Rate pro Monat aus aktuellem Zustand. */
export function ebitdaMonthly(state: CompanyState): number {
  const revenue = totalMrr(state);
  return revenue * (1 - state.finance.cogsRate) - opexMonthlyTotal(state);
}

export function interestMonthly(state: CompanyState): number {
  return (state.finance.debt.principal * state.finance.debt.annualRate) / 12;
}

/** Netto-Burn pro Monat (>0 = Geld fließt ab). */
export function netBurnMonthly(state: CompanyState): number {
  return -(ebitdaMonthly(state) - interestMonthly(state));
}

export function runwayWeeks(state: CompanyState): number {
  const burn = netBurnMonthly(state);
  if (burn <= 0) return 999;
  return Math.max(0, state.finance.cash / (burn / WEEKS_PER_MONTH));
}

/** Gewichteter effektiver Monats-Logo-Churn über alle Kohorten (inkl. Modifikatoren). */
export function effectiveMonthlyChurn(state: CompanyState): number {
  const mult = modifierProduct(state, 'churnMonthly');
  const cohorts = state.customers.cohorts;
  const logos = cohorts.reduce((s, c) => s + c.logosMonthly + c.logosAnnual, 0);
  if (logos <= 0) return 0;
  const weighted = cohorts.reduce(
    (s, c) => s + (c.logosMonthly + c.logosAnnual) * c.baseMonthlyChurn,
    0,
  );
  return (weighted / logos) * mult;
}

export function avgExpansionMonthly(state: CompanyState): number {
  const mult = modifierProduct(state, 'expansionMonthly');
  const cohorts = state.customers.cohorts;
  const mrr = cohortMrr(state);
  if (mrr <= 0) return 0;
  const weighted = cohorts.reduce(
    (s, c) => s + (c.logosMonthly + c.logosAnnual) * c.arpaMonthly * c.monthlyExpansion,
    0,
  );
  return (weighted / mrr) * mult;
}

/** Produkt aller aktiven multiplikativen Modifikatoren auf ein Ziel. */
export function modifierProduct(state: CompanyState, target: ModifierTarget): number {
  const w = state.meta.week;
  return state.activeModifiers
    .filter((m) => m.target === target && m.startWeek <= w && w <= m.endWeek && m.factor !== undefined)
    .reduce((p, m) => p * (m.factor ?? 1), 1);
}

/** Summe aller aktiven additiven Modifikatoren auf ein Ziel. */
export function modifierSum(state: CompanyState, target: ModifierTarget): number {
  const w = state.meta.week;
  return state.activeModifiers
    .filter((m) => m.target === target && m.startWeek <= w && w <= m.endWeek && m.add !== undefined)
    .reduce((s, m) => s + (m.add ?? 0), 0);
}

/** Engineering-Velocity (Story-Points/Woche) aus Team, Ramp, Moral, Tech-Debt. */
export function currentVelocity(state: CompanyState): number {
  const POINTS: Record<string, number> = { junior: 3, mid: 5, senior: 7, lead: 6 };
  let pts = 0;
  for (const e of state.people.employees) {
    if (e.dept !== 'engineering') continue;
    const ramp = e.rampWeeksRemaining > 0 ? 0.5 : 1;
    const morale = 0.7 + 0.3 * (e.satisfaction / 100);
    pts += (POINTS[e.seniority] ?? 4) * ramp * morale;
  }
  const debtDrag = 1 - state.product.techDebt / 220; // 62 Debt ⇒ ~0.72
  return pts * Math.max(0.25, debtDrag) * modifierProduct(state, 'velocity');
}

/** Ø-ARPA über alle aktiven Kunden. */
export function avgArpa(state: CompanyState): number {
  const logos = totalLogos(state);
  return logos > 0 ? totalMrr(state) / logos : 0;
}

/** Sales-&-Marketing-Ausgaben pro Monat (Payroll Sales+Marketing + Marketingbudget). */
export function smSpendMonthly(state: CompanyState): number {
  const byDept = payrollMonthlyByDept(state);
  return byDept.sales + byDept.marketing + state.finance.budgetsMonthly.marketing;
}

export function avgSatisfaction(state: CompanyState): number {
  const emps = state.people.employees;
  if (emps.length === 0) return 50;
  return emps.reduce((s, e) => s + e.satisfaction, 0) / emps.length;
}

export function weekToDateISO(startDateISO: string, week: number): string {
  const d = new Date(startDateISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + week * 7);
  return d.toISOString().slice(0, 10);
}

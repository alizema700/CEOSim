import type { CompanyState } from '../types/company.js';
import type { CashFlowStatement, BalanceSheet } from '../types/finance.js';
import type { InvariantReport } from '../types/game.js';

/**
 * Harte Konsistenzprüfungen nach jedem Wochenschritt.
 * Verletzung ⇒ Fehler mit Diff-Anzeige (kein stilles Weiterrechnen!).
 */
export function checkInvariants(
  state: CompanyState,
  cf: CashFlowStatement,
  bs: BalanceSheet,
): InvariantReport {
  const checks: InvariantReport['checks'] = [];
  const EPS = 0.01;

  const push = (name: string, expected: number, actual: number, eps = EPS) => {
    const delta = actual - expected;
    checks.push({ name, ok: Math.abs(delta) < eps, expected, actual, delta });
  };

  // 1. Bilanz-Identität auf ROHWERTEN des States (die Report-Werte sind
  //    centgerundet und dürfen daher um wenige Cent abweichen).
  const f = state.finance;
  push(
    'Bilanz: Aktiva = Passiva',
    f.accountsPayable + f.deferredRevenue + f.debt.principal + f.contributedCapital + f.retainedEarnings,
    f.cash + f.accountsReceivable + f.treasury,
  );

  // 2. Cash-Flow-Konsistenz: Endbestand = Anfang + CFO + CFI + CFF
  //    (Report-Werte sind je Zeile gerundet ⇒ 5-Cent-Toleranz.)
  push(
    'Cash-Flow: Ende = Anfang + CFO + CFI + CFF',
    cf.cashStart + cf.operations.net + cf.investing.net + cf.financing.net,
    cf.cashEnd,
    0.05,
  );

  // 3. Bilanz-Cash = Kassenstand des States
  push('Bilanz-Cash = State-Cash', state.finance.cash, bs.assets.cash);

  // 4. Nicht-Negativität von Beständen
  push('Forderungen ≥ 0', Math.max(0, state.finance.accountsReceivable), state.finance.accountsReceivable);
  push('Verbindlichkeiten ≥ 0', Math.max(0, state.finance.accountsPayable), state.finance.accountsPayable);
  push('Deferred Revenue ≥ 0', Math.max(0, state.finance.deferredRevenue), state.finance.deferredRevenue);
  push('Debt ≥ 0', Math.max(0, state.finance.debt.principal), state.finance.debt.principal);

  // 5. Kundenzahlen ≥ 0
  const minLogos = Math.min(
    0,
    ...state.customers.cohorts.map((c) => Math.min(c.logosMonthly, c.logosAnnual)),
  );
  push('Kunden-Logos ≥ 0', 0, Math.min(0, minLogos));

  // 6. Scores in [0, 100]
  const scores = [
    state.ceo.boardTrust,
    state.reputation.customers,
    state.reputation.press,
    state.reputation.laborMarket,
    state.reputation.investors,
    state.product.techDebt,
  ];
  const outOfRange = scores.filter((s) => s < 0 || s > 100).length;
  push('Scores in [0,100]', 0, outOfRange);

  return { ok: checks.every((c) => c.ok), checks };
}

/** Wirft bei Invarianten-Verletzung einen Fehler mit lesbarem Diff. */
export function assertInvariants(report: InvariantReport, week: number): void {
  if (report.ok) return;
  const broken = report.checks
    .filter((c) => !c.ok)
    .map((c) => `  ✗ ${c.name}: erwartet ${c.expected.toFixed(4)}, tatsächlich ${c.actual.toFixed(4)} (Δ ${c.delta.toFixed(4)})`)
    .join('\n');
  throw new Error(`INVARIANTEN-VERLETZUNG in Woche ${week}:\n${broken}`);
}

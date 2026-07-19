import { describe, expect, it } from 'vitest';
import { forceCash, newGame, testSetup } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { computeKpis, KPI_DEFINITIONS } from '../src/engine/kpis.js';
import { runDueEvaluations } from '../src/engine/evaluate.js';
import { createCompany } from '../src/engine/init.js';
import { totalMrr, runwayWeeks } from '../src/engine/derive.js';
import type { KpiId } from '../src/types/kpi.js';

describe('Initialisierung (SaaS-Turnaround)', () => {
  it('startet mit konsistenter Bilanz und plausiblen Werten', () => {
    const s = newGame();
    const f = s.finance;
    const assets = f.cash + f.accountsReceivable;
    const liabEq = f.accountsPayable + f.deferredRevenue + f.debt.principal + f.contributedCapital + f.retainedEarnings;
    expect(Math.abs(assets - liabEq)).toBeLessThan(0.01);
    expect(totalMrr(s)).toBeGreaterThan(150_000);
    expect(totalMrr(s)).toBeLessThan(260_000);
    expect(s.people.employees.length).toBeGreaterThanOrEqual(24);
    expect(s.people.executives).toHaveLength(4);
    expect(s.customers.keyAccounts).toHaveLength(5);
    // Jede Person hat einen Namen — Menschlichkeit ist Teil des Produkts.
    for (const e of s.people.employees) {
      expect(e.firstName.length).toBeGreaterThan(1);
      expect(e.lastName.length).toBeGreaterThan(1);
    }
  });

  it('gleicher Seed ⇒ identischer Start-State (Determinismus)', () => {
    const a = createCompany(testSetup(), 7, 'g1', '2026-01-05T00:00:00Z');
    const b = createCompany(testSetup(), 7, 'g1', '2026-01-05T00:00:00Z');
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('anderer Seed ⇒ andere Namen', () => {
    const a = createCompany(testSetup(), 1, 'g1', '2026-01-05T00:00:00Z');
    const b = createCompany(testSetup(), 2, 'g1', '2026-01-05T00:00:00Z');
    const namesA = a.people.employees.map((e) => e.firstName + e.lastName).join(',');
    const namesB = b.people.employees.map((e) => e.firstName + e.lastName).join(',');
    expect(namesA).not.toEqual(namesB);
  });
});

describe('Wochentick & Invarianten', () => {
  it('52 Wochen ohne Eingriff: Invarianten halten in jeder Woche', () => {
    const s = newGame(1234);
    for (let w = 0; w < 52 && s.meta.status === 'active'; w++) {
      const report = closeWeek(s);
      expect(report.invariants.ok).toBe(true);
      expect(report.balanceSheet.identityDelta).toBeLessThan(0.01);
    }
  });

  it('Cash-Flow-Statement stimmt mit Kassenbewegung überein', () => {
    const s = newGame(99);
    const report = closeWeek(s);
    const cf = report.cashFlow;
    expect(Math.abs(cf.cashEnd - (cf.cashStart + cf.operations.net + cf.investing.net + cf.financing.net))).toBeLessThan(0.01);
    expect(Math.abs(cf.cashEnd - s.finance.cash)).toBeLessThan(0.01);
  });

  it('Churn-Problem frisst MRR, wenn niemand eingreift', () => {
    const s = newGame(5);
    const mrr0 = totalMrr(s);
    for (let w = 0; w < 26 && s.meta.status === 'active'; w++) closeWeek(s);
    // Ohne Gegensteuern sollte das Szenario spürbar bluten (das ist der Auftrag).
    expect(totalMrr(s)).toBeLessThan(mrr0 * 1.02);
  });

  it('beendetes Spiel wirft bei weiterem Tick', () => {
    const s = newGame(3);
    s.meta.status = 'insolvent';
    expect(() => closeWeek(s)).toThrow();
  });
});

describe('Aktionen & verzögerte Effekte', () => {
  it('Preiserhöhung: Cooldown wird erzwungen', () => {
    const s = newGame(11);
    applyAction(s, { type: 'PRICE_CHANGE', pct: 0.1, applyToExisting: false }, null, 'd1');
    const v = validateAction(s, { type: 'PRICE_CHANGE', pct: 0.05, applyToExisting: false });
    expect(v.ok).toBe(false);
    expect(v.errorsDe.join()).toContain('Woche');
  });

  it('Preiserhöhung auf Bestand: Churn-Spike kommt erst verzögert (Woche 4 wird im 5. Tick verarbeitet)', () => {
    const s = newGame(11);
    applyAction(s, { type: 'PRICE_CHANGE', pct: 0.15, applyToExisting: true }, null, 'd1');
    for (let w = 0; w < 4; w++) closeWeek(s);
    expect(s.activeModifiers.filter((m) => m.target === 'churnMonthly')).toHaveLength(0); // noch nicht aktiv
    closeWeek(s); // der Tick, der Woche 4 verarbeitet
    expect(s.activeModifiers.filter((m) => m.target === 'churnMonthly')).toHaveLength(1);
  });

  it('Entlassung: Abfindung sofort, Payroll sinkt, Moral leidet', () => {
    const s = newGame(21);
    const headBefore = s.people.employees.length;
    const satBefore = s.people.employees.reduce((x, e) => x + e.satisfaction, 0) / headBefore;
    applyAction(s, { type: 'LAYOFF', dept: 'ga', count: 2, generousSeverance: false }, null, 'd1');
    const report = closeWeek(s);
    expect(s.people.employees.length).toBeLessThanOrEqual(headBefore - 2); // + evtl. freiwillige Kündigungen
    expect(report.incomeStatement.oneOffs).toBeGreaterThan(0); // Abfindungen
    const satAfter = s.people.employees.reduce((x, e) => x + e.satisfaction, 0) / s.people.employees.length;
    expect(satAfter).toBeLessThan(satBefore);
    expect(report.invariants.ok).toBe(true);
  });

  it('Werte-Konflikt: „Menschen zuerst" + harte Entlassung ⇒ Presse-/Moral-Malus', () => {
    const s = newGame(22);
    const pressBefore = s.reputation.press;
    applyAction(s, { type: 'LAYOFF', dept: 'engineering', count: 3, generousSeverance: false }, null, 'd1');
    closeWeek(s);
    expect(s.reputation.press).toBeLessThan(pressBefore);
  });

  it('Hiring: Time-to-Fill, dann erscheint eine benannte Person', () => {
    const s = newGame(31);
    applyAction(s, { type: 'START_HIRING', dept: 'cs', count: 1, seniority: 'mid' }, null, 'd1');
    expect(s.people.openRequisitions).toHaveLength(1);
    const csBefore = s.people.employees.filter((e) => e.dept === 'cs').length;
    for (let w = 0; w < 12 && s.people.openRequisitions.length > 0; w++) closeWeek(s);
    const csAfter = s.people.employees.filter((e) => e.dept === 'cs').length;
    expect(csAfter).toBeGreaterThanOrEqual(csBefore); // trotz evtl. Attrition
    expect(s.people.openRequisitions).toHaveLength(0);
  });

  it('Kredit: Covenant-Grenze blockiert Überziehung', () => {
    const s = newGame(41);
    const v = validateAction(s, { type: 'RAISE_DEBT', amount: 10_000_000 });
    expect(v.ok).toBe(false);
  });

  it('Kreditziehung erhöht Cash & Debt gleichermaßen (Bilanz bleibt konsistent)', () => {
    const s = newGame(41);
    const cashBefore = s.finance.cash;
    applyAction(s, { type: 'RAISE_DEBT', amount: 200_000 }, null, 'd1');
    const report = closeWeek(s);
    expect(s.finance.debt.principal).toBe(500_000);
    expect(report.cashFlow.financing.debtDrawn).toBe(200_000);
    expect(s.finance.cash).toBeGreaterThan(cashBefore); // trotz Wochen-Burn
    expect(report.invariants.ok).toBe(true);
  });

  it('R&D-Allokation muss sich zu 100 % summieren', () => {
    const s = newGame(51);
    const v = validateAction(s, { type: 'SET_RND_ALLOCATION', features: 0.5, techDebt: 0.2, bugfixes: 0.2 });
    expect(v.ok).toBe(false);
  });

  it('Tech-Debt-Fokus senkt den Debt-Score über die Zeit', () => {
    const s = newGame(51);
    applyAction(s, { type: 'SET_RND_ALLOCATION', features: 0.2, techDebt: 0.6, bugfixes: 0.2 }, null, 'd1');
    const debtBefore = s.product.techDebt;
    for (let w = 0; w < 12; w++) closeWeek(s);
    expect(s.product.techDebt).toBeLessThan(debtBefore);
  });
});

describe('KPI-Formeln', () => {
  it('alle KPI-Definitionen haben Formel & Definition (Tooltip-Pflicht)', () => {
    for (const def of Object.values(KPI_DEFINITIONS)) {
      expect(def.formulaDe.length).toBeGreaterThan(5);
      expect(def.definitionDe.length).toBeGreaterThan(10);
    }
  });

  it('Snapshot enthält jede definierte Kennzahl', () => {
    const s = newGame(61);
    closeWeek(s);
    const snap = computeKpis(s);
    for (const id of Object.keys(KPI_DEFINITIONS) as KpiId[]) {
      expect(snap.values[id]).toBeDefined();
      expect(Number.isFinite(snap.values[id])).toBe(true);
    }
  });

  it('LTV = ARPA × Marge ÷ Churn (Stichprobe)', () => {
    const s = newGame(61);
    closeWeek(s);
    const v = computeKpis(s).values;
    const expected = (v.arpa * v.grossMarginPct) / v.logoChurnMonthly;
    expect(Math.abs(v.ltv - expected)).toBeLessThan(1);
  });

  it('Runway = Cash ÷ Wochen-Burn', () => {
    const s = newGame(61);
    const rw = runwayWeeks(s);
    expect(rw).toBeGreaterThan(20);
    expect(rw).toBeLessThan(120);
  });
});

describe('Bewertungs-Pipeline', () => {
  it('Outcome-Bewertung wird 4 Wochen nach Entscheidung fällig und benotet den Prozess', () => {
    const s = newGame(71);
    applyAction(
      s,
      { type: 'SET_CS_BUDGET', monthlyAmount: 20_000 },
      { textDe: 'Churn sinkt Richtung 3 %', expectedMrrDelta4w: -2_000, expectedChurnDeltaPp: -0.4 },
      'd1',
    );
    for (let w = 0; w < 4; w++) closeWeek(s);
    const evals = runDueEvaluations(s);
    expect(evals).toHaveLength(1);
    const e = evals[0]!;
    expect(e.grade.overall).toBeGreaterThanOrEqual(1);
    expect(e.grade.overall).toBeLessThanOrEqual(6);
    expect(e.hypothesisReview.hadHypothesis).toBe(true);
    expect(e.causalChainDe.length).toBeGreaterThan(0);
    expect(e.lessonDe.length).toBeGreaterThan(10);
    // CS-Invest in der Churn-Krise = gutes Timing ⇒ ordentliche Note
    expect(e.grade.overall).toBeLessThanOrEqual(3);
    // Idempotent: zweiter Lauf erzeugt nichts Neues
    expect(runDueEvaluations(s)).toHaveLength(0);
  });

  it('Werte-Konsistenz fließt in die Note ein', () => {
    const s = newGame(72);
    applyAction(s, { type: 'LAYOFF', dept: 'engineering', count: 4, generousSeverance: false }, null, 'd1');
    for (let w = 0; w < 4; w++) closeWeek(s);
    const evals = runDueEvaluations(s);
    expect(evals[0]!.grade.criteria.werteKonsistenz).toBeLessThan(50);
  });
});

describe('Board & Game Over', () => {
  it('Board-Vertrauen ist keine Blackbox: jedes Delta hat eine Begründung', () => {
    const s = newGame(81);
    const report = closeWeek(s);
    for (const d of report.trustDrivers) {
      expect(d.reasonDe.length).toBeGreaterThan(5);
    }
  });

  it('Vertrauen < 20 ⇒ Abwahl (Game Over „fired")', () => {
    const s = newGame(82);
    s.ceo.boardTrust = 21;
    forceCash(s, 30_000); // Runway-Krise drückt das Vertrauen unter 20
    closeWeek(s);
    expect(s.meta.status).toBe('fired');
    expect(s.meta.endReasonDe).toContain('Misstrauensvotum');
  });

  it('negative Kasse ⇒ Insolvenz', () => {
    const s = newGame(83);
    forceCash(s, 1_000); // reicht nicht für eine Woche Payroll
    closeWeek(s);
    expect(s.meta.status).toBe('insolvent');
  });
});

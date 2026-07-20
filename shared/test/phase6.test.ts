import { describe, expect, it } from 'vitest';
import { newGame, testSetup, forceCash } from './helpers.js';
import { createCompany } from '../src/engine/init.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { ipoEligibility, subscriptionRatioFor, IPO_BANKS } from '../src/engine/ipo.js';
import { PRE_IPO_SHARES } from '../src/types/ipo.js';
import type { CompanyState } from '../src/types/company.js';

/** Phase 6: IPO-Prozess, Ad-hoc-Pflicht, Sanierungs-Szenario. */

function weeks(s: CompanyState, n: number): void {
  for (let i = 0; i < n && s.meta.status === 'active'; i++) closeWeek(s);
}

/** Roadshow-Zustand direkt herstellen (Unit-Test-Abkürzung, bilanzneutral). */
function forceRoadshow(s: CompanyState, bankId = 'bank_sud'): void {
  s.ipo.status = 'roadshow';
  s.ipo.bankId = bankId;
  s.ipo.bookLow = 3.0;
  s.ipo.bookHigh = 3.6;
  s.ipo.roadshowEndsWeek = s.meta.week + 3;
  s.reputation.investors = 60;
}

describe('Sanierungs-Szenario (distressed)', () => {
  it('startet härter als der Turnaround und hält die Invarianten', () => {
    const t = newGame(8001);
    const d = createCompany(testSetup({ scenarioId: 'distressed' }), 8001, 'game_dz', '2026-01-05T09:00:00.000Z');
    expect(d.meta.scenarioId).toBe('distressed');
    expect(d.finance.cash).toBeLessThan(t.finance.cash * 0.5);
    expect(d.finance.debt.principal).toBeGreaterThan(t.finance.debt.principal);
    expect(d.product.techDebt).toBeGreaterThan(t.product.techDebt);
    expect(d.ceo.boardTrust).toBeLessThan(t.ceo.boardTrust);
    expect(d.customers.keyAccounts[0]!.status).toBe('atRisk');
    // Junge Kohorten churnen brutaler
    expect(d.customers.cohorts[0]!.baseMonthlyChurn).toBeGreaterThan(t.customers.cohorts[0]!.baseMonthlyChurn);
    // Erste Wochen laufen sauber durch (Bilanz-Identität etc.)
    const r1 = closeWeek(d);
    expect(r1.invariants.ok).toBe(true);
    const r2 = closeWeek(d);
    expect(r2.invariants.ok).toBe(true);
  });

  it('ist deterministisch (gleicher Seed ⇒ gleicher Start)', () => {
    const a = createCompany(testSetup({ scenarioId: 'distressed' }), 8002, 'g1', '2026-01-05T09:00:00.000Z');
    const b = createCompany(testSetup({ scenarioId: 'distressed' }), 8002, 'g1', '2026-01-05T09:00:00.000Z');
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});

describe('IPO: Freischaltung & Gates', () => {
  it('frisches Spiel ist locked; Bank-Mandat wird abgelehnt', () => {
    const s = newGame(8003);
    expect(s.ipo.status).toBe('locked');
    expect(ipoEligibility(s).ok).toBe(false);
    const v = validateAction(s, { type: 'IPO_SELECT_BANK', bankId: 'bank_sud' });
    expect(v.ok).toBe(false);
    weeks(s, 3);
    expect(s.ipo.status).toBe('locked'); // Kriterien weiter verfehlt
  });
});

describe('IPO: Pricing, Listing, Erstnotiz', () => {
  it('Zeichnungsquote ist deterministisch und fällt mit dem Preis', () => {
    const s = newGame(8004);
    weeks(s, 4);
    forceRoadshow(s);
    const cheap = subscriptionRatioFor(s, 3.0);
    const mid = subscriptionRatioFor(s, 3.3);
    const rich = subscriptionRatioFor(s, 3.6);
    expect(cheap).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(rich);
    expect(subscriptionRatioFor(s, 3.3)).toBe(mid); // deterministisch
  });

  it('Listing: Cash über CFF, Fees als Aufwand, Streubesitz im Cap Table, Invarianten ok', () => {
    const s = newGame(8005);
    weeks(s, 4);
    forceRoadshow(s, 'bank_gsq');
    const price = 3.2;
    const ratio = subscriptionRatioFor(s, price);
    expect(ratio).toBeGreaterThanOrEqual(0.9);
    const contributedBefore = s.finance.contributedCapital;
    const bank = IPO_BANKS.find((b) => b.id === 'bank_gsq')!;

    const rec = applyAction(s, { type: 'IPO_PRICE', pricePerShare: price }, null, 'dec_ipo');
    expect(rec.summaryDe).toMatch(/gepreist/);
    const report = closeWeek(s);

    expect(s.ipo.status).toBe('public');
    const newShares = s.ipo.newSharesIssued;
    const gross = newShares * price;
    expect(report.cashFlow.financing.equityRaised).toBeCloseTo(gross, 0);
    expect(s.finance.contributedCapital).toBeCloseTo(contributedBefore + gross, 4);
    expect(report.incomeStatement.oneOffs).toBeGreaterThanOrEqual(Math.round(gross * bank.feePct) - 1);
    expect(report.invariants.ok).toBe(true);

    // Cap Table: Streubesitz drin, Summe 1, Aktienzahl konsistent
    const pub = s.capTable.find((e) => e.kind === 'public');
    expect(pub).toBeDefined();
    expect(s.capTable.reduce((a, e) => a + e.share, 0)).toBeCloseTo(1, 6);
    expect(pub!.share).toBeCloseTo(newShares / s.ipo.sharesOutstanding, 6);
    expect(s.ipo.sharesOutstanding).toBe(PRE_IPO_SHARES + newShares);

    // Erstnotiz & Kalender
    expect(s.ipo.sharePrice).not.toBeNull();
    expect(s.ipo.priceHistory.length).toBeGreaterThan(0);
    expect(s.calendar.appointments.some((a) => a.kind === 'earningsCall')).toBe(true);
    expect(s.ipo.nextEarningsWeek).toBe(s.ipo.listedWeek! + 13);
  });

  it('Gier-Pricing über der Spanne mit schwacher Bank platzt (withdrawn)', () => {
    const s = newGame(8006);
    weeks(s, 4);
    forceRoadshow(s, 'bank_dix');
    s.reputation.investors = 35;
    const price = 3.6 * 1.08 - 0.01;
    const trustBefore = s.ceo.boardTrust;
    const rec = applyAction(s, { type: 'IPO_PRICE', pricePerShare: Math.round(price * 100) / 100 }, null, 'dec_greed');
    expect(s.ipo.status).toBe('withdrawn');
    expect(rec.summaryDe).toMatch(/GEPLATZT/);
    expect(s.ceo.boardTrust).toBeLessThan(trustBefore);
  });
});

describe('IPO: Kurs & Earnings-Calls', () => {
  it('nach 13 Wochen kommt der erste Call mit Verdikt und neuer Guidance', () => {
    const s = newGame(8007);
    weeks(s, 4);
    forceRoadshow(s);
    applyAction(s, { type: 'IPO_PRICE', pricePerShare: 3.2 }, null, 'dec_ipo2');
    closeWeek(s);
    expect(s.ipo.status).toBe('public');
    forceCash(s, Math.max(s.finance.cash, 2_000_000)); // überlebt sicher bis zum Call
    weeks(s, 14);
    expect(s.ipo.earningsHistory.length).toBeGreaterThanOrEqual(1);
    const call = s.ipo.earningsHistory[0]!;
    expect(['beat', 'met', 'missed']).toContain(call.verdict);
    expect(s.ipo.guidanceGrowthMonthly).not.toBeNull();
    expect(s.ipo.nextEarningsWeek).toBe(call.week + 13);
    expect(s.ipo.priceHistory.length).toBeGreaterThan(10); // Kurs läuft wöchentlich
  });

  it('Ad-hoc-Pflicht triggert als Ereignis; Offenlegung drückt den Kurs kontrolliert', () => {
    const s = newGame(8008);
    weeks(s, 4);
    forceRoadshow(s);
    applyAction(s, { type: 'IPO_PRICE', pricePerShare: 3.1 }, null, 'dec_ipo3');
    closeWeek(s);
    forceCash(s, Math.max(s.finance.cash, 2_000_000));
    s.ipo.pendingAdhocTopicDe = 'Datenpanne im Kernprodukt';
    closeWeek(s);
    const ev = s.openEvents.find((e) => e.cardId === 'ADHOC_DUTY' && e.status === 'open');
    expect(ev).toBeDefined();
    const priceBefore = s.ipo.sharePrice!;
    applyAction(s, { type: 'RESPOND_EVENT', eventInstanceId: ev!.instanceId, optionId: 'disclose' }, null, 'dec_adhoc');
    expect(s.ipo.pendingAdhocTopicDe).toBeNull();
    expect(s.ipo.sharePrice!).toBeLessThan(priceBefore);
    const r = closeWeek(s);
    expect(r.invariants.ok).toBe(true);
  });
});

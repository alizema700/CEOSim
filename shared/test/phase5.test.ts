import { describe, expect, it } from 'vitest';
import { newGame, forceCash } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { generateTermSheets, validateVentureDebt } from '../src/engine/funding.js';
import { computeValuation } from '../src/engine/kpis.js';
import type { CompanyState } from '../src/types/company.js';

/**
 * Phase 5: Fundraising, M&A, Konkurrenz-Agenten.
 * Alles deterministisch — kein LLM im Spiel.
 */

function weeks(s: CompanyState, n: number): void {
  // Ohne Gegensteuern stirbt das Turnaround-Szenario irgendwann — beabsichtigt.
  for (let i = 0; i < n && s.meta.status === 'active'; i++) closeWeek(s);
}

describe('Term Sheets (Fundraising)', () => {
  it('erscheinen erst ab Woche 6 und sind deterministisch', () => {
    const s = newGame(7001);
    expect(generateTermSheets(s)).toHaveLength(0); // Woche 0
    weeks(s, 7);
    const a = generateTermSheets(s);
    const b = generateTermSheets(s);
    expect(a).toHaveLength(2);
    expect(a).toEqual(b); // gleiche Woche ⇒ identische Angebote
    expect(a[0]!.id).not.toEqual(a[1]!.id);
    // Trade-off-Struktur: A teuer bewertet aber hart, B fair
    expect(a[0]!.liquidationPref).toBe('1x-participating');
    expect(a[0]!.boardSeat).toBe(true);
    expect(a[1]!.liquidationPref).toBe('1x');
    expect(a[0]!.preMoney).toBeGreaterThan(a[1]!.preMoney);
  });

  it('verfallen wöchentlich: altes Angebot wird abgelehnt', () => {
    const s = newGame(7001);
    weeks(s, 7);
    const old = generateTermSheets(s)[0]!;
    closeWeek(s);
    const v = validateAction(s, { type: 'ACCEPT_TERM_SHEET', offer: old });
    expect(v.ok).toBe(false);
    expect(v.errorsDe.join(' ')).toMatch(/nicht \(mehr\) gültig/);
  });

  it('manipulierte Angebote werden ignoriert: Engine nutzt regeneriertes Original', () => {
    const s = newGame(7001);
    weeks(s, 7);
    const offer = generateTermSheets(s)[1]!;
    const tampered = { ...offer, amount: offer.amount * 10 }; // ID bleibt gültig
    const cashBefore = s.finance.cash;
    applyAction(s, { type: 'ACCEPT_TERM_SHEET', offer: tampered }, null, 'dec_tamper');
    closeWeek(s);
    const round = s.funding.rounds[0]!;
    expect(round.amount).toBe(offer.amount); // NICHT ×10
    expect(s.finance.cash).toBeLessThan(cashBefore + offer.amount * 2);
  });

  it('Annahme: Cash über CFF, Cap Table verwässert, Bilanz hält', () => {
    const s = newGame(7002);
    weeks(s, 7);
    const offer = generateTermSheets(s)[0]!; // Growth-VC mit ESOP-Top-up + Board-Seat
    const ceoBefore = s.ceo.equityShare;
    const cashBefore = s.finance.cash;
    const contributedBefore = s.finance.contributedCapital;

    applyAction(s, { type: 'ACCEPT_TERM_SHEET', offer }, null, 'dec_ts');
    const report = closeWeek(s); // Injection läuft im Tick

    expect(report.cashFlow.financing.equityRaised).toBeCloseTo(offer.amount, 0);
    expect(s.finance.contributedCapital).toBeCloseTo(contributedBefore + offer.amount, 6);
    expect(s.finance.cash).toBeGreaterThan(cashBefore + offer.amount * 0.8); // Burn frisst etwas
    expect(report.invariants.ok).toBe(true);

    // Cap Table: Summe = 1, Investor drin, CEO verwässert (ESOP pre-money + Investor)
    const sum = s.capTable.reduce((acc, e) => acc + e.share, 0);
    expect(sum).toBeCloseTo(1, 6);
    const round = s.funding.rounds[0]!;
    expect(round.newInvestorShare).toBeCloseTo(offer.amount / (offer.preMoney + offer.amount), 6);
    const expectedCeo = ceoBefore * (1 - offer.esopTopUp) * (1 - round.newInvestorShare);
    expect(s.ceo.equityShare).toBeCloseTo(expectedCeo, 6);
    expect(s.funding.investorBoardSeat).toBe(true);
    // 26-Wochen-Sperre: direkt danach keine neuen Angebote
    expect(generateTermSheets(s)).toHaveLength(0);
  });
});

describe('Venture Debt', () => {
  it('Gates: ARR-Schwelle, 25%-Cap, nur einmal', () => {
    const s = newGame(7003);
    weeks(s, 7);
    const arr = computeValuation(s).arr;
    if (arr >= 1_500_000) {
      // Startszenario liegt über der Schwelle → Cap & Einmaligkeit testen
      expect(validateVentureDebt(s, arr)).not.toHaveLength(0); // > 25 % ARR
      const amount = Math.round((arr * 0.2) / 1000) * 1000;
      expect(validateVentureDebt(s, amount)).toHaveLength(0);
      const lineBefore = s.finance.debt.creditLine;
      const rateBefore = s.finance.debt.annualRate;
      applyAction(s, { type: 'RAISE_VENTURE_DEBT', amount }, null, 'dec_vd');
      expect(s.finance.debt.creditLine).toBe(lineBefore + amount);
      expect(s.finance.debt.annualRate).toBeGreaterThan(rateBefore); // Blended Richtung 13 %
      const report = closeWeek(s);
      expect(report.cashFlow.financing.debtDrawn).toBeCloseTo(amount, 0);
      expect(report.invariants.ok).toBe(true);
      // Zweiter Zug verboten
      expect(validateVentureDebt(s, 100_000).join(' ')).toMatch(/bereits gezogen/);
    } else {
      expect(validateVentureDebt(s, 200_000).join(' ')).toMatch(/1,5 M€ ARR/);
    }
  });
});

describe('M&A-Zukäufe', () => {
  it('Ziele sind seed-deterministisch, Red Flags versteckt bis DD', () => {
    const a = newGame(7004);
    const b = newGame(7004);
    expect(a.market.maTargets.map((t) => ({ ...t }))).toEqual(b.market.maTargets.map((t) => ({ ...t })));
    expect(a.market.maTargets).toHaveLength(2);
    expect(a.market.maTargets.every((t) => !t.ddDone && t.redFlags.length > 0)).toBe(true);
  });

  it('DD kostet Gebühr, deckt Flags auf und drückt den Preis', () => {
    const s = newGame(7005);
    weeks(s, 2);
    const t = s.market.maTargets[0]!;
    const priceBefore = t.askPrice;
    forceCash(s, 2_000_000);
    const rec = applyAction(s, { type: 'MA_DUE_DILIGENCE', targetId: t.id }, null, 'dec_dd');
    expect(t.ddDone).toBe(true);
    expect(t.askPrice).toBeLessThan(priceBefore); // Befunde = Verhandlungshebel
    expect(rec.immediateAnalysisDe.join(' ')).toMatch(/Befund/);
    const report = closeWeek(s);
    expect(report.incomeStatement.oneOffs).toBeGreaterThanOrEqual(15_000);
    expect(report.invariants.ok).toBe(true);
    // Doppelte DD verboten
    expect(validateAction(s, { type: 'MA_DUE_DILIGENCE', targetId: t.id }).ok).toBe(false);
  });

  it('Kauf ohne DD warnt; Integration bringt MRR, Team und Red-Flag-Folgen', () => {
    const s = newGame(7006);
    weeks(s, 2);
    const t = s.market.maTargets[0]!;
    forceCash(s, Math.max(2_500_000, t.askPrice * 1.5));

    const v = validateAction(s, { type: 'MA_ACQUIRE', targetId: t.id });
    expect(v.ok).toBe(true);
    expect(v.warningsDe.join(' ')).toMatch(/OHNE Due Diligence/);

    const headcountBefore = s.people.employees.length;
    const cohortsBefore = s.customers.cohorts.length;
    applyAction(s, { type: 'MA_ACQUIRE', targetId: t.id }, null, 'dec_ma');
    expect(t.status).toBe('acquired');
    expect(validateAction(s, { type: 'MA_ACQUIRE', targetId: t.id }).ok).toBe(false); // nicht doppelt kaufbar

    const r1 = closeWeek(s); // Kaufpreis zahlungswirksam
    expect(r1.incomeStatement.oneOffs).toBeGreaterThanOrEqual(t.askPrice);
    const r2 = closeWeek(s); // Integration (dueWeek = Kaufwoche + 1)
    expect(s.people.employees.length).toBeGreaterThanOrEqual(headcountBefore + t.employees - 2); // Attrition-Toleranz
    expect(s.customers.cohorts.length).toBeGreaterThan(cohortsBefore);
    expect(r2.invariants.ok).toBe(true);

    // Red-Flag-Folgen liegen als geplante Effekte im State (Kulturwelle immer dabei)
    const kinds = s.scheduledEffects.map((fx) => fx.effect.kind);
    expect(kinds).toContain('ATTRITION_WAVE');
    // Neue Kohorte churnt real schlechter als beworben (churn-higher-Flag, severity 2)
    const churnFlag = t.redFlags.find((f) => f.kind === 'churn-higher');
    if (churnFlag) {
      const newCohort = s.customers.cohorts[s.customers.cohorts.length - 1]!;
      expect(newCohort.baseMonthlyChurn).toBeCloseTo(t.claimedMonthlyChurn * (1 + 0.6 * churnFlag.severity), 6);
    }
  });

  it('zu teurer Kauf wird von der Validierung geblockt', () => {
    const s = newGame(7007);
    weeks(s, 2);
    const t = s.market.maTargets[1]!; // Klaro, teuer
    forceCash(s, t.askPrice * 0.5);
    const v = validateAction(s, { type: 'MA_ACQUIRE', targetId: t.id });
    expect(v.ok).toBe(false);
    expect(v.errorsDe.join(' ')).toMatch(/85 % der Kasse/);
  });
});

describe('Konkurrenz-Agenten', () => {
  it('ziehen deterministisch: gleicher Seed ⇒ identische Züge & Cooldowns', () => {
    const a = newGame(7008);
    const b = newGame(7008);
    weeks(a, 30);
    weeks(b, 30);
    expect(a.market.agentCooldowns).toEqual(b.market.agentCooldowns);
    expect(a.market.competitors).toEqual(b.market.competitors);
    expect(a.pressLog).toEqual(b.pressLog);
  });

  it('bewegen den Markt: über 40 Wochen passiert mindestens ein Agenten-Zug', () => {
    // Über mehrere Seeds hinweg: Agenten sind aktiv (keine tote Mechanik).
    let totalMoves = 0;
    for (const seed of [7009, 7010, 7011]) {
      const s = newGame(seed);
      weeks(s, 40);
      totalMoves += Object.keys(s.market.agentCooldowns).length;
    }
    expect(totalMoves).toBeGreaterThan(0);
  });

  it('Preiskämpfer kontert eine deutliche Preiserhöhung (falls Roll trifft)', () => {
    // Deterministischer Kontertest: wir suchen einen Seed, bei dem der Konter kommt.
    let countered = false;
    for (const seed of [7012, 7013, 7014, 7015, 7016, 7017, 7018, 7019]) {
      const s = newGame(seed);
      weeks(s, 8);
      if (s.meta.status !== 'active') continue;
      applyAction(s, { type: 'PRICE_CHANGE', pct: 0.12, applyToExisting: false }, null, 'dec_p' + seed);
      weeks(s, 3);
      if (Object.keys(s.market.agentCooldowns).some((k) => k.endsWith(':reactPrice'))) {
        countered = true;
        break;
      }
    }
    expect(countered).toBe(true);
  });
});

describe('Replay-Sicherheit Phase 5', () => {
  it('Fundraising + M&A + Wochen: zwei identische Läufe bleiben bit-identisch', async () => {
    const run = () => {
      const s = newGame(7020);
      weeks(s, 7);
      const offer = generateTermSheets(s)[1]!;
      applyAction(s, { type: 'ACCEPT_TERM_SHEET', offer }, null, 'dec_r1');
      weeks(s, 2);
      const t = s.market.maTargets[0]!;
      applyAction(s, { type: 'MA_DUE_DILIGENCE', targetId: t.id }, null, 'dec_r2');
      closeWeek(s);
      if (validateAction(s, { type: 'MA_ACQUIRE', targetId: t.id }).ok) {
        applyAction(s, { type: 'MA_ACQUIRE', targetId: t.id }, null, 'dec_r3');
      }
      weeks(s, 4);
      return s;
    };
    const s1 = run();
    const s2 = run();
    expect(JSON.stringify(s1)).toEqual(JSON.stringify(s2));
  });
});

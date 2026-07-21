import { describe, expect, it } from 'vitest';
import { forceCash, newGame } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { ipoEligibility } from '../src/engine/ipo.js';
import { effectiveCorporateTaxRate, taxBreakdown, FORMWECHSEL_WEEKS, MIN_KAPITAL } from '../src/types/legal.js';

/**
 * Phase 9: Rechtsform & Gesellschaftsrecht — GmbH/AG, Kapital, Organe,
 * deutsche Unternehmenssteuer, Formwechsel (IPO-Voraussetzung), Dividende.
 */

/** Gewinnrücklage bilanzkonform auf einen Zielwert setzen (Gegenbuchung Cash). */
function bumpRetained(s: ReturnType<typeof newGame>, target: number): void {
  const delta = target - s.finance.retainedEarnings;
  s.finance.retainedEarnings = target;
  s.finance.cash += delta;
}

describe('Initialzustand & Determinismus', () => {
  it('startet als GmbH mit 25.000 € Stammkapital und Handelsregister-Eintrag', () => {
    const s = newGame(9001);
    expect(s.legal.rechtsform).toBe('GmbH');
    expect(s.legal.nennkapital).toBe(25_000);
    expect(s.legal.handelsregister.number).toMatch(/^HRB \d+$/);
    expect(s.legal.handelsregister.courtDe).toMatch(/^Amtsgericht /);
    expect(s.legal.hebesatz).toBe(490); // München
  });

  it('capTable summiert sich exakt auf 100 %', () => {
    const s = newGame(9002);
    const sum = s.capTable.reduce((a, e) => a + e.share, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('Struktur ist replay-stabil', () => {
    const a = newGame(9003);
    const b = newGame(9003);
    for (let i = 0; i < 15; i++) { closeWeek(a); closeWeek(b); }
    expect(JSON.stringify(a.legal)).toEqual(JSON.stringify(b.legal));
  });
});

describe('Deutsche Unternehmenssteuer', () => {
  it('effektiver Satz = KSt 15 % + Soli + Gewerbesteuer (Hebesatz 490 %)', () => {
    const s = newGame(9010);
    const rate = effectiveCorporateTaxRate(s.legal, 'Deutschland', 0.3);
    expect(rate).toBeCloseTo(0.15 + 0.15 * 0.055 + 0.035 * 4.9, 4); // ≈ 0,32975
    const rows = taxBreakdown(s.legal, 'Deutschland', 0.3, 100);
    expect(rows).toHaveLength(3); // KSt, Soli, GewSt
  });

  it('ausländischer Standort behält den pauschalen Satz', () => {
    const s = newGame(9011);
    expect(effectiveCorporateTaxRate(s.legal, 'Polen', 0.19)).toBe(0.19);
    expect(taxBreakdown(s.legal, 'Polen', 0.19, 100)).toHaveLength(1);
  });

  it('ein profitables dt. Unternehmen zahlt genau den KSt+Soli+GewSt-Satz — Bilanz bleibt konsistent', () => {
    const s = newGame(9012);
    bumpRetained(s, 1_000_000); // Verlustvorträge aufgebraucht (bilanzkonform)
    for (const c of s.customers.cohorts) c.arpaMonthly *= 50; // Umsatz weit über Kosten
    const r = closeWeek(s);
    expect(r.invariants.ok).toBe(true);
    expect(r.incomeStatement.tax).toBeGreaterThan(0);
    const ebt = r.incomeStatement.netIncome + r.incomeStatement.tax;
    const realized = r.incomeStatement.tax / ebt;
    expect(realized).toBeCloseTo(0.15 + 0.15 * 0.055 + 0.035 * 4.9, 2);
  });
});

describe('Kapitalerhöhung', () => {
  it('hebt das Nennkapital, begrenzt durch das eingezahlte Kapital', () => {
    const s = newGame(9020);
    applyAction(s, { type: 'CAPITAL_INCREASE', targetNennkapital: 50_000 }, null, 'dec_cap');
    expect(s.legal.nennkapital).toBe(50_000);
    // über das eingezahlte Kapital hinaus nicht möglich
    expect(validateAction(s, { type: 'CAPITAL_INCREASE', targetNennkapital: s.finance.contributedCapital + 1 }).ok).toBe(false);
    // Rückschritt unmöglich
    expect(validateAction(s, { type: 'CAPITAL_INCREASE', targetNennkapital: 40_000 }).ok).toBe(false);
  });
});

describe('Formwechsel GmbH → AG', () => {
  it('ist ohne ausreichendes Grundkapital gesperrt, danach möglich und nach der Frist wirksam', () => {
    const s = newGame(9030);
    forceCash(s, 500_000);
    // 25k < 50k ⇒ noch nicht
    expect(validateAction(s, { type: 'CONVERT_LEGAL_FORM', toForm: 'AG' }).ok).toBe(false);
    applyAction(s, { type: 'CAPITAL_INCREASE', targetNennkapital: MIN_KAPITAL.AG }, null, 'dec_cap');
    const v = validateAction(s, { type: 'CONVERT_LEGAL_FORM', toForm: 'AG' });
    expect(v.ok).toBe(true);
    applyAction(s, { type: 'CONVERT_LEGAL_FORM', toForm: 'AG' }, null, 'dec_conv');
    expect(s.legal.pendingConversion?.toForm).toBe('AG');
    expect(s.legal.rechtsform).toBe('GmbH'); // erst nach der Umwandlungsfrist wirksam
    for (let i = 0; i < FORMWECHSEL_WEEKS + 1; i++) closeWeek(s);
    expect(s.legal.rechtsform).toBe('AG');
    expect(s.legal.formHistory).toHaveLength(1);
    expect(s.legal.formHistory[0]).toMatchObject({ from: 'GmbH', to: 'AG' });
  });

  it('ein laufender Formwechsel lässt sich nicht doppelt starten', () => {
    const s = newGame(9031);
    forceCash(s, 500_000);
    applyAction(s, { type: 'CAPITAL_INCREASE', targetNennkapital: MIN_KAPITAL.AG }, null, 'dec_cap');
    applyAction(s, { type: 'CONVERT_LEGAL_FORM', toForm: 'AG' }, null, 'dec_conv');
    expect(validateAction(s, { type: 'CONVERT_LEGAL_FORM', toForm: 'AG' }).ok).toBe(false);
  });
});

describe('IPO-Gate: nur die AG ist börsenfähig (§ 2 AktG)', () => {
  it('als GmbH ist das Rechtsform-Kriterium hart verletzt; als AG erfüllt', () => {
    const s = newGame(9040);
    const asGmbh = ipoEligibility(s);
    const agCrit = asGmbh.criteria.find((c) => /Börsenfähige Rechtsform/.test(c.labelDe))!;
    expect(agCrit.ok).toBe(false);
    expect(asGmbh.ok).toBe(false);
    // Als AG ist genau dieses Kriterium erfüllt.
    s.legal.rechtsform = 'AG';
    const asAg = ipoEligibility(s);
    expect(asAg.criteria.find((c) => /Börsenfähige Rechtsform/.test(c.labelDe))!.ok).toBe(true);
  });
});

describe('Gewinnausschüttung', () => {
  it('schüttet aus der Gewinnrücklage aus, hält die Invarianten und ist begrenzt', () => {
    const s = newGame(9050);
    bumpRetained(s, 300_000);
    applyAction(s, { type: 'DISTRIBUTE_DIVIDEND', amount: 100_000 }, null, 'dec_div');
    const r = closeWeek(s);
    expect(r.invariants.ok).toBe(true);
    expect(s.legal.dividends).toHaveLength(1);
    expect(s.legal.dividends[0]!.amount).toBe(100_000);
    // Mehr als die Rücklage lässt sich nicht ausschütten.
    expect(validateAction(s, { type: 'DISTRIBUTE_DIVIDEND', amount: 10_000_000 }).ok).toBe(false);
  });
});

describe('Gesellschafterversammlung', () => {
  it('setzt den Turnus zurück und kann Rückendeckung geben', () => {
    const s = newGame(9060);
    s.ceo.boardTrust = 60; // solide Lage ⇒ Entlastung
    const trustBefore = s.ceo.boardTrust;
    applyAction(s, { type: 'HOLD_SHAREHOLDER_MEETING' }, null, 'dec_hv');
    expect(s.legal.lastMeetingWeek).toBe(s.meta.week);
    expect(s.legal.nextMeetingWeek).toBe(s.meta.week + 52);
    expect(s.ceo.boardTrust).toBeGreaterThanOrEqual(trustBefore);
  });
});

describe('Invarianten über eine Laufzeit mit Kapitalmaßnahmen', () => {
  it('Kapitalerhöhung, Formwechsel und Ausschüttung halten die Bilanz-Identität', () => {
    const s = newGame(9070);
    bumpRetained(s, 400_000);
    applyAction(s, { type: 'CAPITAL_INCREASE', targetNennkapital: MIN_KAPITAL.AG }, null, 'dec_cap');
    applyAction(s, { type: 'CONVERT_LEGAL_FORM', toForm: 'AG' }, null, 'dec_conv');
    applyAction(s, { type: 'DISTRIBUTE_DIVIDEND', amount: 80_000 }, null, 'dec_div');
    let weeks = 0;
    for (let w = 0; w < 20 && s.meta.status === 'active'; w++) {
      const r = closeWeek(s);
      expect(r.invariants.ok).toBe(true);
      weeks++;
    }
    expect(weeks).toBeGreaterThanOrEqual(8);
    expect(s.legal.rechtsform).toBe('AG');
  });
});

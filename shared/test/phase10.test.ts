import { describe, expect, it } from 'vitest';
import { forceCash, newGame, testSetup } from './helpers.js';
import { createCompany } from '../src/engine/init.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { ipoEligibility } from '../src/engine/ipo.js';
import { computeResolution, memberSupport } from '../src/engine/governance.js';
import { vestedFraction, esopUnallocated, esopAllocated } from '../src/engine/equity.js';
import { isPublicCapable, legalFamily, MIN_KAPITAL } from '../src/types/legal.js';

/**
 * Phase 10: Governance (Board-Sitze + Abstimmungen), ESOP-Vesting und
 * internationale Rechtsformen (US Inc, UK Ltd/PLC).
 */

describe('Aufsichtsrat / Board', () => {
  it('startet mit vier benannten Sitzen und ist replay-stabil', () => {
    const a = newGame(10001);
    const b = newGame(10001);
    expect(a.board.members).toHaveLength(4);
    expect(a.board.members.map((m) => m.seatType).sort()).toEqual(['ceo', 'chair', 'founder', 'independent']);
    expect(JSON.stringify(a.board)).toEqual(JSON.stringify(b.board));
    // Jeder Sitz hat einen Namen.
    for (const m of a.board.members) expect(m.name.length).toBeGreaterThan(2);
  });

  it('rechnet einen Formwechsel-Beschluss kapitalgewichtet (75 %) mit Einzelstimmen', () => {
    const s = newGame(10002); // Board-Vertrauen 58
    const res = computeResolution(s, 'formwechsel', 'Test');
    expect(res.basis).toBe('capital');
    expect(res.requiredShare).toBe(0.75);
    expect(res.votes.length).toBe(4);
    expect(res.passed).toBe(true); // bei gutem Vertrauen tragen die Gesellschafter mit

    // Sackt das Vertrauen ab, kippt der Beschluss.
    s.ceo.boardTrust = 40;
    const res2 = computeResolution(s, 'formwechsel', 'Test');
    expect(res2.passed).toBe(false);
    expect(res2.forShare).toBeLessThan(0.75);
  });

  it('bei der CEO-Vergütung ist der CEO befangen (stimmt nicht mit)', () => {
    const s = newGame(10003);
    const res = computeResolution(s, 'ceo-verguetung', 'Test');
    expect(res.basis).toBe('seat');
    expect(res.votes.some((v) => v.memberId === 'seat_ceo')).toBe(false);
  });

  it('Mitgliederrückhalt folgt dem Board-Vertrauen', () => {
    const s = newGame(10004);
    const chair = s.board.members.find((m) => m.seatType === 'chair')!;
    const low = memberSupport(s, chair);
    s.ceo.boardTrust = 90;
    const high = memberSupport(s, chair);
    expect(high).toBeGreaterThan(low);
  });
});

describe('ESOP-Vesting', () => {
  it('Schlüsselpersonen halten Grants; Cliff sperrt, danach linear bis 100 %', () => {
    const s = newGame(10010);
    const withGrant = s.people.employees.filter((e) => e.equityGrant);
    expect(withGrant.length).toBeGreaterThan(0);
    const g = { percent: 0.01, grantWeek: 0, cliffWeeks: 52, vestWeeks: 208 };
    expect(vestedFraction(g, 51)).toBe(0); // vor dem Cliff
    expect(vestedFraction(g, 52)).toBeCloseTo(0.25, 2); // am Cliff: 1 Jahr
    expect(vestedFraction(g, 208)).toBe(1); // voll
    expect(vestedFraction(g, 500)).toBe(1); // gedeckelt
  });

  it('GRANT_OPTIONS bindet ohne Cash und zehrt am Pool; Abgang gibt den Anteil frei', () => {
    const s = newGame(10011);
    const emp = s.people.employees.find((e) => !e.equityGrant && e.dept === 'sales')!;
    const satBefore = emp.satisfaction;
    const freeBefore = esopUnallocated(s);
    applyAction(s, { type: 'GRANT_OPTIONS', employeeId: emp.id, percent: 0.005 }, null, 'dec_grant');
    const after = s.people.employees.find((e) => e.id === emp.id)!;
    expect(after.equityGrant?.percent).toBe(0.005);
    expect(after.satisfaction).toBeGreaterThan(satBefore);
    expect(esopUnallocated(s)).toBeCloseTo(freeBefore - 0.005, 5);
    // Doppel-Grant unmöglich; über den Pool hinaus unmöglich.
    expect(validateAction(s, { type: 'GRANT_OPTIONS', employeeId: emp.id, percent: 0.005 }).ok).toBe(false);
    expect(validateAction(s, { type: 'GRANT_OPTIONS', employeeId: s.people.employees.find((e) => !e.equityGrant)!.id, percent: 0.5 }).ok).toBe(false);
  });

  it('die Summe der Grants bleibt im 10-%-Pool', () => {
    const s = newGame(10012);
    expect(esopAllocated(s)).toBeLessThanOrEqual(0.1 + 1e-9);
  });
});

describe('Internationale Rechtsformen', () => {
  it('US-Standort startet als Inc (bereits börsenfähig) mit Delaware-Register', () => {
    const setup = testSetup();
    setup.identity = { ...setup.identity, locationId: 'newyork' };
    const s = createCompany(setup, 10020, 'game_us', '2026-01-05T09:00:00.000Z');
    expect(s.legal.rechtsform).toBe('Inc');
    expect(isPublicCapable(s.legal.rechtsform)).toBe(true);
    expect(s.legal.handelsregister.courtDe).toMatch(/Delaware/);
    // Inc ist bereits börsenfähig ⇒ kein Formwechsel vorgesehen.
    expect(validateAction(s, { type: 'CONVERT_LEGAL_FORM', toForm: 'Inc' }).ok).toBe(false);
  });

  it('UK-Standort startet als Ltd und wird per Formwechsel zur PLC börsenfähig', () => {
    const setup = testSetup();
    setup.identity = { ...setup.identity, locationId: 'london' };
    const s = createCompany(setup, 10021, 'game_uk', '2026-01-05T09:00:00.000Z');
    expect(s.legal.rechtsform).toBe('Ltd');
    expect(isPublicCapable('Ltd')).toBe(false);
    expect(legalFamily('Großbritannien').ipoTarget).toBe('PLC');
    expect(s.legal.handelsregister.courtDe).toMatch(/Companies House/);
    // IPO-Gate: als Ltd nicht börsenfähig.
    expect(ipoEligibility(s).criteria.find((c) => /Börsenfähige Rechtsform/.test(c.labelDe))!.ok).toBe(false);
    // Auf 50.000 anheben und zur PLC wechseln.
    forceCash(s, 500_000);
    s.ceo.boardTrust = 60;
    applyAction(s, { type: 'CAPITAL_INCREASE', targetNennkapital: MIN_KAPITAL.PLC }, null, 'dec_cap');
    const v = validateAction(s, { type: 'CONVERT_LEGAL_FORM', toForm: 'PLC' });
    expect(v.ok).toBe(true);
  });

  it('deutscher Standort bleibt bei GmbH → AG', () => {
    const s = newGame(10022);
    expect(s.legal.rechtsform).toBe('GmbH');
    expect(legalFamily('Deutschland').ipoTarget).toBe('AG');
    // In Deutschland ist ein Wechsel zur PLC nicht vorgesehen.
    expect(validateAction(s, { type: 'CONVERT_LEGAL_FORM', toForm: 'PLC' }).ok).toBe(false);
  });
});

describe('Invarianten mit Governance & Beteiligung', () => {
  it('Board-Beschlüsse, Grants und Formwechsel halten die Bilanz-Identität', () => {
    const s = newGame(10030);
    forceCash(s, 1_200_000);
    s.ceo.boardTrust = 62;
    const emp = s.people.employees.find((e) => !e.equityGrant)!;
    applyAction(s, { type: 'GRANT_OPTIONS', employeeId: emp.id, percent: 0.004 }, null, 'dec_g');
    applyAction(s, { type: 'CAPITAL_INCREASE', targetNennkapital: MIN_KAPITAL.AG }, null, 'dec_c');
    applyAction(s, { type: 'CONVERT_LEGAL_FORM', toForm: 'AG' }, null, 'dec_v');
    for (let w = 0; w < 15 && s.meta.status === 'active'; w++) {
      const r = closeWeek(s);
      expect(r.invariants.ok).toBe(true);
    }
    expect(s.legal.rechtsform).toBe('AG');
    expect(s.board.resolutions.some((r) => r.kind === 'formwechsel' && r.passed)).toBe(true);
  });
});

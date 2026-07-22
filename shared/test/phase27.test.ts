import { describe, expect, it } from 'vitest';
import { newGame, forceCash } from './helpers.js';
import { applyAction, validateAction } from '../src/engine/actions.js';

/**
 * Phase 22 (C2): Weitere CEO-Züge — Sonderbonus, Star-Neuzugang, Kundenbeirat,
 * Ethik-/Compliance-Programm. Alle on-demand ⇒ Golden-Master-neutral.
 */

const modOf = (s: ReturnType<typeof newGame>, source: string, target: string) =>
  s.activeModifiers.find((m) => m.sourceDe.startsWith(source) && m.target === target);

describe('Weitere CEO-Züge', () => {
  it('Sonderbonus setzt einen Attritions-Modifikator und braucht Liquidität', () => {
    const s = newGame(27000);
    forceCash(s, 300_000);
    applyAction(s, { type: 'SPECIAL_BONUS', amount: 60_000 }, null, 'd');
    const mod = modOf(s, 'Sonderbonus', 'attritionRisk');
    expect(mod).toBeDefined();
    expect(mod!.factor).toBeLessThan(1);
    const poor = newGame(27001);
    forceCash(poor, 10_000);
    expect(validateAction(poor, { type: 'SPECIAL_BONUS', amount: 60_000 }).ok).toBe(false);
  });

  it('Star-Neuzugang hebt je Abteilung den passenden Output + Arbeitgebermarke', () => {
    const s = newGame(27002);
    forceCash(s, 300_000);
    const repBefore = s.reputation.laborMarket;
    applyAction(s, { type: 'STAR_HIRE', dept: 'engineering' }, null, 'd');
    expect(modOf(s, 'Star-Neuzugang', 'velocity')).toBeDefined();
    expect(s.reputation.laborMarket).toBeGreaterThan(repBefore);

    const sales = newGame(27002);
    forceCash(sales, 300_000);
    applyAction(sales, { type: 'STAR_HIRE', dept: 'sales' }, null, 'd');
    expect(modOf(sales, 'Star-Neuzugang', 'leadGen')).toBeDefined();
    expect(modOf(sales, 'Star-Neuzugang', 'trialWinRate')).toBeDefined();
  });

  it('Star-Neuzugang braucht ~60 k€ Liquidität', () => {
    const s = newGame(27003);
    forceCash(s, 40_000);
    expect(validateAction(s, { type: 'STAR_HIRE', dept: 'marketing' }).ok).toBe(false);
    forceCash(s, 120_000);
    expect(validateAction(s, { type: 'STAR_HIRE', dept: 'marketing' }).ok).toBe(true);
  });

  it('Kundenbeirat hebt NPS und senkt den Churn-Modifikator', () => {
    const s = newGame(27004);
    forceCash(s, 100_000);
    const npsBefore = s.product.nps;
    applyAction(s, { type: 'CUSTOMER_ADVISORY_BOARD' }, null, 'd');
    expect(s.product.nps).toBeGreaterThan(npsBefore);
    const churn = modOf(s, 'Kundenbeirat', 'churnMonthly');
    expect(churn).toBeDefined();
    expect(churn!.factor).toBeLessThan(1);
  });

  it('Ethik-Programm senkt Regulierungsdruck & Skandal-Risiko (Bezug M5/M3)', () => {
    const s = newGame(27005);
    forceCash(s, 100_000);
    s.politics.regulatoryPressure = 50;
    s.politics.exposure = 40;
    applyAction(s, { type: 'ETHICS_PROGRAM' }, null, 'd');
    expect(s.politics.regulatoryPressure).toBe(38);
    expect(s.politics.exposure).toBe(30);
    expect(s.reputation.laborMarket).toBeGreaterThan(0);
  });

  it('Ethik-Programm clampt nie unter 0', () => {
    const s = newGame(27006);
    forceCash(s, 100_000);
    s.politics.regulatoryPressure = 4;
    s.politics.exposure = 3;
    applyAction(s, { type: 'ETHICS_PROGRAM' }, null, 'd');
    expect(s.politics.regulatoryPressure).toBe(0);
    expect(s.politics.exposure).toBe(0);
  });
});

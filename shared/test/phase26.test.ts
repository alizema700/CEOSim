import { describe, expect, it } from 'vitest';
import { newGame, forceCash } from './helpers.js';
import { applyAction, validateAction } from '../src/engine/actions.js';

/**
 * Phase 22 (C1): Strategische CEO-Züge — Townhall, strategische Initiative,
 * Sparprogramm, Key-Account-Offensive, Markenkampagne. Alle on-demand ⇒
 * Golden-Master-neutral (im Scripted-Lauf nie ausgelöst).
 */

const hasMod = (s: ReturnType<typeof newGame>, source: string) => s.activeModifiers.some((m) => m.sourceDe.startsWith(source));

describe('Strategische CEO-Züge', () => {
  it('Townhall kostet Energie und setzt je nach Thema Moral-/Fokus-/Vertrauens-Effekte', () => {
    const s = newGame(26000);
    s.ceo.energy = 60;
    applyAction(s, { type: 'TOWNHALL', theme: 'strategie' }, null, 'd');
    expect(s.ceo.energy).toBe(52);
    expect(hasMod(s, 'Townhall')).toBe(true);
    const t = newGame(26000);
    const repBefore = t.reputation.laborMarket;
    applyAction(t, { type: 'TOWNHALL', theme: 'transparenz' }, null, 'd');
    expect(t.reputation.laborMarket).toBeGreaterThan(repBefore);
  });

  it('Townhall braucht genug Energie', () => {
    const s = newGame(26001);
    s.ceo.energy = 5;
    expect(validateAction(s, { type: 'TOWNHALL', theme: 'motivation' }).ok).toBe(false);
    s.ceo.energy = 40;
    expect(validateAction(s, { type: 'TOWNHALL', theme: 'motivation' }).ok).toBe(true);
  });

  it('Strategische Initiative: hohe Strategie + Budget ⇒ eher Erfolg (Produkt-NPS steigt)', () => {
    // Erfolg finden: mit maximaler Strategie & großem Budget ist die Chance hoch.
    let sawSuccess = false;
    for (let seed = 26100; seed < 26130 && !sawSuccess; seed++) {
      const s = newGame(seed);
      forceCash(s, 800_000);
      s.ceo.skills.strategie = 100;
      const npsBefore = s.product.nps;
      applyAction(s, { type: 'LAUNCH_INITIATIVE', focus: 'produkt', budget: 250_000 }, null, 'd');
      if (s.product.nps > npsBefore) sawSuccess = true;
    }
    expect(sawSuccess).toBe(true);
  });

  it('Strategische Initiative: Validierung braucht Budget ≤ Kasse', () => {
    const s = newGame(26002);
    forceCash(s, 50_000);
    expect(validateAction(s, { type: 'LAUNCH_INITIATIVE', focus: 'markt', budget: 200_000 }).ok).toBe(false);
    expect(validateAction(s, { type: 'LAUNCH_INITIATIVE', focus: 'markt', budget: 30_000 }).ok).toBe(true);
  });

  it('Sparprogramm kürzt Marketing- & G&A-Budget und setzt Attritions-Modifikator', () => {
    const s = newGame(26003);
    const mBefore = s.finance.budgetsMonthly.marketing;
    const gBefore = s.finance.budgetsMonthly.gaOther;
    applyAction(s, { type: 'AUSTERITY', intensity: 'hart' }, null, 'd');
    expect(s.finance.budgetsMonthly.marketing).toBeLessThan(mBefore);
    expect(s.finance.budgetsMonthly.gaOther).toBeLessThan(gBefore);
    expect(hasMod(s, 'Sparprogramm')).toBe(true);
  });

  it('Key-Account-Offensive senkt Churn-Modifikator und kostet Energie', () => {
    const s = newGame(26004);
    s.ceo.energy = 50;
    applyAction(s, { type: 'KEY_ACCOUNT_OFFENSIVE' }, null, 'd');
    expect(s.ceo.energy).toBe(43);
    const churnMod = s.activeModifiers.find((m) => m.sourceDe === 'Key-Account-Offensive' && m.target === 'churnMonthly');
    expect(churnMod).toBeDefined();
    expect(churnMod!.factor).toBeLessThan(1);
  });

  it('Markenkampagne hebt Lead-Zufluss und Presse-Reputation', () => {
    const s = newGame(26005);
    forceCash(s, 400_000);
    const pressBefore = s.reputation.press;
    applyAction(s, { type: 'BRAND_CAMPAIGN', budget: 120_000 }, null, 'd');
    const leadMod = s.activeModifiers.find((m) => m.sourceDe === 'Markenkampagne' && m.target === 'leadGen');
    expect(leadMod).toBeDefined();
    expect(leadMod!.factor).toBeGreaterThan(1);
    expect(s.reputation.press).toBeGreaterThan(pressBefore);
  });
});

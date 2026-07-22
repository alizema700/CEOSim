import { describe, expect, it } from 'vitest';
import { newGame, forceCash } from './helpers.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { closeWeek } from '../src/engine/tick.js';

/**
 * Phase 22 (M6): Firmen-Treasury — Geldmarkt-Anlage als eigene Aktiva-Klasse.
 * Verzinst sich mit dem Leitzins, zählt aber nicht als Runway-Puffer.
 * closeWeek prüft die Bilanz- & Cashflow-Invarianten hart — jeder grüne Lauf
 * bestätigt sie bereits; zusätzlich prüfen wir die Aktiva=Passiva-Identität roh.
 */

function balanced(s: ReturnType<typeof newGame>): boolean {
  const f = s.finance;
  const passiva = f.accountsPayable + f.deferredRevenue + f.debt.principal + f.contributedCapital + f.retainedEarnings;
  const aktiva = f.cash + f.accountsReceivable + f.treasury;
  return Math.abs(aktiva - passiva) < 0.02;
}

describe('Firmen-Treasury', () => {
  it('Anlage verschiebt Cash → Treasury zum Wochenschluss (bilanzneutral)', () => {
    const s = newGame(24000);
    forceCash(s, 500_000);
    expect(balanced(s)).toBe(true);
    applyAction(s, { type: 'TREASURY_ALLOCATE', amount: 200_000 }, null, 'd');
    expect(s.finance.treasury).toBe(0); // erst terminiert, noch nicht gebucht
    closeWeek(s);
    expect(s.finance.treasury).toBe(200_000);
    expect(balanced(s)).toBe(true);
  });

  it('Treasury verzinst sich (Zinsertrag > 0) und bleibt bilanzkonform', () => {
    const s = newGame(24001);
    forceCash(s, 600_000);
    applyAction(s, { type: 'TREASURY_ALLOCATE', amount: 300_000 }, null, 'd');
    closeWeek(s);
    const yieldBefore = s.finance.treasuryYieldTotal;
    expect(yieldBefore).toBeGreaterThan(0); // schon im Anlagewoche-Tick verzinst
    closeWeek(s);
    expect(s.finance.treasuryYieldTotal).toBeGreaterThan(yieldBefore);
    expect(balanced(s)).toBe(true);
  });

  it('Auflösung holt die Mittel zurück in die Kasse', () => {
    const s = newGame(24002);
    forceCash(s, 500_000);
    applyAction(s, { type: 'TREASURY_ALLOCATE', amount: 250_000 }, null, 'd');
    closeWeek(s);
    expect(s.finance.treasury).toBe(250_000);
    const cashMid = s.finance.cash;
    applyAction(s, { type: 'TREASURY_WITHDRAW', amount: 250_000 }, null, 'd');
    closeWeek(s);
    expect(s.finance.treasury).toBe(0);
    expect(s.finance.cash).toBeGreaterThan(cashMid); // Mittel sind zurück
    expect(balanced(s)).toBe(true);
  });

  it('Validierung: Anlage braucht Cash, Auflösung braucht Treasury-Bestand', () => {
    const s = newGame(24003);
    forceCash(s, 100_000);
    expect(validateAction(s, { type: 'TREASURY_ALLOCATE', amount: 500_000 }).ok).toBe(false);
    expect(validateAction(s, { type: 'TREASURY_WITHDRAW', amount: 10_000 }).ok).toBe(false);
    expect(validateAction(s, { type: 'TREASURY_ALLOCATE', amount: 50_000 }).ok).toBe(true);
  });

  it('Treasury ist kein Runway-Puffer: Cash sinkt um den angelegten Betrag', () => {
    const s = newGame(24004);
    forceCash(s, 500_000);
    const cash0 = s.finance.cash;
    applyAction(s, { type: 'TREASURY_ALLOCATE', amount: 300_000 }, null, 'd');
    closeWeek(s);
    expect(s.finance.cash).toBeLessThan(cash0 - 250_000);
    expect(s.finance.treasury).toBe(300_000);
    expect(balanced(s)).toBe(true);
  });

  it('Bilanz & Cashflow bleiben über viele Wochen mit Treasury konsistent', () => {
    const s = newGame(24005);
    forceCash(s, 800_000);
    applyAction(s, { type: 'TREASURY_ALLOCATE', amount: 400_000 }, null, 'd');
    for (let i = 0; i < 12; i++) {
      closeWeek(s); // wirft bei Invarianten-Verletzung
      expect(balanced(s)).toBe(true);
      if (s.meta.status !== 'active') break;
    }
    expect(s.finance.treasury).toBeGreaterThan(0);
    expect(s.finance.treasuryYieldTotal).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { newGame } from './helpers.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { ceoNetWorth, portfolioValue, tickCeoPortfolio } from '../src/engine/ceo.js';

/**
 * Phase 20: Investments — privates CEO-Portfolio (Geldmarkt/Aktienindex/Angel),
 * gekoppelt an die Makrolage. Golden-Master-sicher: leer per Default = no-op.
 */

describe('CEO-Portfolio', () => {
  it('Anlegen verschiebt Netto-Cash ins Instrument; Aussteigen zurück', () => {
    const s = newGame(20000);
    s.ceo.personalNetCash = 200_000;
    applyAction(s, { type: 'CEO_INVEST', instrument: 'aktienindex', amount: 80_000 }, null, 'd');
    expect(s.ceo.personalNetCash).toBe(120_000);
    expect(s.ceo.portfolio.aktienindex).toBe(80_000);
    applyAction(s, { type: 'CEO_DIVEST', instrument: 'aktienindex', amount: 30_000 }, null, 'd');
    expect(s.ceo.personalNetCash).toBe(150_000);
    expect(s.ceo.portfolio.aktienindex).toBe(50_000);
  });

  it('Validierung: Anlage braucht Netto-Cash, Ausstieg braucht Bestand', () => {
    const s = newGame(20001);
    s.ceo.personalNetCash = 10_000;
    expect(validateAction(s, { type: 'CEO_INVEST', instrument: 'geldmarkt', amount: 50_000 }).ok).toBe(false);
    expect(validateAction(s, { type: 'CEO_DIVEST', instrument: 'geldmarkt', amount: 1_000 }).ok).toBe(false);
    expect(validateAction(s, { type: 'CEO_INVEST', instrument: 'geldmarkt', amount: 5_000 }).ok).toBe(true);
  });

  it('Geldmarkt verzinst sich mit dem Leitzins', () => {
    const s = newGame(20002);
    s.ceo.portfolio.geldmarkt = 100_000;
    s.macro.interestRatePct = 6;
    tickCeoPortfolio(s, []);
    expect(s.ceo.portfolio.geldmarkt).toBeGreaterThan(100_000);
  });

  it('Aktienindex im Bullenmarkt > Bärenmarkt (gleicher Seed)', () => {
    const bull = newGame(20003); bull.ceo.portfolio.aktienindex = 100_000; bull.macro.sentiment = 100;
    const bear = newGame(20003); bear.ceo.portfolio.aktienindex = 100_000; bear.macro.sentiment = -100;
    for (let i = 0; i < 12; i++) { tickCeoPortfolio(bull, []); tickCeoPortfolio(bear, []); bull.meta.week++; bear.meta.week++; }
    expect(bull.ceo.portfolio.aktienindex).toBeGreaterThan(bear.ceo.portfolio.aktienindex);
  });

  it('Angel-Portfolio schwankt (Exits/Ausfälle) und bleibt ≥ 0', () => {
    const s = newGame(20004);
    s.ceo.portfolio.angel = 100_000;
    let changed = false;
    for (let i = 0; i < 30; i++) {
      const before = s.ceo.portfolio.angel;
      tickCeoPortfolio(s, []);
      s.meta.week++;
      if (s.ceo.portfolio.angel !== before) changed = true;
      expect(s.ceo.portfolio.angel).toBeGreaterThanOrEqual(0);
    }
    expect(changed).toBe(true);
  });

  it('Netto-Vermögen enthält das Portfolio; leeres Portfolio ist neutral', () => {
    const s = newGame(20005);
    expect(portfolioValue(s)).toBe(0);
    expect(ceoNetWorth(s).portfolio).toBe(0);
    s.ceo.portfolio.geldmarkt = 40_000; s.ceo.portfolio.aktienindex = 60_000;
    expect(portfolioValue(s)).toBe(100_000);
    expect(ceoNetWorth(s).portfolio).toBe(100_000);
  });
});

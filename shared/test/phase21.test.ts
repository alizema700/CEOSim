import { describe, expect, it } from 'vitest';
import { newGame, forceCash } from './helpers.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { doLobby, tickPolitics, politicsTaxRelief, politicsSummaryDe } from '../src/engine/politics.js';
import { LOBBY_COST } from '../src/types/politics.js';

/**
 * Phase 22 (M3): Lobbyismus & Politik — politisches Kapital schaltet ab Schwellen
 * Steuererleichterung / Fördermittel / Zugang frei, gegen ein Skandal-Risiko.
 * Golden-Master-sicher: ohne Lobbying bleibt alles inert (tickPolitics = no-op).
 */

/** Rohbilanz-Identität auf State-Werten (Aktiva = Passiva). */
function balanced(s: ReturnType<typeof newGame>): boolean {
  const f = s.finance;
  const passiva = f.accountsPayable + f.deferredRevenue + f.debt.principal + f.contributedCapital + f.retainedEarnings;
  const aktiva = f.cash + f.accountsReceivable;
  return Math.abs(aktiva - passiva) < 0.01;
}

describe('Lobbyismus & Politik', () => {
  it('Ein Lobby-Zug baut politisches Kapital auf und erhöht das Skandal-Risiko', () => {
    const s = newGame(21000);
    const capBefore = s.politics.politicalCapital;
    applyAction(s, { type: 'LOBBY', focus: 'steuern' }, null, 'd');
    expect(s.politics.politicalCapital).toBeGreaterThan(capBefore);
    expect(s.politics.exposure).toBeGreaterThan(0);
    expect(s.politics.lobbyingSpendTotal).toBe(LOBBY_COST.steuern);
  });

  it('„Zugang" ist diskreter (weniger Exposure) als aggressives Steuer-Lobbying', () => {
    const a = newGame(21001);
    const b = newGame(21001);
    applyAction(a, { type: 'LOBBY', focus: 'steuern' }, null, 'd');
    applyAction(b, { type: 'LOBBY', focus: 'zugang' }, null, 'd');
    expect(b.politics.exposure).toBeLessThan(a.politics.exposure);
  });

  it('Validierung: zu wenig Liquidität blockiert das Lobbying', () => {
    const s = newGame(21002);
    forceCash(s, 5_000);
    expect(validateAction(s, { type: 'LOBBY', focus: 'steuern' }).ok).toBe(false);
    forceCash(s, 200_000);
    expect(validateAction(s, { type: 'LOBBY', focus: 'steuern' }).ok).toBe(true);
  });

  it('Steuer-Lobbyerfolg ab Schwelle senkt den effektiven Steuersatz dauerhaft', () => {
    const s = newGame(21003);
    s.politics.politicalCapital = 52; // + Lobby-Gewinn ⇒ ≥ 55
    doLobby(s, 'steuern', [], 'd');
    expect(s.politics.taxReliefPct).toBeCloseTo(0.03, 5);
    expect(politicsTaxRelief(s)).toBeCloseTo(0.03, 5);
  });

  it('Fördermittel-Erfolg schreibt den Zuschuss bilanzkonform gut', () => {
    const s = newGame(21004);
    s.politics.politicalCapital = 42; // + Lobby-Gewinn ⇒ ≥ 45
    const cashBefore = s.finance.cash;
    expect(balanced(s)).toBe(true);
    doLobby(s, 'subvention', [], 'd');
    expect(s.politics.subsidiesWon).toBeGreaterThan(0);
    expect(s.finance.cash).toBeGreaterThan(cashBefore);
    expect(balanced(s)).toBe(true); // Cash + Gegenbuchung in Gewinnrücklage
  });

  it('Unter der Schwelle bleibt der Erfolg aus (nur Kapitalaufbau)', () => {
    const s = newGame(21005);
    s.politics.politicalCapital = 10;
    doLobby(s, 'steuern', [], 'd');
    expect(s.politics.taxReliefPct).toBe(0);
  });

  it('tickPolitics ist ohne Lobbying ein No-op (Golden-Master-sicher)', () => {
    const s = newGame(21006);
    const cap = s.politics.politicalCapital;
    for (let i = 0; i < 15; i++) { tickPolitics(s, []); s.meta.week++; }
    expect(s.politics.politicalCapital).toBe(cap);
    expect(s.politics.exposure).toBe(0);
    expect(s.politics.logDe.length).toBe(0);
    expect(s.politics.lastScandalWeek).toBe(-99);
  });

  it('Hohe Exposure kann einen Lobbyismus-Skandal auslösen (Presse leidet)', () => {
    const s = newGame(21007);
    const pressBefore = s.reputation.press;
    let scandal = false;
    for (let i = 0; i < 40 && !scandal; i++) {
      s.politics.exposure = 90; // dauerhaft im Risikobereich halten
      const occ: { icon: string; textDe: string; severity: string }[] = [];
      tickPolitics(s, occ as never);
      s.meta.week++;
      if (s.politics.lastScandalWeek >= 0) scandal = true;
    }
    expect(scandal).toBe(true);
    expect(s.reputation.press).toBeLessThan(pressBefore);
  });

  it('politicsTaxRelief clampt auf 0..0,03', () => {
    const s = newGame(21008);
    s.politics.taxReliefPct = 0.1;
    expect(politicsTaxRelief(s)).toBeCloseTo(0.03, 5);
    s.politics.taxReliefPct = -1;
    expect(politicsTaxRelief(s)).toBe(0);
  });

  it('politicsSummaryDe fasst Kapital & Risiko zusammen', () => {
    const s = newGame(21009);
    s.politics.politicalCapital = 60;
    s.politics.taxReliefPct = 0.03;
    const txt = politicsSummaryDe(s);
    expect(txt).toContain('Politisches Kapital');
    expect(txt).toContain('Steuererleichterung');
  });
});

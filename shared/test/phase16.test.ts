import { describe, expect, it } from 'vitest';
import { newGame } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { macroLeadFactor, macroWinFactor } from '../src/engine/macro.js';
import { macroValuationMultiplier, regimeForSentiment } from '../src/types/macro.js';
import { computeValuation } from '../src/engine/kpis.js';

/**
 * Phase 16: Makroökonomie — deterministischer Konjunktur-Walk, beschränkte
 * Werte, milde Nachfrage-Modulation. Golden-Master bleibt (mild, regeneriert).
 */

describe('Konjunktur-Dynamik', () => {
  it('Marktstimmung bleibt beschränkt (−100..+100) und Zins in Bandbreite', () => {
    const s = newGame(16000);
    for (let i = 0; i < 40 && s.meta.status === 'active'; i++) {
      closeWeek(s);
      expect(s.macro.sentiment).toBeGreaterThanOrEqual(-100);
      expect(s.macro.sentiment).toBeLessThanOrEqual(100);
      expect(s.macro.interestRatePct).toBeGreaterThanOrEqual(1.5);
      expect(s.macro.interestRatePct).toBeLessThanOrEqual(7.5);
    }
  });

  it('Regime-Zuordnung folgt der Stimmungsschwelle', () => {
    expect(regimeForSentiment(80)).toBe('boom');
    expect(regimeForSentiment(30)).toBe('aufschwung');
    expect(regimeForSentiment(0)).toBe('neutral');
    expect(regimeForSentiment(-30)).toBe('abschwung');
    expect(regimeForSentiment(-80)).toBe('rezession');
  });

  it('Nachfrage-Faktoren sind mild beschränkt (Lead ±15 %, Win ±10 %)', () => {
    const s = newGame(16001);
    s.macro.sentiment = 100;
    expect(macroLeadFactor(s)).toBeLessThanOrEqual(1.15);
    expect(macroWinFactor(s)).toBeLessThanOrEqual(1.10);
    s.macro.sentiment = -100;
    expect(macroLeadFactor(s)).toBeGreaterThanOrEqual(0.85);
    expect(macroWinFactor(s)).toBeGreaterThanOrEqual(0.90);
    s.macro.sentiment = 0;
    expect(macroLeadFactor(s)).toBeCloseTo(1, 5);
  });

  it('bessere Stimmung ⇒ höherer Lead-Faktor', () => {
    const boom = newGame(16002); boom.macro.sentiment = 60;
    const bust = newGame(16002); bust.macro.sentiment = -60;
    expect(macroLeadFactor(boom)).toBeGreaterThan(macroLeadFactor(bust));
  });

  it('deterministisch: gleicher Seed ⇒ gleiche Konjunktur-Trajektorie', () => {
    const a = newGame(16003); const b = newGame(16003);
    for (let i = 0; i < 20; i++) { closeWeek(a); closeWeek(b); }
    expect(a.macro.sentiment).toBe(b.macro.sentiment);
    expect(a.macro.regime).toBe(b.macro.regime);
  });
});

describe('Makro-Ausbau (Inflation, Kapitalmarkt, Zins)', () => {
  it('Inflation & Kapitalmarkt-Index bleiben beschränkt', () => {
    const s = newGame(16010);
    for (let i = 0; i < 40 && s.meta.status === 'active'; i++) {
      closeWeek(s);
      expect(s.macro.inflationPct).toBeGreaterThanOrEqual(0.2);
      expect(s.macro.inflationPct).toBeLessThanOrEqual(8);
      expect(s.macro.capitalIndex).toBeGreaterThanOrEqual(35);
      expect(s.macro.capitalIndex).toBeLessThanOrEqual(220);
    }
  });

  it('Kapitalmarkt-Multiplikator ist neutral bei 100 und beschränkt', () => {
    expect(macroValuationMultiplier({ capitalIndex: 100 })).toBeCloseTo(1, 5);
    expect(macroValuationMultiplier({ capitalIndex: 200 })).toBeLessThanOrEqual(1.32);
    expect(macroValuationMultiplier({ capitalIndex: 40 })).toBeGreaterThanOrEqual(0.78);
  });

  it('Bullenmarkt hebt die Bewertung, Bärenmarkt senkt sie', () => {
    const bull = newGame(16011); bull.macro.capitalIndex = 130;
    const base = newGame(16011); base.macro.capitalIndex = 100;
    const bear = newGame(16011); bear.macro.capitalIndex = 70;
    expect(computeValuation(bull).value).toBeGreaterThan(computeValuation(base).value);
    expect(computeValuation(bear).value).toBeLessThan(computeValuation(base).value);
  });

  it('höhere Inflation ⇒ höherer Leitzins', () => {
    const hot = newGame(16012); hot.macro.inflationPct = 6; hot.macro.sentiment = 0;
    const calm = newGame(16012); calm.macro.inflationPct = 1.5; calm.macro.sentiment = 0;
    closeWeek(hot); closeWeek(calm);
    expect(hot.macro.interestRatePct).toBeGreaterThan(calm.macro.interestRatePct);
  });
});

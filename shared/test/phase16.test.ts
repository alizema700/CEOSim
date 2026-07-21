import { describe, expect, it } from 'vitest';
import { newGame } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { macroLeadFactor, macroWinFactor } from '../src/engine/macro.js';
import { regimeForSentiment } from '../src/types/macro.js';

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

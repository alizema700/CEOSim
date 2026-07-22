import { describe, expect, it } from 'vitest';
import { newGame } from './helpers.js';
import { computeEconomicOutlook, outlookSummaryDe } from '../src/engine/outlook.js';

/**
 * Phase 22 (M7): Wirtschaftsausblick — reine Ableitung aus Makro-/Politik-/
 * Regulierungslage. Kein Tick, keine Mutation ⇒ Golden-Master-neutral.
 */

describe('Wirtschaftsausblick', () => {
  it('Günstige Lage: hoher Kapitalmarkt + niedriger Zins ⇒ günstig/offen/positiv', () => {
    const s = newGame(25000);
    s.macro.capitalIndex = 130;
    s.macro.interestRatePct = 2;
    s.macro.inflationPct = 1.5;
    s.macro.sentiment = 40;
    const o = computeEconomicOutlook(s);
    expect(o.financingClimate).toBe('günstig');
    expect(o.valuationWindow).toBe('offen');
    expect(o.rateTrajectory).toBe('fallend');
    expect(o.demandOutlook).toBe('anziehend');
    expect(o.score).toBeGreaterThan(0);
  });

  it('Angespannte Lage: schwacher Kapitalmarkt + hoher Zins ⇒ angespannt/eng/negativ', () => {
    const s = newGame(25001);
    s.macro.capitalIndex = 78;
    s.macro.interestRatePct = 8;
    s.macro.inflationPct = 6;
    s.macro.sentiment = -40;
    const o = computeEconomicOutlook(s);
    expect(o.financingClimate).toBe('angespannt');
    expect(o.valuationWindow).toBe('eng');
    expect(o.rateTrajectory).toBe('steigend');
    expect(o.demandOutlook).toBe('nachlassend');
    expect(o.score).toBeLessThan(0);
    expect(o.risksDe.some((r) => /Inflation/.test(r))).toBe(true);
    expect(o.risksDe.some((r) => /Kapital|Zins/.test(r))).toBe(true);
  });

  it('Ein aktiver Negativ-Schock dämpft die Nachfrage und taucht in den Risiken auf', () => {
    const control = newGame(25002);
    control.macro.sentiment = 20; // ohne Schock: anziehend (> 15)
    expect(computeEconomicOutlook(control).demandOutlook).toBe('anziehend');

    const s = newGame(25002);
    s.macro.sentiment = 20;
    s.macro.shock = { kind: 'bankenbeben', startWeek: 30, endWeek: 36, headlineDe: 'x' };
    s.meta.week = 31;
    const o = computeEconomicOutlook(s);
    expect(o.demandOutlook).toBe('stabil'); // 20 − 12 (Schock) = 8 ⇒ herabgestuft
    expect(o.risksDe.some((r) => /Bankenbeben/.test(r))).toBe(true);
  });

  it('Eine aktive Auflage erscheint als Risiko', () => {
    const s = newGame(25003);
    s.politics.activeRegulation = { kind: 'kartellpruefung', startWeek: 30, endWeek: 35, headlineDe: 'x', complianceCost: 50_000 };
    const o = computeEconomicOutlook(s);
    expect(o.risksDe.some((r) => /Kartellprüfung|Aufsicht/.test(r))).toBe(true);
  });

  it('Der Ausblick hat immer vier Signale und eine Schlagzeile', () => {
    const s = newGame(25004);
    const o = computeEconomicOutlook(s);
    expect(o.signals.length).toBe(4);
    expect(o.headlineDe.length).toBeGreaterThan(10);
    expect(outlookSummaryDe(s)).toContain('Rückenwind-Index');
  });
});

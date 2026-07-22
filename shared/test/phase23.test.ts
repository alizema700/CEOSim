import { describe, expect, it } from 'vitest';
import { newGame } from './helpers.js';
import { tickRegulation, regulationSummaryDe } from '../src/engine/regulation.js';
import { doLobby } from '../src/engine/politics.js';
import { REGULATION_SPECS } from '../src/types/politics.js';

/**
 * Phase 22 (M5): Regulierung & Aufsicht — die politische Gegenkraft. Regulatorischer
 * Druck baut sich ab Woche 26 auf und entlädt sich in Auflagen; politisches Kapital
 * mildert Druck, Kosten und Dauer. Golden-Master-sicher (kein Effekt vor Woche 26).
 */

const REG_SOURCE = 'Regulierung';

describe('Regulierung & Aufsicht', () => {
  it('Vor Woche 26 baut sich kein Druck auf und es gibt keine Auflagen (Golden-sicher)', () => {
    const s = newGame(23000);
    for (let w = 1; w < 26; w++) {
      s.meta.week = w;
      tickRegulation(s, []);
      expect(s.politics.regulatoryPressure).toBe(0);
      expect(s.politics.activeRegulation).toBeNull();
    }
    expect(s.activeModifiers.some((m) => m.sourceDe === REG_SOURCE)).toBe(false);
  });

  it('Ab Woche 26 baut sich Regulierungsdruck auf', () => {
    const s = newGame(23001);
    for (let w = 26; w < 45; w++) { s.meta.week = w; tickRegulation(s, []); }
    expect(s.politics.regulatoryPressure).toBeGreaterThan(0);
  });

  it('Hoher Druck entlädt sich in eine Auflage mit Compliance-Kosten & Reibung', () => {
    const s = newGame(23002);
    s.politics.regulatoryPressure = 80;
    s.politics.lastRegulationWeek = -99;
    let fired = false;
    for (let w = 26; w < 90 && !fired; w++) {
      s.meta.week = w;
      const beforeScheduled = s.scheduledEffects.length;
      tickRegulation(s, []);
      if (s.politics.activeRegulation) {
        fired = true;
        // Eine ONE_OFF_COST wurde terminiert.
        expect(s.scheduledEffects.length).toBeGreaterThan(beforeScheduled);
        expect(s.politics.activeRegulation.complianceCost).toBeGreaterThan(0);
      }
      s.politics.regulatoryPressure = Math.max(s.politics.regulatoryPressure, 80); // im Risikobereich halten
    }
    expect(fired).toBe(true);
    // Während der Auflage ist ein Reibungs-Modifikator aktiv (jede Spec hat ≥1 Faktor ≠ 1).
    s.meta.week = s.politics.activeRegulation!.startWeek + 1;
    tickRegulation(s, []);
    expect(s.activeModifiers.some((m) => m.sourceDe === REG_SOURCE)).toBe(true);
    expect(regulationSummaryDe(s)).toMatch(/aktiv/);
  });

  it('Politisches Kapital senkt die Compliance-Kosten (Verteidigungswert von M3)', () => {
    const mk = (capital: number) => {
      const s = newGame(23003);
      s.politics.politicalCapital = capital;
      s.politics.regulatoryPressure = 85;
      s.politics.lastRegulationWeek = -99;
      for (let w = 26; w < 120; w++) {
        s.meta.week = w;
        tickRegulation(s, []);
        if (s.politics.activeRegulation) return s.politics.activeRegulation.complianceCost;
        s.politics.regulatoryPressure = Math.max(s.politics.regulatoryPressure, 85);
      }
      return null;
    };
    const lowCap = mk(0);
    const highCap = mk(100);
    expect(lowCap).not.toBeNull();
    expect(highCap).not.toBeNull();
    expect(highCap!).toBeLessThan(lowCap!);
  });

  it('Auflagen laufen ab und melden Entspannung', () => {
    const s = newGame(23004);
    s.meta.week = 40;
    s.politics.activeRegulation = { kind: 'datenschutz', startWeek: 36, endWeek: 40, headlineDe: 'x', complianceCost: 30_000 };
    const occ: { icon: string; textDe: string; severity: string }[] = [];
    tickRegulation(s, occ as never);
    expect(s.politics.activeRegulation).toBeNull();
    expect(s.politics.lastRegulationWeek).toBe(40);
    expect(occ.some((o) => /Aufsicht/.test(o.textDe))).toBe(true);
  });

  it('Lobbying „Zugang" senkt den Regulierungsdruck (M3 → M5)', () => {
    const s = newGame(23005);
    s.politics.regulatoryPressure = 50;
    doLobby(s, 'zugang', [], 'd');
    expect(s.politics.regulatoryPressure).toBeLessThan(50);
  });

  it('regulationSummaryDe nennt ohne Auflage nur den Druck', () => {
    const s = newGame(23006);
    s.politics.regulatoryPressure = 20;
    expect(regulationSummaryDe(s)).toContain('Regulierungsdruck');
    expect(regulationSummaryDe(s)).not.toMatch(/aktiv/);
  });

  it('Alle Auflagen-Specs sind mild geerdet', () => {
    for (const kind of Object.keys(REGULATION_SPECS) as (keyof typeof REGULATION_SPECS)[]) {
      const spec = REGULATION_SPECS[kind];
      expect(spec.baseCost).toBeGreaterThanOrEqual(20_000);
      expect(spec.baseCost).toBeLessThanOrEqual(80_000);
      expect(spec.leadFactor).toBeGreaterThanOrEqual(0.9);
      expect(spec.winFactor).toBeGreaterThanOrEqual(0.9);
      expect(spec.durationWeeks).toBeGreaterThanOrEqual(3);
      expect(spec.durationWeeks).toBeLessThanOrEqual(8);
    }
  });
});

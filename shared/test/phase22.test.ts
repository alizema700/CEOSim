import { describe, expect, it } from 'vitest';
import { newGame } from './helpers.js';
import { clamp } from '../src/types/common.js';
import { MACRO_SHOCK_SPECS, type MacroShockKind } from '../src/types/macro.js';
import { tickMacroShocks, macroShockSummaryDe } from '../src/engine/macroShocks.js';

/**
 * Phase 22 (M4): Wirtschaftsschock-Episoden — benannte Großereignisse mit
 * mehrwöchigem Bogen und echten Effekten auf Stimmung/Inflation/Kapitalmarkt/
 * Nachfrage. Golden-Master-sicher: kein Schock vor Woche 26 (Golden-Lauf endet W25).
 */

const SHOCK_SOURCE = 'Wirtschaftsschock';

describe('Wirtschaftsschocks', () => {
  it('Vor Woche 26 rollt niemals ein Schock (Golden-Master-sicher)', () => {
    const s = newGame(22000);
    for (let w = 1; w < 26; w++) {
      s.meta.week = w;
      tickMacroShocks(s, []);
      expect(s.macro.shock).toBeNull();
    }
    expect(s.activeModifiers.some((m) => m.sourceDe === SHOCK_SOURCE)).toBe(false);
  });

  it('Ab Woche 26 setzt ein Schock Onset-Impulse und Nachfrage-Modifikatoren', () => {
    const s = newGame(22001);
    let fired: { kind: MacroShockKind; preSent: number; preInfl: number } | null = null;
    for (let w = 26; w < 500 && !fired; w++) {
      s.meta.week = w;
      const preSent = s.macro.sentiment;
      const preInfl = s.macro.inflationPct;
      const wasActive = !!s.macro.shock;
      tickMacroShocks(s, []);
      if (!wasActive && s.macro.shock) fired = { kind: s.macro.shock.kind, preSent, preInfl };
    }
    expect(fired).not.toBeNull();
    const spec = MACRO_SHOCK_SPECS[fired!.kind];
    // Onset-Impuls auf die Stimmung angewandt (mit Clamp-Toleranz).
    expect(s.macro.sentiment).toBeCloseTo(clamp(fired!.preSent + spec.sentimentKick, -100, 100), 4);
    // Nachfrage-Modifikator aus dem Schock ist gesetzt (jede Spec hat ≥ 1 Faktor ≠ 1).
    expect(s.activeModifiers.some((m) => m.sourceDe === SHOCK_SOURCE)).toBe(true);
    // Summary spiegelt die aktive Episode.
    expect(macroShockSummaryDe(s)).toContain(spec.labelDe);
  });

  it('Eine Episode läuft nach ihrer Dauer ab und meldet Entspannung', () => {
    const s = newGame(22002);
    s.macro.shock = { kind: 'techhype', startWeek: 30, endWeek: 33, headlineDe: 'x' };
    s.meta.week = 32;
    tickMacroShocks(s, []);
    expect(s.macro.shock).not.toBeNull(); // noch aktiv
    expect(s.activeModifiers.some((m) => m.sourceDe === SHOCK_SOURCE)).toBe(true);

    s.meta.week = 33;
    const occ: { icon: string; textDe: string; severity: string }[] = [];
    tickMacroShocks(s, occ as never);
    expect(s.macro.shock).toBeNull(); // abgelaufen
    expect(s.macro.lastShockEpisodeWeek).toBe(33);
    expect(occ.some((o) => /Entspannung/.test(o.textDe))).toBe(true);
    // Nach Ablauf sind keine Schock-Modifikatoren mehr aktiv.
    expect(s.activeModifiers.some((m) => m.sourceDe === SHOCK_SOURCE)).toBe(false);
  });

  it('Nach einer Episode gilt ein Cooldown, bevor der nächste Schock rollen kann', () => {
    const s = newGame(22003);
    s.macro.lastShockEpisodeWeek = 40;
    for (let w = 41; w < 54; w++) { s.meta.week = w; tickMacroShocks(s, []); } // 53−40 = 13 < 14
    expect(s.macro.shock).toBeNull();
  });

  it('macroShockSummaryDe ist ohne aktive Episode leer', () => {
    const s = newGame(22004);
    expect(macroShockSummaryDe(s)).toBe('');
  });

  it('Alle Schock-Specs sind mild geerdet (Impulse & Faktoren im Rahmen)', () => {
    for (const kind of Object.keys(MACRO_SHOCK_SPECS) as MacroShockKind[]) {
      const spec = MACRO_SHOCK_SPECS[kind];
      expect(Math.abs(spec.sentimentKick)).toBeLessThanOrEqual(30);
      expect(Math.abs(spec.capKick)).toBeLessThanOrEqual(60);
      expect(spec.leadFactor).toBeGreaterThanOrEqual(0.9);
      expect(spec.leadFactor).toBeLessThanOrEqual(1.1);
      expect(spec.winFactor).toBeGreaterThanOrEqual(0.9);
      expect(spec.winFactor).toBeLessThanOrEqual(1.1);
      expect(spec.durationWeeks).toBeGreaterThanOrEqual(3);
      expect(spec.durationWeeks).toBeLessThanOrEqual(9);
      // Mindestens ein Nachfrage-Faktor weicht von 1 ab (sonst wären Modifikator-Tests leer).
      expect(spec.leadFactor !== 1 || spec.winFactor !== 1).toBe(true);
    }
  });
});

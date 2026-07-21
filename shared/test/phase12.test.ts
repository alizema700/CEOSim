import { describe, expect, it } from 'vitest';
import { newGame } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { ceoNetWorth, focusIntensity } from '../src/engine/ceo.js';
import { computeValuation } from '../src/engine/kpis.js';
import { balancedFocus } from '../src/types/ceo.js';

/**
 * Phase 12: Der CEO als Mensch — Netto-Vermögen, Energie/Burnout, Wochenfokus
 * (mit echten Trade-offs), öffentliche Auftritte und Executive-Coaching.
 */

describe('Persönliches Vermögen', () => {
  it('Netto-Cash akkumuliert wöchentlich; Netto-Vermögen = Cash + Anteilswert', () => {
    const s = newGame(12001);
    expect(s.ceo.personalNetCash).toBe(0);
    closeWeek(s);
    expect(s.ceo.personalNetCash).toBeGreaterThan(0); // Gehalt nach Steuer
    const nw = ceoNetWorth(s);
    expect(nw.equityValue).toBeCloseTo(s.ceo.equityShare * computeValuation(s).value, 0);
    expect(nw.total).toBeCloseTo(nw.netCash + nw.equityValue, 3);
    expect(nw.total).toBeGreaterThan(nw.netCash); // Anteil trägt das Vermögen
  });
});

describe('Energie & Erholung', () => {
  it('Auszeit hebt die Energie sofort', () => {
    const s = newGame(12003);
    s.ceo.energy = 30;
    applyAction(s, { type: 'CEO_REST' }, null, 'dec_rest');
    expect(s.ceo.energy).toBeGreaterThanOrEqual(56); // +28
  });

  it('Energie ist replay-stabil', () => {
    const a = newGame(12008);
    const b = newGame(12008);
    for (let i = 0; i < 12; i++) { closeWeek(a); closeWeek(b); }
    expect(a.ceo.energy).toBe(b.ceo.energy);
  });
});

describe('Wochenfokus', () => {
  it('focusIntensity: ausgeglichen = 0, alles auf ein Feld = 1', () => {
    expect(focusIntensity(balancedFocus())).toBe(0);
    expect(focusIntensity({ produkt: 5, vertrieb: 0, team: 0, investoren: 0, aussenwirkung: 0 })).toBe(1);
  });

  it('ausgeglichener Default erzeugt KEINE Fokus-Modifikatoren (Golden-Master-sicher)', () => {
    const s = newGame(12002);
    closeWeek(s);
    expect(s.activeModifiers.some((m) => m.sourceDe === 'CEO-Fokus')).toBe(false);
  });

  it('zugespitzter Fokus erzeugt Rückenwind-Modifikatoren und einen Investoren-Nudge', () => {
    const s = newGame(12009);
    applyAction(s, { type: 'SET_CEO_FOCUS', focus: { produkt: 3, vertrieb: 1, team: 1, investoren: 0, aussenwirkung: 0 } }, null, 'dec_f');
    closeWeek(s);
    const focusMods = s.activeModifiers.filter((m) => m.sourceDe === 'CEO-Fokus');
    expect(focusMods.some((m) => m.target === 'velocity' && (m.factor ?? 1) > 1)).toBe(true);
    // Nudge isoliert: gleicher Seed, Investoren-Fokus vs. ausgeglichen ⇒ höheres Vertrauen.
    const balanced = newGame(12011);
    closeWeek(balanced);
    const invest = newGame(12011);
    applyAction(invest, { type: 'SET_CEO_FOCUS', focus: { produkt: 1, vertrieb: 1, team: 1, investoren: 2, aussenwirkung: 0 } }, null, 'dec_f2');
    closeWeek(invest);
    expect(invest.ceo.boardTrust).toBeGreaterThan(balanced.ceo.boardTrust);
  });

  it('validiert die Punktesumme (genau FOCUS_POINTS)', () => {
    const s = newGame(12010);
    expect(validateAction(s, { type: 'SET_CEO_FOCUS', focus: { produkt: 2, vertrieb: 2, team: 2, investoren: 0, aussenwirkung: 0 } }).ok).toBe(false); // 6
    expect(validateAction(s, { type: 'SET_CEO_FOCUS', focus: { produkt: 1, vertrieb: 1, team: 1, investoren: 1, aussenwirkung: 1 } }).ok).toBe(true); // 5
  });
});

describe('Öffentliche Auftritte', () => {
  it('kostet Energie & PR-Budget, protokolliert und ist deterministisch', () => {
    const s = newGame(12004);
    const before = s.ceo.energy;
    const rec = applyAction(s, { type: 'CEO_PUBLIC_APPEARANCE', kind: 'keynote' }, null, 'dec_pub');
    expect(s.ceo.energy).toBeLessThan(before);
    expect(s.ceo.publicLog).toHaveLength(1);
    expect(s.scheduledEffects.some((fx) => fx.effect.kind === 'ONE_OFF_COST')).toBe(true);
    // gleicher Seed ⇒ gleicher Ausgang
    const s2 = newGame(12004);
    const rec2 = applyAction(s2, { type: 'CEO_PUBLIC_APPEARANCE', kind: 'keynote' }, null, 'dec_pub');
    expect(rec2.summaryDe).toBe(rec.summaryDe);
  });
});

describe('Executive-Coaching', () => {
  it('hebt die Zielkompetenz über Wochen; Doppel-Coaching gesperrt', () => {
    const s = newGame(12005);
    applyAction(s, { type: 'HIRE_COACH', skill: 'kommunikation' }, null, 'dec_coach');
    expect(s.ceo.coach?.skill).toBe('kommunikation');
    const before = s.ceo.skills.kommunikation;
    for (let i = 0; i < 6; i++) closeWeek(s);
    expect(s.ceo.skills.kommunikation).toBeGreaterThan(before);
    expect(validateAction(s, { type: 'HIRE_COACH', skill: 'kommunikation' }).ok).toBe(false);
  });
});

describe('Invarianten & Determinismus mit CEO-Aktionen', () => {
  it('Coaching-Gebühr, Fokus und Auftritte halten die Bilanz-Identität', () => {
    const s = newGame(12006);
    applyAction(s, { type: 'HIRE_COACH', skill: 'finanzen' }, null, 'dec_c');
    applyAction(s, { type: 'SET_CEO_FOCUS', focus: { produkt: 2, vertrieb: 2, team: 1, investoren: 0, aussenwirkung: 0 } }, null, 'dec_f');
    let weeks = 0;
    for (let w = 0; w < 15 && s.meta.status === 'active'; w++) {
      const r = closeWeek(s);
      expect(r.invariants.ok).toBe(true);
      weeks++;
    }
    expect(weeks).toBeGreaterThanOrEqual(8);
  });

  it('CEO-Zustand ist replay-stabil', () => {
    const a = newGame(12007);
    const b = newGame(12007);
    const focus = { produkt: 3, vertrieb: 2, team: 0, investoren: 0, aussenwirkung: 0 } as const;
    applyAction(a, { type: 'SET_CEO_FOCUS', focus }, null, 'd');
    applyAction(b, { type: 'SET_CEO_FOCUS', focus }, null, 'd');
    for (let i = 0; i < 10; i++) { closeWeek(a); closeWeek(b); }
    expect(JSON.stringify(a.ceo)).toEqual(JSON.stringify(b.ceo));
  });
});

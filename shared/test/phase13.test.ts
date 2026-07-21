import { describe, expect, it } from 'vitest';
import { forceCash, newGame } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { computeLegacy } from '../src/engine/legacy.js';

/**
 * Phase 13: Amtszeit-Bilanz (Legacy) + Rücktritt. Bewertet die gesamte
 * Amtszeit deterministisch über sechs Dimensionen; STEP_DOWN beendet das Spiel.
 */

describe('computeLegacy', () => {
  it('liefert sechs Dimensionen, Score/Note im Wertebereich und ist replay-stabil', () => {
    const a = newGame(13001);
    const b = newGame(13001);
    for (let i = 0; i < 10; i++) { closeWeek(a); closeWeek(b); }
    const ra = computeLegacy(a);
    expect(ra.dimensions).toHaveLength(6);
    expect(ra.overall).toBeGreaterThanOrEqual(0);
    expect(ra.overall).toBeLessThanOrEqual(100);
    expect(ra.grade).toBeGreaterThanOrEqual(1);
    expect(ra.grade).toBeLessThanOrEqual(6);
    expect(ra.arc.length).toBeGreaterThan(0);
    expect(ra.titleDe.length).toBeGreaterThan(3);
    // Determinismus
    expect(JSON.stringify(ra)).toEqual(JSON.stringify(computeLegacy(b)));
  });

  it('sammelt Meilensteine (Formwechsel) chronologisch', () => {
    const s = newGame(13002);
    forceCash(s, 600_000);
    s.ceo.boardTrust = 70;
    applyAction(s, { type: 'CAPITAL_INCREASE', targetNennkapital: 50_000 }, null, 'dec_cap');
    applyAction(s, { type: 'CONVERT_LEGAL_FORM', toForm: 'AG' }, null, 'dec_conv');
    for (let i = 0; i < 6; i++) closeWeek(s);
    const r = computeLegacy(s);
    expect(r.milestones.some((m) => /Formwechsel/.test(m.labelDe))).toBe(true);
    expect(r.titleDe).toMatch(/Börsennotiert|Amtszeit|Bilanz|Champions|Legende|Jahre/); // irgendein gültiger Titel
  });

  it('ein Misserfolg (fired) kappt die Note', () => {
    const s = newGame(13003);
    s.meta.status = 'fired';
    s.meta.endReasonDe = 'Test: abberufen';
    const r = computeLegacy(s);
    expect(r.overall).toBeLessThanOrEqual(40);
    expect(r.grade).toBeGreaterThanOrEqual(4);
    expect(r.titleDe).toMatch(/Abberufen/);
  });
});

describe('STEP_DOWN (Rücktritt)', () => {
  it('beendet das Spiel als „retired" mit Legacy-Begründung', () => {
    const s = newGame(13004);
    for (let i = 0; i < 5; i++) closeWeek(s);
    expect(validateAction(s, { type: 'STEP_DOWN' }).ok).toBe(true);
    const rec = applyAction(s, { type: 'STEP_DOWN' }, null, 'dec_step');
    expect(s.meta.status).toBe('retired');
    expect(s.meta.endReasonDe).toMatch(/Rücktritt/);
    expect(rec.summaryDe).toMatch(/Amtsende/);
    // Nach dem Rücktritt ist kein Wochenschritt mehr möglich.
    expect(() => closeWeek(s)).toThrow();
  });

  it('warnt bei sehr frühem Rücktritt, ist aber gültig', () => {
    const s = newGame(13005);
    const v = validateAction(s, { type: 'STEP_DOWN' });
    expect(v.ok).toBe(true);
    expect(v.warningsDe.length).toBeGreaterThan(0);
  });
});

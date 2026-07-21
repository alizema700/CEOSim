import { describe, expect, it } from 'vitest';
import { forceCash, newGame } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { restQuality } from '../src/engine/ceo.js';

/**
 * Phase 18: CEO-Privatleben & Netzwerk — passive Drift, Investitionen (Sport/
 * Familie/Netzwerk), Erholungs-Qualität, Mentor. Golden-Master unberührt
 * (Privatleben greift nicht in die Kern-KPIs ein).
 */

describe('Privatleben & Netzwerk', () => {
  it('startet mit sinnvollen Werten und bleibt über die Zeit beschränkt', () => {
    const s = newGame(18000);
    expect(s.ceo.personal.health).toBeGreaterThan(0);
    for (let i = 0; i < 30 && s.meta.status === 'active'; i++) {
      closeWeek(s);
      for (const v of [s.ceo.personal.health, s.ceo.personal.workLife, s.ceo.personal.network]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('Netzwerk verfällt ohne Pflege (Drift Richtung Basiswert)', () => {
    const s = newGame(18001);
    s.ceo.personal.network = 90;
    for (let i = 0; i < 12; i++) closeWeek(s);
    expect(s.ceo.personal.network).toBeLessThan(90);
  });

  it('Sport hebt Gesundheit, Familie die Work-Life-Balance', () => {
    const s = newGame(18002);
    const h = s.ceo.personal.health, wl = s.ceo.personal.workLife;
    applyAction(s, { type: 'CEO_PERSONAL_TIME', kind: 'sport' }, null, 'd1');
    expect(s.ceo.personal.health).toBeGreaterThan(h);
    applyAction(s, { type: 'CEO_PERSONAL_TIME', kind: 'family' }, null, 'd2');
    expect(s.ceo.personal.workLife).toBeGreaterThan(wl);
  });

  it('Netzwerken kostet Geld (validiert) und baut das Netzwerk auf', () => {
    const s = newGame(18003);
    forceCash(s, 100_000);
    const n = s.ceo.personal.network;
    expect(validateAction(s, { type: 'CEO_PERSONAL_TIME', kind: 'network' }).ok).toBe(true);
    applyAction(s, { type: 'CEO_PERSONAL_TIME', kind: 'network' }, null, 'd');
    expect(s.ceo.personal.network).toBeGreaterThan(n);
    expect(s.scheduledEffects.some((e) => e.effect.kind === 'ONE_OFF_COST')).toBe(true);
    const s2 = newGame(18003); forceCash(s2, 1_000);
    expect(validateAction(s2, { type: 'CEO_PERSONAL_TIME', kind: 'network' }).ok).toBe(false);
  });

  it('bessere Gesundheit & Work-Life ⇒ wirksamere Erholung', () => {
    const fit = newGame(18004); fit.ceo.personal.health = 95; fit.ceo.personal.workLife = 90; fit.ceo.energy = 40;
    const worn = newGame(18004); worn.ceo.personal.health = 20; worn.ceo.personal.workLife = 20; worn.ceo.energy = 40;
    expect(restQuality(fit)).toBeGreaterThan(restQuality(worn));
    applyAction(fit, { type: 'CEO_REST' }, null, 'r');
    applyAction(worn, { type: 'CEO_REST' }, null, 'r');
    expect(fit.ceo.energy).toBeGreaterThan(worn.ceo.energy);
  });

  it('starkes Netzwerk öffnet einen Mentor', () => {
    const s = newGame(18005);
    forceCash(s, 100_000);
    s.ceo.personal.network = 52; // +14 ⇒ ≥ 62
    applyAction(s, { type: 'CEO_PERSONAL_TIME', kind: 'network' }, null, 'd');
    expect(s.ceo.personal.mentorDe).not.toBeNull();
  });
});

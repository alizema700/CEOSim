import { describe, expect, it } from 'vitest';
import { forceCash, newGame } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { counterEfficacy, respondStrike, tickRivalry } from '../src/engine/rivalry.js';
import type { CompanyState } from '../src/types/company.js';

/**
 * Phase 19: Wettbewerber-Angriff — Emergence-Gating (Golden-Master-sicher),
 * Konter-Ökonomie (match/differentiate/ignore/counter), Eskalation & Abklingen.
 */

function strike(s: CompanyState, intensity: number, kind: 'preiskampf' | 'feature_konter' | 'abwerbung' | 'fud' = 'preiskampf'): void {
  const attacker = s.market.competitors[0]?.name ?? 'Rivale';
  s.rivalry = {
    status: 'active', kind, attackerName: attacker, headlineDe: `${attacker} greift an`, detailDe: 'Kampagne.',
    intensity, startedWeek: s.meta.week - 1, deadlineWeek: s.meta.week + 1, responsesUsed: [], momentum: 5, lastNudgeWeek: s.meta.week,
  };
}

describe('Emergence-Gating', () => {
  it('unterhalb der Gefahren-Schwelle (kleiner Anteil, kein Rampenlicht) kein Angriff', () => {
    const s = newGame(19000);
    for (let i = 0; i < 30 && s.meta.status === 'active'; i++) closeWeek(s);
    expect(s.rivalry.status).toBe('none');
  });
});

describe('Konter-Ökonomie', () => {
  it('Mitgehen senkt die Intensität und kostet Geld', () => {
    const s = newGame(19001); forceCash(s, 500_000); strike(s, 60);
    const before = s.rivalry.intensity;
    expect(validateAction(s, { type: 'COUNTER_COMPETITOR', mode: 'match' }).ok).toBe(true);
    applyAction(s, { type: 'COUNTER_COMPETITOR', mode: 'match' }, null, 'd');
    expect(s.rivalry.intensity).toBeLessThan(before);
    expect(s.scheduledEffects.some((e) => e.effect.kind === 'ONE_OFF_COST')).toBe(true);
  });

  it('Differenzieren wirkt stärker bei starkem Produkt', () => {
    const strong = newGame(19002); strong.product.nps = 60; strong.product.techDebt = 10; strike(strong, 60);
    const weak = newGame(19002); weak.product.nps = 0; weak.product.techDebt = 80; strike(weak, 60);
    applyAction(strong, { type: 'COUNTER_COMPETITOR', mode: 'differentiate' }, null, 'd');
    applyAction(weak, { type: 'COUNTER_COMPETITOR', mode: 'differentiate' }, null, 'd');
    expect(strong.rivalry.intensity).toBeLessThan(weak.rivalry.intensity);
  });

  it('Gegenoffensive knabbert am Anteil des Angreifers', () => {
    const s = newGame(19003); forceCash(s, 500_000); strike(s, 55);
    const attacker = s.market.competitors.find((c) => c.name === s.rivalry.attackerName)!;
    const shareBefore = attacker.marketShare;
    applyAction(s, { type: 'COUNTER_COMPETITOR', mode: 'counter' }, null, 'd');
    expect(attacker.marketShare).toBeLessThan(shareBefore);
  });

  it('Aushalten lässt den Druck bestehen (Momentum ↑)', () => {
    const s = newGame(19004); strike(s, 50); s.rivalry.momentum = 0;
    applyAction(s, { type: 'COUNTER_COMPETITOR', mode: 'ignore' }, null, 'd');
    expect(s.rivalry.momentum).toBeGreaterThan(0);
  });

  it('ohne Angriff ist der Konter ungültig; match/counter brauchen Liquidität', () => {
    const s = newGame(19005);
    expect(validateAction(s, { type: 'COUNTER_COMPETITOR', mode: 'match' }).ok).toBe(false);
    forceCash(s, 10_000); strike(s, 50);
    expect(validateAction(s, { type: 'COUNTER_COMPETITOR', mode: 'match' }).ok).toBe(false);
  });

  it('Konter-Wirksamkeit steigt mit Strategie & Leadership', () => {
    const weak = newGame(19006); weak.ceo.skills.strategie = 20; weak.ceo.skills.leadership = 20;
    const strong = newGame(19006); strong.ceo.skills.strategie = 90; strong.ceo.skills.leadership = 90;
    expect(counterEfficacy(strong)).toBeGreaterThan(counterEfficacy(weak));
  });
});

describe('Eskalation & Abklingen', () => {
  it('unbeantwortet & Frist vorbei ⇒ der Angriff verschärft sich', () => {
    const s = newGame(19007); strike(s, 50); s.rivalry.deadlineWeek = s.meta.week - 1; s.rivalry.momentum = 0;
    const before = s.rivalry.intensity;
    tickRivalry(s, []);
    expect(s.rivalry.intensity).toBeGreaterThan(before);
  });

  it('sehr niedrige Intensität ⇒ der Angriff verpufft (none)', () => {
    const s = newGame(19008); strike(s, 5); s.rivalry.momentum = -3;
    tickRivalry(s, []);
    expect(s.rivalry.status).toBe('none');
  });
});

import { describe, expect, it } from 'vitest';
import { forceCash, newGame } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { respondCrisis, responseEfficacy, tickCrisis } from '../src/engine/crisis.js';
import type { CompanyState } from '../src/types/company.js';

/**
 * Phase 15: Krisenmanagement & Shitstorm — Emergence-Gating (Golden-Master-
 * sicher), Reaktions-Ökonomie (apologize/defend/silent/investigate),
 * Eskalation & Abklingen.
 */

/** Legt einen aktiven Sturm gegebener Schwere an. */
function crisis(s: CompanyState, severity: number, stage = 1): void {
  s.crisis = {
    status: 'active', kind: 'social', headlineDe: 'Test-Sturm', sparkDe: 'Funke.',
    severity, stage, startedWeek: s.meta.week - 1, deadlineWeek: s.meta.week + 1,
    responsesUsed: [], momentum: 6, addressed: false, lastNudgeWeek: s.meta.week,
  };
}

describe('Emergence-Gating', () => {
  it('der Sanierungsfall (kein Rampenlicht) löst NIE eine Krise aus', () => {
    const s = newGame(15000);
    for (let i = 0; i < 30 && s.meta.status === 'active'; i++) closeWeek(s);
    expect(s.crisis.status).toBe('none');
  });
});

describe('Reaktions-Ökonomie', () => {
  it('Entschuldigung senkt die Schwere und gilt als adressiert', () => {
    const s = newGame(15001);
    crisis(s, 60);
    const before = s.crisis.severity;
    applyAction(s, { type: 'CRISIS_RESPOND', mode: 'apologize' }, null, 'dec');
    expect(s.crisis.severity).toBeLessThan(before);
    expect(s.crisis.addressed).toBe(true);
  });

  it('Gegenrede trägt bei haltbarer Lage, befeuert aber bei starker Empörung', () => {
    const low = newGame(15002); crisis(low, 30);
    applyAction(low, { type: 'CRISIS_RESPOND', mode: 'defend' }, null, 'dec');
    expect(low.crisis.status === 'none' || low.crisis.severity < 30).toBe(true);

    const high = newGame(15002); crisis(high, 70, 1);
    const beforeStage = high.crisis.stage;
    applyAction(high, { type: 'CRISIS_RESPOND', mode: 'defend' }, null, 'dec');
    expect(high.crisis.severity > 70 || high.crisis.stage > beforeStage).toBe(true);
  });

  it('Transparente Aufklärung kostet Geld, wirkt aber am stärksten', () => {
    const s = newGame(15003);
    forceCash(s, 500_000);
    crisis(s, 60);
    expect(validateAction(s, { type: 'CRISIS_RESPOND', mode: 'investigate' }).ok).toBe(true);
    const sevBefore = s.crisis.severity, momBefore = s.crisis.momentum;
    applyAction(s, { type: 'CRISIS_RESPOND', mode: 'investigate' }, null, 'dec');
    expect(s.scheduledEffects.some((e) => e.effect.kind === 'ONE_OFF_COST')).toBe(true);
    expect(s.crisis.severity).toBeLessThan(sevBefore); // wirkt sofort
    expect(s.crisis.momentum).toBeLessThan(momBefore); // dämpft die Dynamik
  });

  it('ohne Liquidität ist die Aufklärung ungültig; ohne Krise jede Reaktion', () => {
    const s = newGame(15004);
    forceCash(s, 10_000);
    crisis(s, 50);
    expect(validateAction(s, { type: 'CRISIS_RESPOND', mode: 'investigate' }).ok).toBe(false);
    const s2 = newGame(15004);
    expect(validateAction(s2, { type: 'CRISIS_RESPOND', mode: 'apologize' }).ok).toBe(false);
  });

  it('Reaktions-Wirksamkeit steigt mit CEO-Marke, Kommunikation & Board-Rückhalt', () => {
    const weak = newGame(15005); weak.ceo.reputation = 20; weak.ceo.boardTrust = 25; weak.ceo.skills.kommunikation = 20;
    const strong = newGame(15005); strong.ceo.reputation = 90; strong.ceo.boardTrust = 85; strong.ceo.skills.kommunikation = 90;
    expect(responseEfficacy(strong)).toBeGreaterThan(responseEfficacy(weak));
  });
});

describe('Eskalation & Abklingen', () => {
  it('unadressiert & Frist verstrichen ⇒ die Krise eskaliert eine Stufe', () => {
    const s = newGame(15006);
    crisis(s, 50, 1);
    s.crisis.deadlineWeek = s.meta.week - 1; // Frist vorbei
    s.crisis.addressed = false;
    tickCrisis(s, []);
    expect(s.crisis.stage).toBe(2);
  });

  it('sehr niedrige Schwere ⇒ der Sturm klingt ab (Status none)', () => {
    const s = newGame(15007);
    crisis(s, 5);
    s.crisis.momentum = -4;
    tickCrisis(s, []);
    expect(s.crisis.status).toBe('none');
  });
});

describe('Determinismus & Invarianten', () => {
  it('eine aktive Krise läuft bilanzkonform durch den Tick', () => {
    const s = newGame(15008);
    forceCash(s, 500_000);
    crisis(s, 55);
    applyAction(s, { type: 'CRISIS_RESPOND', mode: 'investigate' }, null, 'dec');
    const r = closeWeek(s);
    expect(r.invariants.ok).toBe(true);
  });
});

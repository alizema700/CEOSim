import { describe, expect, it } from 'vitest';
import { replayGame } from '../src/engine/replay.js';
import type { GameEvent } from '../src/types/game.js';
import { testSetup } from './helpers.js';

/**
 * Golden-Master: fester Seed + festes Entscheidungsskript ⇒ exakt
 * reproduzierbarer Endzustand. Bricht dieser Test, hat sich die Engine-
 * Semantik geändert — dann bewusst den Master aktualisieren, nie „mal eben".
 */

function ev(seq: number, week: number, type: GameEvent['type'], payload: unknown): GameEvent {
  return { seq, gameId: 'gm', week, atISO: '2026-01-05T00:00:00Z', type, payload } as GameEvent;
}

function scriptedEvents(): GameEvent[] {
  const events: GameEvent[] = [ev(1, 0, 'GAME_CREATED', { setup: testSetup(), seed: 20260105 })];
  let seq = 2;
  let week = 0;
  const close = () => events.push(ev(seq++, week++, 'WEEK_CLOSED', {}));
  const decide = (decisionId: string, action: unknown, hypothesis: unknown = null) =>
    events.push(ev(seq++, week, 'DECISION_MADE', { decisionId, action, hypothesis }));

  // Ein realistisches erstes Quartal:
  decide('d1', { type: 'SET_CS_BUDGET', monthlyAmount: 18_000 }, { textDe: 'Churn runter', expectedMrrDelta4w: -1500, expectedChurnDeltaPp: -0.3 });
  close(); close();
  decide('d2', { type: 'SET_RND_ALLOCATION', features: 0.45, techDebt: 0.35, bugfixes: 0.2 });
  close(); close(); close();
  decide('d3', { type: 'RAISE_DEBT', amount: 150_000 });
  close(); close(); close(); close();
  decide('d4', { type: 'PRICE_CHANGE', pct: 0.08, applyToExisting: false });
  for (let i = 0; i < 16; i++) close(); // bis Woche 25
  return events;
}

describe('Golden-Master (Seed 20260105, 25 Wochen, 4 Entscheidungen)', () => {
  it('Replay ist deterministisch: zwei Läufe ⇒ bit-identischer State', () => {
    const a = replayGame(scriptedEvents());
    const b = replayGame(scriptedEvents());
    expect(JSON.stringify(a.state)).toEqual(JSON.stringify(b.state));
  });

  it('Endzustand entspricht dem eingefrorenen Master', () => {
    const { state, reports } = replayGame(scriptedEvents());
    expect(state.meta.week).toBe(25);
    expect(reports).toHaveLength(25);
    expect(state.meta.status).toBe('active');

    // Eingefrorene Kernwerte (bei bewusster Engine-Änderung aktualisieren):
    const snap = state.history[state.history.length - 1]!;
    const master = {
      cash: Math.round(state.finance.cash),
      mrr: Math.round(snap.values.mrr),
      customers: Math.round(snap.values.customers),
      debt: state.finance.debt.principal,
      boardTrust: state.ceo.boardTrust,
      headcount: state.people.employees.length,
      techDebt: Math.round(state.product.techDebt * 10) / 10,
      evaluations: state.evaluations.length,
    };
    // Der Master wird beim ersten Lauf erzeugt und hier festgeschrieben:
    expect(master).toMatchSnapshot();
    // Grobe Plausibilität unabhängig vom Snapshot:
    expect(master.debt).toBe(450_000);
    expect(master.evaluations).toBe(4);
    expect(master.mrr).toBeGreaterThan(120_000);
    expect(master.mrr).toBeLessThan(300_000);
  });

  it('Invarianten halten über den gesamten Replay-Lauf', () => {
    const { reports } = replayGame(scriptedEvents());
    for (const r of reports) {
      expect(r.invariants.ok).toBe(true);
    }
  });
});

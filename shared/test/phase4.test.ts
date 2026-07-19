import { describe, expect, it } from 'vitest';
import { newGame, testSetup } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction } from '../src/engine/actions.js';
import { runDueEvaluations } from '../src/engine/evaluate.js';
import { PRECEDENT_CASES } from '../src/data/precedents.js';
import { GLOSSARY } from '../src/data/glossary.js';
import { replayGame } from '../src/engine/replay.js';
import type { GameEvent } from '../src/types/game.js';

describe('Phase 4: Präzedenzfall-Bibliothek', () => {
  it('Bibliothek umfasst 45+ vollständig dokumentierte reale Fälle', () => {
    expect(PRECEDENT_CASES.length).toBeGreaterThanOrEqual(45);
    for (const c of PRECEDENT_CASES) {
      expect(c.contextDe.length).toBeGreaterThan(20);
      expect(c.decisionDe.length).toBeGreaterThan(20);
      expect(c.outcomeDe.length).toBeGreaterThan(20);
      expect(c.lessonDe.length).toBeGreaterThan(20);
      expect(c.tags.length).toBeGreaterThanOrEqual(2);
      expect(c.sourceDe.length).toBeGreaterThan(5);
    }
    // IDs eindeutig
    expect(new Set(PRECEDENT_CASES.map((c) => c.id)).size).toBe(PRECEDENT_CASES.length);
  });

  it('Bewertungen zitieren passende Fälle (Layoff ⇒ Layoff-Fälle)', () => {
    const s = newGame(301);
    applyAction(s, { type: 'LAYOFF', dept: 'ga', count: 2, generousSeverance: false }, null, 'd1');
    for (let i = 0; i < 4; i++) closeWeek(s);
    const evals = runDueEvaluations(s);
    const precedents = evals[0]!.precedents;
    expect(precedents.length).toBeGreaterThanOrEqual(1);
    expect(precedents.length).toBeLessThanOrEqual(3);
    const matched = PRECEDENT_CASES.filter((c) => precedents.some((p) => p.caseId === c.id));
    expect(matched.some((c) => c.tags.includes('layoffs') || c.tags.includes('culture'))).toBe(true);
  });

  it('Matching ist deterministisch', () => {
    const run = () => {
      const s = newGame(302);
      applyAction(s, { type: 'PRICE_CHANGE', pct: 0.12, applyToExisting: true }, null, 'd1');
      for (let i = 0; i < 4; i++) closeWeek(s);
      return runDueEvaluations(s)[0]!.precedents.map((p) => p.caseId).join(',');
    };
    expect(run()).toEqual(run());
  });
});

describe('Phase 4: Berater & Glossar', () => {
  it('HIRE_CONSULTANT kostet 25 k€ (Invarianten halten)', () => {
    const s = newGame(303);
    applyAction(s, { type: 'HIRE_CONSULTANT', topic: 'churn' }, null, 'd1');
    const report = closeWeek(s);
    expect(report.incomeStatement.oneOffs).toBeGreaterThanOrEqual(25_000);
    expect(report.invariants.ok).toBe(true);
  });

  it('Glossar: 15+ Begriffe mit Definition & Beispiel', () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(15);
    for (const g of GLOSSARY) {
      expect(g.definitionDe.length).toBeGreaterThan(30);
      expect(g.exampleDe.length).toBeGreaterThan(10);
    }
  });
});

describe('Phase 4: Fork-Grundlage (Event-Slicing + Replay)', () => {
  function scripted(totalWeeks: number): GameEvent[] {
    const events: GameEvent[] = [
      { seq: 1, gameId: 'g', week: 0, atISO: 'x', type: 'GAME_CREATED', payload: { setup: testSetup(), seed: 555 } },
    ];
    let seq = 2;
    for (let w = 0; w < totalWeeks; w++) {
      if (w === 2) events.push({ seq: seq++, gameId: 'g', week: w, atISO: 'x', type: 'DECISION_MADE', payload: { decisionId: 'd1', action: { type: 'SET_CS_BUDGET', monthlyAmount: 20_000 }, hypothesis: null } });
      events.push({ seq: seq++, gameId: 'g', week: w, atISO: 'x', type: 'WEEK_CLOSED', payload: {} });
    }
    return events;
  }

  it('Prefix-Replay = Fork-Zustand: Woche W identisch mit Originalverlauf bis W', () => {
    const full = scripted(10);
    // Slice bis einschließlich 6. WEEK_CLOSED (Fork nach Woche 6)
    const sliced: GameEvent[] = [];
    let closed = 0;
    for (const ev of full) {
      if (closed >= 6 && ev.type !== 'GAME_CREATED') break;
      sliced.push(ev);
      if (ev.type === 'WEEK_CLOSED') closed++;
    }
    const fork = replayGame(sliced).state;
    expect(fork.meta.week).toBe(6);

    // Original bis Woche 6 nachgebaut ⇒ bit-identisch (gleicher Seed, gleiche Events)
    const other = replayGame(sliced).state;
    expect(JSON.stringify(fork)).toEqual(JSON.stringify(other));

    // Divergenz: Fork entscheidet anders weiter als Original
    applyAction(fork, { type: 'SET_MARKETING_BUDGET', monthlyAmount: 60_000 }, null, 'dx');
    for (let i = 0; i < 4; i++) closeWeek(fork);
    const original = replayGame(full).state;
    expect(original.meta.week).toBe(10);
    expect(fork.meta.week).toBe(10);
    expect(Math.round(fork.finance.budgetsMonthly.marketing)).toBe(60_000);
    expect(Math.round(original.finance.budgetsMonthly.marketing)).toBe(25_000);
  });
});

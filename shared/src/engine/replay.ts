import type { CompanyState } from '../types/company.js';
import type { GameEvent, WeekReport } from '../types/game.js';
import { createCompany } from './init.js';
import { applyAction } from './actions.js';
import { closeWeek } from './tick.js';
import { runDueEvaluations } from './evaluate.js';

/**
 * Event-Sourcing-Replay: rekonstruiert den CompanyState deterministisch aus
 * dem append-only Event-Log. Gleicher Seed + gleiche Events ⇒ identischer
 * Endzustand (Golden-Master-Garantie).
 *
 * Grundlage für: Spielstände, Integritätsprüfung beim Laden, Zeitreise/Forks
 * im Was-wäre-wenn-Labor (Phase 4).
 */
export function replayGame(events: GameEvent[]): { state: CompanyState; reports: WeekReport[] } {
  if (events.length === 0 || events[0]?.type !== 'GAME_CREATED') {
    throw new Error('Replay: erstes Event muss GAME_CREATED sein.');
  }
  const first = events[0];
  const state = createCompany(first.payload.setup, first.payload.seed, first.gameId, first.atISO);
  const reports: WeekReport[] = [];

  for (const ev of events.slice(1)) {
    switch (ev.type) {
      case 'DECISION_MADE':
        applyAction(state, ev.payload.action, ev.payload.hypothesis, ev.payload.decisionId);
        break;
      case 'WEEK_CLOSED': {
        const report = closeWeek(state);
        runDueEvaluations(state);
        reports.push(report);
        break;
      }
      case 'GAME_CREATED':
        throw new Error('Replay: GAME_CREATED darf nur einmal vorkommen.');
    }
  }
  return { state, reports };
}

import { describe, expect, it } from 'vitest';
import { newGame } from './helpers.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { holdBoardMeeting } from '../src/engine/governance.js';

/**
 * Phase 17: Vorstandssitzung als interaktive Szene — Ansprache-Stil, Sitz-
 * Reaktionen nach Passung, Board-Vertrauens-Wirkung, Cooldown & Energie.
 */

describe('Vorstandssitzung', () => {
  it('liefert Reaktionen je Sitz (ohne den CEO-Sitz) und eine beschränkte Vertrauens-Wirkung', () => {
    const s = newGame(17000);
    const rec = holdBoardMeeting(s, 'data');
    expect(rec.reactions.length).toBe(s.board.members.filter((m) => m.seatType !== 'ceo').length);
    expect(rec.reactions.every((r) => r.name && r.moodDe)).toBe(true);
    expect(rec.trustDelta).toBeGreaterThanOrEqual(-4);
    expect(rec.trustDelta).toBeLessThanOrEqual(6);
  });

  it('unterschiedliche Ansprache trifft unterschiedliche Sitze', () => {
    const s = newGame(17001);
    const data = holdBoardMeeting(s, 'data');
    const vision = holdBoardMeeting(s, 'vision');
    // Der Investoren-/Vorsitz-Sitz reagiert auf „Zahlen" stärker als auf „Vision".
    const chairData = data.reactions.find((r) => r.affiliationDe.includes('Vorsitz'))!.delta;
    const chairVision = vision.reactions.find((r) => r.affiliationDe.includes('Vorsitz'))!.delta;
    expect(chairData).toBeGreaterThanOrEqual(chairVision);
    // Der Gründersitz reagiert auf „Vision" stärker.
    const foundData = data.reactions.find((r) => r.affiliationDe.includes('Gründer'))!.delta;
    const foundVision = vision.reactions.find((r) => r.affiliationDe.includes('Gründer'))!.delta;
    expect(foundVision).toBeGreaterThanOrEqual(foundData);
  });

  it('deterministisch: gleicher Zustand ⇒ gleiches Ergebnis (kein RNG)', () => {
    const a = newGame(17002);
    const b = newGame(17002);
    expect(JSON.stringify(holdBoardMeeting(a, 'vision'))).toBe(JSON.stringify(holdBoardMeeting(b, 'vision')));
  });

  it('Anwenden bewegt Board-Vertrauen & Energie und schreibt das Protokoll fest', () => {
    const s = newGame(17003);
    const bt = s.ceo.boardTrust, en = s.ceo.energy;
    applyAction(s, { type: 'HOLD_BOARD_MEETING', approach: 'data' }, null, 'dec');
    expect(s.board.lastMeeting).not.toBeNull();
    expect(s.board.lastMeetingWeek).toBe(s.meta.week);
    expect(s.ceo.energy).toBe(en - 12);
    expect(s.ceo.boardTrust).toBe(Math.max(0, Math.min(100, bt + s.board.lastMeeting!.trustDelta)));
  });

  it('Cooldown & Energie werden validiert', () => {
    const s = newGame(17004);
    expect(validateAction(s, { type: 'HOLD_BOARD_MEETING', approach: 'data' }).ok).toBe(true);
    s.board.lastMeetingWeek = s.meta.week - 1; // gerade erst getagt
    expect(validateAction(s, { type: 'HOLD_BOARD_MEETING', approach: 'data' }).ok).toBe(false);
    const s2 = newGame(17004); s2.ceo.energy = 5;
    expect(validateAction(s2, { type: 'HOLD_BOARD_MEETING', approach: 'data' }).ok).toBe(false);
  });
});

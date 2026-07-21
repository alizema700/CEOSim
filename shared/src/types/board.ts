import type { Id, WeekIndex } from './common.js';

/**
 * Aufsichtsrat / Board (Phase 10): echte Sitze mit Namen, Herkunft und
 * Grundhaltung — plus protokollierte Beschlüsse mit Einzelstimmen. Das
 * aggregierte `ceo.boardTrust` bleibt die Leitgröße; die Einzel-Zustimmung je
 * Sitz wird daraus + einer persistenten Grundhaltung (Bias) abgeleitet, damit
 * nichts desynchronisiert und die bestehende Vertrauens-Mechanik intakt bleibt.
 */

export type BoardSeatType = 'chair' | 'investor' | 'founder' | 'independent' | 'employee' | 'ceo';

export interface BoardMember {
  id: Id;
  name: string;
  seatType: BoardSeatType;
  /** Herkunft/Rolle, menschenlesbar (z. B. „Lead-Investor · Almberg Capital"). */
  affiliationDe: string;
  /** Persistente Grundhaltung: additiver Offset auf das Board-Vertrauen. */
  bias: number;
  appointedWeek: WeekIndex;
  /** Kapitalanteil, den dieser Sitz bei Gesellschafterbeschlüssen vertritt (0..1). */
  capitalShare: number;
}

export type ResolutionKind = 'formwechsel' | 'dividende' | 'ceo-verguetung' | 'ma' | 'kapitalerhoehung';

export interface MemberVote {
  memberId: Id;
  name: string;
  vote: 'ja' | 'nein' | 'enthaltung';
  /** Zustimmungswert des Mitglieds zum Zeitpunkt der Abstimmung (0..100). */
  support: number;
}

export interface ResolutionRecord {
  week: WeekIndex;
  kind: ResolutionKind;
  titleDe: string;
  passed: boolean;
  /** Erforderliche Zustimmungsquote (0..1). */
  requiredShare: number;
  /** Erreichte Zustimmungsquote (0..1). */
  forShare: number;
  /** Ob nach Kapitalanteilen (Gesellschafter) oder Sitzen (Board) gezählt wurde. */
  basis: 'capital' | 'seat';
  votes: MemberVote[];
}

/** Ansprache-Stil einer Vorstandssitzung (Phase 22). */
export type BoardMeetingApproach = 'data' | 'vision' | 'listen';

export interface BoardMeetingReaction {
  memberId: Id;
  name: string;
  affiliationDe: string;
  /** Reaktion auf die Ansprache (−… skeptisch … +… überzeugt). */
  delta: number;
  moodDe: string;
}

export interface BoardMeetingRecord {
  week: WeekIndex;
  approach: BoardMeetingApproach;
  approachDe: string;
  /** Resultierende Änderung des Board-Vertrauens. */
  trustDelta: number;
  reactions: BoardMeetingReaction[];
}

export interface BoardState {
  members: BoardMember[];
  resolutions: ResolutionRecord[];
  /** Woche der letzten einberufenen Vorstandssitzung (Cooldown). */
  lastMeetingWeek: WeekIndex;
  /** Ergebnis der letzten Sitzung (fürs UI). */
  lastMeeting: BoardMeetingRecord | null;
}

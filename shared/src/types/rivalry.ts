import type { WeekIndex } from './common.js';

/**
 * Wettbewerber-Angriff (Phase 21). Ein namentlicher Rivale fährt eine gezielte,
 * über Wochen eskalierende Kampagne gegen dich — Preiskampf, Feature-Konter,
 * Abwerbung oder FUD. Deterministisch & gegated: nur wenn du eine echte Gefahr
 * bist (relevanter Marktanteil/ARR), zieht dich jemand ins Visier.
 */

export type StrikeKind = 'preiskampf' | 'feature_konter' | 'abwerbung' | 'fud';
export type StrikeStatus = 'none' | 'active';
export type StrikeResponse = 'match' | 'differentiate' | 'ignore' | 'counter';

export interface CompetitorStrikeState {
  status: StrikeStatus;
  kind: StrikeKind;
  attackerName: string;
  headlineDe: string;
  detailDe: string;
  /** 0..100 — treibt den Druck (Modifikatoren). */
  intensity: number;
  startedWeek: WeekIndex;
  /** Reaktionsfenster; verstreicht es, verschärft der Rivale. */
  deadlineWeek: WeekIndex | null;
  responsesUsed: string[];
  /** > 0 wächst der Druck, < 0 klingt ab. */
  momentum: number;
  lastNudgeWeek: WeekIndex;
}

export function initialCompetitorStrikeState(): CompetitorStrikeState {
  return {
    status: 'none',
    kind: 'preiskampf',
    attackerName: '',
    headlineDe: '',
    detailDe: '',
    intensity: 0,
    startedWeek: 0,
    deadlineWeek: null,
    responsesUsed: [],
    momentum: 0,
    lastNudgeWeek: 0,
  };
}

export const STRIKE_KIND_LABELS: Record<StrikeKind, string> = {
  preiskampf: 'Preiskampf',
  feature_konter: 'Feature-Konter',
  abwerbung: 'Abwerbe-Welle',
  fud: 'FUD-Kampagne',
};

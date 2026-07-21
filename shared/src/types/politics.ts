import type { Money, WeekIndex } from './common.js';

/**
 * Politik & Lobbyismus (Phase 22). Der CEO baut politisches Kapital auf, um
 * Steuererleichterungen, Subventionen und Zugang zu gewinnen — mit dem Risiko
 * eines Lobbyismus-Skandals. Golden-Master-sicher: alle Felder sind ohne aktives
 * Lobbying inert (kein Kapital-/Exposure-Aufbau ⇒ keine Wirkung, kein Skandal).
 */

export type LobbyFocus = 'steuern' | 'subvention' | 'zugang';

export interface PoliticsState {
  /** Politisches Kapital 0..100 — Einfluss, freigeschaltet durch Lobbying. */
  politicalCapital: number;
  /** Gewonnene Steuererleichterung in Prozentpunkten auf den effektiven Satz (0..0,05). */
  taxReliefPct: number;
  /** Skandal-Risiko 0..100 — steigt mit aggressivem Lobbying, klingt ab. */
  exposure: number;
  /** Kumulierte Lobby-Ausgaben (Narrativ/Skandal). */
  lobbyingSpendTotal: Money;
  /** Kumuliert erhaltene Subventionen. */
  subsidiesWon: Money;
  /** Letzte Skandal-Woche. */
  lastScandalWeek: WeekIndex;
  /** Kurzchronik der Erfolge/Vorfälle (fürs UI). */
  logDe: string[];
}

export function initialPoliticsState(): PoliticsState {
  return {
    politicalCapital: 8,
    taxReliefPct: 0,
    exposure: 0,
    lobbyingSpendTotal: 0,
    subsidiesWon: 0,
    lastScandalWeek: -99,
    logDe: [],
  };
}

export const LOBBY_LABELS: Record<LobbyFocus, string> = {
  steuern: 'Steuerpolitik',
  subvention: 'Fördermittel',
  zugang: 'Zugang & Netzwerk',
};

export const LOBBY_COST: Record<LobbyFocus, Money> = {
  steuern: 40_000,
  subvention: 30_000,
  zugang: 20_000,
};

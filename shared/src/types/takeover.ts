import type { Fraction, Money, WeekIndex } from './common.js';

/**
 * Feindliche Übernahme (Phase 14). Ein Bieter baut eine Beteiligung auf und
 * legt ein Angebot mit Prämie vor; der CEO verteidigt mit Board & Aktionären
 * — oder steigt zum Höchstpreis aus. Deterministisch: Emergence ist seed- &
 * lagegebunden, die Annahme kapitalgewichtet.
 */

export type TakeoverKind = 'stratege' | 'finanzinvestor' | 'aktivist';
export type TakeoverStatus = 'none' | 'circling' | 'tender';

export interface TakeoverState {
  status: TakeoverStatus;
  bidderName: string;
  bidderKind: TakeoverKind;
  bidderPitchDe: string;
  /** Aufgebaute Beteiligung des Bieters (0..1). */
  toeholdStake: Fraction;
  /** Prämie auf den fairen Unternehmenswert (0,3 = +30 %). */
  premiumPct: number;
  /** Gesamtangebot = fairer Wert × (1 + Prämie) — beim Tender gesetzt. */
  offerValue: Money | null;
  startedWeek: WeekIndex;
  /** Frist des Übernahmeangebots; nach Ablauf entscheiden die Aktionäre selbst. */
  deadlineWeek: WeekIndex | null;
  /** Genutzte Verteidigungen (fürs UI/Historie). */
  defensesUsed: string[];
  /** Zusätzliche Ablehnungsneigung aus Verteidigung (Rally/Giftpille). */
  defenseResistance: number;
  lastNudgeWeek: WeekIndex;
}

export function initialTakeoverState(): TakeoverState {
  return {
    status: 'none',
    bidderName: '',
    bidderKind: 'finanzinvestor',
    bidderPitchDe: '',
    toeholdStake: 0,
    premiumPct: 0,
    offerValue: null,
    startedWeek: 0,
    deadlineWeek: null,
    defensesUsed: [],
    defenseResistance: 0,
    lastNudgeWeek: -99,
  };
}

/** Reservationsprämien je Anteilseignergruppe (ab dieser Prämie wird verkauft). */
export const RESERVATION_PREMIUM: Record<string, number> = {
  public: 0.12, // Streubesitz verkauft früh
  esop: 0.22,
  investor: 0.32, // Finanzinvestoren wollen eine ordentliche Rendite
  founder: 0.55, // Gründer hängen an ihrem Werk
  ceo: 0.68,
};

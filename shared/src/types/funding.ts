import type { Fraction, Id, Money, WeekIndex } from './common.js';

/**
 * Fundraising & M&A (Phase 5).
 *
 * Term Sheets werden DETERMINISTISCH aus dem State erzeugt (Seed + Woche) —
 * kein LLM nötig. Zwei Angebote mit echten Trade-offs: höhere Bewertung
 * gegen härtere Terms (Participating Preference, Board-Seat, ESOP-Top-up).
 */
export interface TermSheetOffer {
  id: string; // Hash über die Terms — Annahme validiert gegen Regenerierung
  investorName: string;
  investorStyleDe: string;
  /** Investitionssumme. */
  amount: Money;
  /** Pre-Money-Bewertung. */
  preMoney: Money;
  /** 1x non-participating (fair) vs. 1x participating (doppelt kassieren). */
  liquidationPref: '1x' | '1x-participating';
  boardSeat: boolean;
  /** ESOP-Aufstockung PRE-Money (verwässert nur Altgesellschafter). */
  esopTopUp: Fraction;
  /** Woche, für die dieses Angebot gilt (Angebote verfallen wöchentlich). */
  validWeek: WeekIndex;
  noteDe: string;
}

export interface FundingRound {
  week: WeekIndex;
  investorName: string;
  amount: Money;
  preMoney: Money;
  postMoney: Money;
  newInvestorShare: Fraction;
  liquidationPref: string;
  boardSeat: boolean;
}

export interface FundingState {
  rounds: FundingRound[];
  /** Ein Investor mit Board-Seat macht das Board fordernder. */
  investorBoardSeat: boolean;
  ventureDebtTaken: boolean;
}

/** M&A-Kaufziel mit versteckten Red Flags (Due Diligence deckt auf). */
export interface MaTarget {
  id: Id;
  name: string;
  pitchDe: string;
  askPrice: Money;
  mrr: Money;
  /** Beworbene Monats-Churn-Rate (die echte kann höher liegen …). */
  claimedMonthlyChurn: Fraction;
  employees: number;
  techDebt: number;
  /** Versteckte Probleme — erst nach DD sichtbar. */
  redFlags: MaRedFlag[];
  ddDone: boolean;
  status: 'available' | 'acquired' | 'withdrawn';
}

export interface MaRedFlag {
  id: string;
  labelDe: string;
  /** Mechanische Wirkung bei Kauf, falls nicht durch DD eingepreist. */
  kind: 'churn-higher' | 'key-customer-leaving' | 'tech-debt-worse' | 'pending-lawsuit';
  severity: number; // 1..3
}

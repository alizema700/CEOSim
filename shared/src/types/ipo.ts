import type { Money, WeekIndex } from './common.js';

/**
 * IPO-Prozess (Phase 6).
 *
 * Freischaltung ab Kennzahlen → Banken-Auswahl (echte Trade-offs bei Fee &
 * Platzierungskraft) → Vorbereitung (Prospekt, Audit) → Roadshow mit
 * Bookbuilding-Spanne und Q&A-Chat → Pricing-Entscheidung → Listing.
 * Danach: wöchentlicher Aktienkurs, Quartals-Earnings-Calls gegen Guidance,
 * Ad-hoc-Publizitätspflicht bei kursrelevanten Ereignissen (§ 17 MAR).
 *
 * Alles Kursrelevante ist deterministisch (Seed + State) — das LLM spielt
 * nur Analysten & Investoren im Chat.
 */

export interface IpoBank {
  id: string;
  name: string;
  styleDe: string;
  /** Underwriting-Fee auf das Bruttovolumen. */
  feePct: number;
  /** Platzierungskraft: Faktor auf die Zeichnungsnachfrage. */
  demandBoost: number;
  tradeoffDe: string;
}

export type IpoStatus = 'locked' | 'eligible' | 'preparing' | 'roadshow' | 'public' | 'withdrawn';

export interface IpoState {
  status: IpoStatus;
  eligibleSinceWeek: WeekIndex | null;
  bankId: string | null;
  preparationStartWeek: WeekIndex | null;
  /** Bookbuilding-Spanne je Aktie — beim Roadshow-Start deterministisch fixiert. */
  bookLow: Money | null;
  bookHigh: Money | null;
  /** Bis zu dieser Woche muss gepreist werden, sonst gilt der IPO als verschoben. */
  roadshowEndsWeek: WeekIndex | null;

  listedWeek: WeekIndex | null;
  offerPrice: Money | null;
  /** Zeichnungsquote beim Pricing (didaktisch: > 1 = überzeichnet). */
  subscriptionRatio: number | null;
  sharesOutstanding: number;
  newSharesIssued: number;
  sharePrice: Money | null;
  priceHistory: { week: WeekIndex; price: Money }[];

  nextEarningsWeek: WeekIndex | null;
  /** Guidance: erwartetes Monats-MRR-Wachstum bis zum nächsten Call. */
  guidanceGrowthMonthly: number | null;
  earningsHistory: EarningsCallResult[];

  /** Offene Ad-hoc-Pflicht: kursrelevantes Thema wartet auf Offenlegung. */
  pendingAdhocTopicDe: string | null;
}

export interface EarningsCallResult {
  week: WeekIndex;
  verdict: 'beat' | 'met' | 'missed';
  growthActual: number;
  growthExpected: number;
  /** Kursreaktion als Faktor (z. B. −0.09 = −9 %). */
  priceReaction: number;
}

/** Aktienanzahl vor dem IPO (Cap-Table-Anteile × PRE_IPO_SHARES = Stückzahl). */
export const PRE_IPO_SHARES = 1_000_000;

/** Anteil des Streubesitzes am Post-IPO-Kapital (neue Aktien). */
export const IPO_FLOAT_SHARE = 0.18;

export function initialIpoState(): IpoState {
  return {
    status: 'locked',
    eligibleSinceWeek: null,
    bankId: null,
    preparationStartWeek: null,
    bookLow: null,
    bookHigh: null,
    roadshowEndsWeek: null,
    listedWeek: null,
    offerPrice: null,
    subscriptionRatio: null,
    sharesOutstanding: PRE_IPO_SHARES,
    newSharesIssued: 0,
    sharePrice: null,
    priceHistory: [],
    nextEarningsWeek: null,
    guidanceGrowthMonthly: null,
    earningsHistory: [],
    pendingAdhocTopicDe: null,
  };
}

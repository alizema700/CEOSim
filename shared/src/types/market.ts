import type { Fraction, Id, Money, Score } from './common.js';

/**
 * Markt & Konkurrenz.
 *
 * Phase 1: Wettbewerber existieren im State, driften seed-gesteuert und
 * reagieren regelbasiert auf Preisänderungen des Spielers.
 * Phase 5: eigenständige Agenten (regelbasiert + LLM-Würze), M&A-Fühler,
 * Partnerschafts-Anfragen, feindliche Übernahmeangebote.
 */
export interface MarketState {
  /** Gesamtmarkt als adressierbares MRR-Volumen. */
  tamMrr: Money;
  /** Monatliches Marktwachstum. */
  marketGrowthMonthly: Fraction;
  /** Makro-Nachfrageindex (1.0 = normal; Abschwung-Events senken ihn). */
  demandIndex: number;
  competitors: Competitor[];
}

export interface Competitor {
  id: Id;
  name: string;
  /** Kurzbeschreibung der Strategie für Dossiers/LLM. */
  strategyDe: string;
  strategy: 'priceWar' | 'featureRace' | 'enterpriseMove';
  /** Preisindex relativ zum Marktreferenzpreis (1.0 = gleich teuer). */
  priceIndex: number;
  /** Produktstärke 0..100 (Feature-Parität). */
  featureScore: Score;
  /** Marktanteil 0..1 (inkl. Spieler ergibt die Summe < 1; Rest = fragmentiert). */
  marketShare: Fraction;
  /** Aggressivität 0..1 — Wahrscheinlichkeit, auf Spielerzüge zu kontern. */
  aggressiveness: Fraction;
}

/**
 * Reputation, getrennt nach Stakeholdern (je 0..100).
 * Wirkungen (in der Engine verdrahtet):
 * - customers   → Win-Rate, Churn-Modifikator
 * - press       → Lead-Generierung, Krisen-Anfälligkeit
 * - laborMarket → Time-to-Fill, Offer-Annahme, Recruiting-Kosten
 * - investors   → Board-Geduld, spätere Fundraising-Konditionen
 */
export interface ReputationState {
  customers: Score;
  press: Score;
  laborMarket: Score;
  investors: Score;
}

import type { Fraction, Score } from './common.js';

/**
 * Produkt-Zustand.
 *
 * Kernmechanik: R&D-Kapazität (Velocity) wird per Allokation auf Features /
 * Tech-Debt / Bugfixes verteilt. Vernachlässigter Tech-Debt senkt schleichend
 * die Velocity und erhöht die Outage-Wahrscheinlichkeit (nichts passiert …
 * bis es knallt).
 */
export interface ProductState {
  /** Technische Schulden 0..100 (0 = sauber, 100 = Stillstand droht). */
  techDebt: Score;
  /** Story-Points/Woche der aktuellen Mannschaft (abgeleitet aus Eng-Team, gecacht). */
  velocityPointsPerWeek: number;
  /** Offene Bugs (gewichtet). Hohe Bug-Last drückt NPS und Win-Rate. */
  bugBacklog: number;
  /** Produkt-NPS −100..100. */
  nps: number;
  /** Nutzungs-Stickiness DAU/MAU 0..1. */
  dauMauRatio: Fraction;
  /** Kumulativ ausgelieferte Feature-Punkte (Fortschritts-/Wettbewerbsmaß). */
  featurePointsShipped: number;
  /** Aktuelle R&D-Allokation (Summe = 1). */
  rndAllocation: { features: Fraction; techDebt: Fraction; bugfixes: Fraction };
}

import type { Fraction, Money, Score, WeekIndex } from './common.js';

/**
 * CEO-Status: Board-Vertrauen ist KEINE Blackbox — jede Änderung wird als
 * TrustDriver mit Begründung protokolliert und ist im UI jederzeit einsehbar.
 *
 * Abwahl-Mechanik:
 * - Vertrauen < 40  ⇒ formale Abmahnung + Bewährung (2 Quartale, klare Ziele)
 * - Vertrauen < 20 oder Bewährung gerissen ⇒ Misstrauensvotum ⇒ Game Over
 */
export interface CeoState {
  boardTrust: Score;
  /** Protokoll der Vertrauens-Treiber (letzte ~26 Wochen). */
  trustLog: TrustDriver[];
  /** Persönliche Reputation des CEO (Presse/Öffentlichkeit). */
  reputation: Score;
  salaryMonthly: Money;
  equityShare: Fraction;
  /** Bewährungs-Status nach Abmahnung. */
  probation: ProbationState | null;
  /** Fortlaufender CEO-Score je Kompetenz-Dimension (0..100, aus Bewertungen). */
  skills: CeoSkills;
}

export interface TrustDriver {
  week: WeekIndex;
  delta: number;
  reasonDe: string;
}

export interface ProbationState {
  startedWeek: WeekIndex;
  endsWeek: WeekIndex;
  /** Vom Board gesetzte Ziele (menschenlesbar + maschinell prüfbar). */
  targets: ProbationTarget[];
}

export interface ProbationTarget {
  labelDe: string;
  metric: 'runwayWeeks' | 'mrrGrowthMonthly' | 'logoChurnMonthly' | 'ebitdaMonthly';
  comparator: 'gte' | 'lte';
  value: number;
}

export interface CeoSkills {
  finanzen: Score;
  strategie: Score;
  leadership: Score;
  kommunikation: Score;
  krisenmanagement: Score;
  governance: Score;
}

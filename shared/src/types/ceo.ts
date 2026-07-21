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
  /** Persönliche Reputation des CEO (Presse/Öffentlichkeit) — die „CEO-Marke". */
  reputation: Score;
  salaryMonthly: Money;
  equityShare: Fraction;
  /** Bewährungs-Status nach Abmahnung. */
  probation: ProbationState | null;
  /** Fortlaufender CEO-Score je Kompetenz-Dimension (0..100, aus Bewertungen). */
  skills: CeoSkills;
  /** ── Der Mensch hinter dem Amt (Phase 12) ── */
  /** Energie/Gesundheit 0..100 — dauerhafte Überlast führt zu Burnout. */
  energy: Score;
  /** Wöchentliche Aufmerksamkeitsverteilung (Summe = FOCUS_POINTS). */
  focus: CeoFocus;
  /** Kumuliertes persönliches Netto: Gehalt nach Steuer + erhaltene Dividenden. */
  personalNetCash: Money;
  /** Laufendes Executive-Coaching (hebt eine Kompetenz über Wochen). */
  coach: CeoCoach | null;
  /** Protokoll öffentlicher Auftritte (Interviews, Keynotes). */
  publicLog: CeoPublicEvent[];
}

/**
 * Wöchentliches Fokus-Budget des CEO (Phase 12): FOCUS_POINTS Punkte auf fünf
 * Bereiche verteilen. Über dem Basiswert (1) gibt es einen kleinen Rückenwind,
 * darunter Gegenwind — man kann sich nicht um alles gleichzeitig kümmern.
 * Ausgeglichen (überall 1) ist neutral.
 */
export interface CeoFocus {
  produkt: number;
  vertrieb: number;
  team: number;
  investoren: number;
  aussenwirkung: number;
}

export const FOCUS_POINTS = 5;

export function balancedFocus(): CeoFocus {
  return { produkt: 1, vertrieb: 1, team: 1, investoren: 1, aussenwirkung: 1 };
}

export interface CeoCoach {
  /** Kompetenz, an der gearbeitet wird. */
  skill: keyof CeoSkills;
  sinceWeek: WeekIndex;
  monthlyFee: Money;
}

export interface CeoPublicEvent {
  week: WeekIndex;
  kindDe: string;
  outcomeDe: string;
  reputationDelta: number;
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

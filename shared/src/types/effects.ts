import type { Department, Id, Money, ReputationDimension, WeekIndex } from './common.js';
import type { Seniority } from './common.js';

/**
 * Verzögerte & sekundäre Effekte — der Realismus-Kern.
 *
 * Jede Entscheidung/jedes Ereignis erzeugt neben Soforteffekten geplante
 * Folge-Effekte (ScheduledEffect, fällig in Woche X) und/oder zeitlich
 * begrenzte Modifikatoren (ActiveModifier, wirken von/bis Woche).
 * Beide sind Teil des CompanyState und damit voll deterministisch & replaybar.
 */
export interface ScheduledEffect {
  id: Id;
  dueWeek: WeekIndex;
  /** Menschenlesbare Herkunft: "Entlassungsrunde W12", "Preiserhöhung W8" … */
  sourceDe: string;
  /** Verweis auf auslösende Entscheidung/Event (für Kausalketten-Analyse). */
  sourceRef: { kind: 'decision' | 'event' | 'system'; id: Id | null };
  effect: EffectPayload;
}

/**
 * WICHTIG: Physische Geld-/Personalbewegungen passieren ausschließlich im
 * Wochentick. Aktionen mutieren nur Absichts-Felder (Budgets, Preisindex,
 * Ausschreibungen) und legen ScheduledEffects an — auch für „sofortige"
 * Wirkungen (dueWeek = aktuelle Woche). So gibt es genau EINEN Ort, an dem
 * Cash fließt, und die Kapitalflussrechnung stimmt konstruktionsbedingt.
 */
export type EffectPayload =
  | { kind: 'HIRES_ARRIVE'; dept: Department; seniority: Seniority; count: number; costPerHire: Money; specialistRoleDe?: string }
  | { kind: 'EXECUTE_LAYOFF'; dept: Department; count: number; generousSeverance: boolean }
  | { kind: 'DEBT_DRAW'; amount: Money }
  | { kind: 'DEBT_REPAY'; amount: Money }
  | { kind: 'SALARY_RAISE'; pct: number }
  | { kind: 'SATISFACTION_DELTA'; dept: Department | 'all'; amount: number }
  | { kind: 'REPUTATION_DELTA'; dimension: ReputationDimension; amount: number }
  | { kind: 'ADD_MODIFIER'; modifier: Omit<ActiveModifier, 'id'> }
  | { kind: 'ATTRITION_WAVE'; dept: Department | 'all'; extraQuitProbability: number }
  | { kind: 'RENEWAL_REPRICING'; segmentId: Id; priceDeltaApplied: number }
  | { kind: 'COMPETITOR_PRICE_MOVE'; competitorId: Id; priceIndexDelta: number }
  | { kind: 'KEY_ACCOUNT_HEALTH_DELTA'; accountId: Id; amount: number }
  | { kind: 'PRESS_STORY'; tone: 'positive' | 'neutral' | 'negative'; topicDe: string }
  | { kind: 'ONE_OFF_COST'; amount: Money; labelDe: string }
  | { kind: 'ONE_OFF_INCOME'; amount: Money; labelDe: string }
  | { kind: 'DEMAND_SHIFT'; factor: number; weeks: number; sourceDe: string }
  | { kind: 'DELEGATION_RESULT'; messageId: Id; execId: Id }
  | { kind: 'DELAYED_SCANDAL'; probability: number; fine: Money; topicDe: string }
  /** Eigenkapital-Zufluss aus akzeptiertem Term Sheet (Phase 5). */
  | { kind: 'EQUITY_INJECTION'; round: import('./funding.js').FundingRound; esopTopUp: number }
  /** Integration eines gekauften Unternehmens (Phase 5). */
  | { kind: 'MA_INTEGRATION'; targetId: Id }
  /** Börsengang vollziehen: Zuteilung, Bruttoerlös, Fees, Erstnotiz (Phase 6). */
  | { kind: 'IPO_LISTING'; pricePerShare: Money; subscriptionRatio: number }
  /** Individuelle Gehaltserhöhung (Phase 7): wirkt auf genau eine Person. */
  | { kind: 'EMPLOYEE_RAISE'; employeeId: Id; pct: number }
  /** Vom Aufsichtsrat genehmigtes CEO-Gehalt (Phase 7). */
  | { kind: 'CEO_SALARY_SET'; monthlyAmount: Money }
  /** Tariflich vereinbarte Lohnerhöhung (Phase 8): trifft die Tarif-Belegschaft (ohne AT/Execs). */
  | { kind: 'TARIF_RAISE'; pct: number; viaStrike: boolean }
  /** (Warn-)Streik (Phase 8): Produktivitäts- & Vertriebseinbruch, Presse. */
  | { kind: 'WARNING_STRIKE'; full: boolean }
  /** Gewinnausschüttung (Phase 9): Cash-Abfluss (CFF) + Minderung der Gewinnrücklage. */
  | { kind: 'DIVIDEND_PAYOUT'; amount: Money };

/** Zeitlich begrenzter Modifikator auf eine Systemgröße. */
export interface ActiveModifier {
  id: Id;
  target: ModifierTarget;
  /** Multiplikativ (factor) ODER additiv (add) — genau eines gesetzt. */
  factor?: number;
  add?: number;
  startWeek: WeekIndex;
  /** Letzte Woche (inklusive), in der der Modifikator wirkt. */
  endWeek: WeekIndex;
  sourceDe: string;
}

export type ModifierTarget =
  | 'churnMonthly' // Kohorten-Churn (multiplikativ)
  | 'leadGen' // Lead-Zufluss
  | 'trialWinRate' // Abschlussquote
  | 'velocity' // Engineering-Velocity
  | 'expansionMonthly' // Bestands-Expansion
  | 'attritionRisk' // Kündigungsrisiko Mitarbeiter
  | 'demandIndex'; // Makro-Nachfrage

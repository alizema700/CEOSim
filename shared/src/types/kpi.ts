import type { Money, WeekIndex } from './common.js';

/**
 * Abgeleitete Kennzahlen: IMMER berechnet, NIE als Wahrheit gespeichert.
 * (KpiSnapshots werden nur als Verlaufs-Cache für Charts abgelegt und sind
 * jederzeit aus dem Event-Log rekonstruierbar.)
 *
 * Jede Kennzahl hat eine KpiDefinition mit Formel-Text und kontextueller
 * „Warum jetzt relevant"-Erklärung für die Formel-Tooltips im UI.
 */
export type KpiId =
  | 'mrr'
  | 'arr'
  | 'mrrGrowthMonthly'
  | 'grossMarginPct'
  | 'ebitdaMonthly'
  | 'ebitdaMarginPct'
  | 'netBurnMonthly'
  | 'runwayWeeks'
  | 'customers'
  | 'arpa'
  | 'logoChurnMonthly'
  | 'nrr'
  | 'grr'
  | 'ltv'
  | 'cac'
  | 'ltvCacRatio'
  | 'cacPaybackMonths'
  | 'ruleOf40'
  | 'magicNumber'
  | 'dsoDays'
  | 'dpoDays'
  | 'cccDays'
  | 'workingCapital'
  | 'revenueConcentrationHhi'
  | 'valuation'
  | 'headcount'
  | 'marketSharePct'
  | 'productNps'
  | 'avgSatisfaction'
  | 'boardTrust';

export interface KpiDefinition {
  id: KpiId;
  labelDe: string;
  labelEn: string;
  unit: 'eur' | 'eurPerMonth' | 'pct' | 'ratio' | 'weeks' | 'months' | 'days' | 'count' | 'score' | 'index';
  /** Formel als Text, z. B. "LTV = ARPA × Bruttomarge ÷ Monats-Churn". */
  formulaDe: string;
  /** Definition in 2 Sätzen (Popover). */
  definitionDe: string;
  /** Gute/kritische Schwellen zur Ampel-Färbung (optional, kontextfrei). */
  goodWhen?: { comparator: 'gte' | 'lte'; value: number };
  badWhen?: { comparator: 'gte' | 'lte'; value: number };
}

/** Wöchentlicher Kennzahlen-Schnappschuss für Verläufe/Charts. */
export interface KpiSnapshot {
  week: WeekIndex;
  dateISO: string;
  values: Record<KpiId, number>;
}

/** Kontextualisierte KPI-Auswertung für Tooltip („warum JETZT relevant"). */
export interface KpiReading {
  id: KpiId;
  value: number;
  formattedDe: string;
  trend: 'up' | 'down' | 'flat';
  /** Ampel aus Sicht des Unternehmens (up ist nicht immer gut — Churn!). */
  health: 'good' | 'neutral' | 'warn' | 'critical';
  contextDe: string;
}

export interface ValuationBreakdown {
  arr: Money;
  multiple: number;
  driversDe: string[];
  value: Money;
}

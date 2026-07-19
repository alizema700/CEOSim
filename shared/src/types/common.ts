/**
 * Gemeinsame Grundtypen für das gesamte Datenmodell.
 *
 * Konventionen (WICHTIG, gelten überall):
 * - Geldbeträge: EUR als `number` (float). Rundung auf Cent erst an
 *   Systemgrenzen (Ledger-Abschluss, UI). Invarianten prüfen mit Epsilon.
 * - Raten: Bruchzahlen 0..1 (0.032 = 3,2 %). Suffix `Monthly`/`Weekly`/`Annual`
 *   gibt den Bezugszeitraum an. Umrechnung monatlich→wöchentlich immer über
 *   `1 - (1 - r_m)^(7/30.44)` (nie einfach /4!).
 * - Zeit: `WeekIndex` ist die absolute Spielwoche ab 0 (Woche der Übernahme/
 *   Gründung). Kalenderdatum = `startDateISO + 7 * week` Tage.
 * - Scores: 0..100 sofern nicht anders angegeben (NPS: -100..100).
 */

/** EUR-Betrag (float, Rundung an Systemgrenzen). */
export type Money = number;

/** Bruchzahl 0..1 (z. B. 0.25 = 25 %). */
export type Fraction = number;

/** Score 0..100. */
export type Score = number;

/** Absolute Spielwoche, beginnend bei 0. */
export type WeekIndex = number;

/** UUID-artige ID (im Spiel deterministisch aus Seed + Zähler generierbar). */
export type Id = string;

export type DifficultyId = 'praktikant' | 'manager' | 'ceo' | 'aktivist';

export type ScenarioId =
  | 'saas-turnaround' // Phase 1: SaaS-Übernahme mit Churn-Problem
  | 'manufacturing-concentration' // später: Produktionsbetrieb, Klumpenrisiko
  | 'ecommerce-cash' // später: E-Commerce, Cash-Conversion
  | 'founding' // später: Gründung ab Tag 0
  | 'distressed'; // später: Sanierungsfall

export type Department = 'engineering' | 'sales' | 'marketing' | 'cs' | 'ga';

/** Abteilungs-Reihenfolge für stabile, deterministische Iteration. */
export const DEPARTMENTS: readonly Department[] = [
  'engineering',
  'sales',
  'marketing',
  'cs',
  'ga',
] as const;

export type Seniority = 'junior' | 'mid' | 'senior' | 'lead';

/** Reputations-Dimensionen — jede beeinflusst andere Subsysteme. */
export type ReputationDimension = 'customers' | 'press' | 'laborMarket' | 'investors';

export type GameStatus =
  | 'active'
  | 'insolvent' // Cash < 0 ⇒ Game Over
  | 'fired' // Board-Misstrauensvotum ⇒ Game Over
  | 'exited'; // Verkauf/Exit (spätere Phase)

/** Umrechnungskonstanten. */
export const DAYS_PER_MONTH = 30.44;
export const WEEKS_PER_MONTH = DAYS_PER_MONTH / 7; // ≈ 4.349
export const WEEKS_PER_YEAR = 52;

/** Monatliche Rate → wöchentliche Rate (zinseszins-korrekt). */
export function monthlyToWeeklyRate(rMonthly: Fraction): Fraction {
  return 1 - Math.pow(1 - rMonthly, 7 / DAYS_PER_MONTH);
}

/** Wöchentliche Rate → monatliche Rate. */
export function weeklyToMonthlyRate(rWeekly: Fraction): Fraction {
  return 1 - Math.pow(1 - rWeekly, DAYS_PER_MONTH / 7);
}

/** Monatsbetrag → Wochenbetrag. */
export function monthlyToWeeklyAmount(m: Money): Money {
  return m / WEEKS_PER_MONTH;
}

/** Rundung auf Cent. */
export function toCents(v: Money): Money {
  return Math.round(v * 100) / 100;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

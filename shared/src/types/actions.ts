import type { Department, Fraction, Id, Money, Seniority } from './common.js';

/**
 * Spieler-Aktionen (Phase 1: festes Entscheidungs-Panel).
 *
 * ARCHITEKTURPRINZIP „Trennung von Wahrheit und Erzählung":
 * NUR diese validierten Aktionen (und der Wochentick) verändern Zahlen.
 * Das LLM erzeugt niemals State-Änderungen direkt — es liefert höchstens
 * strukturierte Intents, die in genau diese Aktionstypen übersetzt und von
 * der Engine validiert werden. Ab Phase 3 kommt `FREE_IDEA` hinzu (LLM
 * klassifiziert → Engine setzt als Projekt mit Meilensteinen um).
 */
export type PlayerAction =
  | PriceChangeAction
  | StartHiringAction
  | LayoffAction
  | SetMarketingBudgetAction
  | SetRndAllocationAction
  | SetCsBudgetAction
  | AdjustSalariesAction
  | RaiseDebtAction
  | RepayDebtAction
  | RespondEventAction
  | DelegateMessageAction;

/**
 * Listenpreis ändern (± %). Sofort: Neugeschäfts-ARPA. Verzögert: Bestand wird
 * beim Renewal umgestellt; Churn-Spike nach 4–12 Wochen; Konkurrenz kann
 * kontern. Cooldown: 8 Wochen zwischen Preisänderungen.
 */
export interface PriceChangeAction {
  type: 'PRICE_CHANGE';
  /** −0.30 .. +0.30 (= ±30 %). */
  pct: Fraction;
  /** Bestandskunden beim Renewal ebenfalls umstellen? (sonst nur Neugeschäft) */
  applyToExisting: boolean;
}

/** Stellen ausschreiben. Time-to-Fill hängt an Arbeitsmarkt-Reputation & Talentpool. */
export interface StartHiringAction {
  type: 'START_HIRING';
  dept: Department;
  seniority: Seniority;
  count: number;
}

/**
 * Entlassungen. Sofort: Abfindungskosten. Ab Kündigungsfrist: OpEx ↓.
 * Verzögert: Moral ↓, Arbeitsmarkt-Reputation ↓, erhöhte freiwillige
 * Kündigungen (2–8 Wochen), Velocity ↓, evtl. Presse.
 */
export interface LayoffAction {
  type: 'LAYOFF';
  dept: Department;
  count: number;
  /** Großzügige Abfindung: teurer, aber deutlich mildere Folgeeffekte. */
  generousSeverance: boolean;
}

/** Monatliches Marketing-Budget setzen (wirkt auf Lead-Gen mit 2–6 Wochen Lag). */
export interface SetMarketingBudgetAction {
  type: 'SET_MARKETING_BUDGET';
  monthlyAmount: Money;
}

/** R&D-Kapazität verteilen (Summe = 1). */
export interface SetRndAllocationAction {
  type: 'SET_RND_ALLOCATION';
  features: Fraction;
  techDebt: Fraction;
  bugfixes: Fraction;
}

/** Customer-Success-Programmbudget (senkt Churn mit 3–6 Wochen Lag). */
export interface SetCsBudgetAction {
  type: 'SET_CS_BUDGET';
  monthlyAmount: Money;
}

/** Gehaltsrunde für alle (Moral ↑ sofort, OpEx ↑ dauerhaft). */
export interface AdjustSalariesAction {
  type: 'ADJUST_SALARIES';
  /** 0 .. 0.15 (max. +15 % pro Runde). */
  pct: Fraction;
}

/** Kreditlinie ziehen (Covenant-Kapazität wird geprüft). */
export interface RaiseDebtAction {
  type: 'RAISE_DEBT';
  amount: Money;
}

/** Kredit tilgen. */
export interface RepayDebtAction {
  type: 'REPAY_DEBT';
  amount: Money;
}

/** Auf ein aktives Zufalls-/Krisenereignis mit einer der Optionen reagieren. */
export interface RespondEventAction {
  type: 'RESPOND_EVENT';
  eventInstanceId: Id;
  optionId: string;
}

/**
 * Eine delegierbare Nachricht ans Führungsteam geben („kümmer dich drum").
 * Ergebnis hängt deterministisch (seed-gesteuert) von Kompetenz & Auslastung
 * der gewählten Führungskraft ab und kommt nach 1–2 Wochen als Mail zurück.
 */
export interface DelegateMessageAction {
  type: 'DELEGATE_MESSAGE';
  messageId: Id;
  execRole: import('./people.js').ExecutiveRole;
}

/** Ergebnis der Aktions-Validierung durch die Engine. */
export interface ActionValidation {
  ok: boolean;
  errorsDe: string[];
  warningsDe: string[];
}

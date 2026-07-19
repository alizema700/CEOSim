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
  | DelegateMessageAction
  | StartProjectAction
  | HireConsultantAction
  | AcceptTermSheetAction
  | RaiseVentureDebtAction
  | MaDueDiligenceAction
  | MaAcquireAction;

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

/**
 * Freie Idee als Projekt starten (Ideen-System, Phase 3). Die Klassifikation
 * stammt vom LLM (oder Fallback), wurde vom Spieler bestätigt und wandert
 * vollständig ins Event-Log — die Engine klemmt alle Werte zusätzlich.
 */
export interface StartProjectAction {
  type: 'START_PROJECT';
  classification: import('./strategy.js').IdeaClassification;
}

/**
 * KI-Unternehmensberater buchen (Phase 4): kostet 25 k€ pro Engagement,
 * liefert einen Slide-Report. Didaktik: gut, aber nicht unfehlbar —
 * Beratern nicht blind glauben.
 */
export interface HireConsultantAction {
  type: 'HIRE_CONSULTANT';
  topic: 'churn' | 'pricing' | 'market' | 'costs';
}

export const CONSULTANT_FEE = 25_000;

/**
 * Term Sheet annehmen (Phase 5). Das Angebot wird gegen die deterministische
 * Regenerierung validiert — manipulierte Angebote fliegen auf.
 */
export interface AcceptTermSheetAction {
  type: 'ACCEPT_TERM_SHEET';
  offer: import('./funding.js').TermSheetOffer;
}

/** Venture Debt: schneller, teurer Fremdkapital-Puffer (Phase 5). */
export interface RaiseVentureDebtAction {
  type: 'RAISE_VENTURE_DEBT';
  amount: number;
}

/** Due Diligence auf ein Kaufziel (deckt Red Flags auf; kostet Beratung). */
export interface MaDueDiligenceAction {
  type: 'MA_DUE_DILIGENCE';
  targetId: string;
}

/** Kaufziel übernehmen (Integration mit Kulturrisiko & Red-Flag-Folgen). */
export interface MaAcquireAction {
  type: 'MA_ACQUIRE';
  targetId: string;
}

export const MA_DD_FEE = 15_000;

/** Ergebnis der Aktions-Validierung durch die Engine. */
export interface ActionValidation {
  ok: boolean;
  errorsDe: string[];
  warningsDe: string[];
}

import type { Department, Fraction, Id, Money, Score, Seniority, WeekIndex } from './common.js';

/**
 * Personal-Modell.
 *
 * Bis ~50 Köpfe wird jede Person einzeln modelliert (Name, Gehalt, Performance,
 * Zufriedenheit, Kündigungsrisiko …). Darüber wird je Abteilung aggregiert
 * (spätere Phase; das Datenmodell sieht beides vor).
 */
export interface PeopleState {
  employees: Employee[];
  /** Benannte Führungs-Personas (CTO, Head of Sales, …) mit Persönlichkeit. */
  executives: Executive[];
  /** Sekretärin / Chief of Staff — erste Anlaufstelle, Briefings, Kalender. */
  assistant: AssistantPersona;
  /** Laufende Stellenausschreibungen mit Time-to-Fill-Logik. */
  openRequisitions: Requisition[];
  /** Ø-Zufriedenheit je Abteilung (abgeleitet, aber gecacht für Ton/Frequenz von Nachrichten). */
  moraleByDept: Record<Department, Score>;
  /** Arbeitgeber-Attraktivität wirkt auf Time-to-Fill & Offer-Annahmequote (Spiegel von reputation.laborMarket). */
  attritionModifier: number;
}

export interface Employee {
  id: Id;
  firstName: string;
  lastName: string;
  dept: Department;
  roleTitleDe: string;
  seniority: Seniority;
  /** Bruttogehalt pro Monat; Arbeitgeberkosten = salary * employerCostFactor. */
  salaryMonthly: Money;
  performance: Score;
  satisfaction: Score;
  /** Basis-Wahrscheinlichkeit pro Woche, dass die Person kündigt (0..1, wird durch Zufriedenheit moduliert). */
  attritionRiskWeekly: Fraction;
  /** Schlüsselperson: Abgang hat Sondereffekte (Wissen, Velocity, Kundenbeziehungen). */
  keyPerson: boolean;
  hiredWeek: WeekIndex;
  /** Wochen bis volle Produktivität nach Einstellung. */
  rampWeeksRemaining: number;
}

/** Führungskraft = Employee-Verweis + Persona-Daten für die LLM-Ebene. */
export interface Executive {
  id: Id;
  employeeId: Id;
  role: ExecutiveRole;
  /** Kurzcharakteristik für System-Prompts, z. B. "detailverliebt, risikoavers". */
  personalityDe: string;
  /** Eigene Agenda, die die Persona in Meetings/Mails verfolgt. */
  agendaDe: string;
  /** Beziehung zum CEO 0..100 — beeinflusst Offenheit, Loyalität, Widerspruch. */
  relationshipToCeo: Score;
}

export type ExecutiveRole = 'cto' | 'headOfSales' | 'headOfCs' | 'cfo';

export interface AssistantPersona {
  id: Id;
  name: string;
  personalityDe: string;
}

export interface Requisition {
  id: Id;
  dept: Department;
  seniority: Seniority;
  count: number;
  openedWeek: WeekIndex;
  /** Erwartete Restwochen bis Besetzung (sinkt wöchentlich, moduliert durch Arbeitsmarkt-Reputation & Talentpool). */
  expectedWeeksToFill: number;
  /** Einmalige Recruiting-Kosten pro Hire (fällig bei Besetzung). */
  costPerHire: Money;
}

/** Arbeitgeber-Gesamtkostenfaktor auf das Bruttogehalt (Sozialabgaben etc.). */
export const EMPLOYER_COST_FACTOR = 1.22;

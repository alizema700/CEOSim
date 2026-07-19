import type { Fraction, Id, Money, WeekIndex } from './common.js';

/**
 * Ideen-System & Projekte (Phase 3).
 *
 * Der Spieler kann JEDE freie Idee einbringen. Das LLM klassifiziert sie in
 * eine streng BEGRENZTE Struktur (zod-validiert, alle Wirkungen gedeckelt),
 * der Spieler bestätigt, die Engine setzt sie als Projekt um. Der komplette
 * Klassifikations-Payload wandert ins Event-Log (START_PROJECT) — Replay
 * braucht kein LLM. Nichts ist „nicht vorgesehen".
 */
export interface IdeaClassification {
  titleDe: string;
  categoryDe: string; // z. B. "Marketing", "Kultur", "Produkt", "Vertrieb"
  /** Einmalkosten bei Projektstart. */
  costOneOff: Money; // 0 .. 500 000
  /** Laufende Monatskosten während der Laufzeit. */
  costMonthly: Money; // 0 .. 100 000
  durationWeeks: number; // 1 .. 26
  /** Erfolgswahrscheinlichkeit mit Begründung (didaktisch: kalibrieren!). */
  successProb: Fraction; // 0.05 .. 0.95
  rationaleDe: string;
  riskDe: string;
  /** Vergleichsfälle aus der echten Welt (nur Text, keine Zahlenmacht). */
  comparablesDe: string[];
  /** GEDECKELTE Wirkungen bei Erfolg (Engine klemmt zusätzlich). */
  effects: IdeaEffects;
}

export interface IdeaEffects {
  /** Lead-Generierung ×Faktor für 26 Wochen (1.0 .. 1.3). */
  leadGenFactor?: number;
  /** Churn ×Faktor für 26 Wochen (0.85 .. 1.0). */
  churnFactor?: number;
  /** Team-Zufriedenheit einmalig (−5 .. +8). */
  moraleDelta?: number;
  /** Presse-Reputation einmalig (−3 .. +6). */
  pressDelta?: number;
  /** Produkt-NPS einmalig (−5 .. +8). */
  npsDelta?: number;
}

export interface Project {
  id: Id;
  titleDe: string;
  categoryDe: string;
  startWeek: WeekIndex;
  durationWeeks: number;
  costMonthly: Money;
  successProb: Fraction;
  effects: IdeaEffects;
  status: 'running' | 'succeeded' | 'failed';
  /** 0..1 — Fortschritt (Wochenanteile). */
  progress: number;
  resolvedWeek: WeekIndex | null;
}

/** Medienspiegel-Eintrag (deterministisch aus PRESS_STORY-Effekten). */
export interface PressLogEntry {
  week: WeekIndex;
  tone: 'positive' | 'neutral' | 'negative';
  topicDe: string;
}

import type { Fraction, WeekIndex } from './common.js';

/**
 * Arbeitsbeziehungen (Phase 8) — deutscher Realismus: Tarifbindung,
 * Gewerkschaft, Betriebsrat, Tarifrunden und Streik.
 *
 * Wie alles andere ist auch das deterministisch: Der Wochentick treibt
 * Organisationsgrad und Konfliktniveau, Tarifrunden werden fällig, und der
 * Ausgang von Verhandlungen ergibt sich aus Angebot vs. Forderung — nicht
 * aus dem LLM. Das LLM spielt später nur die Gewerkschaftssekretärin.
 */

export type TarifStatus =
  | 'none' // nicht tarifgebunden
  | 'verband' // Flächentarifvertrag über Arbeitgeberverband
  | 'haustarif'; // eigener Haustarifvertrag mit der Gewerkschaft

export interface LaborState {
  tarifStatus: TarifStatus;
  /** Gewerkschafts-Organisationsgrad der Belegschaft, 0..1. */
  unionizationRate: Fraction;
  /** Betriebsrat gewählt? (bildet sich ab Betriebsgröße + Belegschaftswunsch) */
  worksCouncil: boolean;
  worksCouncilSinceWeek: WeekIndex | null;
  /** Konfliktniveau 0..100 — treibt Warnstreik-/Streikrisiko. */
  tension: number;
  /** Nächste reguläre Tarifrunde fällig ab dieser Woche (nur wenn tarifgebunden). */
  nextBargainingWeek: WeekIndex | null;
  /** Laufende Tarifverhandlung (verlangt ein Angebot des CEO). */
  negotiation: TarifNegotiation | null;
  /** Zuletzt tariflich vereinbarte Erhöhung (Info/Historie). */
  lastRaisePct: number | null;
  lastRaiseWeek: WeekIndex | null;
  rounds: TarifRoundResult[];
  /** Interner Cooldown, damit Betriebsrats-Thema nicht wöchentlich aufpoppt. */
  councilConsideredWeek: WeekIndex | null;
}

export interface TarifNegotiation {
  startedWeek: WeekIndex;
  /** Forderung der Gewerkschaft in Prozent Lohnerhöhung. */
  demandPct: number;
  /** Untergrenze eines akzeptablen Abschlusses — darunter droht Streik. */
  floorPct: number;
  /** Bis zu dieser Woche muss ein Angebot her, sonst eskaliert es (Warnstreik). */
  deadlineWeek: WeekIndex;
  /** Verhandlungs-/Eskalationsrunde (0 = frisch). */
  round: number;
  /** Letztes Angebot des CEO in Prozent (null = noch keins). */
  lastOfferPct: number | null;
}

export interface TarifRoundResult {
  week: WeekIndex;
  agreedPct: number;
  /** Kam der Abschluss erst nach (Warn-)Streik zustande? */
  viaStrike: boolean;
}

/** Startzustand — abhängig von Regulierungsdichte des Standorts & Szenario. */
export function initialLaborState(regulationDensity: 'low' | 'medium' | 'high', distressed: boolean): LaborState {
  const baseUnion = regulationDensity === 'high' ? 0.28 : regulationDensity === 'medium' ? 0.15 : 0.06;
  return {
    tarifStatus: 'none',
    unionizationRate: baseUnion,
    worksCouncil: false,
    worksCouncilSinceWeek: null,
    tension: distressed ? 36 : 18,
    nextBargainingWeek: null,
    negotiation: null,
    lastRaisePct: null,
    lastRaiseWeek: null,
    rounds: [],
    councilConsideredWeek: null,
  };
}

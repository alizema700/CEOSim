import type { Fraction, Id, Money, Score, WeekIndex } from './common.js';

/**
 * Kunden-Modell: Segmente → Quartals-Kohorten → (Top-)Key-Accounts.
 *
 * - Kohorten bündeln Kunden nach Startquartal (13-Wochen-Blöcke), damit die
 *   Arrays über Jahre beschränkt bleiben. Jede Kohorte altert, churnt gemäß
 *   eigener Kurve und expandiert (Seat-/Plan-Upgrades).
 * - Key-Accounts sind EINZELN benannte Großkunden mit EIGENEM MRR (nicht in
 *   Kohorten enthalten — Gesamt-MRR = Kohorten + Key-Accounts). Sie tragen
 *   Events („Key Account droht zu kündigen") und die Umsatz-Konzentration
 *   (HHI). Key-Accounts haben Jahresverträge und churnen nur zum Renewal
 *   oder durch Eskalations-Events.
 */
export interface CustomerState {
  segments: CustomerSegment[];
  cohorts: CustomerCohort[];
  keyAccounts: KeyAccount[];
  pipeline: PipelineState;
  /** Listenpreis-Index: 1.0 = Ausgangspreis. Preisänderungen wirken auf Neugeschäft sofort, Bestand bei Renewal. */
  priceIndex: number;
  /** Woche der letzten Preisänderung (Cooldown für erneute Änderung). */
  lastPriceChangeWeek: WeekIndex | null;
}

export interface CustomerSegment {
  id: Id;
  nameDe: string; // z. B. "SMB", "Mid-Market"
  /** Referenz-ARPA (monatlich) zum priceIndex 1.0. */
  baseArpaMonthly: Money;
  /** Anteil Jahresverträge (Vorauszahlung) bei Neuabschlüssen. */
  annualContractShare: Fraction;
}

export interface CustomerCohort {
  id: Id;
  segmentId: Id;
  /** Startwoche des Quartals-Blocks (week - startWeek = Alter). */
  startWeek: WeekIndex;
  /** Anzahl Logos mit Monatsvertrag. */
  logosMonthly: number;
  /** Anzahl Logos mit Jahresvertrag (churnen nur zum Renewal). */
  logosAnnual: number;
  /** Ø-ARPA dieser Kohorte (monatlich, inkl. bisheriger Expansion). */
  arpaMonthly: Money;
  /** Basis-Monats-Churn der Kohorte (wird durch Alterskurve/NPS/CS moduliert). */
  baseMonthlyChurn: Fraction;
  /** Monatliche Netto-Expansion des Bestands (Upgrades − Downgrades). */
  monthlyExpansion: Fraction;
}

export interface KeyAccount {
  id: Id;
  name: string; // z. B. "TechCorp AG"
  segmentId: Id;
  mrr: Money;
  /** Gesundheit 0..100 — sinkt bei Outages, Preiserhöhungen, schlechtem Support. */
  health: Score;
  /** Woche des nächsten Renewals (Jahresvertrag). */
  renewalWeek: WeekIndex;
  /** Hat der Account gekündigt/Kündigung angedroht? */
  status: 'ok' | 'atRisk' | 'churned';
}

/**
 * Vereinfachter Funnel: Marketing erzeugt Leads → Trials (reifen 3 Wochen) →
 * Abschluss. Win-Rate hängt an Produkt-NPS, Preis vs. Markt, Sales-Kapazität.
 */
export interface PipelineState {
  /** Neue Leads der letzten Woche (Anzeige/Diagnose). */
  lastWeekLeads: number;
  /** Aktive Trials nach Restwochen bis Entscheidung. */
  trials: { count: number; weeksToDecision: number }[];
  /** Basis-Conversion Lead→Trial. */
  leadToTrialRate: Fraction;
  /** Basis-Win-Rate Trial→Kunde (vor Modifikatoren). */
  trialWinRate: Fraction;
  /** Rollende 13-Wochen-Fenster für CAC/Magic Number (jüngste zuletzt). */
  recentNewLogos: number[];
  recentSmSpend: number[];
}

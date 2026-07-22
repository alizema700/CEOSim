import type { Money, WeekIndex } from './common.js';

/**
 * Versicherungen (Phase 22, V1). Ein Unternehmen kann Policen abschließen: laufende
 * Prämien (G&A-Kosten) gegen Deckung im Schadensfall. Schäden laufen im Spiel
 * größtenteils über DELAYED_SCANDAL (Datenpanne, Betrug, Klage, Patentstreit,
 * M&A-Altlast) sowie über Regulierungs-Auflagen (M5) — genau dort greift die Deckung.
 *
 * Golden-Master-sicher: per Default ist keine Police aktiv ⇒ keine Prämie (OpEx
 * unverändert) und jede Schadensmeldung deckt 0 (Netto-Schaden unverändert).
 */

export type InsuranceKind = 'haftpflicht' | 'rechtsschutz' | 'cyber' | 'do' | 'vertrauensschaden';

/** Schadensart, gegen die eine Police deckt. */
export type ClaimKind = 'cyber' | 'legal' | 'fraud' | 'regulation';

export interface InsurancePolicy {
  active: boolean;
  sinceWeek: WeekIndex;
  /** Kumuliert erhaltene Deckungssummen (fürs UI). */
  claimsPaid: Money;
}

export interface InsuranceState {
  policies: Record<InsuranceKind, InsurancePolicy>;
  /** Kumuliert gezahlte Prämien. */
  premiumsPaidTotal: Money;
  /** Kumuliert erhaltene Deckungssummen (alle Policen). */
  claimsPaidTotal: Money;
  /** Kurzchronik (fürs UI). */
  logDe: string[];
}

export interface InsuranceSpec {
  labelDe: string;
  shortDe: string;
  /** Monatliche Prämie (fließt in die G&A-Kosten). */
  monthlyPremium: Money;
  /** Gedeckter Anteil eines Schadens (0..1). */
  coverage: number;
  /** Maximale Deckungssumme je Schadensfall. */
  capPerClaim: Money;
  /** Welche Schadensarten die Police deckt. */
  covers: ClaimKind[];
}

export const INSURANCE_KINDS: InsuranceKind[] = ['haftpflicht', 'rechtsschutz', 'cyber', 'do', 'vertrauensschaden'];

export const INSURANCE_SPECS: Record<InsuranceKind, InsuranceSpec> = {
  haftpflicht: {
    labelDe: 'Betriebshaftpflicht', shortDe: 'Allgemeine Haftpflicht — Personen-/Sach-/Vermögensschäden Dritter.',
    monthlyPremium: 1_200, coverage: 0.5, capPerClaim: 40_000, covers: ['legal'],
  },
  rechtsschutz: {
    labelDe: 'Rechtsschutz', shortDe: 'Deckt Anwalts- & Verfahrenskosten bei Klagen und behördlichen Auflagen.',
    monthlyPremium: 900, coverage: 0.7, capPerClaim: 60_000, covers: ['legal', 'regulation'],
  },
  cyber: {
    labelDe: 'Cyber-Versicherung', shortDe: 'Datenpannen, Erpressung, Betriebsausfall durch IT-Vorfälle.',
    monthlyPremium: 1_800, coverage: 0.75, capPerClaim: 150_000, covers: ['cyber'],
  },
  do: {
    labelDe: 'D&O (Managerhaftpflicht)', shortDe: 'Schützt Leitung bei Haftungs-, Governance- & Skandalfällen (breite Deckung).',
    monthlyPremium: 2_400, coverage: 0.8, capPerClaim: 200_000, covers: ['legal', 'cyber', 'fraud'],
  },
  vertrauensschaden: {
    labelDe: 'Vertrauensschaden', shortDe: 'Deckt Schäden durch Betrug, Untreue & Unterschlagung (intern/extern).',
    monthlyPremium: 700, coverage: 0.7, capPerClaim: 80_000, covers: ['fraud'],
  },
};

export function initialInsuranceState(): InsuranceState {
  const policy = (): InsurancePolicy => ({ active: false, sinceWeek: -1, claimsPaid: 0 });
  return {
    policies: { haftpflicht: policy(), rechtsschutz: policy(), cyber: policy(), do: policy(), vertrauensschaden: policy() },
    premiumsPaidTotal: 0,
    claimsPaidTotal: 0,
    logDe: [],
  };
}

import type { Fraction, Id, Money } from './common.js';

/**
 * Firmen-Identität & Ideologie.
 *
 * NICHT kosmetisch: Die Engine speichert Mission/Werte/Motto, und die
 * Bewertungs-Pipeline prüft spätere Entscheidungen auf Konsistenz damit
 * (z. B. Motto „Menschen zuerst" + brutale Massenentlassung ⇒
 * Kultur-/Reputations-Malus, Presse zitiert das Motto).
 */
export interface CompanyIdentity {
  companyName: string;
  /** Hex-Farbe des Logos, z. B. "#22d3ee". */
  logoColor: string;
  /** Emoji/Glyph als Logo-Platzhalter (Datei-Upload in späterer Phase). */
  logoEmoji: string;
  /** Frei formulierte Produktidee/Branche — fließt in LLM-Flavor ein. */
  productPitch: string;
  mission: string;
  vision: string;
  /** 2–4 gewählte Unternehmenswerte (z. B. "Menschen zuerst"). */
  values: string[];
  motto: string;
  locationId: LocationId;
}

export type LocationId = 'muenchen' | 'berlin' | 'zuerich' | 'austin';

/** Standort-Parameter — beeinflussen Payroll, Hiring, Steuern, Bürokosten. */
export interface LocationProfile {
  id: LocationId;
  nameDe: string;
  country: string;
  /** Multiplikator auf Basisgehälter (1.0 = Referenz München). */
  payrollIndex: number;
  /** 0..1 — Größe/Qualität des Talentpools ⇒ Time-to-Fill, Qualität. */
  talentPool: Fraction;
  /** Effektiver Ertragsteuersatz auf positives Ergebnis. */
  taxRate: Fraction;
  /** Regulierungsdichte ⇒ Frequenz rechtlicher Events, Kündigungsschutz. */
  regulationDensity: 'low' | 'medium' | 'high';
  /** Bürokosten pro Mitarbeiter und Monat. */
  officeCostPerEmployeeMonthly: Money;
}

/**
 * Selbsteinschätzung des Spielers beim Setup („individualisiert" das Spiel:
 * Events/Bewertungen zielen bewusst auch auf Schwächen).
 */
export interface PlayerProfile {
  /** Anzeigename des CEO (der Spieler). */
  ceoName: string;
  strengths: PlayerSkillArea[];
  weaknesses: PlayerSkillArea[];
}

export type PlayerSkillArea =
  | 'finanzen'
  | 'vertrieb'
  | 'produkt'
  | 'leadership'
  | 'kommunikation'
  | 'recht';

/** Cap-Table-Eintrag. */
export interface CapTableEntry {
  id: Id;
  holder: string;
  kind: 'founder' | 'investor' | 'esop' | 'ceo' | 'public';
  /** Anteil 0..1, Summe aller Einträge = 1. */
  share: Fraction;
}

import type { Money, WeekIndex } from './common.js';

/**
 * Rechtsform & Gesellschaftsrecht (Phase 9).
 *
 * Bildet die deutsche Firmenstruktur ab, damit CEO und Kapitalgesellschaft
 * durchschaubar werden: Rechtsform, Stamm-/Grundkapital, Handelsregister,
 * die Organe (Gesellschafter-/Hauptversammlung, Aufsichtsrat, Geschäfts-
 * führung/Vorstand) und die größenabhängigen Compliance-Pflichten (§ 267 HGB,
 * Mitbestimmung). Alles deterministisch — kein LLM verändert diese Zahlen.
 *
 * Realismus-Kopplung: Ein Börsengang setzt eine AG voraus (§ 2 AktG). Der
 * Formwechsel GmbH → AG ist damit die harte Voraussetzung fürs IPO.
 */

export type Rechtsform = 'UG' | 'GmbH' | 'AG' | 'LLC' | 'Inc' | 'Ltd' | 'PLC';

/** Mindest-Nennkapital je Rechtsform (dt. §§ GmbHG/AktG; US/UK vereinfacht). */
export const MIN_KAPITAL: Record<Rechtsform, Money> = {
  UG: 1,
  GmbH: 25_000,
  AG: 50_000,
  LLC: 0,
  Inc: 1,
  Ltd: 1,
  PLC: 50_000, // £50.000 Mindest-Grundkapital einer PLC
};

/**
 * Rechtsform-Familie je Land: mit welcher Form startet man, und welche ist
 * börsenfähig (Ziel eines Formwechsels). Deutschland GmbH→AG, UK Ltd→PLC,
 * USA Inc (C-Corp) ist bereits börsenfähig — kein Formwechsel nötig.
 */
export function legalFamily(country: string): { start: Rechtsform; ipoTarget: Rechtsform } {
  if (country === 'USA') return { start: 'Inc', ipoTarget: 'Inc' };
  if (country === 'Großbritannien') return { start: 'Ltd', ipoTarget: 'PLC' };
  return { start: 'GmbH', ipoTarget: 'AG' };
}

/** Börsenfähige Rechtsformen (nur diese dürfen an die Börse). */
export function isPublicCapable(f: Rechtsform): boolean {
  return f === 'AG' || f === 'Inc' || f === 'PLC';
}

/** Deutsche Ertragsteuer-Bausteine (Kapitalgesellschaft). */
export const KOERPERSCHAFTSTEUER = 0.15; // § 23 KStG
export const SOLI_AUF_KST = 0.055; // Solidaritätszuschlag auf die KSt
export const GEWERBE_MESSZAHL = 0.035; // Steuermesszahl § 11 GewStG

/** Gewerbesteuer-Hebesätze realer deutscher Städte (%). */
export const HEBESATZ_BY_CITY: Record<string, number> = {
  muenchen: 490,
  berlin: 410,
  hamburg: 470,
  frankfurt: 460,
  koeln: 475,
  duesseldorf: 440,
  stuttgart: 420,
  leipzig: 460,
  dresden: 450,
};
export const HEBESATZ_DEFAULT = 400;

export interface HandelsregisterEntry {
  /** Registerbehörde (Amtsgericht / Secretary of State / Companies House). */
  courtDe: string;
  /** Registerart: HRB (DE), File (US), CRN (UK). */
  type: 'HRB' | 'File' | 'CRN';
  /** Registernummer (deterministisch aus dem Seed). */
  number: string;
}

/** Mitbestimmung im Aufsichtsrat, gestaffelt nach Belegschaftsgröße. */
export type Mitbestimmung = 'keine' | 'drittelbeteiligung' | 'paritaetisch';

/** Größenklasse nach § 267 HGB (vereinfacht aus Umsatz & Beschäftigten). */
export type Groessenklasse = 'klein' | 'mittelgross' | 'gross';

export interface LegalState {
  rechtsform: Rechtsform;
  /** Stamm- (GmbH/UG) bzw. Grundkapital (AG) — gezeichnetes Nennkapital. */
  nennkapital: Money;
  handelsregister: HandelsregisterEntry;

  /** Aufsichtsrat/Beirat vorhanden (bei Investoren-Board-Sitz true). */
  aufsichtsrat: boolean;
  mitbestimmung: Mitbestimmung;

  /** Gewerbesteuer-Hebesatz des Standorts (%). */
  hebesatz: number;

  /** Größenklasse & Prüfungspflicht (§ 316 HGB: Mittel/Groß sind prüfpflichtig). */
  groessenklasse: Groessenklasse;
  pruefungspflicht: boolean;

  /** Woche der letzten festgestellten Bilanz / ordentlichen Versammlung. */
  lastMeetingWeek: WeekIndex | null;
  /** Fälligkeit der nächsten ordentlichen Versammlung. */
  nextMeetingWeek: WeekIndex;

  /** Laufender Formwechsel (z. B. GmbH → AG), bis effectiveWeek. */
  pendingConversion: { toForm: Rechtsform; startedWeek: WeekIndex; effectiveWeek: WeekIndex } | null;

  /** Historie der Rechtsform-Wechsel und Ausschüttungen (fürs UI). */
  formHistory: { week: WeekIndex; from: Rechtsform; to: Rechtsform }[];
  dividends: { week: WeekIndex; amount: Money }[];
}

/** Notar- & Handelsregisterkosten (vereinfacht, aber real spürbar). */
export const NOTARY_CAPITAL_FEE_RATE = 0.006; // auf die Kapitalerhöhung
export const NOTARY_CAPITAL_FEE_MIN = 800;
export const FORMWECHSEL_FEE_AG = 42_000; // Umwandlungsbericht, Prüfung, Notar, HR
export const FORMWECHSEL_WEEKS = 4;

export function displayRechtsform(f: Rechtsform): string {
  return f === 'UG' ? 'UG (haftungsbeschränkt)' : f;
}

/** Organbezeichnungen je Rechtsform (DE zweistufig, US/UK einstufig). */
export function organNames(f: Rechtsform): { leitung: string; aufsicht: string; versammlung: string; anteil: string; anteilseigner: string } {
  switch (f) {
    case 'AG':
      return { leitung: 'Vorstand', aufsicht: 'Aufsichtsrat', versammlung: 'Hauptversammlung', anteil: 'Aktie', anteilseigner: 'Aktionär:innen' };
    case 'Inc':
    case 'LLC':
      return { leitung: 'Officers (CEO/CFO)', aufsicht: 'Board of Directors', versammlung: "Stockholders' Meeting", anteil: 'Share', anteilseigner: 'Stockholders' };
    case 'Ltd':
    case 'PLC':
      return { leitung: 'Executive Directors', aufsicht: 'Board of Directors', versammlung: 'General Meeting', anteil: 'Share', anteilseigner: 'Shareholders' };
    default:
      return { leitung: 'Geschäftsführung', aufsicht: 'Aufsichtsrat/Beirat', versammlung: 'Gesellschafterversammlung', anteil: 'Geschäftsanteil', anteilseigner: 'Gesellschafter:innen' };
  }
}

/**
 * Effektiver Ertragsteuersatz. Deutsche Kapitalgesellschaft:
 * KSt 15 % + Soli (5,5 % darauf) + Gewerbesteuer (Messzahl 3,5 % × Hebesatz).
 * Ausländische Standorte behalten ihren pauschalen Satz (fremdes System).
 */
export function effectiveCorporateTaxRate(legal: LegalState, country: string, fallbackRate: number): number {
  if (country !== 'Deutschland') return fallbackRate;
  const kst = KOERPERSCHAFTSTEUER;
  const soli = kst * SOLI_AUF_KST;
  const gewst = GEWERBE_MESSZAHL * (legal.hebesatz / 100);
  return kst + soli + gewst;
}

/** Steueraufschlüsselung für die UI (gegebenes zu versteuerndes Ergebnis). */
export function taxBreakdown(legal: LegalState, country: string, fallbackRate: number, ebt: number): { labelDe: string; rate: number; amount: Money }[] {
  if (country !== 'Deutschland') {
    return [{ labelDe: 'Ertragsteuer (pauschal)', rate: fallbackRate, amount: ebt * fallbackRate }];
  }
  const kst = KOERPERSCHAFTSTEUER;
  const soli = kst * SOLI_AUF_KST;
  const gewst = GEWERBE_MESSZAHL * (legal.hebesatz / 100);
  return [
    { labelDe: 'Körperschaftsteuer (15 %)', rate: kst, amount: ebt * kst },
    { labelDe: 'Solidaritätszuschlag (5,5 % der KSt)', rate: soli, amount: ebt * soli },
    { labelDe: `Gewerbesteuer (Hebesatz ${legal.hebesatz} %)`, rate: gewst, amount: ebt * gewst },
  ];
}

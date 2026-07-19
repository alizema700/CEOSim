import type { Fraction, Money } from './common.js';

/**
 * Finanz-Kern des CompanyState.
 *
 * Buchhaltungslogik (vereinfachte, aber konsistente Periodenrechnung):
 * - Umsatz wird wöchentlich fakturiert (→ Forderungen/AR) und über DSO
 *   eingezogen (→ Cash). Jahresverträge zahlen im Voraus (→ Cash + Deferred
 *   Revenue, Auflösung wöchentlich bei Leistungserbringung).
 * - Nicht-Personal-Kosten laufen über Verbindlichkeiten (AP) mit DPO.
 * - Payroll wird wöchentlich direkt aus Cash bezahlt (keine Abgrenzung).
 * - Eigenkapital = Einlagen + kumulierte Ergebnisse (Retained Earnings).
 *
 * INVARIANTE (hart geprüft nach jedem Wochenschritt):
 *   Cash + AR  =  AP + Deferred + Debt + Contributed + Retained
 *   und CashEnd = CashStart + CFO + CFI + CFF.
 */
export interface FinanceState {
  cash: Money;
  /** Offene Forderungen aus Lieferungen/Leistungen. */
  accountsReceivable: Money;
  /** Offene Verbindlichkeiten (Nicht-Personal-Kosten). */
  accountsPayable: Money;
  /** Passive Rechnungsabgrenzung aus Jahres-Vorauszahlungen. */
  deferredRevenue: Money;
  debt: DebtState;
  /** Eingezahltes Kapital (Gründer + Investoren). */
  contributedCapital: Money;
  /** Kumulierte Gewinne/Verluste. */
  retainedEarnings: Money;

  /** Days Sales Outstanding — Zahlungsziel-Realität der Kunden (Tage). */
  dsoDays: number;
  /** Days Payables Outstanding — eigenes Zahlungsverhalten (Tage). */
  dpoDays: number;

  /** COGS als Anteil vom Umsatz (Hosting, Support-Infrastruktur …). */
  cogsRate: Fraction;

  /** Monatliche NICHT-Personal-Budgets je Funktion (per Entscheidung steuerbar). */
  budgetsMonthly: {
    /** Marketing/Demand-Gen (Werbebudget, Events, Content). */
    marketing: Money;
    /** Customer-Success-Programme (On-Top zu CS-Payroll). */
    customerSuccess: Money;
    /** Tools, Infrastruktur-Extras in R&D. */
    rndTools: Money;
    /** Sonstige G&A-Sachkosten (Buchhaltung, Versicherungen, Software). */
    gaOther: Money;
  };
}

export interface DebtState {
  principal: Money;
  /** Nominalzins p. a. */
  annualRate: Fraction;
  /** Kreditlinie: maximal ziehbarer Gesamtbetrag. */
  creditLine: Money;
  covenants: Covenant[];
}

/**
 * Kredit-Covenants. Verletzung ⇒ Event „Bank meldet sich", bei anhaltender
 * Verletzung kann die Bank die Linie fällig stellen (spätere Phase: Event-Deck).
 */
export type Covenant =
  | { type: 'minCash'; value: Money; labelDe: string }
  | { type: 'maxDebtToArr'; value: number; labelDe: string };

/** Wöchentliche Gewinn- und Verlustrechnung (alles EUR der Woche). */
export interface IncomeStatement {
  revenue: Money;
  cogs: Money;
  grossProfit: Money;
  /** OpEx je Funktion, aufgeteilt in Personal / Sachkosten. */
  opex: Record<OpexLine, { payroll: Money; other: Money }>;
  opexTotal: Money;
  ebitda: Money;
  /** Einmaleffekte (Abfindungen, Strafen …), unterhalb EBITDA ausgewiesen. */
  oneOffs: Money;
  interest: Money;
  /** Ertragsteuern (nur auf positives Ergebnis, Verlustvortrag vereinfacht). */
  tax: Money;
  netIncome: Money;
}

export type OpexLine = 'salesMarketing' | 'rnd' | 'customerSuccess' | 'ga';

/** Wöchentliche Kapitalflussrechnung. */
export interface CashFlowStatement {
  cashStart: Money;
  operations: {
    collections: Money; // Zahlungseingänge inkl. Jahres-Prepays
    payroll: Money;
    suppliers: Money; // AP-Auszahlungen
    interest: Money;
    tax: Money;
    oneOffs: Money; // Abfindungen etc.
    net: Money;
  };
  investing: { net: Money };
  financing: {
    debtDrawn: Money;
    debtRepaid: Money;
    net: Money;
  };
  netChange: Money;
  cashEnd: Money;
}

/** Bilanz zum Wochenende. */
export interface BalanceSheet {
  assets: { cash: Money; accountsReceivable: Money; total: Money };
  liabilities: {
    accountsPayable: Money;
    deferredRevenue: Money;
    debt: Money;
    total: Money;
  };
  equity: { contributed: Money; retained: Money; total: Money };
  /** |Aktiva − (Passiva)| — muss < 0.01 sein, sonst harter Invariantenfehler. */
  identityDelta: Money;
}

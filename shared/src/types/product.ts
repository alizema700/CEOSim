import type { Fraction, Money, Score, WeekIndex } from './common.js';

/**
 * Produkt-Zustand.
 *
 * Kernmechanik: R&D-Kapazität (Velocity) wird per Allokation auf Features /
 * Tech-Debt / Bugfixes verteilt. Vernachlässigter Tech-Debt senkt schleichend
 * die Velocity und erhöht die Outage-Wahrscheinlichkeit (nichts passiert …
 * bis es knallt).
 */
export interface ProductState {
  /** Technische Schulden 0..100 (0 = sauber, 100 = Stillstand droht). */
  techDebt: Score;
  /** Story-Points/Woche der aktuellen Mannschaft (abgeleitet aus Eng-Team, gecacht). */
  velocityPointsPerWeek: number;
  /** Offene Bugs (gewichtet). Hohe Bug-Last drückt NPS und Win-Rate. */
  bugBacklog: number;
  /** Produkt-NPS −100..100. */
  nps: number;
  /** Nutzungs-Stickiness DAU/MAU 0..1. */
  dauMauRatio: Fraction;
  /** Kumulativ ausgelieferte Feature-Punkte (Fortschritts-/Wettbewerbsmaß). */
  featurePointsShipped: number;
  /** Aktuelle R&D-Allokation (Summe = 1). */
  rndAllocation: { features: Fraction; techDebt: Fraction; bugfixes: Fraction };

  /** ── Produkt-Studio (Phase 22, FB3): echte Produkt-Stellschrauben ── */
  /** Ausbaubare Produkt-Module (Analytics, API, Mobile, KI, White-Label). */
  modules: Record<ProductModuleKind, ProductModule>;
  /** Positionierung: Einfachheit (SMB) vs. Power (Enterprise). */
  positioning: ProductPositioning;
  /** Preis-Verpackung: Einzelpreis, 3 Tarife, nutzungsbasiert. */
  packaging: PricingPackaging;
}

// ── Produkt-Studio (Phase 22, FB3) ───────────────────────────────────
export type ProductModuleKind = 'analytics' | 'api' | 'mobile' | 'kiAssistent' | 'whitelabel';
export type ProductModuleStatus = 'none' | 'building' | 'live';
export type ProductPositioning = 'einfachheit' | 'balance' | 'power';
export type PricingPackaging = 'single' | 'tiers' | 'usage';

export interface ProductModule {
  status: ProductModuleStatus;
  startedWeek: WeekIndex;
  liveWeek: WeekIndex;
}

export interface ProductModuleSpec {
  labelDe: string;
  shortDe: string;
  buildCost: Money;
  buildWeeks: number;
  /** Laufende Pflege/Betrieb — fließt in die R&D-Sachkosten. */
  maintenanceMonthly: Money;
  /** Dauerhafte Wirkung, solange live (1 = neutral). */
  winFactor: number;
  churnFactor: number;
  expansionFactor: number;
  leadFactor: number;
  /** Einmaliger NPS-Schub beim Launch. */
  npsOnLive: number;
}

export const MODULE_KINDS: ProductModuleKind[] = ['analytics', 'api', 'mobile', 'kiAssistent', 'whitelabel'];

export const MODULE_SPECS: Record<ProductModuleKind, ProductModuleSpec> = {
  analytics: {
    labelDe: 'Reporting & Analytics', shortDe: 'Dashboards & Auswertungen — macht den Wert des Produkts sichtbar.',
    buildCost: 60_000, buildWeeks: 6, maintenanceMonthly: 800,
    winFactor: 1.03, churnFactor: 1, expansionFactor: 1.06, leadFactor: 1, npsOnLive: 2,
  },
  api: {
    labelDe: 'API & Integrationen', shortDe: 'Offene Schnittstellen — verankert euch tief in den Kunden-Stacks (Lock-in).',
    buildCost: 80_000, buildWeeks: 8, maintenanceMonthly: 1_000,
    winFactor: 1.04, churnFactor: 0.94, expansionFactor: 1, leadFactor: 1, npsOnLive: 2,
  },
  mobile: {
    labelDe: 'Mobile App', shortDe: 'iOS/Android — Sichtbarkeit im Alltag der Nutzer:innen.',
    buildCost: 50_000, buildWeeks: 6, maintenanceMonthly: 700,
    winFactor: 1, churnFactor: 1, expansionFactor: 1, leadFactor: 1.05, npsOnLive: 3,
  },
  kiAssistent: {
    labelDe: 'KI-Assistent', shortDe: 'Automatische Antworten & Zusammenfassungen — das Verkaufsargument der Stunde.',
    buildCost: 120_000, buildWeeks: 10, maintenanceMonthly: 2_000,
    winFactor: 1.06, churnFactor: 0.97, expansionFactor: 1, leadFactor: 1, npsOnLive: 4,
  },
  whitelabel: {
    labelDe: 'White-Label & Mandanten', shortDe: 'Eigenes Branding & Mandantenfähigkeit — der Türöffner für Enterprise & Partner.',
    buildCost: 70_000, buildWeeks: 7, maintenanceMonthly: 900,
    winFactor: 1, churnFactor: 1, expansionFactor: 1.08, leadFactor: 1, npsOnLive: 1,
  },
};

export const POSITIONING_SPECS: Record<ProductPositioning, { labelDe: string; hintDe: string; winFactor: number; expansionFactor: number }> = {
  einfachheit: { labelDe: 'Einfachheit', hintDe: 'Schnell startklar, wenig Schulung — gewinnt SMB-Deals, verschenkt Ausbaupotenzial.', winFactor: 1.05, expansionFactor: 0.95 },
  balance: { labelDe: 'Balance', hintDe: 'Der Mittelweg — keine Stärke, keine Schwäche.', winFactor: 1, expansionFactor: 1 },
  power: { labelDe: 'Power', hintDe: 'Tiefe & Konfigurierbarkeit — Enterprise wächst, Einsteiger schrecken zurück.', winFactor: 0.97, expansionFactor: 1.07 },
};

export const PACKAGING_SPECS: Record<PricingPackaging, { labelDe: string; hintDe: string; winFactor: number; churnFactor: number; expansionFactor: number }> = {
  single: { labelDe: 'Ein Preis', hintDe: 'Ein Tarif für alle — einfach zu verkaufen, kein Upsell-Pfad.', winFactor: 1, churnFactor: 1, expansionFactor: 1 },
  tiers: { labelDe: '3 Tarife', hintDe: 'Starter/Pro/Enterprise — klarer Upsell-Pfad, minimal mehr Kaufhürde.', winFactor: 0.98, churnFactor: 1, expansionFactor: 1.06 },
  usage: { labelDe: 'Nutzungsbasiert', hintDe: 'Wächst mit dem Kunden — aber Rechnungsschock kostet Bindung.', winFactor: 1, churnFactor: 1.04, expansionFactor: 1.08 },
};

export function initialProductModules(): Record<ProductModuleKind, ProductModule> {
  const m = (): ProductModule => ({ status: 'none', startedWeek: -1, liveWeek: -1 });
  return { analytics: m(), api: m(), mobile: m(), kiAssistent: m(), whitelabel: m() };
}

import type { Money, WeekIndex } from './common.js';

/**
 * Zertifizierungen & Standards (Phase 22, V2). Ein B2B-SaaS reift über Zertifikate:
 * DSGVO, ISO 27001, SOC 2, ISO 9001. Jede Zertifizierung ist ein Prozess (Vorbereitung
 * + Audit über Wochen), kostet einmalig + laufende Pflege, und schaltet danach echte
 * Vorteile frei: höhere Abschlussquote (Enterprise-Vertrauen), weniger Churn, geringeres
 * Regulierungs-/Cyberrisiko, bessere Reputation.
 *
 * Golden-Master-sicher: per Default nichts in Arbeit/zertifiziert ⇒ keine Pflegekosten,
 * keine Modifikatoren, tickCertifications ist ein No-op.
 */

export type CertificationKind = 'dsgvo' | 'iso27001' | 'soc2' | 'iso9001';
export type CertStatus = 'none' | 'in_progress' | 'certified';

export interface Certification {
  status: CertStatus;
  startedWeek: WeekIndex;
  /** Woche, in der das Audit abgeschlossen wird (bei in_progress). */
  completesWeek: WeekIndex;
  certifiedWeek: WeekIndex;
}

export interface CertificationState {
  certs: Record<CertificationKind, Certification>;
  logDe: string[];
}

export interface CertificationSpec {
  labelDe: string;
  shortDe: string;
  /** Einmalige Vorbereitungs-/Audit-Kosten. */
  prepCost: Money;
  /** Wochen bis zum Abschluss des Audits. */
  weeksToCertify: number;
  /** Laufende Pflege (Überwachungsaudits) — fließt in die G&A-Kosten. */
  maintenanceMonthly: Money;
  /** Abschlussquoten-Faktor, solange zertifiziert (1 = neutral). */
  winFactor: number;
  /** Churn-Faktor, solange zertifiziert (1 = neutral). */
  churnFactor: number;
  /** Senkung des Regulierungs-Druckaufbaus je Woche (M5). */
  regReliefPerWeek: number;
  /** Einmalige Reputations-/NPS-Boni beim Abschluss. */
  onCertify: { customers?: number; investors?: number; nps?: number };
}

export const CERTIFICATION_KINDS: CertificationKind[] = ['dsgvo', 'iso27001', 'soc2', 'iso9001'];

export const CERTIFICATION_SPECS: Record<CertificationKind, CertificationSpec> = {
  dsgvo: {
    labelDe: 'DSGVO-Konformität', shortDe: 'Datenschutz-Grundverordnung — Pflicht-Basis für EU-Kunden.',
    prepCost: 20_000, weeksToCertify: 4, maintenanceMonthly: 300,
    winFactor: 1.03, churnFactor: 0.98, regReliefPerWeek: 0.15, onCertify: { customers: 3 },
  },
  iso27001: {
    labelDe: 'ISO 27001', shortDe: 'Informationssicherheits-Managementsystem — Türöffner für Enterprise.',
    prepCost: 45_000, weeksToCertify: 8, maintenanceMonthly: 900,
    winFactor: 1.06, churnFactor: 0.98, regReliefPerWeek: 0.15, onCertify: { investors: 4, customers: 2 },
  },
  soc2: {
    labelDe: 'SOC 2 Type II', shortDe: 'Sicherheits-/Verfügbarkeitsnachweis — Standard für US-/Großkunden.',
    prepCost: 55_000, weeksToCertify: 10, maintenanceMonthly: 1_200,
    winFactor: 1.08, churnFactor: 0.96, regReliefPerWeek: 0.1, onCertify: { investors: 3, customers: 2 },
  },
  iso9001: {
    labelDe: 'ISO 9001', shortDe: 'Qualitätsmanagement — Reife & Verlässlichkeit in Prozessen.',
    prepCost: 25_000, weeksToCertify: 6, maintenanceMonthly: 400,
    winFactor: 1.02, churnFactor: 0.97, regReliefPerWeek: 0.05, onCertify: { nps: 4, customers: 1 },
  },
};

export function initialCertificationState(): CertificationState {
  const c = (): Certification => ({ status: 'none', startedWeek: -1, completesWeek: -1, certifiedWeek: -1 });
  return {
    certs: { dsgvo: c(), iso27001: c(), soc2: c(), iso9001: c() },
    logDe: [],
  };
}

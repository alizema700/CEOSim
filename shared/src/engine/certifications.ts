import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import { CERTIFICATION_KINDS, CERTIFICATION_SPECS, type CertificationKind } from '../types/certifications.js';
import { nextId } from './stateHelpers.js';

/**
 * Zertifizierungs-Engine (Phase 22, V2). Zertifizierungen sind ein Prozess: gestartet
 * per Aktion, abgeschlossen nach `weeksToCertify` Wochen (tickCertifications), danach
 * dauerhaft wirksam (Abschlussquote/Churn-Modifikatoren + Reg-/Reputationsvorteile).
 * Golden-Master-sicher: ohne gestartete Zertifizierung passiert nichts.
 */

const CERT_SOURCE = 'Zertifizierung';

/** Summe der monatlichen Pflegekosten aller Zertifikate (fließt in die G&A-Kosten). */
export function certMaintenanceMonthly(state: CompanyState): number {
  const cs = state.certifications;
  if (!cs) return 0;
  let sum = 0;
  for (const kind of CERTIFICATION_KINDS) {
    if (cs.certs[kind]?.status === 'certified') sum += CERTIFICATION_SPECS[kind].maintenanceMonthly;
  }
  return sum;
}

/** Senkung des Regulierungs-Druckaufbaus durch zertifizierte Standards (M5). */
export function certRegulatoryRelief(state: CompanyState): number {
  const cs = state.certifications;
  if (!cs) return 0;
  let relief = 0;
  for (const kind of CERTIFICATION_KINDS) {
    if (cs.certs[kind]?.status === 'certified') relief += CERTIFICATION_SPECS[kind].regReliefPerWeek;
  }
  return relief;
}

/** Startet eine Zertifizierung (Kosten trägt der Aufrufer via schedule). */
export function startCertification(state: CompanyState, kind: CertificationKind): void {
  const cert = state.certifications.certs[kind];
  const spec = CERTIFICATION_SPECS[kind];
  cert.status = 'in_progress';
  cert.startedWeek = state.meta.week;
  cert.completesWeek = state.meta.week + spec.weeksToCertify;
  state.certifications.logDe.unshift(`W${state.meta.week}: ${spec.labelDe} — Audit gestartet (Abschluss in ~${spec.weeksToCertify} Wochen).`);
}

// ── Wochentick ──────────────────────────────────────────────────────
export function tickCertifications(state: CompanyState, occ: Occurrence[]): void {
  const cs = state.certifications;
  if (!cs) return;
  const week = state.meta.week;

  // Laufende Modifikatoren der Vorwoche zurücksetzen; für zertifizierte neu setzen.
  state.activeModifiers = state.activeModifiers.filter((m) => m.sourceDe !== CERT_SOURCE);

  let anyActive = false;
  for (const kind of CERTIFICATION_KINDS) {
    const cert = cs.certs[kind];
    const spec = CERTIFICATION_SPECS[kind];

    // Abschluss eines laufenden Audits.
    if (cert.status === 'in_progress' && week >= cert.completesWeek) {
      cert.status = 'certified';
      cert.certifiedWeek = week;
      if (spec.onCertify.customers) state.reputation.customers = clamp(state.reputation.customers + spec.onCertify.customers, 0, 100);
      if (spec.onCertify.investors) state.reputation.investors = clamp(state.reputation.investors + spec.onCertify.investors, 0, 100);
      if (spec.onCertify.nps) state.product.nps = clamp(state.product.nps + spec.onCertify.nps, -100, 100);
      cs.logDe.unshift(`W${week}: ${spec.labelDe} zertifiziert — Audit bestanden.`);
      occ.push({ icon: '🏅', textDe: `Zertifiziert: ${spec.labelDe} — mehr Vertrauen bei Enterprise-Kunden, weniger Churn.`, severity: 'good' });
    }

    // Dauerhafte Wirkung zertifizierter Standards (Modifikatoren neu setzen).
    if (cert.status === 'certified') {
      anyActive = true;
      if (spec.winFactor !== 1) state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'trialWinRate', factor: spec.winFactor, startWeek: week, endWeek: week + 1, sourceDe: CERT_SOURCE });
      if (spec.churnFactor !== 1) state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'churnMonthly', factor: spec.churnFactor, startWeek: week, endWeek: week + 1, sourceDe: CERT_SOURCE });
    }
  }
  void anyActive;
}

/** Anzahl abgeschlossener Zertifikate. */
export function certifiedCount(state: CompanyState): number {
  const cs = state.certifications;
  if (!cs) return 0;
  return CERTIFICATION_KINDS.filter((k) => cs.certs[k].status === 'certified').length;
}

/** Kurzstatus fürs UI/Personas. */
export function certificationSummaryDe(state: CompanyState): string {
  const cs = state.certifications;
  if (!cs) return 'keine Zertifikate';
  const certified = CERTIFICATION_KINDS.filter((k) => cs.certs[k].status === 'certified').map((k) => CERTIFICATION_SPECS[k].labelDe);
  const inProgress = CERTIFICATION_KINDS.filter((k) => cs.certs[k].status === 'in_progress').map((k) => CERTIFICATION_SPECS[k].labelDe);
  if (certified.length === 0 && inProgress.length === 0) return 'noch keine Zertifikate (Enterprise-Türen bleiben zu)';
  const parts: string[] = [];
  if (certified.length) parts.push(`zertifiziert: ${certified.join(', ')}`);
  if (inProgress.length) parts.push(`in Arbeit: ${inProgress.join(', ')}`);
  return parts.join(' · ');
}

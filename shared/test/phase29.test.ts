import { describe, expect, it } from 'vitest';
import { newGame, forceCash } from './helpers.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { tickCertifications, certMaintenanceMonthly, certRegulatoryRelief, startCertification } from '../src/engine/certifications.js';
import { CERTIFICATION_SPECS } from '../src/types/certifications.js';

/**
 * Phase 22 (V2): Zertifizierungen — Audit-Prozess über Wochen, danach dauerhafte
 * Vorteile. Golden-Master-sicher: ohne gestartete Zertifizierung ist alles inert.
 */

const hasMod = (s: ReturnType<typeof newGame>, target: string) =>
  s.activeModifiers.some((m) => m.sourceDe === 'Zertifizierung' && m.target === target);

describe('Zertifizierungen', () => {
  it('Ohne Zertifikat: keine Pflegekosten, keine Reg-Erleichterung (Golden-neutral)', () => {
    const s = newGame(29000);
    expect(certMaintenanceMonthly(s)).toBe(0);
    expect(certRegulatoryRelief(s)).toBe(0);
    tickCertifications(s, []);
    expect(s.activeModifiers.some((m) => m.sourceDe === 'Zertifizierung')).toBe(false);
  });

  it('Start setzt den Status auf in_progress mit Abschlusswoche', () => {
    const s = newGame(29001);
    forceCash(s, 200_000);
    applyAction(s, { type: 'PURSUE_CERTIFICATION', kind: 'iso27001' }, null, 'd');
    const cert = s.certifications.certs.iso27001;
    expect(cert.status).toBe('in_progress');
    expect(cert.completesWeek).toBe(s.meta.week + CERTIFICATION_SPECS.iso27001.weeksToCertify);
    // Doppelstart abgelehnt.
    expect(validateAction(s, { type: 'PURSUE_CERTIFICATION', kind: 'iso27001' }).ok).toBe(false);
  });

  it('Validierung: braucht genug Liquidität für Vorbereitung & Audit', () => {
    const s = newGame(29002);
    forceCash(s, 10_000);
    expect(validateAction(s, { type: 'PURSUE_CERTIFICATION', kind: 'soc2' }).ok).toBe(false);
    forceCash(s, 200_000);
    expect(validateAction(s, { type: 'PURSUE_CERTIFICATION', kind: 'soc2' }).ok).toBe(true);
  });

  it('Nach Ablauf der Audit-Zeit wird zertifiziert (Reputation + Modifikatoren)', () => {
    const s = newGame(29003);
    startCertification(s, 'iso27001');
    const invBefore = s.reputation.investors;
    // Zur Abschlusswoche springen.
    s.meta.week = s.certifications.certs.iso27001.completesWeek;
    const occ: { icon: string; textDe: string; severity: string }[] = [];
    tickCertifications(s, occ as never);
    expect(s.certifications.certs.iso27001.status).toBe('certified');
    expect(s.reputation.investors).toBeGreaterThan(invBefore);
    expect(occ.some((o) => /Zertifiziert/.test(o.textDe))).toBe(true);
    // Dauerhafte Wirkung: Abschlussquoten- & Churn-Modifikator.
    expect(hasMod(s, 'trialWinRate')).toBe(true);
    expect(hasMod(s, 'churnMonthly')).toBe(true);
    // Pflegekosten & Reg-Erleichterung jetzt aktiv.
    expect(certMaintenanceMonthly(s)).toBe(CERTIFICATION_SPECS.iso27001.maintenanceMonthly);
    expect(certRegulatoryRelief(s)).toBeGreaterThan(0);
  });

  it('Mehrere Zertifikate summieren Pflege & Reg-Erleichterung', () => {
    const s = newGame(29004);
    startCertification(s, 'dsgvo');
    startCertification(s, 'iso27001');
    s.meta.week = Math.max(s.certifications.certs.dsgvo.completesWeek, s.certifications.certs.iso27001.completesWeek);
    tickCertifications(s, []);
    expect(s.certifications.certs.dsgvo.status).toBe('certified');
    expect(s.certifications.certs.iso27001.status).toBe('certified');
    expect(certMaintenanceMonthly(s)).toBe(CERTIFICATION_SPECS.dsgvo.maintenanceMonthly + CERTIFICATION_SPECS.iso27001.maintenanceMonthly);
    expect(certRegulatoryRelief(s)).toBeCloseTo(CERTIFICATION_SPECS.dsgvo.regReliefPerWeek + CERTIFICATION_SPECS.iso27001.regReliefPerWeek, 5);
  });
});

import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import { REGULATION_SPECS, type RegulationKind } from '../types/politics.js';
import { stream } from './rng.js';
import { schedule, nextId } from './stateHelpers.js';
import { addMessage, assistantSender } from './comms.js';
import { totalMrr } from './derive.js';
import { fileInsuranceClaim } from './insurance.js';
import { certRegulatoryRelief } from './certifications.js';

/**
 * Regulierung & Aufsicht (Phase 22, M5). Die politische Gegenkraft: regulatorischer
 * Druck baut sich mit Marktmacht, Skandalen und Zeit auf und entlädt sich in
 * Auflagen (Compliance-Kosten via ONE_OFF_COST + Reibungs-Modifikatoren).
 *
 * Politisches Kapital (M3) senkt den Druckaufbau sowie Kosten und Dauer der
 * Auflagen — der Lobby-Aufbau bekommt so echten defensiven Wert.
 *
 * Golden-Master-sicher: läuft erst ab REG_MIN_WEEK. Der Golden-Lauf endet in
 * Woche 25 und sieht daher weder Druckaufbau noch Auflagen (regulatoryPressure
 * bleibt 0, keine ONE_OFF_COST wird terminiert).
 */

const REG_SOURCE = 'Regulierung';
const REG_MIN_WEEK = 26;
const REG_COOLDOWN = 12;

/** Marktanteil 0..1 (Treiber für Kartell-/Aufsichtsdruck). */
function marketShare(state: CompanyState): number {
  const tam = state.market.tamMrr;
  return tam > 0 ? clamp(totalMrr(state) / tam, 0, 1) : 0;
}

/** Wählt die Auflagen-Art; bei hoher Marktmacht eher eine Kartellprüfung. */
function pickRegulation(r: number, share: number): RegulationKind {
  if (share >= 0.16 && r < 0.4) return 'kartellpruefung';
  if (r < 0.34) return 'datenschutz';
  if (r < 0.67) return 'branchenaufsicht';
  return 'complianceauflage';
}

export function tickRegulation(state: CompanyState, occ: Occurrence[]): void {
  const week = state.meta.week;
  if (week < REG_MIN_WEEK) return; // Aufwärmphase + Golden-Master-Schutz.

  const pol = state.politics;
  // Regulierungs-Modifikatoren der Vorwoche zurücksetzen.
  state.activeModifiers = state.activeModifiers.filter((mm) => mm.sourceDe !== REG_SOURCE);

  const share = marketShare(state);
  const access = pol.politicalCapital;
  // Druckaufbau: Grunddruck + Marktmacht + Skandal-Nachwirkung − politischer Zugang.
  const drift = 0.5 + Math.max(0, share - 0.1) * 22 + pol.exposure * 0.02 - access * 0.03 - certRegulatoryRelief(state);
  pol.regulatoryPressure = clamp(pol.regulatoryPressure + drift, 0, 100);

  // ── Laufende Auflage: Ablauf zuerst, sonst Reibung ───────────────────
  if (pol.activeRegulation) {
    const spec = REGULATION_SPECS[pol.activeRegulation.kind];
    if (week >= pol.activeRegulation.endWeek) {
      pol.activeRegulation = null;
      pol.lastRegulationWeek = week;
      pol.logDe.unshift(`W${week}: ${spec.recoveryDe}`);
      occ.push({ icon: '🛡️', textDe: `Aufsicht: ${spec.recoveryDe}`, severity: 'good' });
    } else {
      if (spec.leadFactor !== 1) state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'leadGen', factor: spec.leadFactor, startWeek: week, endWeek: week + 1, sourceDe: REG_SOURCE });
      if (spec.winFactor !== 1) state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'trialWinRate', factor: spec.winFactor, startWeek: week, endWeek: week + 1, sourceDe: REG_SOURCE });
    }
    return;
  }

  // ── Neue Auflage auswürfeln ──────────────────────────────────────────
  if (pol.regulatoryPressure >= 55 && week - pol.lastRegulationWeek >= REG_COOLDOWN) {
    const rng = stream(state.meta.seed, 'regulation', week);
    if (rng() < 0.05 + pol.regulatoryPressure / 1000) {
      const kind = pickRegulation(rng(), share);
      const spec = REGULATION_SPECS[kind];
      // Politisches Kapital mildert Kosten (bis −40 %) und ggf. die Dauer.
      const cost = Math.max(6_000, Math.round(spec.baseCost * (1 - access / 250)));
      const dur = Math.max(3, spec.durationWeeks - (access >= 55 ? 1 : 0));
      pol.activeRegulation = { kind, startWeek: week, endWeek: week + dur, headlineDe: spec.headlineDe, complianceCost: cost };
      // Rechtsschutz-/Haftpflicht-Deckung übernimmt einen Teil der Verfahrens-/Compliance-Kosten.
      const insCovered = fileInsuranceClaim(state, 'regulation', cost, spec.labelDe, occ);
      schedule(state, 0, `Auflage: ${spec.labelDe}`, null, { kind: 'ONE_OFF_COST', amount: Math.max(0, cost - insCovered), labelDe: `Compliance: ${spec.labelDe}` });
      if (spec.reputationHit > 0) {
        const hit = Math.max(1, Math.round(spec.reputationHit * (1 - access / 300)));
        state.reputation.press = clamp(state.reputation.press - hit, 0, 100);
      }
      pol.regulatoryPressure = clamp(pol.regulatoryPressure - 32, 0, 100); // Entladung nach Auflage
      pol.logDe.unshift(`W${week}: ${spec.labelDe} — Compliance-Aufwand ${Math.round(cost / 1000)} k€.`);
      occ.push({ icon: spec.emoji, textDe: `${spec.labelDe}: ${spec.headlineDe} (Compliance-Aufwand ${Math.round(cost / 1000)} k€)`, severity: 'bad' });
      addMessage(state, {
        from: assistantSender(state),
        subjectDe: `Aufsicht: ${spec.labelDe}`,
        bodyDe: `zur Kenntnis: ${spec.headlineDe} Die Behörde setzt uns eine Frist von ~${dur} Wochen; der Compliance-Aufwand liegt bei ${Math.round(cost / 1000)} k€${access >= 55 ? ' (durch euren politischen Zugang bereits reduziert)' : ''}. Politisches Kapital senkt künftig Druck, Kosten und Dauer solcher Auflagen — Lobbying zahlt sich hier defensiv aus.`,
        kind: 'system', eventInstanceId: null, delegable: false, suggestedActionType: null, templateId: 'regulation', priority: 'hoch',
      });
    }
  }
}

/** Kurzstatus der Regulierungslage (fürs UI/Personas). */
export function regulationSummaryDe(state: CompanyState): string {
  const pol = state.politics;
  if (pol.activeRegulation) {
    const spec = REGULATION_SPECS[pol.activeRegulation.kind];
    const left = Math.max(0, pol.activeRegulation.endWeek - state.meta.week);
    return `${spec.labelDe} aktiv (noch ~${left} Wo., ${Math.round(pol.activeRegulation.complianceCost / 1000)} k€) · Regulierungsdruck ${Math.round(pol.regulatoryPressure)}/100`;
  }
  return `Regulierungsdruck ${Math.round(pol.regulatoryPressure)}/100`;
}

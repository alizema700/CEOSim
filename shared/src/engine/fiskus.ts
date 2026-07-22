import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import { TAX_AUDIT_SPECS, TAX_STRATEGY_SPECS, type TaxAuditKind } from '../types/fiskus.js';
import { stream } from './rng.js';
import { schedule } from './stateHelpers.js';
import { addMessage, assistantSender } from './comms.js';

/**
 * Fiskus-Engine (Phase 22, FB4). Zwei Hälften:
 * 1) Steuerstrategie: der Wochentick zahlt nur den deklarierten Anteil der
 *    Steuerlast (taxStrategyFactor); die Ersparnis wandert anteilig ins
 *    Schwarzbuch (bookTaxSavings) — als offenes Prüfungsrisiko.
 * 2) Prüfwesen: tickFiskus lässt ab Woche 26 seed-zufällig Prüfungen anrollen
 *    (auch bei Unschuldigen!), eskaliert bei hohem Risiko zur Steuerfahndung
 *    und rechnet am Ende ab: Nachzahlung + Strafzuschlag, Reputations- und
 *    Board-Schaden — und bei > 1 Mio € Hinterziehung + Fahndung: Haftbefehl.
 */

const AUDIT_MIN_WEEK = 26; // Golden-Lauf endet W25 ⇒ Prüfwesen bleibt dort stumm.
const AUDIT_COOLDOWN = 10;
const HAFT_SCHWELLE = 1_000_000; // BGH-Linie: über 1 Mio € keine Bewährung mehr.

/** Anteil der Steuerlast, der tatsächlich deklariert wird (1 = alles). */
export function taxStrategyFactor(state: CompanyState): number {
  return TAX_STRATEGY_SPECS[state.fiskus?.strategy ?? 'konservativ'].declaredFactor;
}

/** Verbucht die „Ersparnis" einer Woche als offenes Prüfrisiko. */
export function bookTaxSavings(state: CompanyState, saved: number): void {
  if (saved <= 0 || !state.fiskus) return;
  const spec = TAX_STRATEGY_SPECS[state.fiskus.strategy];
  state.fiskus.schwarzbuch += saved * spec.atRiskShare;
  if (state.fiskus.strategy === 'illegal') state.fiskus.hinterzogenTotal += saved;
}

// ── Wochentick ──────────────────────────────────────────────────────
export function tickFiskus(state: CompanyState, occ: Occurrence[]): void {
  const fk = state.fiskus;
  if (!fk) return;
  const week = state.meta.week;

  // Prüfrisiko-Drift: riskante Strategie & offenes Schwarzbuch ziehen Aufmerksamkeit.
  const drift = (fk.strategy === 'illegal' ? 1.6 : fk.strategy === 'aggressiv' ? 0.7 : 0) + (fk.schwarzbuch > 0 ? 0.3 : 0);
  if (drift > 0) fk.auditRisk = clamp(fk.auditRisk + drift, 0, 100);
  else if (fk.auditRisk > 0) fk.auditRisk = clamp(fk.auditRisk * 0.97, 0, 100);

  // ── Laufende Prüfung abschließen ─────────────────────────────────
  if (fk.activeAudit && week >= fk.activeAudit.endWeek) {
    resolveAudit(state, occ);
    return;
  }

  // ── Neue Prüfung anrollen lassen (ab W26, mit Abstand) ───────────
  if (fk.activeAudit || week < AUDIT_MIN_WEEK || week - fk.lastAuditWeek < AUDIT_COOLDOWN) return;
  const rng = stream(state.meta.seed, 'fiskus', week);

  let kind: TaxAuditKind | null = null;
  if (fk.schwarzbuch > 0 && fk.auditRisk >= 55 && rng() < 0.1 + fk.auditRisk / 400) {
    kind = 'steuerfahndung';
  } else if (rng() < 0.025 + fk.auditRisk / 600) {
    kind = 'betriebspruefung';
  } else if ((state.funding.rounds.length > 0 || state.legal.rechtsform === 'AG') && rng() < 0.02) {
    kind = 'wirtschaftspruefung';
  } else if (rng() < 0.015) {
    kind = 'sozialversicherung';
  } else if (state.politics.subsidiesWon > 0 && rng() < 0.03) {
    kind = 'subventionspruefung';
  }
  if (!kind) return;

  const spec = TAX_AUDIT_SPECS[kind];
  fk.activeAudit = { kind, startWeek: week, endWeek: week + spec.durationWeeks };
  fk.lastAuditWeek = week;
  schedule(state, 0, `Prüfung: ${spec.labelDe}`, null, { kind: 'ONE_OFF_COST', amount: spec.fee, labelDe: `${spec.labelDe}: Berater & Aufwand` }, 'system');
  fk.logDe.unshift(`W${week}: ${spec.labelDe} angeordnet (Dauer ~${spec.durationWeeks} Wochen).`);
  if (kind === 'steuerfahndung') {
    // Eine Razzia spricht sich sofort herum.
    state.reputation.press = clamp(state.reputation.press - 4, 0, 100);
    occ.push({ icon: '🚨', textDe: 'RAZZIA: Die Steuerfahndung durchsucht Büro und Server — die Belegschaft steht im Flur.', severity: 'bad' });
  } else {
    occ.push({ icon: '📋', textDe: `${spec.labelDe} angeordnet — Unterlagen bereitstellen, Berater einbinden (${Math.round(spec.fee / 1000)} k€).`, severity: 'warn' });
  }
  addMessage(state, {
    from: assistantSender(state),
    subjectDe: `Amtliche Post: ${spec.labelDe}`,
    bodyDe: `das musst du sofort sehen — amtliches Schreiben, heute zugestellt: „Sehr geehrte Damen und Herren, ${spec.letterDe}" Die Prüfung läuft ~${spec.durationWeeks} Wochen; Beraterkosten ~${Math.round(spec.fee / 1000)} k€ sind eingeplant. ${fk.schwarzbuch > 0 ? 'Und du weißt selbst, was in den Büchern schlummert.' : 'Die Bücher sind sauber — dann ist das Routine.'}`,
    kind: 'system', eventInstanceId: null, delegable: false, suggestedActionType: null, templateId: 'fiskus-audit', priority: 'hoch',
  });
}

/** Abrechnung am Prüfungsende: erwischt oder sauber davongekommen. */
function resolveAudit(state: CompanyState, occ: Occurrence[]): void {
  const fk = state.fiskus;
  const audit = fk.activeAudit!;
  const spec = TAX_AUDIT_SPECS[audit.kind];
  const week = state.meta.week;
  const rng = stream(state.meta.seed, 'fiskus-resolve', week);
  fk.activeAudit = null;
  fk.lastAuditWeek = week;

  // Fördermittel-Prüfung: eigener Pfad (Rückforderung statt Steuernachzahlung).
  if (audit.kind === 'subventionspruefung') {
    const risky = fk.strategy !== 'konservativ';
    if (state.politics.subsidiesWon > 0 && risky && rng() < 0.55) {
      const clawback = Math.round(state.politics.subsidiesWon * 0.4);
      schedule(state, 0, 'Fördermittel-Rückforderung', null, { kind: 'ONE_OFF_COST', amount: clawback, labelDe: 'Rückforderung zweckwidriger Fördermittel (+ Zinsen)' }, 'system');
      fk.finesTotal += clawback;
      state.reputation.press = clamp(state.reputation.press - 5, 0, 100);
      fk.logDe.unshift(`W${week}: Verwendungsprüfung — Rückforderung ${Math.round(clawback / 1000)} k€.`);
      occ.push({ icon: '🏛️', textDe: `Fördermittel-Prüfung: Rückforderung über ${Math.round(clawback / 1000)} k€ — zweckwidrige Verwendung festgestellt.`, severity: 'bad' });
    } else {
      fk.cleanAudits += 1;
      fk.logDe.unshift(`W${week}: Verwendungsprüfung ohne Beanstandung.`);
      occ.push({ icon: '🛡️', textDe: 'Fördermittel-Prüfung abgeschlossen: Verwendung nicht zu beanstanden.', severity: 'good' });
    }
    return;
  }

  // Entdeckungswahrscheinlichkeit je Prüfart.
  const catchProb: Record<TaxAuditKind, number> = { steuerfahndung: 0.95, betriebspruefung: 0.65, wirtschaftspruefung: 0.5, sozialversicherung: 0.15, subventionspruefung: 0 };
  const caught = fk.schwarzbuch > 1_000 && rng() < catchProb[audit.kind];

  if (!caught) {
    fk.cleanAudits += 1;
    if (fk.schwarzbuch > 1_000) {
      fk.logDe.unshift(`W${week}: ${spec.labelDe} beendet — nichts gefunden. Diesmal.`);
      occ.push({ icon: '🕳️', textDe: `${spec.labelDe} beendet: keine Feststellungen. Das Schwarzbuch bleibt unentdeckt — diesmal.`, severity: 'warn' });
    } else {
      state.reputation.investors = clamp(state.reputation.investors + 1, 0, 100);
      fk.logDe.unshift(`W${week}: ${spec.labelDe} ohne Beanstandungen abgeschlossen.`);
      occ.push({ icon: '🛡️', textDe: `${spec.labelDe} abgeschlossen: keine Beanstandungen — saubere Bücher zahlen sich aus.`, severity: 'good' });
    }
    return;
  }

  // Erwischt: Nachzahlung + Strafzuschlag + Reputations-/Board-Schaden.
  const nachzahlung = Math.round(fk.schwarzbuch);
  const strafFaktor = audit.kind === 'steuerfahndung' ? 1.0 : 0.5;
  const strafe = Math.round(nachzahlung * strafFaktor);
  schedule(state, 0, `Feststellung ${spec.labelDe}`, null, { kind: 'ONE_OFF_COST', amount: nachzahlung + strafe, labelDe: `Steuernachzahlung ${Math.round(nachzahlung / 1000)} k€ + Zuschlag ${Math.round(strafe / 1000)} k€ (inkl. 6 % Zinsen p. a.)` }, 'system');
  fk.finesTotal += strafe;
  fk.schwarzbuch = 0;
  fk.auditRisk = clamp(fk.auditRisk - 35, 0, 100);
  const heavy = audit.kind === 'steuerfahndung';
  state.reputation.press = clamp(state.reputation.press - (heavy ? 14 : 8), 0, 100);
  state.reputation.investors = clamp(state.reputation.investors - (heavy ? 10 : 6), 0, 100);
  state.ceo.boardTrust = clamp(state.ceo.boardTrust - (heavy ? 15 : 8), 0, 100);
  state.ceo.trustLog.push({ week, delta: heavy ? -15 : -8, reasonDe: `${spec.labelDe}: Feststellungen — Nachzahlung & Zuschlag` });
  state.ceo.reputation = clamp(state.ceo.reputation - (heavy ? 8 : 4), 0, 100);
  fk.logDe.unshift(`W${week}: ${spec.labelDe} — AUFGEFLOGEN. Nachzahlung ${Math.round(nachzahlung / 1000)} k€ + Zuschlag ${Math.round(strafe / 1000)} k€.`);
  occ.push({ icon: '🔥', textDe: `${spec.labelDe}: Feststellungen! Nachzahlung ${Math.round(nachzahlung / 1000)} k€ plus Zuschlag ${Math.round(strafe / 1000)} k€ — Presse, Investoren und Board reagieren entsprechend.`, severity: 'bad' });

  // Strafrechtliche Schwelle: über 1 Mio € hinterzogen + Fahndung ⇒ Haftbefehl.
  if (heavy && fk.hinterzogenTotal >= HAFT_SCHWELLE) {
    state.meta.status = 'convicted';
    state.meta.endReasonDe = `Steuerfahndung, Woche ${week}: Haftbefehl wegen Steuerhinterziehung in Höhe von ${Math.round(fk.hinterzogenTotal / 1000)} k€ (§ 370 AO). Ab einer Million Euro gibt es keine Bewährung mehr — die Amtszeit endet in Untersuchungshaft.`;
    occ.push({ icon: '🚔', textDe: 'HAFTBEFEHL: Die hinterzogene Summe übersteigt eine Million Euro — der CEO wird abgeführt. Spielende.', severity: 'bad' });
  }
}

/** Kurzstatus fürs UI/Personas. */
export function fiskusSummaryDe(state: CompanyState): string {
  const fk = state.fiskus;
  if (!fk) return '';
  const parts: string[] = [`Steuerstrategie ${TAX_STRATEGY_SPECS[fk.strategy].labelDe}`];
  if (fk.schwarzbuch > 0) parts.push(`offenes Risiko ${Math.round(fk.schwarzbuch / 1000)} k€`);
  parts.push(`Prüfrisiko ${Math.round(fk.auditRisk)}/100`);
  if (fk.activeAudit) parts.push(`LAUFEND: ${TAX_AUDIT_SPECS[fk.activeAudit.kind].labelDe}`);
  if (fk.finesTotal > 0) parts.push(`Strafen bisher ${Math.round(fk.finesTotal / 1000)} k€`);
  return parts.join(' · ');
}

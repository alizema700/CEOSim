import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { IdeaClassification, Project } from '../types/strategy.js';
import type { Occurrence } from '../types/game.js';
import { nextId, schedule } from './stateHelpers.js';
import { stream } from './rng.js';
import { addMessage, assistantSender } from './comms.js';

/**
 * Projekte aus dem Ideen-System (Phase 3).
 * Die Engine KLEMMT jede LLM-Klassifikation hart auf erlaubte Bereiche —
 * egal was die Erzählschicht liefert, die Mathematik bleibt im Rahmen.
 */
export function clampClassification(c: IdeaClassification): IdeaClassification {
  return {
    titleDe: c.titleDe.slice(0, 80),
    categoryDe: c.categoryDe.slice(0, 30),
    costOneOff: clamp(Math.round(c.costOneOff), 0, 500_000),
    costMonthly: clamp(Math.round(c.costMonthly), 0, 100_000),
    durationWeeks: clamp(Math.round(c.durationWeeks), 1, 26),
    successProb: clamp(c.successProb, 0.05, 0.95),
    rationaleDe: c.rationaleDe.slice(0, 1200),
    riskDe: c.riskDe.slice(0, 600),
    comparablesDe: c.comparablesDe.slice(0, 3).map((x) => x.slice(0, 300)),
    effects: {
      ...(c.effects.leadGenFactor !== undefined && { leadGenFactor: clamp(c.effects.leadGenFactor, 1.0, 1.3) }),
      ...(c.effects.churnFactor !== undefined && { churnFactor: clamp(c.effects.churnFactor, 0.85, 1.0) }),
      ...(c.effects.moraleDelta !== undefined && { moraleDelta: clamp(c.effects.moraleDelta, -5, 8) }),
      ...(c.effects.pressDelta !== undefined && { pressDelta: clamp(c.effects.pressDelta, -3, 6) }),
      ...(c.effects.npsDelta !== undefined && { npsDelta: clamp(c.effects.npsDelta, -5, 8) }),
    },
  };
}

export function startProject(state: CompanyState, raw: IdeaClassification, decisionId: string): Project {
  const c = clampClassification(raw);
  const project: Project = {
    id: nextId(state, 'prj'),
    titleDe: c.titleDe,
    categoryDe: c.categoryDe,
    startWeek: state.meta.week,
    durationWeeks: c.durationWeeks,
    costMonthly: c.costMonthly,
    successProb: c.successProb,
    effects: c.effects,
    status: 'running',
    progress: 0,
    resolvedWeek: null,
  };
  state.projects.push(project);
  if (c.costOneOff > 0) {
    schedule(state, 0, `Projektstart „${c.titleDe}“`, decisionId, { kind: 'ONE_OFF_COST', amount: c.costOneOff, labelDe: `Projektstart: ${c.titleDe}` }, 'decision');
  }
  return project;
}

/** Wöchentlicher Fortschritt + Auflösung am Laufzeitende (seed-gesteuert). */
export function tickProjects(state: CompanyState, occ: Occurrence[]): void {
  const week = state.meta.week;
  for (const p of state.projects) {
    if (p.status !== 'running') continue;
    p.progress = Math.min(1, (week - p.startWeek + 1) / p.durationWeeks);
    if (p.progress < 1) continue;

    const roll = stream(state.meta.seed, 'project', week, p.id.length * 17 + p.durationWeeks)();
    const success = roll < p.successProb;
    p.status = success ? 'succeeded' : 'failed';
    p.resolvedWeek = week;

    if (success) {
      const fx = p.effects;
      if (fx.leadGenFactor && fx.leadGenFactor > 1) {
        state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'leadGen', factor: fx.leadGenFactor, startWeek: week, endWeek: week + 26, sourceDe: `Projekt „${p.titleDe}“` });
      }
      if (fx.churnFactor && fx.churnFactor < 1) {
        state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'churnMonthly', factor: fx.churnFactor, startWeek: week, endWeek: week + 26, sourceDe: `Projekt „${p.titleDe}“` });
      }
      if (fx.moraleDelta) for (const e of state.people.employees) e.satisfaction = clamp(e.satisfaction + fx.moraleDelta, 0, 100);
      if (fx.pressDelta) state.reputation.press = clamp(state.reputation.press + fx.pressDelta, 0, 100);
      if (fx.npsDelta) state.product.nps = clamp(state.product.nps + fx.npsDelta, -100, 100);
      occ.push({ icon: '🎉', textDe: `Projekt erfolgreich abgeschlossen: „${p.titleDe}“ — die Wirkung läuft an.`, severity: 'good' });
      addMessage(state, {
        from: assistantSender(state),
        subjectDe: `Projekt abgeschlossen: ${p.titleDe}`,
        bodyDe: `gute Nachrichten: „${p.titleDe}“ ist durch — und zwar erfolgreich. Die Effekte sind ab sofort im Zahlenwerk sichtbar (mit der üblichen Anlaufzeit). Das Team, das daran gearbeitet hat, freut sich über ein Wort von dir.`,
        kind: 'system',
        eventInstanceId: null,
        delegable: false,
        suggestedActionType: null,
        templateId: 'project-done',
      });
    } else {
      occ.push({ icon: '🪦', textDe: `Projekt gescheitert: „${p.titleDe}“ — Budget verbraucht, Wirkung ausgeblieben.`, severity: 'bad' });
      addMessage(state, {
        from: assistantSender(state),
        subjectDe: `Projekt beendet (ohne Erfolg): ${p.titleDe}`,
        bodyDe: `„${p.titleDe}“ ist ausgelaufen und hat die Erwartungen nicht erfüllt. Das Budget ist verbraucht; messbare Wirkung blieb aus. Kein Beinbruch — aber es lohnt der Blick, welche Annahme nicht gehalten hat. Die Bewertungs-Seite hat die Entscheidung im Verlauf.`,
        kind: 'system',
        eventInstanceId: null,
        delegable: false,
        suggestedActionType: null,
        templateId: 'project-failed',
      });
    }
  }
  // Alte abgeschlossene Projekte begrenzen
  if (state.projects.length > 40) {
    state.projects = state.projects.filter((p, i) => p.status === 'running' || i >= state.projects.length - 40);
  }
}

/** Laufende Projektkosten pro Monat (fließen in den Ledger als G&A-Sachkosten). */
export function projectsMonthlyCost(state: CompanyState): number {
  return state.projects.filter((p) => p.status === 'running').reduce((s, p) => s + p.costMonthly, 0);
}

/** Regelbasierter Klassifikations-Fallback, wenn kein LLM verfügbar ist. */
export function fallbackClassification(ideaText: string): IdeaClassification {
  const t = ideaText.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));
  if (has('podcast', 'content', 'blog', 'webinar', 'youtube', 'marketing')) {
    return base('Content-/Marketing-Initiative', 'Marketing', 12_000, 3_000, 10, 0.55,
      'Content-Kanäle zahlen langsam, aber stetig auf Sichtbarkeit und Lead-Zufluss ein.',
      'Wirkung schwer messbar; braucht Durchhaltevermögen über Monate.',
      ['Viele B2B-SaaS-Firmen (z. B. HubSpot mit Inbound-Content) haben Content als günstigen Lead-Kanal etabliert.'],
      { leadGenFactor: 1.1 });
  }
  if (has('schulung', 'training', 'weiterbildung', 'academy')) {
    return base('Schulungs-/Academy-Angebot', 'Produkt/CS', 15_000, 4_000, 12, 0.6,
      'Bessere Nutzerbefähigung senkt Support-Last und Früh-Churn.',
      'Erstellungsaufwand wird oft unterschätzt; Inhalte veralten.',
      ['Onboarding-Academies (z. B. bei CRM-Anbietern) korrelieren mit besserer Retention.'],
      { churnFactor: 0.95, npsDelta: 3 });
  }
  if (has('4-tage', 'vier-tage', 'homeoffice', 'kultur', 'team-event', 'benefit')) {
    return base('Kultur-/Arbeitsmodell-Initiative', 'Kultur', 5_000, 2_000, 8, 0.65,
      'Sichtbare Investition ins Team hebt Stimmung und Bindung.',
      'Wirkt hohl, wenn parallel harte Einschnitte laufen (Konsistenz!).',
      ['Studien zu 4-Tage-Woche-Piloten zeigen häufig stabile Produktivität bei besserer Zufriedenheit.'],
      { moraleDelta: 5 });
  }
  return base('Freie Initiative', 'Strategie', 10_000, 2_500, 8, 0.5,
    'Regelbasierte Einschätzung (kein LLM verfügbar): moderates Experiment mit offenem Ausgang.',
    'Unklare Wirkmechanik — Erfolgskriterien vorab definieren.',
    ['Ohne Vergleichsfälle: klein starten, messen, dann skalieren.'],
    { moraleDelta: 2, leadGenFactor: 1.03 });

  function base(titleDe: string, categoryDe: string, costOneOff: number, costMonthly: number, durationWeeks: number, successProb: number, rationaleDe: string, riskDe: string, comparablesDe: string[], effects: IdeaClassification['effects']): IdeaClassification {
    return { titleDe, categoryDe, costOneOff, costMonthly, durationWeeks, successProb, rationaleDe, riskDe, comparablesDe, effects };
  }
}

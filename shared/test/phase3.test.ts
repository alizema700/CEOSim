import { describe, expect, it } from 'vitest';
import { newGame } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { applyCommsIntent } from '../src/engine/comms.js';
import { clampClassification, fallbackClassification } from '../src/engine/projects.js';
import type { IdeaClassification } from '../src/types/strategy.js';

const IDEA: IdeaClassification = {
  titleDe: 'Kunden-Podcast',
  categoryDe: 'Marketing',
  costOneOff: 12_000,
  costMonthly: 3_000,
  durationWeeks: 4,
  successProb: 0.6,
  rationaleDe: 'Content-Kanal für Sichtbarkeit.',
  riskDe: 'Wirkung schwer messbar.',
  comparablesDe: ['HubSpot Inbound-Content'],
  effects: { leadGenFactor: 1.1, moraleDelta: 2 },
};

describe('Phase 3: Intents (geklemmt & deterministisch)', () => {
  it('LEGAL_BILLING bucht Honorar als Einmalkosten (Invarianten halten)', () => {
    const s = newGame(201);
    applyCommsIntent(s, { kind: 'LEGAL_BILLING', amount: 450, topicDe: 'Kündigungsschutz' });
    expect(s.scheduledEffects.some((fx) => fx.effect.kind === 'ONE_OFF_COST' && fx.effect.labelDe.includes('Kanzlei'))).toBe(true);
    const cashBefore = s.finance.cash;
    const report = closeWeek(s);
    expect(report.invariants.ok).toBe(true);
    expect(report.incomeStatement.oneOffs).toBeGreaterThanOrEqual(450);
    expect(s.finance.cash).toBeLessThan(cashBefore);
  });

  it('LEGAL_BILLING wird auf 5000 € gedeckelt', () => {
    const s = newGame(202);
    applyCommsIntent(s, { kind: 'LEGAL_BILLING', amount: 999_999, topicDe: 'X' });
    const fx = s.scheduledEffects.find((f) => f.effect.kind === 'ONE_OFF_COST');
    expect(fx && fx.effect.kind === 'ONE_OFF_COST' ? fx.effect.amount : 0).toBeLessThanOrEqual(5000);
  });

  it('BOARD_TRUST wird auf ±3 geklemmt und protokolliert', () => {
    const s = newGame(203);
    const before = s.ceo.boardTrust;
    applyCommsIntent(s, { kind: 'BOARD_TRUST', delta: 99, reasonDe: 'Überzeugender Plan' });
    expect(s.ceo.boardTrust).toBe(before + 3);
    expect(s.ceo.trustLog[s.ceo.trustLog.length - 1]!.reasonDe).toContain('Plan');
  });

  it('PRESS_RELEASE_OUTCOME: Presse-Delta gedeckelt, Skandal-Risiko geplant, Medienspiegel-Eintrag', () => {
    const s = newGame(204);
    const before = s.reputation.press;
    applyCommsIntent(s, {
      kind: 'PRESS_RELEASE_OUTCOME', titleDe: 'Wir sind die Besten', pressDelta: 40, leadFactor: 9, scandalProb: 0.9, scandalTopicDe: 'Claims widerlegt',
    });
    expect(s.reputation.press).toBe(before + 6); // geklemmt auf +6
    expect(s.activeModifiers.some((m) => m.target === 'leadGen' && (m.factor ?? 1) <= 1.15)).toBe(true);
    expect(s.scheduledEffects.some((f) => f.effect.kind === 'DELAYED_SCANDAL' && f.effect.probability <= 0.5)).toBe(true);
    expect(s.pressLog.length).toBe(1);
  });
});

describe('Phase 3: Ideen-System & Projekte', () => {
  it('Klassifikation wird hart geklemmt', () => {
    const wild = { ...IDEA, costOneOff: 99_000_000, successProb: 0.999, effects: { leadGenFactor: 5, churnFactor: 0.1 } };
    const c = clampClassification(wild as IdeaClassification);
    expect(c.costOneOff).toBe(500_000);
    expect(c.successProb).toBe(0.95);
    expect(c.effects.leadGenFactor).toBe(1.3);
    expect(c.effects.churnFactor).toBe(0.85);
  });

  it('Projekt: Start kostet, läuft, wird seed-deterministisch aufgelöst', () => {
    const s = newGame(205);
    applyAction(s, { type: 'START_PROJECT', classification: IDEA }, null, 'd1');
    expect(s.projects).toHaveLength(1);
    let report = closeWeek(s);
    expect(report.incomeStatement.oneOffs).toBeGreaterThanOrEqual(12_000); // Startkosten
    for (let i = 0; i < 4; i++) report = closeWeek(s);
    const p = s.projects[0]!;
    expect(p.status === 'succeeded' || p.status === 'failed').toBe(true);
    expect(report.invariants.ok).toBe(true);
    // Erfolg ⇒ Lead-Modifier; Misserfolg ⇒ keiner. Beides deterministisch:
    const hasMod = s.activeModifiers.some((m) => m.sourceDe.includes('Kunden-Podcast'));
    expect(hasMod).toBe(p.status === 'succeeded');
    // Ergebnis-Mail existiert
    expect(s.comms.messages.some((m) => m.templateId === 'project-done' || m.templateId === 'project-failed')).toBe(true);
  });

  it('Maximal 5 parallele Projekte', () => {
    const s = newGame(206);
    for (let i = 0; i < 5; i++) applyAction(s, { type: 'START_PROJECT', classification: { ...IDEA, titleDe: 'P' + i } }, null, 'd' + i);
    const v = validateAction(s, { type: 'START_PROJECT', classification: IDEA });
    expect(v.ok).toBe(false);
    expect(v.errorsDe.join()).toContain('Fokus');
  });

  it('Fallback-Klassifikation erkennt Ideen-Kategorien', () => {
    expect(fallbackClassification('Wir starten einen Podcast').effects.leadGenFactor).toBeGreaterThan(1);
    expect(fallbackClassification('4-Tage-Woche testen').effects.moraleDelta).toBeGreaterThan(0);
    expect(fallbackClassification('Kunden-Academy mit Schulungen').effects.churnFactor).toBeLessThan(1);
  });

  it('Laufende Projektkosten fließen in die GuV (G&A)', () => {
    const s = newGame(207);
    applyAction(s, { type: 'START_PROJECT', classification: { ...IDEA, costOneOff: 0, costMonthly: 43_450, durationWeeks: 8 } }, null, 'd1');
    const report = closeWeek(s);
    const gaOther = report.incomeStatement.opex.ga.other;
    const s2 = newGame(207);
    const report2 = closeWeek(s2);
    expect(gaOther).toBeGreaterThan(report2.incomeStatement.opex.ga.other + 8_000); // ~10k/Woche mehr
    expect(report.invariants.ok).toBe(true);
  });
});

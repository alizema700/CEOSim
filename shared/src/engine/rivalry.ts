import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import type { StrikeKind, StrikeResponse } from '../types/rivalry.js';
import { STRIKE_KIND_LABELS } from '../types/rivalry.js';
import { totalMrr } from './derive.js';
import { stream } from './rng.js';
import { addMessage, assistantSender } from './comms.js';
import { nextId, schedule } from './stateHelpers.js';

/**
 * Rivalitäts-Engine (Phase 21). Ein Wettbewerber eröffnet eine gezielte
 * Kampagne, die über Wochen Druck macht (Modifikatoren) und eskaliert, wenn du
 * nicht reagierst. Emergence ist gegated (nur gegen echte Gefahren) und
 * seed-gerollt — der Golden-Master-Lauf bleibt darunter.
 */

const STRIKE_SOURCE = 'Wettbewerber-Angriff';

/** Wirksamkeit der Konter — aus Strategie & Vertrieb des CEO. */
export function counterEfficacy(state: CompanyState): number {
  const str = state.ceo.skills.strategie ?? 50;
  const lead = state.ceo.skills.leadership ?? 50;
  return clamp(0.4 + (str - 50) / 240 + (lead - 50) / 260, 0.25, 0.9);
}

/** Produktstärke des Spielers (0..1) für „Differenzieren". */
function productStrength(state: CompanyState): number {
  return clamp((state.product.nps + 40) / 120 + (100 - state.product.techDebt) / 400, 0, 1);
}

const KIND_TEXT: Record<StrikeKind, { headline: (a: string) => string; detail: string; modifier: { target: 'leadGen' | 'trialWinRate' | 'attritionRisk'; per: number }[] }> = {
  preiskampf: {
    headline: (a) => `${a} eröffnet einen Preiskampf`,
    detail: 'senkt aggressiv die Preise und bewirbt „Wir rechnen Ihre Restlaufzeit an" — Neugeschäft und Abschlüsse geraten unter Druck.',
    modifier: [{ target: 'leadGen', per: -0.0018 }, { target: 'trialWinRate', per: -0.0015 }],
  },
  feature_konter: {
    headline: (a) => `${a} schießt mit einem Feature-Konter`,
    detail: 'launcht lautstark ein konkurrierendes Feature und vergleicht sich offensiv — eure Abschlussquote leidet in umkämpften Deals.',
    modifier: [{ target: 'trialWinRate', per: -0.0022 }],
  },
  abwerbung: {
    headline: (a) => `${a} startet eine Abwerbe-Welle`,
    detail: 'geht gezielt auf eure besten Leute zu (Signing-Boni, Titel) — die Fluktuation steigt, das Wissen wackelt.',
    modifier: [{ target: 'attritionRisk', per: 0.0025 }],
  },
  fud: {
    headline: (a) => `${a} streut FUD über euch`,
    detail: 'platziert Zweifel bei Analysten und in Foren („instabil, bald pleite") — die Nachfrage kühlt ab.',
    modifier: [{ target: 'leadGen', per: -0.002 }],
  },
};

function emergenceReady(state: CompanyState): boolean {
  if (state.meta.status !== 'active' || state.rivalry.status !== 'none') return false;
  if (state.meta.week < 10) return false;
  if (state.takeover.status !== 'none') return false;
  const share = state.market.tamMrr > 0 ? totalMrr(state) / state.market.tamMrr : 0;
  const arr = totalMrr(state) * 12;
  return share >= 0.06 || arr >= 3_000_000; // nur echte Gefahren werden angegriffen
}

function refreshModifiers(state: CompanyState): void {
  const week = state.meta.week;
  const r = state.rivalry;
  state.activeModifiers = state.activeModifiers.filter((m) => m.sourceDe !== STRIKE_SOURCE);
  if (r.status !== 'active') return;
  for (const m of KIND_TEXT[r.kind].modifier) {
    state.activeModifiers.push({ id: nextId(state, 'mod'), target: m.target, factor: clamp(1 + m.per * r.intensity, 0.75, 1.25), startWeek: week, endWeek: week + 1, sourceDe: STRIKE_SOURCE });
  }
}

function pickAttacker(state: CompanyState, rng: () => number): { name: string; kind: StrikeKind } {
  const comps = state.market.competitors;
  if (comps.length === 0) return { name: 'ein Wettbewerber', kind: 'preiskampf' };
  // Der aggressivste, größte Rivale zieht dich ins Visier.
  const sorted = [...comps].sort((a, b) => b.aggressiveness * b.marketShare - a.aggressiveness * a.marketShare);
  const attacker = sorted[0]!;
  let kind: StrikeKind = attacker.strategy === 'priceWar' ? 'preiskampf' : attacker.strategy === 'featureRace' ? 'feature_konter' : 'abwerbung';
  if (rng() < 0.22) kind = 'fud';
  return { name: attacker.name, kind };
}

// ── Wochentick ──────────────────────────────────────────────────────
export function tickRivalry(state: CompanyState, occ: Occurrence[]): void {
  const r = state.rivalry;
  const week = state.meta.week;

  if (r.status === 'none') {
    if (!emergenceReady(state)) return;
    const rng = stream(state.meta.seed, 'rivalry', week);
    if (rng() > 0.12) return; // ~12 % je berechtigter Woche
    const a = pickAttacker(state, rng);
    const kt = KIND_TEXT[a.kind];
    r.status = 'active';
    r.kind = a.kind;
    r.attackerName = a.name;
    r.headlineDe = kt.headline(a.name);
    r.detailDe = `${a.name} ${kt.detail}`;
    r.intensity = Math.round(34 + rng() * 14);
    r.startedWeek = week;
    r.deadlineWeek = week + 3;
    r.responsesUsed = [];
    r.momentum = 5 + Math.round(rng() * 4);
    r.lastNudgeWeek = week;
    refreshModifiers(state);
    occ.push({ icon: '⚔️', textDe: `${r.headlineDe} — die Kampagne läuft ${STRIKE_KIND_LABELS[a.kind]}. Reagiere, bevor sie sich verschärft.`, severity: 'bad' });
    addMessage(state, {
      from: assistantSender(state),
      subjectDe: `Wettbewerber-Angriff: ${STRIKE_KIND_LABELS[a.kind]}`,
      bodyDe: `${r.detailDe} Erfahrungsgemäß verschärft sich so etwas, wenn wir es aussitzen. Optionen: mitgehen (matchen), auf unsere Stärken setzen (differenzieren), aushalten (ignorieren) oder zurückschlagen. Frist ~3 Wochen (Dashboard → Angriff).`,
      kind: 'system', eventInstanceId: null, delegable: false, suggestedActionType: null, templateId: 'rivalry-strike', priority: 'hoch',
    });
    return;
  }

  // Aktiv: Druck via Modifikatoren; Intensität nach Momentum; Eskalation.
  r.intensity = clamp(r.intensity + r.momentum, 0, 100);
  r.momentum = r.momentum > 0 ? Math.max(0, r.momentum - 2) : Math.min(0, r.momentum + 1);
  if (r.deadlineWeek !== null && week > r.deadlineWeek) {
    r.intensity = clamp(r.intensity + 10, 0, 100);
    r.momentum += 5;
    r.deadlineWeek = week + 3;
    occ.push({ icon: '⚔️', textDe: `${r.attackerName} legt nach — der Angriff (${STRIKE_KIND_LABELS[r.kind]}) verschärft sich, weil er unbeantwortet blieb.`, severity: 'bad' });
  }
  refreshModifiers(state);
  if (r.intensity <= 8) {
    occ.push({ icon: '🕊️', textDe: `Der Angriff von ${r.attackerName} verpufft — der Druck lässt nach.`, severity: 'good' });
    resetStrike(state);
  }
}

/** Reaktion des CEO auf den Angriff. */
export function respondStrike(state: CompanyState, mode: StrikeResponse, occ: Occurrence[]): void {
  const r = state.rivalry;
  const eff = counterEfficacy(state);
  r.responsesUsed.push(mode);
  r.lastNudgeWeek = state.meta.week;

  if (mode === 'match') {
    schedule(state, 0, `Wettbewerbs-Match W${state.meta.week}`, null, { kind: 'ONE_OFF_COST', amount: 35_000, labelDe: `Konter „${STRIKE_KIND_LABELS[r.kind]}": Rabattaktion/Gegenkampagne` });
    r.intensity = clamp(r.intensity - Math.round(20 * eff) - 4, 0, 100);
    r.momentum -= Math.round(8 * eff);
    occ.push({ icon: '🛡️', textDe: 'Du gehst mit — die Kampagne verliert an Wirkung, kostet dich aber Marge/Cash.', severity: 'good' });
  } else if (mode === 'differentiate') {
    const strong = productStrength(state);
    const drop = Math.round((10 + strong * 22) * eff);
    r.intensity = clamp(r.intensity - drop, 0, 100);
    r.momentum -= Math.round(6 * eff);
    occ.push({ icon: '🎯', textDe: strong > 0.55 ? 'Ihr stellt eure Stärken heraus — das trägt, der Angriff läuft ins Leere.' : 'Ihr setzt auf Differenzierung — bei mittelmäßigem Produkt wirkt das nur bedingt.', severity: strong > 0.55 ? 'good' : 'warn' });
  } else if (mode === 'ignore') {
    r.momentum += 3;
    occ.push({ icon: '🤐', textDe: 'Du hältst den Kurs — spart Ressourcen, aber der Druck bleibt (und kann wachsen).', severity: 'warn' });
  } else {
    // counter: aggressiver Gegenangriff (Marketing/Abwerben zurück).
    schedule(state, 0, `Gegenoffensive W${state.meta.week}`, null, { kind: 'ONE_OFF_COST', amount: 25_000, labelDe: 'Gegenoffensive gegen den Rivalen' });
    r.intensity = clamp(r.intensity - Math.round(14 * eff), 0, 100);
    r.momentum -= Math.round(6 * eff);
    const target = state.market.competitors.find((c) => c.name === r.attackerName);
    if (target) target.marketShare = clamp(target.marketShare - 0.006, 0, 1);
    occ.push({ icon: '⚡', textDe: `Gegenoffensive gegen ${r.attackerName} — du drehst den Spieß um und knabberst an seinem Anteil.`, severity: 'good' });
  }

  refreshModifiers(state);
  if (r.intensity <= 8) resetStrike(state);
}

function resetStrike(state: CompanyState): void {
  const r = state.rivalry;
  r.status = 'none';
  r.intensity = 0;
  r.momentum = 0;
  r.deadlineWeek = null;
  state.activeModifiers = state.activeModifiers.filter((m) => m.sourceDe !== STRIKE_SOURCE);
}

export function rivalrySummaryDe(state: CompanyState): string {
  const r = state.rivalry;
  if (r.status === 'none') return 'kein aktiver Wettbewerber-Angriff';
  return `${STRIKE_KIND_LABELS[r.kind]} von ${r.attackerName} (Intensität ${Math.round(r.intensity)}/100)`;
}

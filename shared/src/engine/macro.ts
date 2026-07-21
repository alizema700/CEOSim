import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import { REGIME_LABELS, regimeForSentiment, type MacroRegime } from '../types/macro.js';
import { stream } from './rng.js';
import { addMessage, assistantSender } from './comms.js';
import { nextId } from './stateHelpers.js';

/**
 * Makro-Engine (Phase 16). Deterministischer Random-Walk der Marktstimmung mit
 * Mean-Reversion und gelegentlichen Schocks. Die Stimmung moduliert Lead-Zufluss
 * und Abschlussquote (mild), der Leitzins bewegt sich gegenläufig zur Konjunktur.
 * Alles bewusst gedämpft — spürbar, aber nie allein spielentscheidend.
 */

const MACRO_SOURCE = 'Konjunktur';

/** Lead-Faktor aus der Marktstimmung (±15 %). */
export function macroLeadFactor(state: CompanyState): number {
  return clamp(1 + state.macro.sentiment / 500, 0.85, 1.15);
}
/** Abschlussquoten-Faktor aus der Marktstimmung (±10 %). */
export function macroWinFactor(state: CompanyState): number {
  return clamp(1 + state.macro.sentiment / 800, 0.9, 1.1);
}

const SHOCK_UP = 'Überraschend starke Konjunkturdaten treiben die Märkte.';
const SHOCK_DOWN = 'Schwache Konjunkturdaten drücken die Stimmung.';

function regimeHeadline(regime: MacroRegime, up: boolean): string {
  switch (regime) {
    case 'boom': return 'Euphorie an den Märkten: Kapital ist billig, Budgets sitzen locker.';
    case 'aufschwung': return 'Aufschwung: Die Nachfrage zieht an, Investitionen kommen zurück.';
    case 'rezession': return 'Rezession: Budgets werden eingefroren, Deals verschleppen sich.';
    case 'abschwung': return up ? 'Die Abkühlung verlangsamt sich.' : 'Abschwung: Vorsicht bei Kunden und Investoren.';
    default: return 'Der Markt beruhigt sich auf normalem Niveau.';
  }
}

export function tickMacro(state: CompanyState, occ: Occurrence[]): void {
  const week = state.meta.week;
  const m = state.macro;
  const rng = stream(state.meta.seed, 'macro', week);

  // Random-Walk mit Mean-Reversion.
  let step = (rng() * 2 - 1) * 6;
  let shocked = false;
  if (rng() < 0.06 && week - m.lastShockWeek > 6) {
    const up = rng() < 0.5;
    step += (up ? 1 : -1) * (16 + rng() * 14);
    m.lastShockWeek = week;
    shocked = true;
    m.lastHeadlineDe = up ? SHOCK_UP : SHOCK_DOWN;
  }
  m.sentiment = clamp((m.sentiment + step) * 0.97, -100, 100);

  const newRegime = regimeForSentiment(m.sentiment);
  const up = step >= 0;
  if (newRegime !== m.regime) {
    const headline = regimeHeadline(newRegime, up);
    m.lastHeadlineDe = shocked ? m.lastHeadlineDe : headline;
    m.regime = newRegime;
    m.weeksInRegime = 0;
    const tone: Occurrence['severity'] = newRegime === 'boom' || newRegime === 'aufschwung' ? 'good' : newRegime === 'rezession' ? 'bad' : newRegime === 'abschwung' ? 'warn' : 'info';
    occ.push({ icon: newRegime === 'rezession' || newRegime === 'abschwung' ? '📉' : newRegime === 'boom' || newRegime === 'aufschwung' ? '📈' : '🌐', textDe: `Konjunktur: ${REGIME_LABELS[newRegime]} — ${headline}`, severity: tone });
  } else {
    m.weeksInRegime += 1;
  }

  // Leitzins bewegt sich mit der Überhitzung (Boom → teurer, Rezession → billiger).
  m.interestRatePct = Math.round(clamp(4 + m.sentiment / 45, 1.5, 7.5) * 10) / 10;

  // Schock separat vermelden (auch ohne Regimewechsel).
  if (shocked && newRegime === m.regime) {
    occ.push({ icon: up ? '📈' : '📉', textDe: `Marktstimmung: ${m.lastHeadlineDe}`, severity: up ? 'good' : 'warn' });
    if (Math.abs(m.sentiment) > 40) {
      addMessage(state, {
        from: assistantSender(state),
        subjectDe: `Konjunktur: ${REGIME_LABELS[m.regime]}`,
        bodyDe: `kurzer Marktbericht: ${m.lastHeadlineDe} Die Stimmung steht bei ${Math.round(m.sentiment)} (${REGIME_LABELS[m.regime]}), der Referenzzins bei ${m.interestRatePct.toFixed(1)} %. Das wirkt auf Nachfrage (Leads, Abschlüsse) und das Finanzierungsklima — die Details siehst du im Markt.`,
        kind: 'system', eventInstanceId: null, delegable: false, suggestedActionType: null, templateId: 'macro-update', priority: 'normal',
      });
    }
  }

  // Modifikatoren neu setzen (mild).
  state.activeModifiers = state.activeModifiers.filter((mm) => mm.sourceDe !== MACRO_SOURCE);
  state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'leadGen', factor: macroLeadFactor(state), startWeek: week, endWeek: week + 1, sourceDe: MACRO_SOURCE });
  state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'trialWinRate', factor: macroWinFactor(state), startWeek: week, endWeek: week + 1, sourceDe: MACRO_SOURCE });
}

/** Kurzstatus fürs UI/Personas. */
export function macroSummaryDe(state: CompanyState): string {
  const m = state.macro;
  return `${REGIME_LABELS[m.regime]} (Stimmung ${Math.round(m.sentiment)}, Zins ${m.interestRatePct.toFixed(1)} %)`;
}

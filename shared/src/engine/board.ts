import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { TrustDriver } from '../types/ceo.js';
import { DIFFICULTIES } from './scenarios/difficulty.js';
import { runwayWeeks, effectiveMonthlyChurn } from './derive.js';
import { mrrGrowthMonthly } from './kpis.js';

/**
 * Board-Vertrauen: wöchentliches Update mit protokollierten Treibern.
 * Keine Blackbox — jeder Punkt Auf/Ab hat eine Begründung im trustLog.
 *
 * Mechanik: < 40 ⇒ Abmahnung + Bewährung (26 Wochen, klare Ziele).
 *           < 20 oder Bewährungsziele verfehlt ⇒ Misstrauensvotum (Game Over).
 */
export function updateBoardTrust(state: CompanyState): { delta: number; drivers: TrustDriver[] } {
  const week = state.meta.week;
  const diff = DIFFICULTIES[state.meta.difficulty];
  const drivers: TrustDriver[] = [];
  const add = (delta: number, reasonDe: string) => {
    const d = delta < 0 ? delta * diff.trustPenaltyMult : delta;
    drivers.push({ week, delta: round1(d), reasonDe });
  };

  const runway = runwayWeeks(state);
  if (runway < 13) add(-2.5, `Runway nur noch ${Math.round(runway)} Wochen — akute Existenzgefahr.`);
  else if (runway < 26) add(-1.0, `Runway unter 26 Wochen (${Math.round(runway)}).`);
  else if (runway > 60) add(+0.4, 'Komfortabler Runway (> 60 Wochen).');

  // Ein Investor mit Board-Seat (Phase 5) hebt die Wachstums-Messlatte.
  const growthBar = state.funding.investorBoardSeat ? 0.018 : 0.012;
  const growth = mrrGrowthMonthly(state);
  if (state.history.length >= 5) {
    if (growth >= growthBar) add(+1.2, `MRR wächst ${(growth * 100).toFixed(1)} %/Monat — über Plan (${(growthBar * 100).toFixed(1).replace('.', ',')} %).`);
    else if (growth >= 0.004) add(+0.5, `MRR wächst leicht (${(growth * 100).toFixed(1)} %/Monat)${state.funding.investorBoardSeat ? ' — dem neuen Investor reicht das nicht' : ''}.`);
    else if (growth <= -0.006) add(-1.5, `MRR schrumpft (${(growth * 100).toFixed(1)} %/Monat).`);
  }

  const churn = effectiveMonthlyChurn(state);
  if (churn > 0.035) add(-0.8, `Logo-Churn bei ${(churn * 100).toFixed(1)} %/Monat — der Kern des Mandats ist unerledigt.`);
  else if (churn < 0.025) add(+0.8, `Churn unter 2,5 %/Monat gedrückt — sichtbarer Fortschritt beim Kernproblem.`);

  const openTooLong = state.openEvents.filter((e) => e.status === 'open' && week - e.triggeredWeek >= 1).length;
  if (openTooLong > 0) add(-1.0 * openTooLong, `${openTooLong} unbeantwortete(s) kritische(s) Ereignis(se) — das Board erwartet Führung.`);

  // Covenant-Verletzung: Investoren reden mit der Bank.
  for (const cov of state.finance.debt.covenants) {
    if (cov.type === 'minCash' && state.finance.cash < cov.value) {
      add(-2.0, `Covenant verletzt: ${cov.labelDe} (Kasse: ${Math.round(state.finance.cash / 1000)} k€).`);
    }
  }

  const delta = drivers.reduce((s, d) => s + d.delta, 0);
  state.ceo.boardTrust = clamp(round1(state.ceo.boardTrust + delta), 0, 100);
  state.ceo.trustLog.push(...drivers);
  if (state.ceo.trustLog.length > 200) state.ceo.trustLog.splice(0, state.ceo.trustLog.length - 200);

  // Bewährungs-Mechanik
  if (state.ceo.probation === null && state.ceo.boardTrust < 40) {
    state.ceo.probation = {
      startedWeek: week,
      endsWeek: week + 26,
      targets: [
        { labelDe: 'Runway mindestens 20 Wochen halten', metric: 'runwayWeeks', comparator: 'gte', value: 20 },
        { labelDe: 'Logo-Churn unter 3,0 %/Monat drücken', metric: 'logoChurnMonthly', comparator: 'lte', value: 0.03 },
      ],
    };
    drivers.push({ week, delta: 0, reasonDe: '⚠️ FORMALE ABMAHNUNG: Bewährung für 26 Wochen mit klaren Zielen (siehe Board-Ziele).' });
  }

  if (state.ceo.probation !== null && week >= state.ceo.probation.endsWeek) {
    const churnNow = effectiveMonthlyChurn(state);
    const runwayNow = runwayWeeks(state);
    const metricValue = (m: string): number =>
      m === 'runwayWeeks' ? runwayNow : m === 'logoChurnMonthly' ? churnNow : 0;
    const allMet = state.ceo.probation.targets.every((t) =>
      t.comparator === 'gte' ? metricValue(t.metric) >= t.value : metricValue(t.metric) <= t.value,
    );
    if (allMet) {
      state.ceo.probation = null;
      state.ceo.boardTrust = clamp(state.ceo.boardTrust + 8, 0, 100);
      drivers.push({ week, delta: 8, reasonDe: 'Bewährungsziele erreicht — das Board stellt sich wieder hinter dich.' });
    } else {
      state.ceo.boardTrust = Math.min(state.ceo.boardTrust, 15); // erzwingt Misstrauensvotum
      drivers.push({ week, delta: 0, reasonDe: 'Bewährungsziele verfehlt — das Board beruft eine Sondersitzung ein.' });
    }
  }

  // Game Over: Misstrauensvotum
  if (state.ceo.boardTrust < 20 && state.meta.status === 'active') {
    state.meta.status = 'fired';
    state.meta.endReasonDe =
      'Misstrauensvotum des Boards: Das Vertrauen ist unter 20 gefallen. In einer außerordentlichen Sitzung wurdest du als CEO abberufen.';
  }

  return { delta: round1(delta), drivers };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

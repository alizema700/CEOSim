import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import { REGIME_LABELS, MACRO_SHOCK_SPECS } from '../types/macro.js';
import { REGULATION_SPECS } from '../types/politics.js';

/**
 * Wirtschaftsausblick (Phase 22, M7). Reine Ableitung aus der bestehenden Makro-,
 * Politik- und Regulierungslage — synthetisiert Konjunktur, Zins-Trajektorie,
 * Finanzierungsklima, Bewertungsfenster und Nachfrage zu einem lesbaren Vorausblick.
 * Keine State-Mutation, kein Tick ⇒ per Konstruktion Golden-Master-neutral.
 */

export type FinancingClimate = 'günstig' | 'neutral' | 'angespannt';
export type ValuationWindow = 'offen' | 'neutral' | 'eng';
export type RateTrajectory = 'steigend' | 'stabil' | 'fallend';
export type DemandOutlook = 'anziehend' | 'stabil' | 'nachlassend';

export interface OutlookSignal {
  labelDe: string;
  valueDe: string;
  tone: 'good' | 'warn' | 'bad' | 'dim';
}

export interface EconomicOutlook {
  regimeLabelDe: string;
  financingClimate: FinancingClimate;
  valuationWindow: ValuationWindow;
  rateTrajectory: RateTrajectory;
  demandOutlook: DemandOutlook;
  headlineDe: string;
  signals: OutlookSignal[];
  risksDe: string[];
  /** Rückenwind-Index −100..+100 für das Unternehmen (Ampel/Score). */
  score: number;
}

export function computeEconomicOutlook(state: CompanyState): EconomicOutlook {
  const m = state.macro;
  const pol = state.politics;

  // Finanzierungsklima: hoher Kapitalmarkt & niedriger Zins = günstig.
  const climateScore = (m.capitalIndex - 100) / 100 - (m.interestRatePct - 4) / 6;
  const financingClimate: FinancingClimate = climateScore > 0.12 ? 'günstig' : climateScore < -0.12 ? 'angespannt' : 'neutral';

  // Bewertungsfenster: folgt dem Kapitalmarkt-Index.
  const valuationWindow: ValuationWindow = m.capitalIndex >= 112 ? 'offen' : m.capitalIndex <= 90 ? 'eng' : 'neutral';

  // Zins-Trajektorie: die Notenbank folgt der Inflation.
  const rateTrajectory: RateTrajectory = m.inflationPct > 3.6 ? 'steigend' : m.inflationPct < 1.8 ? 'fallend' : 'stabil';

  // Nachfrage-Ausblick: Marktstimmung, gedämpft durch einen aktiven Negativ-Schock.
  const shockDrag = m.shock && MACRO_SHOCK_SPECS[m.shock.kind].tone !== 'good' ? -12 : 0;
  const demandLevel = m.sentiment + shockDrag;
  const demandOutlook: DemandOutlook = demandLevel > 15 ? 'anziehend' : demandLevel < -15 ? 'nachlassend' : 'stabil';

  const signals: OutlookSignal[] = [
    { labelDe: 'Finanzierungsklima', valueDe: financingClimate, tone: financingClimate === 'günstig' ? 'good' : financingClimate === 'angespannt' ? 'bad' : 'dim' },
    { labelDe: 'Bewertungsfenster', valueDe: valuationWindow, tone: valuationWindow === 'offen' ? 'good' : valuationWindow === 'eng' ? 'bad' : 'dim' },
    { labelDe: 'Zins-Trajektorie', valueDe: `${rateTrajectory} (${m.interestRatePct.toFixed(1)} %)`, tone: rateTrajectory === 'fallend' ? 'good' : rateTrajectory === 'steigend' ? 'warn' : 'dim' },
    { labelDe: 'Nachfrage', valueDe: demandOutlook, tone: demandOutlook === 'anziehend' ? 'good' : demandOutlook === 'nachlassend' ? 'bad' : 'dim' },
  ];

  const risksDe: string[] = [];
  if (m.shock) {
    const spec = MACRO_SHOCK_SPECS[m.shock.kind];
    if (spec.tone !== 'good') risksDe.push(`Aktiver Schock: ${spec.labelDe} (noch ~${Math.max(0, m.shock.endWeek - state.meta.week)} Wo.).`);
  }
  if (pol.activeRegulation) risksDe.push(`Aufsicht: ${REGULATION_SPECS[pol.activeRegulation.kind].labelDe} bindet Ressourcen.`);
  else if (pol.regulatoryPressure >= 55) risksDe.push(`Hoher Regulierungsdruck (${Math.round(pol.regulatoryPressure)}/100) — eine Auflage droht.`);
  if (pol.exposure >= 55) risksDe.push(`Hohes Lobby-Skandal-Risiko (${Math.round(pol.exposure)}/100).`);
  if (m.inflationPct >= 5) risksDe.push(`Hohe Inflation (${m.inflationPct.toFixed(1)} %) treibt Zins & Kosten.`);
  if (m.interestRatePct >= 7) risksDe.push(`Teures Kapital (Zins ${m.interestRatePct.toFixed(1)} %) — Fremdfinanzierung & Bewertungen leiden.`);

  // Rückenwind-Index: gewichtete Synthese.
  const score = clamp(
    Math.round(
      m.sentiment * 0.35 +
      (m.capitalIndex - 100) * 0.6 +
      (4 - m.interestRatePct) * 4 +
      shockDrag -
      (pol.activeRegulation ? 8 : 0) -
      Math.max(0, m.inflationPct - 3) * 3,
    ),
    -100,
    100,
  );

  const climatePhrase = financingClimate === 'günstig' ? 'Das Finanzierungsklima ist günstig' : financingClimate === 'angespannt' ? 'Das Finanzierungsklima ist angespannt' : 'Das Finanzierungsklima ist neutral';
  const demandPhrase = demandOutlook === 'anziehend' ? 'die Nachfrage zieht an' : demandOutlook === 'nachlassend' ? 'die Nachfrage lässt nach' : 'die Nachfrage bleibt stabil';
  const headlineDe = `${REGIME_LABELS[m.regime]}: ${climatePhrase}, ${demandPhrase}. Bewertungsfenster ${valuationWindow}, Zinsen ${rateTrajectory}.`;

  return { regimeLabelDe: REGIME_LABELS[m.regime], financingClimate, valuationWindow, rateTrajectory, demandOutlook, headlineDe, signals, risksDe, score };
}

/** Kurzfassung fürs Personas/UI. */
export function outlookSummaryDe(state: CompanyState): string {
  const o = computeEconomicOutlook(state);
  return `${o.headlineDe} Rückenwind-Index ${o.score > 0 ? '+' : ''}${o.score}.`;
}

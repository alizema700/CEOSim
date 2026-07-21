/**
 * Makroökonomie (Phase 16). Ein globales Konjunktur-Umfeld, das sich über die
 * Zeit deterministisch verschiebt (Random-Walk + gelegentliche Schocks) und die
 * Nachfrage moduliert: Marktstimmung treibt Lead-Zufluss und Abschlussquote,
 * der Leitzins bewegt Bewertungen & Finanzierungsklima. Bewusst mild gehalten —
 * spürbar, aber nie allein spielentscheidend.
 */

export type MacroRegime = 'boom' | 'aufschwung' | 'neutral' | 'abschwung' | 'rezession';

export interface MacroState {
  /** Marktstimmung −100..+100 (Angst … Gier). */
  sentiment: number;
  regime: MacroRegime;
  /** Leitzins-artiger Referenzsatz in Prozent (Finanzierungsklima/Bewertung). */
  interestRatePct: number;
  /** Inflationsrate in Prozent (Kostendruck, treibt den Leitzins). */
  inflationPct: number;
  /** Kapitalmarkt-/Tech-Sektor-Index (Basis 100) — bewegt Bewertungen & IPO-Fenster. */
  capitalIndex: number;
  /** Wochen im aktuellen Regime (fürs UI/Narrativ). */
  weeksInRegime: number;
  /** Letzte Schockwoche (verhindert Schock-Ketten). */
  lastShockWeek: number;
  /** Letzte Schlagzeile (fürs UI). */
  lastHeadlineDe: string;
}

export function initialMacroState(): MacroState {
  return { sentiment: 0, regime: 'neutral', interestRatePct: 4.0, inflationPct: 2.0, capitalIndex: 100, weeksInRegime: 0, lastShockWeek: -99, lastHeadlineDe: '' };
}

/** Bewertungs-Multiplikator aus dem Kapitalmarkt (Basis 100 = neutral 1,0). */
export function macroValuationMultiplier(m: { capitalIndex: number }): number {
  const x = (m?.capitalIndex ?? 100) / 100;
  return Math.max(0.78, Math.min(1.32, x));
}

export function regimeForSentiment(s: number): MacroRegime {
  if (s >= 55) return 'boom';
  if (s >= 18) return 'aufschwung';
  if (s <= -55) return 'rezession';
  if (s <= -18) return 'abschwung';
  return 'neutral';
}

export const REGIME_LABELS: Record<MacroRegime, string> = {
  boom: 'Boom',
  aufschwung: 'Aufschwung',
  neutral: 'Neutral',
  abschwung: 'Abschwung',
  rezession: 'Rezession',
};

/** Färbung fürs UI (gut/warn/schlecht/neutral). */
export const REGIME_TONE: Record<MacroRegime, 'good' | 'warn' | 'bad' | 'dim'> = {
  boom: 'good',
  aufschwung: 'good',
  neutral: 'dim',
  abschwung: 'warn',
  rezession: 'bad',
};

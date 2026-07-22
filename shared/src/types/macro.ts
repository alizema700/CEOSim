/**
 * Makroökonomie (Phase 16). Ein globales Konjunktur-Umfeld, das sich über die
 * Zeit deterministisch verschiebt (Random-Walk + gelegentliche Schocks) und die
 * Nachfrage moduliert: Marktstimmung treibt Lead-Zufluss und Abschlussquote,
 * der Leitzins bewegt Bewertungen & Finanzierungsklima. Bewusst mild gehalten —
 * spürbar, aber nie allein spielentscheidend.
 */

export type MacroRegime = 'boom' | 'aufschwung' | 'neutral' | 'abschwung' | 'rezession';

/**
 * Exogene Wirtschaftsschocks (Phase 22, M4): benannte, mehrwöchige Makro-Episoden mit
 * eigenem Narrativ und echten Effekten (Stimmung, Inflation, Zins, Kapitalmarkt,
 * Nachfrage). Anders als der stille Random-Walk sind das legible Großereignisse.
 */
export type MacroShockKind = 'zinsschock' | 'techhype' | 'energiekrise' | 'bankenbeben' | 'lieferkette' | 'wachstumswunder';

export interface MacroShock {
  kind: MacroShockKind;
  startWeek: number;
  endWeek: number;
  headlineDe: string;
}

export interface MacroShockSpec {
  labelDe: string;
  /** Emoji für Occurrences/Narrativ (wird clientseitig auf ein Line-Icon gemappt). */
  emoji: string;
  tone: 'good' | 'warn' | 'bad';
  headlineDe: string;
  recoveryDe: string;
  durationWeeks: number;
  /** Einmalige Impulse zum Onset (wirken nach, klingen über tickMacro ab). */
  sentimentKick: number;
  inflationKick: number;
  capKick: number;
  /** Nachfrage-Modifikatoren, solange die Episode läuft (1 = neutral). */
  leadFactor: number;
  winFactor: number;
}

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
  /** Aktive Wirtschaftsschock-Episode (Phase 23) oder null. */
  shock: MacroShock | null;
  /** Woche der letzten Schock-Episode (Cooldown zwischen Großereignissen). */
  lastShockEpisodeWeek: number;
}

export function initialMacroState(): MacroState {
  return { sentiment: 0, regime: 'neutral', interestRatePct: 4.0, inflationPct: 2.0, capitalIndex: 100, weeksInRegime: 0, lastShockWeek: -99, lastHeadlineDe: '', shock: null, lastShockEpisodeWeek: -99 };
}

/**
 * Deck der Schock-Episoden. Bewusst mild und größtenteils demand-/klimaseitig
 * (keine Direkt-Buchungen ⇒ bilanz-/cashflow-invariant-sicher).
 */
export const MACRO_SHOCK_SPECS: Record<MacroShockKind, MacroShockSpec> = {
  zinsschock: {
    labelDe: 'Zinsschock', emoji: '🏦', tone: 'bad', durationWeeks: 6,
    headlineDe: 'Die Notenbank hebt die Leitzinsen drastisch an — Kapital wird teuer.',
    recoveryDe: 'Die Notenbank signalisiert eine Zinspause — das Finanzierungsklima entspannt sich.',
    sentimentKick: -14, inflationKick: 1.5, capKick: -22, leadFactor: 1, winFactor: 0.96,
  },
  techhype: {
    labelDe: 'Tech-Hype', emoji: '🚀', tone: 'good', durationWeeks: 5,
    headlineDe: 'Eine Euphorie-Welle erfasst Tech-Werte — Bewertungen und Wagniskapital explodieren.',
    recoveryDe: 'Die Euphorie kühlt ab; die Bewertungen kehren auf den Boden zurück.',
    sentimentKick: 20, inflationKick: 0.3, capKick: 48, leadFactor: 1.05, winFactor: 1.05,
  },
  energiekrise: {
    labelDe: 'Energiekrise', emoji: '⚡', tone: 'bad', durationWeeks: 7,
    headlineDe: 'Die Energiepreise schießen in die Höhe — Inflation und Kostendruck steigen.',
    recoveryDe: 'Die Energiemärkte beruhigen sich, der Preisdruck lässt nach.',
    sentimentKick: -12, inflationKick: 2.4, capKick: -12, leadFactor: 0.95, winFactor: 1,
  },
  bankenbeben: {
    labelDe: 'Bankenbeben', emoji: '📉', tone: 'bad', durationWeeks: 6,
    headlineDe: 'Eine Bankenkrise erschüttert die Märkte — Kredite werden knapp, Finanzierung stockt.',
    recoveryDe: 'Notfallmaßnahmen stabilisieren die Banken; das Vertrauen kehrt zurück.',
    sentimentKick: -24, inflationKick: -0.3, capKick: -34, leadFactor: 0.96, winFactor: 0.94,
  },
  lieferkette: {
    labelDe: 'Lieferkettenschock', emoji: '📦', tone: 'warn', durationWeeks: 5,
    headlineDe: 'Globale Lieferketten reißen — Vorprodukte werden knapp und teurer.',
    recoveryDe: 'Die Lieferketten normalisieren sich wieder.',
    sentimentKick: -9, inflationKick: 1.5, capKick: -6, leadFactor: 0.97, winFactor: 1,
  },
  wachstumswunder: {
    labelDe: 'Wachstumswunder', emoji: '📈', tone: 'good', durationWeeks: 5,
    headlineDe: 'Überraschend starke Konjunkturdaten befeuern die gesamte Wirtschaft.',
    recoveryDe: 'Das Wachstum normalisiert sich auf gesundem Niveau.',
    sentimentKick: 18, inflationKick: 0.6, capKick: 22, leadFactor: 1.05, winFactor: 1.03,
  },
};

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

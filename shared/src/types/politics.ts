import type { Money, WeekIndex } from './common.js';

/**
 * Politik & Lobbyismus (Phase 22). Der CEO baut politisches Kapital auf, um
 * Steuererleichterungen, Subventionen und Zugang zu gewinnen — mit dem Risiko
 * eines Lobbyismus-Skandals. Golden-Master-sicher: alle Felder sind ohne aktives
 * Lobbying inert (kein Kapital-/Exposure-Aufbau ⇒ keine Wirkung, kein Skandal).
 */

export type LobbyFocus = 'steuern' | 'subvention' | 'zugang';

export interface PoliticsState {
  /** Politisches Kapital 0..100 — Einfluss, freigeschaltet durch Lobbying. */
  politicalCapital: number;
  /** Gewonnene Steuererleichterung in Prozentpunkten auf den effektiven Satz (0..0,05). */
  taxReliefPct: number;
  /** Skandal-Risiko 0..100 — steigt mit aggressivem Lobbying, klingt ab. */
  exposure: number;
  /** Kumulierte Lobby-Ausgaben (Narrativ/Skandal). */
  lobbyingSpendTotal: Money;
  /** Kumuliert erhaltene Subventionen. */
  subsidiesWon: Money;
  /** Letzte Skandal-Woche. */
  lastScandalWeek: WeekIndex;
  /** Kurzchronik der Erfolge/Vorfälle (fürs UI). */
  logDe: string[];
  /** Regulatorischer Druck 0..100 (Phase 22, M5) — Aufsicht als Gegenkraft. */
  regulatoryPressure: number;
  /** Aktive Aufsichts-/Regulierungs-Episode oder null. */
  activeRegulation: ActiveRegulation | null;
  /** Woche der letzten Auflage (Cooldown). */
  lastRegulationWeek: WeekIndex;
}

/**
 * Regulierung & Aufsicht (Phase 22, M5): die politische Gegenkraft. Regulatorischer
 * Druck baut sich mit Marktmacht & Skandalen auf und entlädt sich in Auflagen
 * (Compliance-Kosten + Reibung). Politisches Kapital (M3) mildert Druck, Kosten
 * und Dauer — so bekommt der Lobby-Aufbau echten defensiven Wert.
 */
export type RegulationKind = 'datenschutz' | 'branchenaufsicht' | 'kartellpruefung' | 'complianceauflage';

export interface ActiveRegulation {
  kind: RegulationKind;
  startWeek: WeekIndex;
  endWeek: WeekIndex;
  headlineDe: string;
  /** Tatsächlich veranlagte Compliance-Kosten (nach Mitigation), fürs UI. */
  complianceCost: Money;
}

export interface RegulationSpec {
  labelDe: string;
  emoji: string;
  headlineDe: string;
  recoveryDe: string;
  durationWeeks: number;
  /** Compliance-Kosten vor Mitigation durch politisches Kapital. */
  baseCost: Money;
  /** Reibung während der Auflage (1 = neutral). */
  leadFactor: number;
  winFactor: number;
  /** Einmaliger Presse-/Reputationsdämpfer beim Onset (vor Mitigation). */
  reputationHit: number;
}

export const REGULATION_SPECS: Record<RegulationKind, RegulationSpec> = {
  datenschutz: {
    labelDe: 'Datenschutz-Auflage', emoji: '🔒', durationWeeks: 5, baseCost: 45_000,
    headlineDe: 'Eine verschärfte Datenschutz-Verordnung verlangt teure Nachrüstung und Audits.',
    recoveryDe: 'Die Datenschutz-Auflagen sind umgesetzt — der Sonderaufwand entfällt.',
    leadFactor: 0.97, winFactor: 1, reputationHit: 0,
  },
  branchenaufsicht: {
    labelDe: 'Branchenaufsicht', emoji: '📋', durationWeeks: 6, baseCost: 30_000,
    headlineDe: 'Eine neue Branchenregulierung bindet Ressourcen in Berichts- und Meldepflichten.',
    recoveryDe: 'Die Berichtspflichten laufen jetzt routiniert — die Sonderlast klingt ab.',
    leadFactor: 0.96, winFactor: 0.98, reputationHit: 0,
  },
  kartellpruefung: {
    labelDe: 'Kartellprüfung', emoji: '⚖️', durationWeeks: 5, baseCost: 60_000,
    headlineDe: 'Die Kartellbehörde prüft eure Marktmacht — Anwaltskosten und Unsicherheit.',
    recoveryDe: 'Die Kartellprüfung endet ohne Auflagen — die Unsicherheit weicht.',
    leadFactor: 1, winFactor: 0.97, reputationHit: 5,
  },
  complianceauflage: {
    labelDe: 'Compliance-Audit', emoji: '🔍', durationWeeks: 4, baseCost: 38_000,
    headlineDe: 'Eine Aufsichtsbehörde verlangt ein externes Compliance-Audit mit Fristen.',
    recoveryDe: 'Das Compliance-Audit ist bestanden — die Prüfer sind zufrieden.',
    leadFactor: 0.98, winFactor: 1, reputationHit: 3,
  },
};

export function initialPoliticsState(): PoliticsState {
  return {
    politicalCapital: 8,
    taxReliefPct: 0,
    exposure: 0,
    lobbyingSpendTotal: 0,
    subsidiesWon: 0,
    lastScandalWeek: -99,
    logDe: [],
    regulatoryPressure: 0,
    activeRegulation: null,
    lastRegulationWeek: -99,
  };
}

export const LOBBY_LABELS: Record<LobbyFocus, string> = {
  steuern: 'Steuerpolitik',
  subvention: 'Fördermittel',
  zugang: 'Zugang & Netzwerk',
};

export const LOBBY_COST: Record<LobbyFocus, Money> = {
  steuern: 40_000,
  subvention: 30_000,
  zugang: 20_000,
};

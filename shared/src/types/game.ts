import type { DifficultyId, Id, ScenarioId, WeekIndex } from './common.js';
import type { CompanyIdentity, PlayerProfile } from './identity.js';
import type { BalanceSheet, CashFlowStatement, IncomeStatement } from './finance.js';
import type { KpiSnapshot } from './kpi.js';
import type { PlayerAction } from './actions.js';
import type { Hypothesis } from './evaluation.js';
import type { ActiveRandomEvent } from './randomEvents.js';
import type { TrustDriver } from './ceo.js';

/** Setup-Payload aus dem „Neues Unternehmen"-Wizard. */
export interface GameSetup {
  scenarioId: ScenarioId;
  difficulty: DifficultyId;
  identity: CompanyIdentity;
  playerProfile: PlayerProfile;
  /** Optionaler expliziter Seed (für Lernvergleiche); sonst zufällig. */
  seed?: number;
}

/**
 * ═══ EVENT-SOURCING ═══
 * Append-only Audit-Log. Der aktuelle CompanyState ist jederzeit durch
 * deterministisches Replay der GameEvents rekonstruierbar:
 *   GAME_CREATED(setup, seed) → initState; dann je Event denselben
 *   Engine-Codepfad anwenden. Ermöglicht Zeitreise/Forks (Was-wäre-wenn-
 *   Labor, Phase 4), Replays und verlustfreie Spielstände.
 *
 * Payloads sind Kommandos (Input), nie berechnete Resultate — die Engine
 * rechnet beim Replay alles identisch neu (Determinismus via Seed).
 */
export type GameEvent =
  | { seq: number; gameId: Id; week: WeekIndex; atISO: string; type: 'GAME_CREATED'; payload: { setup: GameSetup; seed: number } }
  | { seq: number; gameId: Id; week: WeekIndex; atISO: string; type: 'DECISION_MADE'; payload: { decisionId: Id; action: PlayerAction; hypothesis: Hypothesis | null } }
  | { seq: number; gameId: Id; week: WeekIndex; atISO: string; type: 'WEEK_CLOSED'; payload: Record<string, never> };

/**
 * Wochenbericht — Ergebnis von closeWeek(). Reine Ausgabe (kein State),
 * wird aber serverseitig gecacht, damit das UI Verläufe anzeigen kann.
 */
export interface WeekReport {
  week: WeekIndex; // die soeben abgeschlossene Woche
  dateISO: string;
  incomeStatement: IncomeStatement;
  cashFlow: CashFlowStatement;
  balanceSheet: BalanceSheet;
  kpis: KpiSnapshot;
  /** Was ist diese Woche passiert (menschenlesbar, chronologisch). */
  occurrences: Occurrence[];
  /** Neu getriggerte Ereignisse, die eine Reaktion verlangen. */
  triggeredEvents: ActiveRandomEvent[];
  /** Board-Vertrauen: Wochendelta + Begründungen (keine Blackbox). */
  boardTrustDelta: number;
  trustDrivers: TrustDriver[];
  /** Warnungen (Runway, Covenants, Moral, offene Events …). */
  alerts: Alert[];
  /** Entscheidungen, deren Outcome-Bewertung jetzt fällig ist. */
  evaluationsDue: Id[];
  invariants: InvariantReport;
}

export interface Occurrence {
  icon: string; // Emoji für die Feed-Zeile
  textDe: string;
  severity: 'info' | 'good' | 'warn' | 'bad';
}

export interface Alert {
  id: string;
  severity: 'info' | 'warn' | 'critical';
  titleDe: string;
  bodyDe: string;
}

/** Ergebnis der harten Konsistenzprüfungen nach dem Wochenschritt. */
export interface InvariantReport {
  ok: boolean;
  checks: {
    name: string;
    ok: boolean;
    /** Bei Verletzung: Diff-Anzeige (erwartet vs. tatsächlich). */
    expected: number;
    actual: number;
    delta: number;
  }[];
}

/** Spielstand-Zusammenfassung für den Spielstände-Manager („Meine Unternehmen"). */
export interface GameSummary {
  gameId: Id;
  companyName: string;
  logoEmoji: string;
  logoColor: string;
  ceoName: string;
  scenarioId: ScenarioId;
  difficulty: DifficultyId;
  week: WeekIndex;
  dateISO: string;
  status: string;
  cash: number;
  mrr: number;
  boardTrust: number;
  createdAtISO: string;
  updatedAtISO: string;
}

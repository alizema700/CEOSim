import type { DifficultyId, GameStatus, Id, ScenarioId, WeekIndex } from './common.js';
import type { CapTableEntry, CompanyIdentity, PlayerProfile } from './identity.js';
import type { FinanceState } from './finance.js';
import type { PeopleState } from './people.js';
import type { CustomerState } from './customers.js';
import type { ProductState } from './product.js';
import type { MarketState, ReputationState } from './market.js';
import type { CeoState } from './ceo.js';
import type { ActiveModifier, ScheduledEffect } from './effects.js';
import type { ActiveRandomEvent } from './randomEvents.js';
import type { KpiSnapshot } from './kpi.js';
import type { DecisionRecord, Evaluation } from './evaluation.js';
import type { CalendarState, CommsState } from './comms.js';
import type { PressLogEntry, Project } from './strategy.js';

/**
 * ═══════════════════════════════════════════════════════════════════
 * CompanyState — SINGLE SOURCE OF TRUTH
 * ═══════════════════════════════════════════════════════════════════
 *
 * Alles Spielgeschehen ist aus diesem Objekt + dem Event-Log ableitbar.
 *
 * Regeln:
 * 1. NUR die deterministische Engine (applyAction / closeWeek) mutiert
 *    diesen State. Das LLM erzählt & bewertet, setzt aber NIE Zahlen.
 * 2. Gleicher Seed + gleiche Event-Folge ⇒ exakt gleicher State (Replay).
 * 3. Nach jedem Wochenschritt laufen Invarianten-Checks (Bilanz-Identität,
 *    Cash-Flow-Konsistenz, Wertebereiche). Verletzung = harter Fehler.
 * 4. Abgeleitete Kennzahlen (EBITDA, Runway, LTV …) werden IMMER aus diesem
 *    State berechnet, nie hier gespeichert (Ausnahme: history als Chart-Cache).
 */
export interface CompanyState {
  meta: GameMeta;
  identity: CompanyIdentity;
  playerProfile: PlayerProfile;
  capTable: CapTableEntry[];

  finance: FinanceState;
  customers: CustomerState;
  people: PeopleState;
  product: ProductState;
  market: MarketState;
  reputation: ReputationState;
  ceo: CeoState;

  /** Geplante Folge-Effekte (fällig ab dueWeek). */
  scheduledEffects: ScheduledEffect[];
  /** Aktive Zeitraum-Modifikatoren. */
  activeModifiers: ActiveModifier[];
  /** Offene Zufalls-/Krisenereignisse, die eine Reaktion verlangen. */
  openEvents: ActiveRandomEvent[];
  /** Cooldown-Buchhaltung des Event-Decks: cardId → letzte Trigger-Woche. */
  eventCooldowns: Record<string, WeekIndex>;

  /** Kommunikation (Phase 2): deterministische Inbox-Nachrichten + Cooldowns. */
  comms: CommsState;
  /** Kalender (Phase 2): Termine, von der Engine generiert. */
  calendar: CalendarState;
  /** Projekte aus dem Ideen-System (Phase 3). */
  projects: Project[];
  /** Medienspiegel: alle Presse-Ereignisse (Phase 3). */
  pressLog: PressLogEntry[];
  /** Fundraising-Historie (Phase 5). */
  funding: import('./funding.js').FundingState;
  /** IPO-Prozess & Börsennotierung (Phase 6). */
  ipo: import('./ipo.js').IpoState;

  /** Wöchentliche KPI-Schnappschüsse (Chart-Cache, aus Events rekonstruierbar). */
  history: KpiSnapshot[];

  /**
   * Entscheidungs- & Bewertungslog. Teil des States, weil beides
   * deterministisch aus Events berechnet wird (Replay-sicher). LLM-Prosa
   * (Evaluation.llmAnalysisDe) bleibt hier IMMER null — der Server hält
   * Erzähltexte separat, damit der State LLM-unabhängig reproduzierbar ist.
   */
  decisionLog: DecisionRecord[];
  evaluations: Evaluation[];

  /** Interner deterministischer Zähler für ID-Vergabe. */
  idCounter: number;
}

export interface GameMeta {
  gameId: Id;
  /** RNG-Seed: gleicher Seed + gleiche Entscheidungen = gleicher Verlauf. */
  seed: number;
  scenarioId: ScenarioId;
  difficulty: DifficultyId;
  /** Aktuelle Spielwoche (0 = Woche der Übernahme). */
  week: WeekIndex;
  /** Montag der Woche 0 als ISO-Datum. */
  startDateISO: string;
  status: GameStatus;
  /** Bei Game Over: menschenlesbare Begründung (Post-Mortem-Kurzform). */
  endReasonDe: string | null;
  createdAtISO: string;
}

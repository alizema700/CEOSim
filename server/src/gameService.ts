import { randomUUID } from 'node:crypto';
import {
  applyAction,
  applyCommsIntent,
  closeWeek,
  createCompany,
  replayGame,
  runDueEvaluations,
  validateAction,
  totalMrr,
  type CommsIntent,
  type CompanyState,
  type Evaluation,
  type GameEvent,
  type GameSetup,
  type GameSummary,
  type Hypothesis,
  type PlayerAction,
  type WeekReport,
} from '@boardroom/shared';
import { getDb } from './db.js';
import { llmText } from './llm.js';
import { ensureStateShape } from './migrate.js';

/**
 * GameService: verbindet deterministische Engine mit Persistenz und der
 * LLM-Erzählschicht. Jede Zustandsänderung läuft über ein GameEvent
 * (append-only), der Snapshot ist nur Cache.
 */

function nowISO(): string {
  return new Date().toISOString();
}

function saveSnapshot(gameId: string, state: CompanyState): void {
  getDb()
    .prepare('UPDATE games SET snapshot = ?, updated_at = ? WHERE game_id = ?')
    .run(JSON.stringify(state), nowISO(), gameId);
}

function appendEvent(ev: Omit<GameEvent, 'seq'>): void {
  getDb()
    .prepare('INSERT INTO events (game_id, week, at_iso, type, payload) VALUES (?, ?, ?, ?, ?)')
    .run(ev.gameId, ev.week, ev.atISO, ev.type, JSON.stringify(ev.payload));
}

export function loadState(gameId: string): CompanyState {
  const row = getDb().prepare('SELECT snapshot FROM games WHERE game_id = ?').get(gameId) as
    | { snapshot: string }
    | undefined;
  if (!row) throw new HttpError(404, 'Spielstand nicht gefunden.');
  return ensureStateShape(JSON.parse(row.snapshot) as CompanyState);
}

export function createGame(setup: GameSetup): CompanyState {
  const seed = setup.seed ?? Math.floor(Math.random() * 2 ** 31);
  const gameId = 'game_' + randomUUID().slice(0, 8);
  const createdAt = nowISO();
  const state = createCompany({ ...setup, seed }, seed, gameId, createdAt);

  getDb()
    .prepare('INSERT INTO games (game_id, created_at, updated_at, snapshot) VALUES (?, ?, ?, ?)')
    .run(gameId, createdAt, createdAt, JSON.stringify(state));
  appendEvent({ gameId, week: 0, atISO: createdAt, type: 'GAME_CREATED', payload: { setup: { ...setup, seed }, seed } });
  return state;
}

export function listGames(): GameSummary[] {
  const rows = getDb().prepare('SELECT snapshot, created_at, updated_at FROM games ORDER BY updated_at DESC').all() as {
    snapshot: string;
    created_at: string;
    updated_at: string;
  }[];
  return rows.map((r) => {
    const s = JSON.parse(r.snapshot) as CompanyState;
    return {
      gameId: s.meta.gameId,
      companyName: s.identity.companyName,
      logoEmoji: s.identity.logoEmoji,
      logoColor: s.identity.logoColor,
      ceoName: s.playerProfile.ceoName,
      scenarioId: s.meta.scenarioId,
      difficulty: s.meta.difficulty,
      week: s.meta.week,
      dateISO: weekDate(s),
      status: s.meta.status,
      cash: Math.round(s.finance.cash),
      mrr: Math.round(totalMrr(s)),
      boardTrust: s.ceo.boardTrust,
      createdAtISO: r.created_at,
      updatedAtISO: r.updated_at,
    };
  });
}

function weekDate(s: CompanyState): string {
  const d = new Date(s.meta.startDateISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + s.meta.week * 7);
  return d.toISOString().slice(0, 10);
}

export function deleteGame(gameId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM games WHERE game_id = ?').run(gameId);
  db.prepare('DELETE FROM events WHERE game_id = ?').run(gameId);
  db.prepare('DELETE FROM week_reports WHERE game_id = ?').run(gameId);
  db.prepare('DELETE FROM llm_narratives WHERE game_id = ?').run(gameId);
}

export function validate(gameId: string, action: PlayerAction) {
  return validateAction(loadState(gameId), action);
}

/**
 * Begrenzten Erzählschicht-Intent anwenden UND als Event protokollieren —
 * Replay wendet den gespeicherten Intent an, ohne das LLM zu brauchen.
 */
export function recordIntent(gameId: string, intent: CommsIntent): CompanyState {
  const state = loadState(gameId);
  applyCommsIntent(state, intent);
  appendEvent({ gameId, week: state.meta.week, atISO: nowISO(), type: 'INTENT', payload: { intent } });
  saveSnapshot(gameId, state);
  return state;
}

export function decide(gameId: string, action: PlayerAction, hypothesis: Hypothesis | null) {
  const state = loadState(gameId);
  if (state.meta.status !== 'active') throw new HttpError(409, 'Das Spiel ist beendet.');
  const decisionId = 'dec_' + randomUUID().slice(0, 8);
  const record = applyAction(state, action, hypothesis, decisionId);
  appendEvent({ gameId, week: state.meta.week, atISO: nowISO(), type: 'DECISION_MADE', payload: { decisionId, action, hypothesis } });
  saveSnapshot(gameId, state);
  return { record, state };
}

export async function closeGameWeek(gameId: string): Promise<{ report: WeekReport; evaluations: Evaluation[]; state: CompanyState }> {
  const state = loadState(gameId);
  const report = closeWeek(state);
  const evaluations = runDueEvaluations(state);
  appendEvent({ gameId, week: report.week, atISO: nowISO(), type: 'WEEK_CLOSED', payload: {} });
  saveSnapshot(gameId, state);
  getDb()
    .prepare('INSERT OR REPLACE INTO week_reports (game_id, week, report) VALUES (?, ?, ?)')
    .run(gameId, report.week, JSON.stringify(report));

  // LLM-Erzählschicht: vertieft neue Bewertungen sprachlich (Zahlen & Note
  // bleiben deterministisch). Fehler/fehlender Key ⇒ still regelbasiert.
  const enriched = await Promise.all(evaluations.map((ev) => enrichEvaluation(gameId, state, ev)));
  return { report, evaluations: enriched, state };
}

async function enrichEvaluation(gameId: string, state: CompanyState, ev: Evaluation): Promise<Evaluation> {
  const decision = state.decisionLog.find((d) => d.id === ev.decisionId);
  if (!decision) return ev;
  const system = `Du bist der Bewertungs-Coach in „Boardroom", einem CEO-Trainings-Simulator. Du erklärst einem angehenden CEO die Kausalkette einer Entscheidung — präzise, First-Principles, ohne Floskeln, auf Deutsch, max. 150 Wörter. Du darfst KEINE neuen Zahlen erfinden; nutze nur die gelieferten. Die Note steht bereits fest, widersprich ihr nicht.`;
  const user = [
    `Unternehmen: ${state.identity.companyName} (Werte: ${state.identity.values.join(', ')}; Motto: „${state.identity.motto}")`,
    `Entscheidung (Woche ${decision.week}): ${decision.summaryDe}`,
    decision.hypothesis ? `Hypothese des Spielers: ${decision.hypothesis.textDe}` : 'Keine Hypothese abgegeben.',
    `KPI-Diff seit Entscheidung: ${ev.kpiDiff.map((k) => `${k.id}: ${fmt(k.before)} → ${fmt(k.after)}`).join('; ')}`,
    `Regelbasierte Kausalkette: ${ev.causalChainDe.join(' ')}`,
    `Note: ${ev.grade.overall} — Begründungen: ${ev.grade.reasoningDe.join(' ')}`,
    'Schreibe eine vertiefende Analyse: Was war der wichtigste Wirkmechanismus, was hätte man vorab prüfen können, was ist die übertragbare Lektion?',
  ].join('\n');

  const text = await llmText('evaluation-analysis', system, user);
  if (text) {
    getDb()
      .prepare('INSERT OR REPLACE INTO llm_narratives (evaluation_id, game_id, text, created_at) VALUES (?, ?, ?, ?)')
      .run(ev.id, gameId, text, nowISO());
    return { ...ev, llmAnalysisDe: text };
  }
  return ev;
}

function fmt(v: number): string {
  return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('de-DE') : String(Math.round(v * 1000) / 1000);
}

/** Bewertungen inkl. gespeicherter LLM-Texte (State selbst bleibt LLM-frei). */
export function evaluationsWithNarratives(gameId: string, state: CompanyState): Evaluation[] {
  const rows = getDb().prepare('SELECT evaluation_id, text FROM llm_narratives WHERE game_id = ?').all(gameId) as {
    evaluation_id: string;
    text: string;
  }[];
  const byId = new Map(rows.map((r) => [r.evaluation_id, r.text]));
  return state.evaluations.map((ev) => ({ ...ev, llmAnalysisDe: byId.get(ev.id) ?? null }));
}

export function getReports(gameId: string, fromWeek = 0): WeekReport[] {
  const rows = getDb()
    .prepare('SELECT report FROM week_reports WHERE game_id = ? AND week >= ? ORDER BY week')
    .all(gameId, fromWeek) as { report: string }[];
  return rows.map((r) => JSON.parse(r.report) as WeekReport);
}

export function exportGame(gameId: string): { events: GameEvent[]; snapshot: CompanyState } {
  const state = loadState(gameId);
  const rows = getDb().prepare('SELECT seq, game_id, week, at_iso, type, payload FROM events WHERE game_id = ? ORDER BY seq').all(gameId) as {
    seq: number; game_id: string; week: number; at_iso: string; type: string; payload: string;
  }[];
  const events = rows.map((r) => ({ seq: r.seq, gameId: r.game_id, week: r.week, atISO: r.at_iso, type: r.type, payload: JSON.parse(r.payload) })) as GameEvent[];
  return { events, snapshot: state };
}

/** Import: Events werden REPLAYT (nicht der Snapshot blind übernommen) — Integrität garantiert. */
export function importGame(events: GameEvent[]): CompanyState {
  const { state, reports } = replayGame(events);
  const gameId = 'game_' + randomUUID().slice(0, 8); // neue ID, Kollisionsfrei
  state.meta.gameId = gameId;
  const createdAt = nowISO();
  const db = getDb();
  db.prepare('INSERT INTO games (game_id, created_at, updated_at, snapshot) VALUES (?, ?, ?, ?)').run(gameId, createdAt, createdAt, JSON.stringify(state));
  for (const ev of events) {
    appendEvent({ ...ev, gameId });
  }
  for (const report of reports) {
    db.prepare('INSERT OR REPLACE INTO week_reports (game_id, week, report) VALUES (?, ?, ?)').run(gameId, report.week, JSON.stringify(report));
  }
  return state;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

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

// ── Was-wäre-wenn-Labor (Phase 4) ────────────────────────────────────

/**
 * Fork: Events bis einschließlich des atWeek-ten Wochenabschlusses replayen
 * und als NEUEN Spielstand speichern. Gleicher Seed ⇒ ab dem Fork-Punkt
 * unterscheiden sich Verläufe NUR durch andere Entscheidungen.
 */
export function forkGame(gameId: string, atWeek: number): CompanyState {
  const { events } = exportGame(gameId);
  const original = loadState(gameId);
  if (atWeek < 0 || atWeek >= original.meta.week) throw new HttpError(400, `Fork-Woche muss zwischen 0 und ${original.meta.week - 1} liegen.`);

  const sliced: GameEvent[] = [];
  let closed = 0;
  for (const ev of events) {
    if (closed >= atWeek && ev.type !== 'GAME_CREATED') break;
    sliced.push(ev);
    if (ev.type === 'WEEK_CLOSED') closed++;
  }
  const { state, reports } = replayGame(sliced);
  const newId = 'game_' + randomUUID().slice(0, 8);
  state.meta.gameId = newId;
  state.identity.companyName = `${original.identity.companyName.replace(/ \(Fork W\d+.*\)$/, '')} (Fork W${atWeek})`;
  const createdAt = nowISO();
  const db = getDb();
  db.prepare('INSERT INTO games (game_id, created_at, updated_at, snapshot) VALUES (?, ?, ?, ?)').run(newId, createdAt, createdAt, JSON.stringify(state));
  for (const ev of sliced) appendEvent({ ...ev, gameId: newId });
  for (const report of reports) {
    db.prepare('INSERT OR REPLACE INTO week_reports (game_id, week, report) VALUES (?, ?, ?)').run(newId, report.week, JSON.stringify(report));
  }
  const rootId = findRoot(gameId);
  db.prepare('INSERT INTO forks (game_id, parent_game_id, fork_week) VALUES (?, ?, ?)').run(newId, rootId, atWeek);
  return state;
}

function findRoot(gameId: string): string {
  const row = getDb().prepare('SELECT parent_game_id FROM forks WHERE game_id = ?').get(gameId) as { parent_game_id: string } | undefined;
  return row ? findRoot(row.parent_game_id) : gameId;
}

/** Vergleichsdaten: Original + alle Forks derselben Familie (Chart-Overlay). */
export function compareFamily(gameId: string): {
  games: { gameId: string; name: string; forkWeek: number | null; status: string; history: { week: number; mrr: number; cash: number; boardTrust: number }[] }[];
} {
  const rootId = findRoot(gameId);
  const db = getDb();
  const forkRows = db.prepare('SELECT game_id, fork_week FROM forks WHERE parent_game_id = ?').all(rootId) as { game_id: string; fork_week: number }[];
  const members: { id: string; forkWeek: number | null }[] = [{ id: rootId, forkWeek: null }, ...forkRows.map((r) => ({ id: r.game_id, forkWeek: r.fork_week }))];

  const games = members
    .map((m) => {
      try {
        const s = loadState(m.id);
        return {
          gameId: m.id,
          name: s.identity.companyName,
          forkWeek: m.forkWeek,
          status: s.meta.status,
          history: s.history.map((h) => ({
            week: h.week,
            mrr: Math.round(h.values.mrr),
            cash: Math.round(h.values.workingCapital + 0) /* Platzhalter unten ersetzt */,
            boardTrust: Math.round(h.values.boardTrust),
          })),
        };
      } catch {
        return null;
      }
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  // Cash aus Snapshots ziehen (History trägt kein Cash-Feld — Runway/WC schon).
  for (const g of games) {
    const s = loadState(g.gameId);
    // Cash-Verlauf aus Wochenberichten:
    const reports = getReports(g.gameId);
    const cashByWeek = new Map(reports.map((r) => [r.week + 1, Math.round(r.cashFlow.cashEnd)]));
    g.history = g.history.map((h) => ({ ...h, cash: cashByWeek.get(h.week) ?? Math.round(s.finance.cash) }));
  }
  return { games };
}

/** Lern-Journal als Markdown (Phase 4) — automatisch geführt, exportierbar. */
export function journalMarkdown(gameId: string): string {
  const s = loadState(gameId);
  const lines: string[] = [
    `# Lern-Journal — ${s.identity.companyName}`,
    ``,
    `CEO: ${s.playerProfile.ceoName} · Szenario: ${s.meta.scenarioId} · Schwierigkeit: ${s.meta.difficulty} · Seed: ${s.meta.seed}`,
    `Stand: Woche ${s.meta.week} · Status: ${s.meta.status}`,
    ``,
    `## Lektionen aus Bewertungen`,
    ``,
  ];
  for (const ev of s.evaluations) {
    const d = s.decisionLog.find((x) => x.id === ev.decisionId);
    lines.push(`### Woche ${d?.week ?? '?'} → ${ev.week}: ${d?.summaryDe ?? ev.decisionId} (Note ${ev.grade.overall})`);
    lines.push(`- **Lektion:** ${ev.lessonDe}`);
    lines.push(`- **Hypothese:** ${ev.hypothesisReview.verdict} — ${ev.hypothesisReview.commentDe}`);
    for (const p of ev.precedents) lines.push(`- **Präzedenzfall:** ${p.titleDe} — ${p.relevanceDe}`);
    lines.push('');
  }
  lines.push(`## Ereignis-Historie`);
  lines.push('');
  for (const ev of s.openEvents) {
    lines.push(`- W${ev.triggeredWeek}: ${ev.cardId} → ${ev.status}${ev.chosenOptionId ? ` (${ev.chosenOptionId})` : ''}`);
  }
  lines.push('', `## Medienspiegel`, '');
  for (const p of s.pressLog) lines.push(`- W${p.week} [${p.tone}] ${p.topicDe}`);
  lines.push('', '---', '_Automatisch geführt von Boardroom — Simulations-Inhalte, keine echte Beratung._');
  return lines.join('\n');
}

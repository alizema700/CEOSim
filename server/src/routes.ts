import { Router, json } from 'express';
import { z } from 'zod';
import type { GameSetup, PlayerAction } from '@boardroom/shared';
import {
  closeGameWeek,
  createGame,
  decide,
  deleteGame,
  evaluationsWithNarratives,
  exportGame,
  getReports,
  HttpError,
  importGame,
  listGames,
  loadState,
  recordIntent,
  validate,
} from './gameService.js';
import { usageSummary } from './llm.js';
import { appendTurn, getThread, meetingRound, personaReply, resolvePersona } from './personas.js';
import { getDb } from './db.js';

/**
 * REST-API. Alle Eingaben werden mit zod validiert, BEVOR sie die Engine
 * erreichen — die Engine validiert Geschäftsregeln zusätzlich selbst.
 */

const zMoney = z.number().finite();
const zDept = z.enum(['engineering', 'sales', 'marketing', 'cs', 'ga']);
const zSeniority = z.enum(['junior', 'mid', 'senior', 'lead']);

const zAction: z.ZodType<PlayerAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PRICE_CHANGE'), pct: z.number().min(-0.5).max(0.5), applyToExisting: z.boolean() }),
  z.object({ type: z.literal('START_HIRING'), dept: zDept, seniority: zSeniority, count: z.number().int().min(1).max(20) }),
  z.object({ type: z.literal('LAYOFF'), dept: zDept, count: z.number().int().min(1).max(50), generousSeverance: z.boolean() }),
  z.object({ type: z.literal('SET_MARKETING_BUDGET'), monthlyAmount: zMoney.min(0) }),
  z.object({ type: z.literal('SET_RND_ALLOCATION'), features: z.number().min(0).max(1), techDebt: z.number().min(0).max(1), bugfixes: z.number().min(0).max(1) }),
  z.object({ type: z.literal('SET_CS_BUDGET'), monthlyAmount: zMoney.min(0) }),
  z.object({ type: z.literal('ADJUST_SALARIES'), pct: z.number().gt(0).max(0.15) }),
  z.object({ type: z.literal('RAISE_DEBT'), amount: zMoney.gt(0) }),
  z.object({ type: z.literal('REPAY_DEBT'), amount: zMoney.gt(0) }),
  z.object({ type: z.literal('RESPOND_EVENT'), eventInstanceId: z.string(), optionId: z.string() }),
  z.object({ type: z.literal('DELEGATE_MESSAGE'), messageId: z.string(), execRole: z.enum(['cto', 'headOfSales', 'headOfCs', 'cfo']) }),
]);

const zHypothesis = z
  .object({
    textDe: z.string().max(2000),
    expectedMrrDelta4w: z.number().nullable(),
    expectedChurnDeltaPp: z.number().nullable(),
  })
  .nullable();

const zSetup: z.ZodType<GameSetup> = z.object({
  scenarioId: z.enum(['saas-turnaround', 'manufacturing-concentration', 'ecommerce-cash', 'founding', 'distressed']),
  difficulty: z.enum(['praktikant', 'manager', 'ceo', 'aktivist']),
  identity: z.object({
    companyName: z.string().min(2).max(60),
    logoColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    logoEmoji: z.string().min(1).max(8),
    productPitch: z.string().max(500),
    mission: z.string().max(300),
    vision: z.string().max(300),
    values: z.array(z.string().min(2).max(40)).min(1).max(4),
    motto: z.string().min(2).max(120),
    locationId: z.enum(['muenchen', 'berlin', 'zuerich', 'austin']),
  }),
  playerProfile: z.object({
    ceoName: z.string().min(2).max(60),
    strengths: z.array(z.enum(['finanzen', 'vertrieb', 'produkt', 'leadership', 'kommunikation', 'recht'])).max(3),
    weaknesses: z.array(z.enum(['finanzen', 'vertrieb', 'produkt', 'leadership', 'kommunikation', 'recht'])).max(3),
  }),
  seed: z.number().int().optional(),
});

export function buildRouter(): Router {
  const router = Router();
  router.use(json({ limit: '10mb' }));

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ── Spielstände ("Meine Unternehmen") ────────────────────────────
  router.get('/games', (_req, res) => {
    res.json({ games: listGames() });
  });

  router.post('/games', (req, res) => {
    const setup = zSetup.parse(req.body);
    const state = createGame(setup);
    res.status(201).json({ state });
  });

  router.get('/games/:id', (req, res) => {
    const state = loadState(req.params.id);
    res.json({ state, evaluations: evaluationsWithNarratives(req.params.id, state) });
  });

  router.delete('/games/:id', (req, res) => {
    deleteGame(req.params.id);
    res.status(204).end();
  });

  router.get('/games/:id/reports', (req, res) => {
    const fromWeek = req.query.from ? Number(req.query.from) : 0;
    res.json({ reports: getReports(req.params.id, fromWeek) });
  });

  // ── Aktionen & Wochenschluss ─────────────────────────────────────
  router.post('/games/:id/actions/validate', (req, res) => {
    const action = zAction.parse(req.body.action);
    res.json({ validation: validate(req.params.id, action) });
  });

  router.post('/games/:id/actions', (req, res) => {
    const action = zAction.parse(req.body.action);
    const hypothesis = zHypothesis.parse(req.body.hypothesis ?? null);
    const { record, state } = decide(req.params.id, action, hypothesis);
    res.status(201).json({ record, state });
  });

  router.post('/games/:id/close-week', async (req, res) => {
    const { report, evaluations, state } = await closeGameWeek(req.params.id);
    res.json({ report, evaluations, state });
  });

  // ── Export / Import (Spielstände als JSON) ───────────────────────
  router.get('/games/:id/export', (req, res) => {
    const data = exportGame(req.params.id);
    res.setHeader('Content-Disposition', `attachment; filename="boardroom-${req.params.id}.json"`);
    res.json(data);
  });

  router.post('/games/import', (req, res) => {
    const events = z.array(z.any()).min(1).parse(req.body.events);
    const state = importGame(events);
    res.status(201).json({ state });
  });

  // ── Kommunikation (Phase 2) ──────────────────────────────────────
  router.get('/games/:id/messages/status', (req, res) => {
    const rows = getDb().prepare('SELECT message_id, status FROM message_status WHERE game_id = ?').all(req.params.id) as {
      message_id: string;
      status: string;
    }[];
    res.json({ status: Object.fromEntries(rows.map((r) => [r.message_id, r.status])) });
  });

  router.post('/games/:id/messages/:mid/status', (req, res) => {
    const status = z.enum(['read', 'archived', 'inbox']).parse(req.body.status);
    getDb()
      .prepare('INSERT OR REPLACE INTO message_status (game_id, message_id, status) VALUES (?, ?, ?)')
      .run(req.params.id, req.params.mid, status);
    res.json({ ok: true });
  });

  router.get('/games/:id/threads/:key', (req, res) => {
    res.json({ turns: getThread(req.params.id, req.params.key) });
  });

  // Freier Dialog mit einer Persona (Sekretärin, Führungsteam, Mail-Antwort).
  router.post('/games/:id/threads/:key', async (req, res) => {
    const text = z.string().min(1).max(4000).parse(req.body.text);
    const gameId = req.params.id;
    const threadKey = req.params.key;
    const state = loadState(gameId);

    const persona = resolvePersona(state, threadKey) ?? resolveMailPersona(state, threadKey);
    if (!persona) {
      res.status(404).json({ error: 'Unbekannter Gesprächskanal.' });
      return;
    }
    const playerTurn = appendTurn(gameId, threadKey, { author: state.playerProfile.ceoName, authorRole: 'CEO', isPlayer: true, text });
    const reply = await personaReply(state, persona, threadKey, text);
    const replyTurn = appendTurn(gameId, threadKey, { author: persona.name, authorRole: persona.roleDe, isPlayer: false, text: reply.text });
    if (reply.relationshipDelta !== 0 && persona.execId) {
      recordIntent(gameId, {
        kind: 'EXEC_RELATIONSHIP',
        execId: persona.execId,
        delta: reply.relationshipDelta as -2 | -1 | 0 | 1 | 2,
        reasonDe: 'Eindruck aus dem Gespräch mit dem CEO',
      });
    }
    res.json({ turns: [playerTurn, replyTurn], relationshipDelta: reply.relationshipDelta });
  });

  // Meeting-Szene: eine Runde mit mehreren Personas.
  router.post('/games/:id/meetings/:aptId', async (req, res) => {
    const text = z.string().min(1).max(4000).parse(req.body.text);
    const gameId = req.params.id;
    const state = loadState(gameId);
    const threadKey = 'meeting:' + req.params.aptId;
    const playerTurn = appendTurn(gameId, threadKey, { author: state.playerProfile.ceoName, authorRole: 'CEO', isPlayer: true, text });
    const round = await meetingRound(state, req.params.aptId, text);
    const turns = [playerTurn, ...round.map((t) => appendTurn(gameId, threadKey, { author: t.speaker, authorRole: t.roleDe, isPlayer: false, text: t.textDe }))];
    res.json({ turns });
  });

  // ── Einstellungen: Token-Kosten-Dashboard ────────────────────────
  router.get('/settings/llm', (_req, res) => {
    res.json(usageSummary());
  });

  return router;
}

/** Mail-Antwort-Threads (msg:<id>): Gegenseite = Absender der Mail. */
function resolveMailPersona(state: import('@boardroom/shared').CompanyState, threadKey: string) {
  if (!threadKey.startsWith('msg:')) return null;
  const msg = state.comms.messages.find((m) => 'msg:' + m.id === threadKey);
  if (!msg) return null;
  const exec = state.people.executives.find((e) => e.id === msg.from.refId);
  if (exec) return resolvePersona(state, 'dm:' + exec.id);
  if (msg.from.refId === state.people.assistant.id) return resolvePersona(state, 'dm:assistant');
  return {
    name: msg.from.name,
    roleDe: msg.from.roleDe + (msg.from.company ? ` · ${msg.from.company}` : ''),
    execId: null,
    systemDe: `Du spielst „${msg.from.name}“ (${msg.from.roleDe}${msg.from.company ? ', ' + msg.from.company : ''}) in einem CEO-Trainings-Simulator. Kontext eurer Konversation ist diese Nachricht an den CEO: „${msg.subjectDe} — ${msg.bodyDe.slice(0, 500)}“. Bleib in der Rolle, antworte kurz und realistisch auf Deutsch. Erfinde keine Zahlen über die Firma des CEO. Du kannst Forderungen stellen, verhandeln oder dich beschweren — aber Vertragliches entscheidet die Simulation, nicht dieses Gespräch.`,
    fallbackDe: 'Danke für die schnelle Rückmeldung. Wir melden uns kommende Woche mit Details. (Offline-Modus: Für lebendige Antworten ANTHROPIC_API_KEY hinterlegen.)',
  };
}

export function errorHandler(err: unknown, _req: import('express').Request, res: import('express').Response, _next: import('express').NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Ungültige Eingabe.', details: err.issues });
    return;
  }
  if (err instanceof Error && err.message.startsWith('Aktion ungültig')) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof Error && err.message.includes('INVARIANTEN-VERLETZUNG')) {
    // Harter Engine-Fehler: vollständig ausgeben, nichts verschleiern.
    console.error(err);
    res.status(500).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Interner Fehler.' });
}

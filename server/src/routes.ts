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
  validate,
} from './gameService.js';
import { usageSummary } from './llm.js';

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

  // ── Einstellungen: Token-Kosten-Dashboard ────────────────────────
  router.get('/settings/llm', (_req, res) => {
    res.json(usageSummary());
  });

  return router;
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

import { Router, json } from 'express';
import { z } from 'zod';
import { generateTermSheets, IPO_BANKS, ipoEligibility, subscriptionRatioFor, type CompanyState, type GameSetup, type PlayerAction } from '@boardroom/shared';
import {
  closeGameWeek,
  compareFamily,
  createGame,
  decide,
  deleteGame,
  evaluationsWithNarratives,
  exportGame,
  forkGame,
  getReports,
  HttpError,
  importGame,
  journalMarkdown,
  listGames,
  loadState,
  recordIntent,
  validate,
} from './gameService.js';
import { generateConsultantReport, listConsultantReports, saveConsultantReport } from './consultantService.js';
import { usageSummary } from './llm.js';
import { appendTurn, getThread, meetingRound, personaReply, resolvePersona } from './personas.js';
import { classifyIdea, classifyPress, listPressReleases, savePressRelease } from './pressService.js';
import { getDb } from './db.js';
import { getLogo, quarterlyReportPdf, saveLogo } from './pdf.js';

/**
 * REST-API. Alle Eingaben werden mit zod validiert, BEVOR sie die Engine
 * erreichen — die Engine validiert Geschäftsregeln zusätzlich selbst.
 */

const zMoney = z.number().finite();
const zDept = z.enum(['engineering', 'sales', 'marketing', 'cs', 'ga']);
const zSeniority = z.enum(['werkstudent', 'junior', 'mid', 'senior', 'lead']);

const zAction: z.ZodType<PlayerAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PRICE_CHANGE'), pct: z.number().min(-0.5).max(0.5), applyToExisting: z.boolean() }),
  z.object({ type: z.literal('START_HIRING'), dept: zDept, seniority: zSeniority, count: z.number().int().min(1).max(20), specialistRoleDe: z.string().min(3).max(40).optional() }),
  z.object({ type: z.literal('LAYOFF'), dept: zDept, count: z.number().int().min(1).max(50), generousSeverance: z.boolean() }),
  z.object({ type: z.literal('SET_MARKETING_BUDGET'), monthlyAmount: zMoney.min(0) }),
  z.object({ type: z.literal('SET_RND_ALLOCATION'), features: z.number().min(0).max(1), techDebt: z.number().min(0).max(1), bugfixes: z.number().min(0).max(1) }),
  z.object({ type: z.literal('SET_CS_BUDGET'), monthlyAmount: zMoney.min(0) }),
  z.object({ type: z.literal('ADJUST_SALARIES'), pct: z.number().gt(0).max(0.15) }),
  z.object({ type: z.literal('RAISE_DEBT'), amount: zMoney.gt(0) }),
  z.object({ type: z.literal('REPAY_DEBT'), amount: zMoney.gt(0) }),
  z.object({ type: z.literal('RESPOND_EVENT'), eventInstanceId: z.string(), optionId: z.string() }),
  z.object({ type: z.literal('DELEGATE_MESSAGE'), messageId: z.string(), execRole: z.enum(['cto', 'headOfSales', 'headOfCs', 'cfo']) }),
  z.object({ type: z.literal('HIRE_CONSULTANT'), topic: z.enum(['churn', 'pricing', 'market', 'costs']) }),
  z.object({
    type: z.literal('START_PROJECT'),
    classification: z.object({
      titleDe: z.string().min(3).max(80),
      categoryDe: z.string().min(2).max(30),
      costOneOff: z.number().min(0).max(500_000),
      costMonthly: z.number().min(0).max(100_000),
      durationWeeks: z.number().min(1).max(26),
      successProb: z.number().min(0.05).max(0.95),
      rationaleDe: z.string().max(1200),
      riskDe: z.string().max(600),
      comparablesDe: z.array(z.string().max(300)).max(3),
      effects: z.object({
        leadGenFactor: z.number().min(1).max(1.3).optional(),
        churnFactor: z.number().min(0.85).max(1).optional(),
        moraleDelta: z.number().min(-5).max(8).optional(),
        pressDelta: z.number().min(-3).max(6).optional(),
        npsDelta: z.number().min(-5).max(8).optional(),
      }),
    }),
  }),
  // Phase 5: Fundraising & M&A. Das Term Sheet wird engine-seitig zusätzlich
  // gegen die deterministische Regenerierung validiert (Manipulationsschutz).
  z.object({
    type: z.literal('ACCEPT_TERM_SHEET'),
    offer: z.object({
      id: z.string(),
      investorName: z.string().max(80),
      investorStyleDe: z.string().max(300),
      amount: z.number().positive(),
      preMoney: z.number().positive(),
      liquidationPref: z.enum(['1x', '1x-participating']),
      boardSeat: z.boolean(),
      esopTopUp: z.number().min(0).max(0.2),
      validWeek: z.number().int().min(0),
      noteDe: z.string().max(600),
    }),
  }),
  z.object({ type: z.literal('RAISE_VENTURE_DEBT'), amount: zMoney.gt(0) }),
  z.object({ type: z.literal('MA_DUE_DILIGENCE'), targetId: z.string() }),
  z.object({ type: z.literal('MA_ACQUIRE'), targetId: z.string() }),
  // Phase 6: IPO
  z.object({ type: z.literal('IPO_SELECT_BANK'), bankId: z.string() }),
  z.object({ type: z.literal('IPO_PRICE'), pricePerShare: z.number().positive().max(10_000) }),
  // Phase 7: Menschen & Termine
  z.object({ type: z.literal('ADJUST_EMPLOYEE_SALARY'), employeeId: z.string(), pct: z.number().min(0.01).max(0.25) }),
  z.object({ type: z.literal('SET_CEO_SALARY'), monthlyAmount: z.number().min(8_000).max(45_000) }),
  z.object({
    type: z.literal('CREATE_APPOINTMENT'),
    titleDe: z.string().min(3).max(80),
    week: z.number().int().min(0),
    weekday: z.number().int().min(0).max(4),
    agendaDe: z.array(z.string().max(120)).max(5),
  }),
  z.object({ type: z.literal('SET_TARIF_BINDING'), status: z.enum(['none', 'verband', 'haustarif']) }),
  z.object({ type: z.literal('NEGOTIATE_TARIF'), offerPct: z.number().min(0).max(0.15) }),
  z.object({ type: z.literal('CONVERT_LEGAL_FORM'), toForm: z.enum(['UG', 'GmbH', 'AG', 'LLC', 'Inc', 'Ltd', 'PLC']) }),
  z.object({ type: z.literal('CAPITAL_INCREASE'), targetNennkapital: zMoney.gt(0) }),
  z.object({ type: z.literal('HOLD_SHAREHOLDER_MEETING') }),
  z.object({ type: z.literal('DISTRIBUTE_DIVIDEND'), amount: zMoney.gt(0) }),
  z.object({ type: z.literal('GRANT_OPTIONS'), employeeId: z.string(), percent: z.number().min(0.0005).max(0.02) }),
  z.object({
    type: z.literal('SET_CEO_FOCUS'),
    focus: z.object({
      produkt: z.number().int().min(0).max(5),
      vertrieb: z.number().int().min(0).max(5),
      team: z.number().int().min(0).max(5),
      investoren: z.number().int().min(0).max(5),
      aussenwirkung: z.number().int().min(0).max(5),
    }),
  }),
  z.object({ type: z.literal('CEO_REST') }),
  z.object({ type: z.literal('CEO_PUBLIC_APPEARANCE'), kind: z.enum(['interview', 'keynote', 'thought-leadership']) }),
  z.object({ type: z.literal('HIRE_COACH'), skill: z.enum(['finanzen', 'strategie', 'leadership', 'kommunikation', 'krisenmanagement', 'governance']) }),
  z.object({ type: z.literal('STEP_DOWN') }),
  z.object({ type: z.literal('TAKEOVER_RESPOND'), mode: z.enum(['accept', 'negotiate', 'poison_pill', 'rally']) }),
  z.object({ type: z.literal('CRISIS_RESPOND'), mode: z.enum(['apologize', 'defend', 'silent', 'investigate']) }),
  z.object({ type: z.literal('HOLD_BOARD_MEETING'), approach: z.enum(['data', 'vision', 'listen']) }),
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
    locationId: z.string().min(2).max(40),
    location: z
      .object({
        id: z.string().max(60),
        nameDe: z.string().min(2).max(40),
        country: z.string().max(40),
        payrollIndex: z.number().min(0.3).max(1.6),
        talentPool: z.number().min(0.4).max(1),
        taxRate: z.number().min(0.1).max(0.4),
        regulationDensity: z.enum(['low', 'medium', 'high']),
        officeCostPerEmployeeMonthly: z.number().min(150).max(2000),
      })
      .optional(),
  }),
  playerProfile: z.object({
    ceoName: z.string().min(2).max(60),
    strengths: z.array(z.enum(['finanzen', 'vertrieb', 'produkt', 'leadership', 'kommunikation', 'recht'])).max(3),
    weaknesses: z.array(z.enum(['finanzen', 'vertrieb', 'produkt', 'leadership', 'kommunikation', 'recht'])).max(3),
  }),
  seed: z.number().int().optional(),
});

/**
 * Didaktik-Schutz (Phase 5): Versteckte Red Flags von M&A-Zielen verlassen
 * den Server erst nach Due Diligence (oder nach dem Kauf — dann als
 * „das hast du dir eingekauft"-Feedback). Der Original-State bleibt unberührt.
 */
function toClientState(state: CompanyState): CompanyState {
  if (state.market.maTargets.every((t) => t.ddDone || t.status !== 'available' || t.redFlags.length === 0)) {
    return state;
  }
  return {
    ...state,
    market: {
      ...state.market,
      maTargets: state.market.maTargets.map((t) => (t.ddDone || t.status !== 'available' ? t : { ...t, redFlags: [] })),
    },
  };
}

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
    res.status(201).json({ state: toClientState(state) });
  });

  router.get('/games/:id', (req, res) => {
    const state = loadState(req.params.id);
    res.json({ state: toClientState(state), evaluations: evaluationsWithNarratives(req.params.id, state) });
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

  router.post('/games/:id/actions', async (req, res) => {
    const action = zAction.parse(req.body.action);
    const hypothesis = zHypothesis.parse(req.body.hypothesis ?? null);
    const { record, state } = decide(req.params.id, action, hypothesis);
    // Berater-Engagement: Report direkt erzeugen (Erzählschicht, DB-only).
    if (action.type === 'HIRE_CONSULTANT') {
      const report = await generateConsultantReport(state, action.topic);
      saveConsultantReport(req.params.id, report);
      res.status(201).json({ record, state: toClientState(state), consultantReport: report });
      return;
    }
    res.status(201).json({ record, state: toClientState(state) });
  });

  router.post('/games/:id/close-week', async (req, res) => {
    const { report, evaluations, state } = await closeGameWeek(req.params.id);
    res.json({ report, evaluations, state: toClientState(state) });
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
    res.status(201).json({ state: toClientState(state) });
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
    // Anwalts-Chat: jede Runde kostet Honorar (lehrt, Anwaltszeit gezielt einzusetzen).
    let billedEur = 0;
    if (threadKey === 'legal') {
      billedEur = 450;
      recordIntent(gameId, { kind: 'LEGAL_BILLING', amount: billedEur, topicDe: text.slice(0, 60) });
    }
    res.json({ turns: [playerTurn, replyTurn], relationshipDelta: reply.relationshipDelta, billedEur });
  });

  // Meeting-Szene: eine Runde mit mehreren Personas (Board-Runden bewegen Vertrauen).
  router.post('/games/:id/meetings/:aptId', async (req, res) => {
    const text = z.string().min(1).max(4000).parse(req.body.text);
    const gameId = req.params.id;
    const state = loadState(gameId);
    const threadKey = 'meeting:' + req.params.aptId;
    const playerTurn = appendTurn(gameId, threadKey, { author: state.playerProfile.ceoName, authorRole: 'CEO', isPlayer: true, text });
    const round = await meetingRound(state, req.params.aptId, text);
    const turns = [playerTurn, ...round.turns.map((t) => appendTurn(gameId, threadKey, { author: t.speaker, authorRole: t.roleDe, isPlayer: false, text: t.textDe }))];
    if (round.boardTrustDelta !== 0) {
      recordIntent(gameId, { kind: 'BOARD_TRUST', delta: round.boardTrustDelta, reasonDe: round.trustReasonDe ?? 'Eindruck aus dem Board-Meeting' });
    }
    res.json({ turns, boardTrustDelta: round.boardTrustDelta });
  });

  // ── Presse-Modul (Phase 3) ───────────────────────────────────────
  router.post('/games/:id/press', async (req, res) => {
    const { titleDe, bodyDe } = z.object({ titleDe: z.string().min(3).max(140), bodyDe: z.string().min(20).max(4000) }).parse(req.body);
    const gameId = req.params.id;
    const state = loadState(gameId);
    if (state.meta.status !== 'active') throw new HttpError(409, 'Das Spiel ist beendet.');
    const outcome = await classifyPress(state, titleDe, bodyDe);
    savePressRelease(gameId, state.meta.week, titleDe, bodyDe, outcome);
    const newState = recordIntent(gameId, {
      kind: 'PRESS_RELEASE_OUTCOME',
      titleDe,
      pressDelta: outcome.pressDelta,
      leadFactor: outcome.leadFactor,
      scandalProb: outcome.scandalProb,
      scandalTopicDe: outcome.scandalTopicDe,
    });
    res.status(201).json({ outcome, state: toClientState(newState) });
  });

  router.get('/games/:id/press', (req, res) => {
    res.json({ releases: listPressReleases(req.params.id) });
  });

  // ── Ideen-System (Phase 3): klassifizieren — Start läuft über /actions ──
  router.post('/games/:id/ideas', async (req, res) => {
    const text = z.string().min(5).max(2000).parse(req.body.text);
    const state = loadState(req.params.id);
    const classification = await classifyIdea(state, text);
    res.json({ classification });
  });

  // ── Phase 5: Fundraising ─────────────────────────────────────────
  // Term Sheets sind deterministisch (Seed + Woche + State) — kein POST nötig,
  // Annahme läuft als ACCEPT_TERM_SHEET über /actions.
  router.get('/games/:id/funding/offers', (req, res) => {
    const state = loadState(req.params.id);
    res.json({ offers: generateTermSheets(state), week: state.meta.week });
  });

  // ── Phase 6: IPO, Logo, PDF-Quartalsbericht ──────────────────────
  router.get('/games/:id/ipo', (req, res) => {
    const state = loadState(req.params.id);
    const price = req.query.price ? Number(req.query.price) : null;
    res.json({
      eligibility: ipoEligibility(state),
      banks: IPO_BANKS,
      // Live-Vorschau der Zeichnungsquote für den Pricing-Schieberegler:
      subscriptionPreview:
        state.ipo.status === 'roadshow' && price && Number.isFinite(price) && price > 0 ? subscriptionRatioFor(state, price) : null,
    });
  });

  router.get('/games/:id/logo', (req, res) => {
    res.json({ dataUrl: getLogo(req.params.id) });
  });

  router.post('/games/:id/logo', (req, res) => {
    const dataUrl = z
      .string()
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
      .max(400_000, 'Logo max. ~300 KB.')
      .parse(req.body.dataUrl);
    loadState(req.params.id); // 404, falls es das Spiel nicht gibt
    saveLogo(req.params.id, dataUrl);
    res.status(201).json({ ok: true });
  });

  router.get('/games/:id/report.pdf', async (req, res) => {
    const state = loadState(req.params.id);
    const pdf = await quarterlyReportPdf(state);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="quartalsbericht-${state.identity.companyName.replace(/[^\w-]+/g, '_')}-W${state.meta.week}.pdf"`);
    res.send(pdf);
  });

  // ── Phase 4: Berater, Fork-Labor, Journal ────────────────────────
  router.get('/games/:id/consultant', (req, res) => {
    res.json({ reports: listConsultantReports(req.params.id) });
  });

  router.post('/games/:id/fork', (req, res) => {
    const atWeek = z.number().int().min(0).parse(req.body.atWeek);
    const state = forkGame(req.params.id, atWeek);
    res.status(201).json({ state: toClientState(state) });
  });

  router.get('/games/:id/compare', (req, res) => {
    res.json(compareFamily(req.params.id));
  });

  router.get('/games/:id/journal.md', (req, res) => {
    const md = journalMarkdown(req.params.id);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lernjournal-${req.params.id}.md"`);
    res.send(md);
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
    fallbackDe: 'Danke für die schnelle Rückmeldung. Wir melden uns kommende Woche mit Details. (Offline-Modus: Für lebendige Antworten einen API-Key (OpenAI/Anthropic) in server/.env hinterlegen.)',
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

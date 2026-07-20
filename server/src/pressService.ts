import { z } from 'zod';
import { clampClassification, fallbackClassification, type CompanyState, type IdeaClassification } from '@boardroom/shared';
import { llmJson } from './llm.js';
import { stateBriefDe } from './personas.js';
import { getDb } from './db.js';

/**
 * Presse-Modul (Phase 3): Jede Pressemitteilung wird vom „Medien-Modul"
 * bewertet — Ton, Glaubwürdigkeit und WAHRHEITSGEHALT gegen das Lagebild.
 * Übertriebene Claims fliegen später auf (Skandal-Risiko). Alle Wirkungen
 * sind gedeckelt und laufen als protokollierter Intent durch die Engine.
 */

const zPressOutcome = z.object({
  pressDelta: z.number().min(-6).max(6),
  leadFactor: z.number().min(1.0).max(1.15),
  scandalProb: z.number().min(0).max(0.5),
  scandalTopicDe: z.string().max(160),
  articleDe: z.string().min(40).max(2200),
  verdictDe: z.string().min(10).max(500),
});
export type PressOutcome = z.infer<typeof zPressOutcome>;

export async function classifyPress(state: CompanyState, titleDe: string, bodyDe: string): Promise<PressOutcome> {
  const system = `Du bist das Medien-Modul eines CEO-Trainings-Simulators: Du spielst die versammelte Fach- und Wirtschaftspresse. Du bekommst eine Pressemitteilung und das WAHRE Lagebild der Firma. Bewerte: (1) Nachrichtenwert & Ton, (2) Glaubwürdigkeit, (3) WAHRHEITSGEHALT — Claims, die dem Lagebild widersprechen oder stark übertreiben, erhöhen scandalProb (0–0.5). Schreibe dazu einen kurzen simulierten Presseartikel (wohlwollend bis vernichtend, realistisch, mit erfundenem Mediennamen wie „Digitalwirtschaft heute“). pressDelta: −6 (vernichtend) bis +6 (starkes Echo). leadFactor 1.0–1.15 nur bei echtem Nachrichtenwert.`;
  const user = [
    '=== WAHRES LAGEBILD ===',
    stateBriefDe(state),
    '=== PRESSEMITTEILUNG DES CEO ===',
    `Titel: ${titleDe}`,
    bodyDe,
    '',
    'Antworte als JSON: {"pressDelta": n, "leadFactor": n, "scandalProb": n, "scandalTopicDe": "...", "articleDe": "...", "verdictDe": "kurze Begründung der Bewertung"}',
  ].join('\n');

  const res = await llmJson('press-release', system, user, zPressOutcome, 1400);
  if (res) return res;

  // Regelbasierter Fallback: Superlative ohne Substanz = Risiko.
  const t = (titleDe + ' ' + bodyDe).toLowerCase();
  const hype = ['revolutionär', 'weltweit führend', 'nummer 1', 'bahnbrechend', 'einzigartig', 'disruptiv'].filter((w) => t.includes(w)).length;
  const sober = bodyDe.length > 300 && hype === 0;
  return {
    pressDelta: sober ? 2 : hype >= 2 ? -1 : 1,
    leadFactor: sober ? 1.04 : 1.0,
    scandalProb: hype >= 2 ? 0.25 : 0,
    scandalTopicDe: hype >= 2 ? 'PR-Superlative halten der Nachprüfung nicht stand' : '',
    articleDe: `(Regelbasiertes Medienecho) Die Mitteilung „${titleDe}“ wurde von der Fachpresse ${sober ? 'sachlich aufgegriffen' : hype >= 2 ? 'als Marketing-Getöse eingeordnet' : 'kurz vermeldet'}. Für lebendige Artikel einen API-Key (OpenAI/Anthropic) hinterlegen.`,
    verdictDe: sober ? 'Sachlich, konkret, glaubwürdig — solide Arbeit.' : hype >= 2 ? `${hype} Superlative ohne Belege — die Presse ist nicht euer Werbeblock.` : 'Okay, aber ohne echten Nachrichtenwert.',
  };
}

export function savePressRelease(gameId: string, week: number, titleDe: string, bodyDe: string, outcome: PressOutcome): void {
  getDb()
    .prepare('INSERT INTO press_releases (game_id, week, title, body, article, verdict, press_delta, at_iso) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(gameId, week, titleDe, bodyDe, outcome.articleDe, outcome.verdictDe, Math.round(outcome.pressDelta), new Date().toISOString());
}

export function listPressReleases(gameId: string): { week: number; title: string; body: string; article: string; verdict: string; pressDelta: number }[] {
  const rows = getDb()
    .prepare('SELECT week, title, body, article, verdict, press_delta FROM press_releases WHERE game_id = ? ORDER BY id DESC')
    .all(gameId) as { week: number; title: string; body: string; article: string; verdict: string; press_delta: number }[];
  return rows.map((r) => ({ week: r.week, title: r.title, body: r.body, article: r.article, verdict: r.verdict, pressDelta: r.press_delta }));
}

// ── Ideen-Klassifikation (Phase 3) ───────────────────────────────────
const zIdea = z.object({
  titleDe: z.string().min(3).max(80),
  categoryDe: z.string().min(2).max(30),
  costOneOff: z.number().min(0).max(500_000),
  costMonthly: z.number().min(0).max(100_000),
  durationWeeks: z.number().min(1).max(26),
  successProb: z.number().min(0.05).max(0.95),
  rationaleDe: z.string().min(10).max(1200),
  riskDe: z.string().min(5).max(600),
  comparablesDe: z.array(z.string().max(300)).max(3),
  effects: z.object({
    leadGenFactor: z.number().min(1).max(1.3).optional(),
    churnFactor: z.number().min(0.85).max(1).optional(),
    moraleDelta: z.number().min(-5).max(8).optional(),
    pressDelta: z.number().min(-3).max(6).optional(),
    npsDelta: z.number().min(-5).max(8).optional(),
  }),
});

export async function classifyIdea(state: CompanyState, ideaText: string): Promise<IdeaClassification> {
  const system = `Du bist der Klassifikator des Ideen-Systems in einem CEO-Trainings-Simulator. Der CEO bringt eine FREIE Idee ein; du übersetzt sie in eine strukturierte, VORSICHTIG geschätzte Projekt-Klassifikation. Regeln: realistische Kosten für ein ~30-Personen-SaaS (EUR), Erfolgswahrscheinlichkeit ehrlich kalibrieren (Basisraten! die meisten Experimente liegen bei 0.3–0.65), Wirkungen NUR über die erlaubten gedeckelten Felder, 1–3 echte Vergleichsfälle aus der Unternehmensgeschichte als Kurztext. Keine Wunder: leadGenFactor ≤ 1.3, churnFactor ≥ 0.85.`;
  const user = [
    '=== LAGEBILD ===',
    stateBriefDe(state),
    '=== IDEE DES CEO ===',
    ideaText,
    '',
    'Antworte als JSON gemäß: {"titleDe","categoryDe","costOneOff","costMonthly","durationWeeks","successProb","rationaleDe","riskDe","comparablesDe":[],"effects":{"leadGenFactor"?,"churnFactor"?,"moraleDelta"?,"pressDelta"?,"npsDelta"?}}',
  ].join('\n');

  const res = await llmJson('idea-classify', system, user, zIdea, 1200);
  return clampClassification(res ?? fallbackClassification(ideaText));
}

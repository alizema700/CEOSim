import { clamp } from '../types/common.js';
import type { GameStatus } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import { computeKpis } from './kpis.js';
import { ceoNetWorth } from './ceo.js';
import { esopAllocated } from './equity.js';

/**
 * Amtszeit-Bilanz / Legacy (Phase 13). Bewertet die GESAMTE Amtszeit
 * deterministisch über sechs Dimensionen — als Endabrechnung UND als
 * Live-Vorschau. Reine Ableitung aus dem State: keine Mutation, kein RNG,
 * Golden-Master-sicher.
 */

export interface LegacyDimension {
  key: string;
  labelDe: string;
  score: number; // 0..100
  noteDe: string;
}
export interface LegacyMilestone { week: number; labelDe: string }
export interface LegacyArcRow { labelDe: string; startDe: string; endDe: string; better: boolean }

export interface LegacyReport {
  status: GameStatus;
  weeks: number;
  overall: number; // 0..100
  grade: number; // 1 (beste) .. 6
  titleDe: string;
  endingDe: string;
  verdictDe: string[];
  dimensions: LegacyDimension[];
  milestones: LegacyMilestone[];
  arc: LegacyArcRow[];
  personal: { netWorth: number; brand: number; energy: number };
}

const eur = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} M€` : `${Math.round(v / 1000).toLocaleString('de-DE')} k€`);
const pct1 = (v: number) => `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;

export function computeLegacy(state: CompanyState): LegacyReport {
  const now = computeKpis(state).values;
  const start = state.history[0]?.values ?? now;
  const weeks = state.meta.week;
  const status = state.meta.status;

  // ── Dimensionen (je 0..100) ──────────────────────────────────────────
  const mrrRatio = now.mrr / Math.max(1, start.mrr);
  const dCompany = clamp(45 + (mrrRatio - 1) * 70 + clamp(now.ebitdaMarginPct, -0.4, 0.4) * 60, 0, 100);
  const dCompanyNote = mrrRatio >= 1.5 ? 'die Firma ist unter dir deutlich gewachsen' : mrrRatio >= 1.05 ? 'solides Wachstum des Umsatzmotors' : mrrRatio >= 0.9 ? 'der Umsatz stagnierte' : 'der Umsatz schrumpfte in deiner Zeit';

  const survived = status !== 'insolvent' && status !== 'convicted';
  const dCapital = survived ? clamp(30 + Math.min(now.runwayWeeks, 104) / 104 * 50 + (now.ebitdaMonthly > 0 ? 20 : 0), 0, 100) : 8;
  const dCapitalNote = !survived ? 'die Kasse lief leer — der schwerste aller Fehler' : now.ebitdaMonthly > 0 ? 'profitabel und mit Puffer geführt' : now.runwayWeeks > 40 ? 'komfortabler Runway gehalten' : 'am Liquiditätslimit balanciert';

  const custRatio = now.customers / Math.max(1, start.customers);
  const dCustomers = clamp(42 + (custRatio - 1) * 40 + (now.nrr - 1) * 120 - (now.logoChurnMonthly - 0.02) * 600, 0, 100);
  const dCustomersNote = now.logoChurnMonthly < 0.025 && now.nrr >= 1 ? 'Churn gebändigt, Bestand wächst aus sich heraus' : now.logoChurnMonthly > 0.04 ? 'der Churn blieb ein offenes Leck' : 'ordentliche, aber nicht herausragende Kundenbindung';

  const laborPeace = 100 - state.labor.tension;
  const sat = now.avgSatisfaction;
  const dPeople = clamp(sat * 0.5 + laborPeace * 0.4 + (esopAllocated(state) > 0.02 ? 6 : 0) + (state.labor.tarifStatus !== 'none' ? 4 : 0), 0, 100);
  const dPeopleNote = sat >= 62 && laborPeace >= 60 ? 'ein Haus mit Betriebsfrieden und Motivation' : sat < 48 ? 'die Belegschaft blieb unzufrieden' : state.labor.tension > 55 ? 'ungelöste Arbeitskonflikte belasteten die Kultur' : 'durchwachsenes Betriebsklima';

  const evals = state.evaluations;
  const avgGrade = evals.length ? evals.reduce((s, e) => s + e.grade.overall, 0) / evals.length : 3.2;
  const gradeScore = (6 - avgGrade) / 5 * 100; // Note 1→100, 6→0
  const avgValues = evals.length ? evals.reduce((s, e) => s + e.grade.criteria.werteKonsistenz, 0) / evals.length : 60;
  let dGovernance = clamp(now.boardTrust * 0.4 + gradeScore * 0.35 + avgValues * 0.25, 0, 100);
  if (status === 'fired') dGovernance = Math.min(dGovernance, 22);
  const dGovernanceNote = status === 'fired' ? 'das Board entzog dir das Vertrauen' : now.boardTrust >= 65 && avgValues >= 65 ? 'sauber und mit Rückhalt des Gremiums geführt' : avgValues < 45 ? 'Werte gerieten unter die Räder der Zahlen' : 'handwerklich in Ordnung, ohne zu glänzen';

  const nw = ceoNetWorth(state);
  const nwScore = clamp(20 + Math.log10(Math.max(1, nw.total) / 100_000) * 30, 0, 100);
  const avgSkills = Object.values(state.ceo.skills).reduce((s, v) => s + v, 0) / 6;
  const skillScore = clamp((avgSkills - 20) / 60 * 100, 0, 100);
  const dPersonal = clamp(nwScore * 0.45 + state.ceo.reputation * 0.3 + skillScore * 0.25, 0, 100);
  const dPersonalNote = nw.total >= 5_000_000 ? 'persönlich zur vermögenden Unternehmer:in geworden' : state.ceo.reputation >= 60 ? 'eine anerkannte CEO-Marke aufgebaut' : 'als Führungskraft gereift, wenn auch (noch) nicht reich';

  const dimensions: LegacyDimension[] = [
    { key: 'company', labelDe: 'Unternehmenswert', score: Math.round(dCompany), noteDe: dCompanyNote },
    { key: 'capital', labelDe: 'Kapitaleffizienz & Überleben', score: Math.round(dCapital), noteDe: dCapitalNote },
    { key: 'customers', labelDe: 'Kunden & Wachstum', score: Math.round(dCustomers), noteDe: dCustomersNote },
    { key: 'people', labelDe: 'Menschen & Kultur', score: Math.round(dPeople), noteDe: dPeopleNote },
    { key: 'governance', labelDe: 'Governance & Ethik', score: Math.round(dGovernance), noteDe: dGovernanceNote },
    { key: 'personal', labelDe: 'Persönliches Erbe', score: Math.round(dPersonal), noteDe: dPersonalNote },
  ];

  const weights: Record<string, number> = { company: 0.22, capital: 0.16, customers: 0.18, people: 0.16, governance: 0.16, personal: 0.12 };
  let overall = dimensions.reduce((s, d) => s + d.score * weights[d.key]!, 0);
  if (status === 'insolvent') overall = Math.min(overall, 28);
  if (status === 'convicted') overall = Math.min(overall, 18);
  if (status === 'fired') overall = Math.min(overall, 40);
  overall = Math.round(overall);
  const grade = overall >= 85 ? 1 : overall >= 70 ? 2 : overall >= 55 ? 3 : overall >= 42 ? 4 : overall >= 30 ? 5 : 6;

  const titleDe = legacyTitle(state, overall);
  const endingDe = state.meta.endReasonDe ?? (status === 'active' ? `Amtszeit läuft — Vorschau nach ${weeks} Wochen.` : '');

  // ── Urteil ───────────────────────────────────────────────────────────
  const sorted = [...dimensions].sort((a, b) => b.score - a.score);
  const best = sorted[0]!;
  const worst = sorted[sorted.length - 1]!;
  const verdictDe = [
    `Nach ${weeks} Wochen an der Spitze: ${overall}/100 — Note ${grade}.`,
    `Deine Stärke war „${best.labelDe}" (${best.score}) — ${best.noteDe}.`,
    `Dein Schatten war „${worst.labelDe}" (${worst.score}) — ${worst.noteDe}.`,
    legacyClosingLine(status, grade),
  ];

  // ── Meilensteine ─────────────────────────────────────────────────────
  const milestones: LegacyMilestone[] = [];
  for (const r of state.funding.rounds) milestones.push({ week: r.week, labelDe: `Finanzierungsrunde: ${r.investorName}, ${eur(r.amount)} @ ${eur(r.postMoney)} post` });
  for (const h of state.legal.formHistory) milestones.push({ week: h.week, labelDe: `Formwechsel: ${h.from} → ${h.to}` });
  if (state.ipo.listedWeek !== null && state.ipo.offerPrice !== null) milestones.push({ week: state.ipo.listedWeek, labelDe: `Börsengang zu ${state.ipo.offerPrice.toFixed(2)} €/Aktie` });
  for (const d of state.legal.dividends) milestones.push({ week: d.week, labelDe: `Gewinnausschüttung ${eur(d.amount)}` });
  if (state.labor.worksCouncilSinceWeek !== null) milestones.push({ week: state.labor.worksCouncilSinceWeek, labelDe: 'Betriebsrat gewählt (Mitbestimmung)' });
  for (const r of state.labor.rounds) milestones.push({ week: r.week, labelDe: `Tarifabschluss +${(r.agreedPct * 100).toFixed(1)} %${r.viaStrike ? ' (nach Streik)' : ''}` });
  milestones.sort((a, b) => a.week - b.week);

  // ── Arc: Start vs. Ende ──────────────────────────────────────────────
  const arc: LegacyArcRow[] = [
    { labelDe: 'MRR', startDe: eur(start.mrr), endDe: eur(now.mrr), better: now.mrr >= start.mrr },
    { labelDe: 'Kunden', startDe: Math.round(start.customers).toLocaleString('de-DE'), endDe: Math.round(now.customers).toLocaleString('de-DE'), better: now.customers >= start.customers },
    { labelDe: 'Logo-Churn/M', startDe: pct1(start.logoChurnMonthly), endDe: pct1(now.logoChurnMonthly), better: now.logoChurnMonthly <= start.logoChurnMonthly },
    { labelDe: 'Board-Vertrauen', startDe: `${Math.round(start.boardTrust)}`, endDe: `${Math.round(now.boardTrust)}`, better: now.boardTrust >= start.boardTrust },
    { labelDe: 'Ø-Zufriedenheit', startDe: `${Math.round(start.avgSatisfaction)}`, endDe: `${Math.round(now.avgSatisfaction)}`, better: now.avgSatisfaction >= start.avgSatisfaction },
    { labelDe: 'Bewertung', startDe: eur(start.valuation), endDe: eur(now.valuation), better: now.valuation >= start.valuation },
  ];

  return {
    status, weeks, overall, grade, titleDe, endingDe, verdictDe, dimensions, milestones, arc,
    personal: { netWorth: nw.total, brand: state.ceo.reputation, energy: state.ceo.energy },
  };
}

function legacyTitle(state: CompanyState, overall: number): string {
  const s = state.meta.status;
  const listed = state.ipo.status === 'public';
  if (s === 'insolvent') return 'Der Absturz — Insolvenz';
  if (s === 'convicted') return 'Der Fall — in Handschellen aus dem Amt';
  if (s === 'fired') return 'Abberufen — das Vertrauen verspielt';
  if (s === 'exited') return overall >= 70 ? 'Der Exit-Stratege' : 'Notverkauf unter Wert';
  const base = overall >= 88 ? 'Legende an der Spitze' : overall >= 75 ? 'Baumeister:in eines Champions' : overall >= 60 ? 'Solide Amtszeit' : overall >= 45 ? 'Durchwachsene Bilanz' : 'Schwere Jahre';
  return listed ? `Börsennotiert · ${base}` : base;
}

function legacyClosingLine(status: GameStatus, grade: number): string {
  if (status === 'insolvent') return 'Lektion: Cash ist Sauerstoff. Alles andere ist erst danach wichtig.';
  if (status === 'convicted') return 'Lektion: Es gibt Abkürzungen, die direkt in die Zelle führen. Steuern sind keine Verhandlungsmasse.';
  if (status === 'fired') return 'Lektion: Ein Board führt man nicht mit Ergebnissen allein, sondern mit Vertrauen und Kommunikation.';
  if (grade <= 2) return 'Ein Vermächtnis, das bleibt: Wachstum, Rückhalt und Haltung in Balance.';
  if (grade <= 4) return 'Eine respektable Amtszeit mit klaren Baustellen — aus denen die nächste Runde lernt.';
  return 'Harte Jahre. Der Wert liegt in den Lektionen, nicht in der Note.';
}

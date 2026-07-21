import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import type { TakeoverKind } from '../types/takeover.js';
import { RESERVATION_PREMIUM } from '../types/takeover.js';
import { totalMrr } from './derive.js';
import { computeValuation, mrrGrowthMonthly } from './kpis.js';
import { stream } from './rng.js';
import { addMessage, assistantSender } from './comms.js';

/**
 * Übernahme-Engine (Phase 14). Emergence ist bewusst eng gegated (attraktiv
 * ODER börsennotiert, ab Woche 20, seed-gerollt), damit der Golden-Master-Lauf
 * (Sanierungsfall, kein IPO) sie nie auslöst.
 */

const eur = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} M€` : `${Math.round(v / 1000).toLocaleString('de-DE')} k€`);
const KAPESt = 0.28; // Kapitalertragsteuer auf den CEO-Verkaufserlös (vereinfacht)

const BIDDERS: Record<TakeoverKind, { names: string[]; pitchDe: string }> = {
  finanzinvestor: {
    names: ['Nordwind Capital Partners', 'Blackmoor Equity', 'Kohlberg & Vance'],
    pitchDe: 'Ein Private-Equity-Haus wittert einen unterbewerteten Cashflow — Plan: übernehmen, straffen, in fünf Jahren weiterverkaufen.',
  },
  stratege: {
    names: [],
    pitchDe: 'Ein strategischer Wettbewerber will Marktanteile und eure Technologie schlucken — Synergien auf dem Papier, Kulturbruch in echt.',
  },
  aktivist: {
    names: ['Steele Activist Fund', 'Riverstone Capital Activists', 'Greenlight Aktivisten'],
    pitchDe: 'Ein aktivistischer Investor hält euch für schlecht geführt und drängt öffentlich auf Verkauf oder Zerschlagung.',
  },
};

/** Kapitalgewichtete Annahmequote des Angebots (0..1) bei gegebener Prämie. */
export function acceptanceShare(state: CompanyState, premiumPct: number, extraResistance = 0): number {
  const t = state.takeover;
  let acc = t.toeholdStake; // der Bieter-Anteil zählt sicher „dafür"
  for (const e of state.capTable) {
    const reservation = RESERVATION_PREMIUM[e.kind] ?? 0.3;
    const effShare = e.kind === 'public' ? Math.max(0, e.share - t.toeholdStake) : e.share;
    if (premiumPct >= reservation + extraResistance) acc += effShare;
  }
  return clamp(acc, 0, 1);
}

function emergenceReady(state: CompanyState): boolean {
  if (state.meta.status !== 'active' || state.meta.week < 20) return false;
  const arr = totalMrr(state) * 12;
  const growth = mrrGrowthMonthly(state);
  const isPublic = state.ipo.status === 'public';
  const attractivePrivate = arr >= 5_000_000 && growth > 0.015 && state.ceo.boardTrust >= 52;
  return isPublic || attractivePrivate;
}

function pickBidder(state: CompanyState, rng: () => number): { kind: TakeoverKind; name: string; pitchDe: string } {
  const roll = rng();
  // Bei schwachem Board eher Aktivist; börsennotiert eher Finanzinvestor/Stratege.
  const kind: TakeoverKind = state.ceo.boardTrust < 50 ? 'aktivist' : roll < 0.45 ? 'finanzinvestor' : roll < 0.8 ? 'stratege' : 'aktivist';
  if (kind === 'stratege') {
    const comp = state.market.competitors[Math.floor(rng() * Math.max(1, state.market.competitors.length))];
    return { kind, name: comp?.name ?? 'ein Wettbewerber', pitchDe: BIDDERS.stratege.pitchDe };
  }
  const pool = BIDDERS[kind].names;
  return { kind, name: pool[Math.floor(rng() * pool.length)] ?? pool[0]!, pitchDe: BIDDERS[kind].pitchDe };
}

// ── Wochentick ──────────────────────────────────────────────────────
export function tickTakeover(state: CompanyState, occ: Occurrence[]): void {
  const t = state.takeover;
  const week = state.meta.week;

  if (t.status === 'none') {
    if (!emergenceReady(state)) return;
    const rng = stream(state.meta.seed, 'takeover', week);
    if (rng() > 0.14) return; // ~14 % je berechtigter Woche
    const b = pickBidder(state, rng);
    t.status = 'circling';
    t.bidderName = b.name;
    t.bidderKind = b.kind;
    t.bidderPitchDe = b.pitchDe;
    t.toeholdStake = Math.round((0.04 + rng() * 0.05) * 1000) / 1000;
    t.premiumPct = Math.round((0.25 + rng() * 0.2) * 100) / 100; // 25–45 %
    t.startedWeek = week;
    t.deadlineWeek = null;
    t.defensesUsed = [];
    t.defenseResistance = 0;
    t.lastNudgeWeek = week;
    occ.push({ icon: '🦈', textDe: `${t.bidderName} baut eine Beteiligung auf (${(t.toeholdStake * 100).toFixed(1)} %) — ein Übernahmeversuch bahnt sich an.`, severity: 'warn' });
    addMessage(state, {
      from: assistantSender(state),
      subjectDe: `Unruhe im Aktionariat: ${t.bidderName} kauft`,
      bodyDe: `wir müssen reden: ${t.bidderName} hat begonnen, Anteile aufzukaufen (${(t.toeholdStake * 100).toFixed(1)} % sind schon zusammen). ${t.bidderPitchDe} Erfahrungsgemäß folgt in ein, zwei Wochen ein formelles Übernahmeangebot mit Prämie. Wir sollten vorbereitet sein — Verteidigung läuft über Board und Aktionäre (Dashboard/Struktur).`,
      kind: 'system',
      eventInstanceId: null,
      delegable: false,
      suggestedActionType: null,
      templateId: 'takeover-circling',
      priority: 'hoch',
    });
    return;
  }

  if (t.status === 'circling') {
    // Beteiligung wächst; nach ~2 Wochen kommt das formelle Angebot.
    t.toeholdStake = clamp(t.toeholdStake + 0.02, 0, 0.3);
    if (week - t.startedWeek >= 2) {
      t.status = 'tender';
      t.offerValue = Math.round(computeValuation(state).value * (1 + t.premiumPct));
      t.deadlineWeek = week + 3;
      occ.push({ icon: '📣', textDe: `${t.bidderName} legt ein Übernahmeangebot vor: ${eur(t.offerValue)} (+${(t.premiumPct * 100).toFixed(0)} % Prämie). Frist: 3 Wochen.`, severity: 'bad' });
      addMessage(state, {
        from: { name: t.bidderName, roleDe: 'Bieterkonsortium', refId: null, company: t.bidderKind === 'stratege' ? 'Strategischer Investor' : t.bidderKind === 'aktivist' ? 'Aktivistischer Fonds' : 'Private Equity' },
        subjectDe: `Öffentliches Übernahmeangebot: ${eur(t.offerValue)}`,
        bodyDe: `Sehr geehrte Geschäftsführung, hiermit unterbreiten wir ein verbindliches Angebot zum Erwerb sämtlicher Anteile zu einer Bewertung von ${eur(t.offerValue)} — eine Prämie von ${(t.premiumPct * 100).toFixed(0)} % auf den fairen Wert. Wir empfehlen dem Aufsichtsrat, das Angebot den Aktionären zur Annahme zu empfehlen. Die Frist beträgt drei Wochen. Mit vorzüglicher Hochachtung, ${t.bidderName}.`,
        kind: 'external',
        eventInstanceId: null,
        delegable: false,
        suggestedActionType: null,
        templateId: 'takeover-tender',
        priority: 'hoch',
      });
    }
    return;
  }

  if (t.status === 'tender' && t.deadlineWeek !== null && week > t.deadlineWeek) {
    // Frist verstrichen: die Aktionäre entscheiden selbst.
    const acc = acceptanceShare(state, t.premiumPct, t.defenseResistance);
    if (acc > 0.5) succeedTakeover(state, occ);
    else defendedTakeover(state, occ, 'Der Bieter erreicht die Mehrheit nicht und zieht das Angebot zurück.');
  }
}

/** Übernahme kommt zustande: Exit, CEO wird ausgetauscht, Payout. */
export function succeedTakeover(state: CompanyState, occ: Occurrence[]): void {
  const t = state.takeover;
  const offer = t.offerValue ?? Math.round(computeValuation(state).value * (1 + t.premiumPct));
  const gross = offer * state.ceo.equityShare;
  const net = gross * (1 - KAPESt);
  state.ceo.personalNetCash += net;
  state.meta.status = 'exited';
  state.meta.endReasonDe = `Feindliche Übernahme durch ${t.bidderName}: ${eur(offer)} (+${(t.premiumPct * 100).toFixed(0)} % Prämie). Dein Anteil (${(state.ceo.equityShare * 100).toFixed(1)} %): ${eur(gross)} brutto, ${eur(net)} nach Kapitalertragsteuer. Der neue Eigentümer tauscht die Führung aus — deine Amtszeit endet.`;
  occ.push({ icon: '🏳️', textDe: `Übernahme vollzogen: ${t.bidderName} erhält die Mehrheit. Du wirst als CEO abgelöst — mit ${eur(net)} auf dem Konto.`, severity: 'bad' });
}

/** Übernahme abgewehrt: Firma bleibt unabhängig. */
export function defendedTakeover(state: CompanyState, occ: Occurrence[], reasonDe: string): void {
  const t = state.takeover;
  occ.push({ icon: '🛡️', textDe: `Übernahme abgewehrt: ${reasonDe} Die Firma bleibt unabhängig.`, severity: 'good' });
  t.status = 'none';
  t.offerValue = null;
  t.deadlineWeek = null;
  t.toeholdStake = 0;
  t.defenseResistance = 0;
}

/** Kurzstatus fürs UI/Personas. */
export function takeoverSummaryDe(state: CompanyState): string {
  const t = state.takeover;
  if (t.status === 'none') return 'keine Übernahmesituation';
  if (t.status === 'circling') return `${t.bidderName} sammelt Anteile (${(t.toeholdStake * 100).toFixed(1)} %)`;
  return `Übernahmeangebot von ${t.bidderName}: ${eur(t.offerValue ?? 0)} (+${(t.premiumPct * 100).toFixed(0)} %)`;
}

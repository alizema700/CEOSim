import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import type { LocationProfile } from '../types/identity.js';
import type { Groessenklasse, HandelsregisterEntry, LegalState, Mitbestimmung } from '../types/legal.js';
import { HEBESATZ_BY_CITY, HEBESATZ_DEFAULT, MIN_KAPITAL, isPublicCapable, legalFamily, organNames } from '../types/legal.js';
import { headcount, locationOf, totalMrr } from './derive.js';
import { addMessage, assistantSender } from './comms.js';

/**
 * Gesellschaftsrecht-Engine (Phase 9). Deterministisch:
 * - Größenklasse (§ 267 HGB) & Prüfungspflicht folgen Umsatz/Belegschaft.
 * - Mitbestimmung im Aufsichtsrat staffelt sich nach Kopfzahl (Drittelbet. >
 *   500, paritätisch > 2000 — real: DrittelbG / MitbestG).
 * - Ein laufender Formwechsel wird nach der Umwandlungsfrist wirksam.
 * Die Entscheidungen (Formwechsel, Kapitalerhöhung, Ausschüttung, Versammlung)
 * trifft der Spieler über Aktionen.
 */

/** Ordentliche Versammlung ~jährlich (vereinfacht als feste Wochenkadenz). */
export const ANNUAL_MEETING_WEEKS = 34;

export function amtsgerichtFor(loc: LocationProfile): string {
  return `Amtsgericht ${loc.nameDe}`;
}

export function hebesatzFor(loc: LocationProfile): number {
  if (loc.country !== 'Deutschland') return HEBESATZ_DEFAULT;
  return HEBESATZ_BY_CITY[loc.id] ?? HEBESATZ_DEFAULT;
}

/** Registereintrag je Rechtsraum (Amtsgericht/HRB, Delaware/File, Companies House/CRN). */
function registerFor(seed: number, loc: LocationProfile): HandelsregisterEntry {
  const n = Math.abs(seed);
  if (loc.country === 'USA') return { courtDe: 'Delaware Secretary of State', type: 'File', number: `File ${7_000_000 + (n % 2_000_000)}` };
  if (loc.country === 'Großbritannien') return { courtDe: 'Companies House', type: 'CRN', number: `${(10_000_000 + (n % 89_999_999))}` };
  return { courtDe: amtsgerichtFor(loc), type: 'HRB', number: `HRB ${100_000 + (n % 800_000)}` };
}

export function initialLegalState(seed: number, loc: LocationProfile): LegalState {
  const start = legalFamily(loc.country).start;
  return {
    rechtsform: start,
    nennkapital: MIN_KAPITAL[start],
    handelsregister: registerFor(seed, loc),
    aufsichtsrat: true, // Lead-Investor hält einen Board-/Beiratssitz
    mitbestimmung: 'keine',
    hebesatz: hebesatzFor(loc),
    groessenklasse: 'klein',
    pruefungspflicht: false,
    lastMeetingWeek: null,
    nextMeetingWeek: ANNUAL_MEETING_WEEKS,
    pendingConversion: null,
    formHistory: [],
    dividends: [],
  };
}

/** Größenklasse nach § 267 HGB (vereinfacht: Umsatz & Beschäftigtenzahl). */
export function computeGroessenklasse(state: CompanyState): { klasse: Groessenklasse; pruefpflicht: boolean } {
  const arr = totalMrr(state) * 12;
  const ma = headcount(state);
  let klasse: Groessenklasse;
  if (arr <= 12_000_000 && ma <= 50) klasse = 'klein';
  else if (arr <= 40_000_000 && ma <= 250) klasse = 'mittelgross';
  else klasse = 'gross';
  return { klasse, pruefpflicht: klasse !== 'klein' };
}

export function computeMitbestimmung(state: CompanyState): Mitbestimmung {
  const ma = headcount(state);
  if (ma > 2000) return 'paritaetisch';
  if (ma > 500) return 'drittelbeteiligung';
  return 'keine';
}

// ── Wochentick ────────────────────────────────────────────────────────
export function tickLegal(state: CompanyState, occ: Occurrence[]): void {
  const l = state.legal;
  const week = state.meta.week;

  // 1) Größenklasse & Prüfungspflicht.
  const { klasse, pruefpflicht } = computeGroessenklasse(state);
  const wasPflicht = l.pruefungspflicht;
  l.groessenklasse = klasse;
  l.pruefungspflicht = pruefpflicht;
  if (pruefpflicht && !wasPflicht) {
    occ.push({ icon: '📑', textDe: 'Schwellen des § 267 HGB überschritten: Der Jahresabschluss ist jetzt prüfungspflichtig (Wirtschaftsprüfer).', severity: 'info' });
    addMessage(state, {
      from: assistantSender(state),
      subjectDe: 'Ab jetzt prüfungspflichtig',
      bodyDe: `kurzer Hinweis der Buchhaltung: Wir sind aus der Größenklasse „klein" herausgewachsen. Damit muss der Jahresabschluss künftig von einem Wirtschaftsprüfer testiert werden (§ 316 HGB) — das kostet Geld und Vorlauf, ist aber auch ein Reifezeichen gegenüber Banken und Investoren.`,
      kind: 'system',
      eventInstanceId: null,
      delegable: false,
      suggestedActionType: null,
      templateId: 'pruefungspflicht',
      priority: 'normal',
    });
  }

  // 2) Mitbestimmung im Aufsichtsrat.
  const mb = computeMitbestimmung(state);
  if (mb !== l.mitbestimmung) {
    l.mitbestimmung = mb;
    if (mb !== 'keine') {
      const txt = mb === 'paritaetisch'
        ? 'Über 2000 Beschäftigte: Der Aufsichtsrat wird paritätisch mitbestimmt (MitbestG) — die Belegschaft stellt die Hälfte der Sitze.'
        : 'Über 500 Beschäftigte: Der Aufsichtsrat unterliegt der Drittelbeteiligung (DrittelbG) — ein Drittel der Sitze für die Belegschaft.';
      occ.push({ icon: '🏛️', textDe: txt, severity: 'info' });
    }
  }

  // 3) Laufender Formwechsel wird wirksam.
  if (l.pendingConversion && week >= l.pendingConversion.effectiveWeek) {
    completeConversion(state, occ);
  }

  // 4) Ordentliche Versammlung fällig (einmalige Erinnerung genau in der Fälligkeitswoche).
  if (week === l.nextMeetingWeek) {
    const o = organNames(l.rechtsform);
    occ.push({ icon: '📅', textDe: `Ordentliche ${o.versammlung} fällig: Feststellung des Jahresabschlusses und Entlastung ${l.rechtsform === 'AG' ? 'des Vorstands' : 'der Geschäftsführung'} stehen an (Struktur → Versammlung).`, severity: 'warn' });
  }
}

/** Formwechsel wird wirksam: Rechtsform, Organe & Terminologie ändern sich. */
export function completeConversion(state: CompanyState, occ: Occurrence[]): void {
  const l = state.legal;
  const from = l.rechtsform;
  const to = l.pendingConversion!.toForm;
  l.rechtsform = to;
  l.pendingConversion = null;
  l.formHistory.push({ week: state.meta.week, from, to });
  // Professionalisierungs-Signal an den Kapitalmarkt.
  state.ceo.boardTrust = clamp(state.ceo.boardTrust + 3, 0, 100);
  state.ceo.trustLog.push({ week: state.meta.week, delta: 3, reasonDe: `Formwechsel zur ${to} vollzogen — professionellere Governance.` });
  if (isPublicCapable(to)) state.reputation.investors = clamp(state.reputation.investors + 5, 0, 100);
  const o = organNames(to);
  occ.push({ icon: '⚖️', textDe: `Formwechsel wirksam: Aus der ${from} ist eine ${to} geworden. Ab jetzt ${o.leitung}, ${o.aufsicht} und ${o.versammlung}${isPublicCapable(to) ? ' — und der Weg an die Börse ist offen.' : '.'}`, severity: 'good' });
  addMessage(state, {
    from: { name: 'Dr. Katharina Brandt', roleDe: 'Kanzlei Brandt & Kollegen', refId: null, company: 'Notariat & Gesellschaftsrecht' },
    subjectDe: `Formwechsel zur ${to} eingetragen`,
    bodyDe: `sehr geehrte Geschäftsführung, die Umwandlung Ihrer Gesellschaft in eine ${to} ist heute im Register (${l.handelsregister.number}, ${l.handelsregister.courtDe}) eingetragen und damit wirksam. ${isPublicCapable(to) ? `Die Leitung liegt nun beim ${o.leitung}, überwacht vom ${o.aufsicht}; oberstes Organ ist die ${o.versammlung}. Erst diese Rechtsform ist börsenfähig — ein Börsengang ist jetzt rechtlich möglich.` : 'Die Haftungsverhältnisse und Organpflichten ändern sich entsprechend.'} Für Rückfragen stehen wir bereit. Mit besten Grüßen, Brandt & Kollegen.`,
    kind: 'external',
    eventInstanceId: null,
    delegable: false,
    suggestedActionType: null,
    templateId: 'formwechsel-done',
    priority: 'hoch',
  });
}

/** Menschenlesbarer Struktur-Status für UI/Personas. */
export function legalSummaryDe(state: CompanyState): string {
  const l = state.legal;
  const eur = (v: number) => Math.round(v).toLocaleString('de-DE') + ' €';
  return `${l.rechtsform} · ${l.handelsregister.number} · Nennkapital ${eur(l.nennkapital)} · ${l.groessenklasse}${l.pruefungspflicht ? ', prüfungspflichtig' : ''}${l.pendingConversion ? ` · Formwechsel zur ${l.pendingConversion.toForm} läuft` : ''}`;
}

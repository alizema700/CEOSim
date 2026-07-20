import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import type { LaborState, TarifStatus } from '../types/labor.js';
import { avgSatisfaction, headcount, locationOf } from './derive.js';
import { schedule } from './stateHelpers.js';
import { addMessage, assistantSender } from './comms.js';

/**
 * Arbeitsbeziehungs-Engine (Phase 8). Deterministisch:
 * - Organisationsgrad & Konfliktniveau driften wöchentlich (ohne RNG).
 * - Ein Betriebsrat bildet sich, wenn die Belegschaft groß & organisiert genug
 *   ist (real: er wird gewählt, nicht vom CEO verhindert — § 1 BetrVG).
 * - Ist die Firma tarifgebunden, wird jährlich eine Tarifrunde fällig; ignoriert
 *   der CEO sie, eskaliert es zum Warnstreik.
 * Die eigentlichen Verhandlungs-Entscheidungen trifft der Spieler über Aktionen.
 */

const UNION_TARGET_STEP = 0.04; // wöchentliche Annäherung an den Zielwert
const COUNCIL_MIN_HEADCOUNT = 8;
const COUNCIL_MIN_WEEK = 12;

/** Menge der außertariflichen (AT) Beschäftigten: das Führungsteam. */
function execEmployeeIds(state: CompanyState): Set<string> {
  return new Set(state.people.executives.map((e) => e.employeeId));
}

/** Beschäftigte, die unter den Tarif fallen (alle außer AT/Execs). */
export function coveredEmployees(state: CompanyState) {
  const at = execEmployeeIds(state);
  return state.people.employees.filter((e) => !at.has(e.id));
}

// ── Wochentick ────────────────────────────────────────────────────────
export function tickLabor(state: CompanyState, occ: Occurrence[]): void {
  const l = state.labor;
  const week = state.meta.week;
  const loc = locationOf(state);
  const sat = avgSatisfaction(state);
  const hc = headcount(state);

  // 1) Organisationsgrad driftet zu einem Zielwert (Standort, Größe, Unmut, Tarif).
  const regBase = loc.regulationDensity === 'high' ? 0.3 : loc.regulationDensity === 'medium' ? 0.18 : 0.08;
  const dissatisfaction = clamp((60 - sat) / 100, -0.1, 0.35); // unter 60 Zufriedenheit ⇒ mehr Zulauf
  const sizeBonus = clamp((hc - 15) / 300, 0, 0.12);
  const tarifBonus = l.tarifStatus !== 'none' ? 0.1 : 0;
  const target = clamp(regBase + dissatisfaction + sizeBonus + tarifBonus, 0.02, 0.9);
  l.unionizationRate = clamp(l.unionizationRate + (target - l.unionizationRate) * UNION_TARGET_STEP, 0, 0.95);

  // 2) Konfliktniveau: steigt bei Unmut & langer Nullrunde, sinkt bei Zufriedenheit/Tarif.
  const weeksSinceRaise = l.lastRaiseWeek === null ? 60 : week - l.lastRaiseWeek;
  let tensionTarget = 20;
  tensionTarget += clamp((55 - sat) * 0.8, -15, 40);
  tensionTarget += l.unionizationRate > 0.4 ? 8 : 0;
  if (l.tarifStatus !== 'none' && weeksSinceRaise > 55) tensionTarget += 15; // überfällige Tarifrunde
  if (l.tarifStatus === 'none' && l.unionizationRate > 0.45) tensionTarget += 10; // organisiert, aber tariflos
  l.tension = clamp(l.tension + (clamp(tensionTarget, 0, 100) - l.tension) * 0.15, 0, 100);

  // 3) Betriebsratswahl: bildet sich, wenn groß & organisiert genug (einmalig).
  if (
    !l.worksCouncil &&
    week >= COUNCIL_MIN_WEEK &&
    hc >= COUNCIL_MIN_HEADCOUNT &&
    l.unionizationRate >= 0.35 &&
    (l.councilConsideredWeek === null || week - l.councilConsideredWeek >= 12)
  ) {
    l.councilConsideredWeek = week;
    // Wunsch der Belegschaft ist so hoch, dass ein Betriebsrat gewählt wird.
    if (l.unionizationRate >= 0.42 || l.tension >= 55) {
      l.worksCouncil = true;
      l.worksCouncilSinceWeek = week;
      state.reputation.laborMarket = clamp(state.reputation.laborMarket + 3, 0, 100);
      occ.push({ icon: '🪧', textDe: 'Die Belegschaft hat einen Betriebsrat gewählt. Ab jetzt gilt Mitbestimmung — Kündigungen, Arbeitszeit und Sozialpläne laufen über das Gremium.', severity: 'info' });
      addMessage(state, {
        from: assistantSender(state),
        subjectDe: 'Es gibt jetzt einen Betriebsrat',
        bodyDe: `zur Info, weil du es von mir hören solltest: Die Kolleg:innen haben einen Betriebsrat gewählt. Das ist ihr gutes Recht (§ 1 BetrVG) und kein Misstrauensvotum gegen dich — aber es ändert etwas. Personalmaßnahmen wie Kündigungen brauchen künftig die Anhörung des Gremiums, größere Einschnitte einen Sozialplan. Mein Rat: Behandle den Betriebsrat als Partner, nicht als Gegner — Firmen, die das tun, sind nachweislich ruhiger.`,
        kind: 'system',
        eventInstanceId: null,
        delegable: false,
        suggestedActionType: null,
        templateId: 'works-council',
        priority: 'normal',
      });
    }
  }

  // 4) Tarifrunde fällig? (nur tarifgebunden, keine laufende Verhandlung)
  if (l.tarifStatus !== 'none' && l.negotiation === null && l.nextBargainingWeek !== null && week >= l.nextBargainingWeek) {
    openBargaining(state, occ);
  }

  // 5) Laufende Verhandlung: Frist verpasst ⇒ Eskalation.
  if (l.negotiation && week > l.negotiation.deadlineWeek) {
    const n = l.negotiation;
    if (n.round >= 2) {
      // Nach wiederholtem Verzug setzt die Gewerkschaft die Forderung per Streik durch.
      settleTarif(state, n.demandPct, true, occ);
    } else {
      n.round += 1;
      n.deadlineWeek = week + 2;
      escalateStrike(state, occ, false);
    }
  }
}

// ── Tarifrunde eröffnen ─────────────────────────────────────────────────
export function openBargaining(state: CompanyState, occ: Occurrence[]): void {
  const l = state.labor;
  const week = state.meta.week;
  const sat = avgSatisfaction(state);
  // Forderung: Basis „Inflationsausgleich + Teilhabe", erhöht durch Konflikt & Unmut.
  const demand = clamp(0.045 + l.tension / 100 * 0.05 + clamp((58 - sat) / 100, 0, 0.05), 0.03, 0.14);
  const demandPct = Math.round(demand * 1000) / 1000;
  l.negotiation = {
    startedWeek: week,
    demandPct,
    floorPct: Math.round(demandPct * 0.55 * 1000) / 1000,
    deadlineWeek: week + 3,
    round: 0,
    lastOfferPct: null,
  };
  occ.push({ icon: '🤝', textDe: `Tarifrunde eröffnet: Die Gewerkschaft fordert +${(demandPct * 100).toFixed(1)} % Lohn. Ein Angebot ist gefragt (Team → Arbeitsbeziehungen).`, severity: 'warn' });
  addMessage(state, {
    from: { name: 'Gewerkschaftssekretariat', roleDe: 'Tarifkommission', refId: null, company: 'ver.di / IG Metall (fiktiv)' },
    subjectDe: `Tarifforderung: +${(demandPct * 100).toFixed(1)} %`,
    bodyDe: `sehr geehrte Geschäftsführung, für die anstehende Tarifrunde fordert die Tarifkommission eine Lohn- und Gehaltserhöhung von ${(demandPct * 100).toFixed(1)} % bei zwölf Monaten Laufzeit. Die Belegschaft steht geschlossen hinter dieser Forderung. Wir erwarten Ihr Angebot innerhalb von drei Wochen und gehen von konstruktiven Verhandlungen aus. Ein tragfähiger Abschluss liegt erfahrungsgemäß nicht unter ${(l.negotiation.floorPct * 100).toFixed(1)} %. Mit kollegialen Grüßen, die Tarifkommission.`,
    kind: 'external',
    eventInstanceId: null,
    delegable: false,
    suggestedActionType: null,
    templateId: 'tarif-demand',
    priority: 'hoch',
  });
}

// ── Abschluss ────────────────────────────────────────────────────────────
export function settleTarif(state: CompanyState, agreedPct: number, viaStrike: boolean, occ: Occurrence[]): void {
  const l = state.labor;
  const week = state.meta.week;
  schedule(state, 0, `Tarifabschluss W${week}`, null, { kind: 'TARIF_RAISE', pct: agreedPct, viaStrike }, 'system');
  l.rounds.push({ week, agreedPct, viaStrike });
  l.lastRaisePct = agreedPct;
  l.lastRaiseWeek = week;
  l.nextBargainingWeek = week + 52;
  l.negotiation = null;
  l.tension = clamp(l.tension - (viaStrike ? 20 : 35), 0, 100);
  state.reputation.laborMarket = clamp(state.reputation.laborMarket + (viaStrike ? 0 : 4), 0, 100);
  if (viaStrike) {
    occ.push({ icon: '✊', textDe: `Tarifabschluss ERZWUNGEN: +${(agreedPct * 100).toFixed(1)} % nach Streik. Teurer als ein früher Kompromiss — und die Presse hat zugesehen.`, severity: 'bad' });
  } else {
    occ.push({ icon: '🤝', textDe: `Tarifabschluss: +${(agreedPct * 100).toFixed(1)} % vereinbart. Die Belegschaft ist zufrieden, der Betriebsfrieden hält.`, severity: 'good' });
  }
}

// ── Streik-Eskalation ─────────────────────────────────────────────────────
export function escalateStrike(state: CompanyState, occ: Occurrence[], full: boolean): void {
  const l = state.labor;
  const week = state.meta.week;
  l.tension = clamp(l.tension + (full ? 18 : 10), 0, 100);
  schedule(state, 0, `Arbeitskampf W${week}`, null, { kind: 'WARNING_STRIKE', full }, 'system');
}

// ── Beitritt / Austritt ────────────────────────────────────────────────────
/**
 * Tarifbindung setzen. Beitritt hebt Löhne auf Tarifniveau (einmalig),
 * beruhigt und verbessert die Arbeitgebermarke; Austritt (Tarifflucht) ist ein
 * harter Schnitt: Konflikt, Reputationsschaden, Streikrisiko.
 */
export function applyTarifBinding(state: CompanyState, status: TarifStatus, occ: Occurrence[]): string[] {
  const l = state.labor;
  const week = state.meta.week;
  const analysis: string[] = [];
  const prev = l.tarifStatus;

  if (status === 'none') {
    // Tarifflucht
    l.tarifStatus = 'none';
    l.nextBargainingWeek = null;
    l.negotiation = null;
    l.tension = clamp(l.tension + 28, 0, 100);
    state.reputation.laborMarket = clamp(state.reputation.laborMarket - 10, 0, 100);
    state.reputation.press = clamp(state.reputation.press - 5, 0, 100);
    for (const e of coveredEmployees(state)) e.satisfaction = clamp(e.satisfaction - 10, 0, 100);
    analysis.push('Tarifflucht: kurzfristig spart ihr die nächste Tariferhöhung — aber Vertrauen, Arbeitgebermarke und Betriebsfrieden nehmen schweren Schaden.');
    if (l.worksCouncil || l.unionizationRate > 0.4) {
      escalateStrike(state, occ, false);
      analysis.push('Betriebsrat und Gewerkschaft rufen zum Protest — mit Warnstreik ist zu rechnen.');
    }
    occ.push({ icon: '🚪', textDe: 'Tarifausstieg beschlossen — die Belegschaft ist alarmiert.', severity: 'bad' });
    return analysis;
  }

  // Beitritt / Wechsel
  l.tarifStatus = status;
  l.nextBargainingWeek = week + 26;
  // Einmalige Angleichung ans Tarifniveau (Verband hebt stärker als Haustarif).
  const alignPct = status === 'verband' ? 0.05 : 0.03;
  schedule(state, 0, `Tarifbeitritt W${week}`, null, { kind: 'TARIF_RAISE', pct: alignPct, viaStrike: false }, 'system');
  l.tension = clamp(l.tension - (status === 'verband' ? 18 : 12), 0, 100);
  state.reputation.laborMarket = clamp(state.reputation.laborMarket + (status === 'verband' ? 6 : 4), 0, 100);
  analysis.push(
    status === 'verband'
      ? 'Flächentarif (Verband): planbare, faire Löhne und eine starke Arbeitgebermarke — dafür weniger Spielraum bei Einzelgehältern und Verbandsbeiträge.'
      : 'Haustarifvertrag: du verhandelst direkt mit der Gewerkschaft — mehr Kontrolle als der Flächentarif, aber du sitzt allein am Tisch.',
  );
  analysis.push(`Löhne werden um ${(alignPct * 100).toFixed(0)} % auf Tarifniveau angehoben (einmalig, diese Woche wirksam). Erste reguläre Tarifrunde in ~26 Wochen.`);
  if (prev !== 'none') analysis.push(`Wechsel von ${prev === 'verband' ? 'Flächentarif' : 'Haustarif'} zu ${status === 'verband' ? 'Flächentarif' : 'Haustarif'}.`);
  occ.push({ icon: '📜', textDe: `Tarifbindung: ${status === 'verband' ? 'Flächentarifvertrag (Verband)' : 'Haustarifvertrag'} — Löhne +${(alignPct * 100).toFixed(0)} %.`, severity: 'good' });
  return analysis;
}

/**
 * Angebot in einer laufenden Tarifrunde bewerten (deterministisch).
 * Gibt Analyse-Zeilen zurück; Abschluss/Streik werden als Effekte/State gesetzt.
 */
export function applyTarifOffer(state: CompanyState, offerPct: number, occ: Occurrence[]): string[] {
  const l = state.labor;
  const n = l.negotiation!;
  const analysis: string[] = [];
  n.lastOfferPct = offerPct;

  if (offerPct >= n.demandPct * 0.97) {
    settleTarif(state, offerPct, false, occ);
    analysis.push(`Angebot (${(offerPct * 100).toFixed(1)} %) trifft die Forderung — die Gewerkschaft nimmt sofort an. Schnell, teuer, aber Ruhe im Haus.`);
  } else if (offerPct >= n.floorPct) {
    // Im akzeptablen Korridor: Abschluss knapp über dem Angebot (Kompromiss).
    const agreed = Math.round(Math.min(n.demandPct, offerPct * 1.04) * 1000) / 1000;
    settleTarif(state, agreed, false, occ);
    analysis.push(`Zäher Kompromiss bei ${(agreed * 100).toFixed(1)} %: dein Angebot lag im vertretbaren Korridor, die Kommission stimmt zu.`);
  } else {
    // Zu niedrig: Ablehnung + Eskalation.
    n.round += 1;
    n.deadlineWeek = state.meta.week + 2;
    escalateStrike(state, occ, n.round >= 2);
    analysis.push(`Angebot (${(offerPct * 100).toFixed(1)} %) liegt unter der Schmerzgrenze (~${(n.floorPct * 100).toFixed(1)} %) — abgelehnt. Es gibt ${n.round >= 2 ? 'einen richtigen Streik' : 'Warnstreiks'}, und der Ton wird rauer.`);
    if (n.round >= 3) {
      settleTarif(state, n.demandPct, true, occ);
      analysis.push('Nach mehreren Streiktagen gibst du nach: Abschluss zur vollen Forderung. Der teuerste aller Wege.');
    }
  }
  return analysis;
}

/** Menschenlesbarer Status für UI/Personas. */
export function laborSummaryDe(l: LaborState): string {
  const tarif = l.tarifStatus === 'none' ? 'ohne Tarif' : l.tarifStatus === 'verband' ? 'Flächentarif' : 'Haustarif';
  return `${tarif} · Organisationsgrad ${(l.unionizationRate * 100).toFixed(0)} % · ${l.worksCouncil ? 'Betriebsrat' : 'kein Betriebsrat'} · Konflikt ${Math.round(l.tension)}/100`;
}

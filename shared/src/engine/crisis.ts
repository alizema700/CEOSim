import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import type { CrisisKind, CrisisResponseMode } from '../types/crisis.js';
import { totalMrr } from './derive.js';
import { stream } from './rng.js';
import { addMessage, assistantSender } from './comms.js';
import { nextId, schedule } from './stateHelpers.js';

const CRISIS_SOURCE = 'Öffentliche Krise';

/**
 * Krisen-Engine (Phase 15). Ein Shitstorm entsteht aus einem Funken, eskaliert
 * über Stufen, wenn der CEO nicht rechtzeitig & glaubwürdig reagiert, und klingt
 * über die Zeit ab. Emergence ist bewusst gegated (nur mit öffentlicher
 * Angriffsfläche: gute Presse, börsennotiert oder relevante Größe) und
 * seed-gerollt — der Golden-Master-Lauf (Sanierungsfall, kein Rampenlicht)
 * löst nie eine Krise aus.
 */

const AUDIT_FEE = 80_000; // Kosten für externe Aufklärung/Audit (Transparenz-Weg)

const KINDS: Record<CrisisKind, { headlines: string[]; sparks: string[] }> = {
  datenschutz: {
    headlines: ['Datenleck: Kundendaten im Netz', 'Sicherheitslücke offengelegt', 'Datenschutz-Skandal zieht Kreise'],
    sparks: ['Ein Sicherheitsforscher hat eine offene Datenbank gefunden — Kundendaten lagen ungeschützt im Netz.'],
  },
  social: {
    headlines: ['Shitstorm über Social Media', 'Empörungswelle rollt', 'Kampagne gegen die Marke trendet'],
    sparks: ['Ein unbedachter Post der Marke wird aus dem Kontext gerissen und trendet — die Empörung kocht hoch.'],
  },
  produkt: {
    headlines: ['Produktmangel wird öffentlich', 'Ausfall trifft Tausende Kunden', 'Qualitätsversprechen wankt'],
    sparks: ['Ein gravierender Produktfehler legt bei vielen Kunden den Betrieb lahm — die Beschwerden häufen sich öffentlich.'],
  },
  führung: {
    headlines: ['Führungsskandal erschüttert die Firma', 'Vorwürfe gegen das Management', 'Interne Kultur unter Beschuss'],
    sparks: ['Ehemalige Mitarbeitende erheben öffentlich Vorwürfe gegen die Führungskultur — Medien greifen es auf.'],
  },
  nachhaltigkeit: {
    headlines: ['Greenwashing-Vorwurf', 'Nachhaltigkeits-Versprechen entzaubert', 'NGO stellt die Bilanz infrage'],
    sparks: ['Eine NGO wirft der Firma vor, ihre Nachhaltigkeits-Versprechen seien Fassade — der Vorwurf verbreitet sich schnell.'],
  },
};

const KIND_ORDER: CrisisKind[] = ['datenschutz', 'social', 'produkt', 'führung', 'nachhaltigkeit'];

/** Wirksamkeit einer Reaktion (0..1) aus CEO-Marke, Kommunikation & Board-Rückhalt. */
export function responseEfficacy(state: CompanyState): number {
  const komm = state.ceo.skills.kommunikation ?? 50;
  const marke = state.ceo.reputation ?? 50;
  const trust = state.ceo.boardTrust ?? 50;
  return clamp(0.35 + (komm - 50) / 200 + (marke - 50) / 260 + (trust - 50) / 320, 0.2, 0.95);
}

function emergenceReady(state: CompanyState): boolean {
  if (state.meta.status !== 'active' || state.crisis.status !== 'none') return false;
  if (state.meta.week < 8) return false;
  if (state.takeover.status !== 'none') return false; // kein Sturm-Stapeln mit Übernahme
  const arr = totalMrr(state) * 12;
  // Nur Firmen „im Rampenlicht" ziehen Stürme an: börsennotiert, starke Presse
  // oder relevante Größe. Der Sanierungs-/Golden-Master-Lauf bleibt darunter.
  const exposed = state.ipo.status === 'public' || state.reputation.press >= 58 || arr >= 5_000_000;
  return exposed;
}

function refreshModifiers(state: CompanyState): void {
  const week = state.meta.week;
  const c = state.crisis;
  // Alte Krisen-Modifikatoren entfernen, neue je Stufe setzen.
  state.activeModifiers = state.activeModifiers.filter((m) => m.sourceDe !== CRISIS_SOURCE);
  if (c.status !== 'active') return;
  const leadDrop = clamp(1 - (0.04 + c.stage * 0.05), 0.7, 0.98); // weniger Leads
  const attritionUp = clamp(1 + (0.03 + c.stage * 0.05), 1.02, 1.3); // mehr Kündigungen
  state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'leadGen', factor: leadDrop, startWeek: week, endWeek: week + 1, sourceDe: CRISIS_SOURCE });
  state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'attritionRisk', factor: attritionUp, startWeek: week, endWeek: week + 1, sourceDe: CRISIS_SOURCE });
}

function ignite(state: CompanyState, occ: Occurrence[]): void {
  const week = state.meta.week;
  const rng = stream(state.meta.seed, 'crisis', week);
  const c = state.crisis;
  const kind = KIND_ORDER[Math.floor(rng() * KIND_ORDER.length)] ?? 'social';
  const cfg = KINDS[kind];
  c.status = 'active';
  c.kind = kind;
  c.headlineDe = cfg.headlines[Math.floor(rng() * cfg.headlines.length)] ?? cfg.headlines[0]!;
  c.sparkDe = cfg.sparks[Math.floor(rng() * cfg.sparks.length)] ?? cfg.sparks[0]!;
  c.severity = Math.round(30 + rng() * 16);
  c.stage = 1;
  c.startedWeek = week;
  c.deadlineWeek = week + 2;
  c.responsesUsed = [];
  c.momentum = 6 + Math.round(rng() * 4);
  c.addressed = false;
  c.lastNudgeWeek = week;
  refreshModifiers(state);
  occ.push({ icon: '🔥', textDe: `${c.headlineDe} — ein öffentlicher Sturm zieht auf. Reagiere, bevor er eskaliert (Frist 2 Wochen).`, severity: 'bad' });
  addMessage(state, {
    from: assistantSender(state),
    subjectDe: `Krise: ${c.headlineDe}`,
    bodyDe: `wir haben ein Problem: ${c.sparkDe} Die ersten Reaktionen sind heftig und werden lauter. Wir sollten heute entscheiden, wie wir öffentlich reagieren — Entschuldigung, Gegenrede, Schweigen oder eine transparente Aufklärung. Jede Option hat ihren Preis. Zeitfenster: gut zwei Wochen, dann verselbstständigt sich der Sturm (Dashboard → Krise).`,
    kind: 'system',
    eventInstanceId: null,
    delegable: false,
    suggestedActionType: null,
    templateId: 'crisis-ignite',
    priority: 'hoch',
  });
}

// ── Wochentick ──────────────────────────────────────────────────────
export function tickCrisis(state: CompanyState, occ: Occurrence[]): void {
  const c = state.crisis;
  const week = state.meta.week;

  if (c.status === 'none') {
    if (!emergenceReady(state)) return;
    const rng = stream(state.meta.seed, 'crisis-spark', week);
    if (rng() > 0.1) return; // ~10 % je berechtigter Woche
    ignite(state, occ);
    return;
  }

  // Aktiv: Strafen skaliert mit Schwere anwenden.
  const sev = c.severity;
  state.reputation.press = clamp(state.reputation.press - sev * 0.10, 0, 100);
  state.reputation.customers = clamp(state.reputation.customers - sev * 0.06, 0, 100);
  state.ceo.reputation = clamp(state.ceo.reputation - sev * 0.05, 0, 100);
  if (c.stage >= 2) state.ceo.boardTrust = clamp(state.ceo.boardTrust - sev * 0.02, 0, 100);

  // Dynamik: Momentum treibt die Schwere, klingt aber natürlich ab.
  c.severity = clamp(c.severity + c.momentum, 0, 100);
  c.momentum = c.momentum > 0 ? Math.max(0, c.momentum - 2) : Math.min(0, c.momentum + 1);

  // Frist verstrichen ohne glaubwürdige Reaktion ⇒ Eskalation.
  if (c.deadlineWeek !== null && week > c.deadlineWeek && !c.addressed && c.stage < 3) {
    c.stage += 1;
    c.severity = clamp(c.severity + 12, 0, 100);
    c.momentum += 6;
    c.deadlineWeek = week + 2;
    occ.push({ icon: '📣', textDe: `Die Krise eskaliert (Stufe ${c.stage}): ohne Reaktion kippt die Stimmung weiter.`, severity: 'bad' });
  }
  c.addressed = false; // pro Woche neu; nur eine frische Reaktion dämpft die nächste Eskalation

  refreshModifiers(state);

  // Abklingen.
  if (c.severity <= 8) {
    occ.push({ icon: '🕊️', textDe: `Der Sturm um „${c.headlineDe}" ist abgeklungen — die Aufmerksamkeit wandert weiter.`, severity: 'good' });
    resetCrisis(state);
  }
}

/** Reaktion des CEO auf die Krise. Wirkung skaliert mit CEO-Marke/Kommunikation. */
export function respondCrisis(state: CompanyState, mode: CrisisResponseMode, occ: Occurrence[]): void {
  const c = state.crisis;
  const eff = responseEfficacy(state);
  c.responsesUsed.push(mode);
  c.lastNudgeWeek = state.meta.week;

  if (mode === 'apologize') {
    c.severity = clamp(c.severity - Math.round(16 * eff) - 4, 0, 100);
    c.momentum -= Math.round(10 * eff);
    c.addressed = true;
    state.reputation.customers = clamp(state.reputation.customers + 3, 0, 100);
    state.reputation.investors = clamp(state.reputation.investors - 2, 0, 100); // wirkt kurz weich
    occ.push({ icon: '🙇', textDe: 'Öffentliche Entschuldigung — die Empörung verliert an Fahrt, wirkt aber angreifbar.', severity: 'good' });
  } else if (mode === 'defend') {
    const defensible = c.severity < 45; // in der Sache haltbar?
    if (defensible) {
      c.severity = clamp(c.severity - Math.round(20 * eff), 0, 100);
      c.momentum -= Math.round(8 * eff);
      state.reputation.investors = clamp(state.reputation.investors + 3, 0, 100); // entschlossen
      occ.push({ icon: '🛡️', textDe: 'Klare Gegenrede — die Faktenlage trägt, der Sturm verliert an Kraft.', severity: 'good' });
    } else {
      c.severity = clamp(c.severity + 12, 0, 100);
      c.momentum += 10;
      if (c.stage < 3) c.stage += 1;
      state.reputation.press = clamp(state.reputation.press - 4, 0, 100);
      occ.push({ icon: '🔥', textDe: 'Die Gegenrede zündet nicht — Öl ins Feuer, der Sturm eskaliert.', severity: 'bad' });
    }
    c.addressed = defensible;
  } else if (mode === 'silent') {
    c.momentum += 4; // Schweigen lässt Raum für Spekulation
    occ.push({ icon: '🤐', textDe: 'Kein Kommentar — ein Vabanquespiel: Der Sturm kann verebben oder sich hochschaukeln.', severity: 'warn' });
  } else {
    // investigate: transparente Aufklärung + externes Audit (kostet Geld & Zeit, wirkt am stärksten).
    schedule(state, 0, `Krisen-Aufklärung W${state.meta.week}`, null, { kind: 'ONE_OFF_COST', amount: AUDIT_FEE, labelDe: 'Externe Aufklärung/Audit (Krise)' });
    c.severity = clamp(c.severity - Math.round(12 * eff) - 4, 0, 100);
    c.momentum -= Math.round(14 * eff);
    c.addressed = true;
    state.reputation.press = clamp(state.reputation.press + 4, 0, 100);
    state.reputation.customers = clamp(state.reputation.customers + 2, 0, 100);
    occ.push({ icon: '🔬', textDe: `Transparente Aufklärung eingeleitet (${Math.round(AUDIT_FEE / 1000)} k€) — glaubwürdigster Weg, wirkt nachhaltig.`, severity: 'good' });
  }

  refreshModifiers(state);
  if (c.severity <= 8) resetCrisis(state);
}

function resetCrisis(state: CompanyState): void {
  const c = state.crisis;
  c.status = 'none';
  c.severity = 0;
  c.stage = 0;
  c.momentum = 0;
  c.deadlineWeek = null;
  c.addressed = false;
  state.activeModifiers = state.activeModifiers.filter((m) => m.sourceDe !== CRISIS_SOURCE);
}

/** Kurzstatus fürs UI/Personas. */
export function crisisSummaryDe(state: CompanyState): string {
  const c = state.crisis;
  if (c.status === 'none') return 'keine akute Krise';
  return `${c.headlineDe} (Stufe ${c.stage}, Schwere ${Math.round(c.severity)}/100)`;
}

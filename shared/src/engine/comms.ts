import { clamp, type WeekIndex } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { CommsIntent, InboxMessage, MessageSender } from '../types/comms.js';
import type { DelegateMessageAction } from '../types/actions.js';
import type { Occurrence } from '../types/game.js';
import { deptDe, nextId, schedule } from './stateHelpers.js';
import { avgSatisfaction, effectiveMonthlyChurn, netBurnMonthly, runwayWeeks, totalMrr, currentVelocity } from './derive.js';
import { stream } from './rng.js';

/**
 * Kommunikations-Engine (Phase 2): erzeugt deterministisch Inbox-Nachrichten,
 * Briefings und Kalender-Termine aus dem State. Freie Dialoge (LLM) leben in
 * der Server-DB — hier entsteht nur die replay-sichere Wahrheit.
 */

const MAX_MESSAGES = 250;

export function addMessage(
  state: CompanyState,
  msg: Omit<InboxMessage, 'id' | 'week' | 'priority' | 'handledWeek'> & { priority?: InboxMessage['priority'] },
): InboxMessage {
  const full: InboxMessage = {
    id: nextId(state, 'msg'),
    week: state.meta.week,
    priority: msg.priority ?? prioritize(msg),
    handledWeek: null,
    ...msg,
  };
  state.comms.messages.push(full);
  if (state.comms.messages.length > MAX_MESSAGES) {
    // Alte, mechanisch erledigte Nachrichten zuerst verdrängen.
    const idx = state.comms.messages.findIndex((m) => m.eventInstanceId === null || m.handledWeek !== null);
    state.comms.messages.splice(idx >= 0 ? idx : 0, 1);
  }
  return full;
}

/** Prioritäts-Flag der Sekretärin (regelbasiert). */
function prioritize(msg: { kind: InboxMessage['kind']; eventInstanceId: Id2 }): InboxMessage['priority'] {
  if (msg.eventInstanceId) return 'hoch';
  if (msg.kind === 'exec' || msg.kind === 'briefing') return 'normal';
  return 'niedrig';
}
type Id2 = string | null;

export function execSender(state: CompanyState, role: 'cto' | 'headOfSales' | 'headOfCs' | 'cfo'): MessageSender {
  const roleDe: Record<string, string> = { cto: 'CTO', headOfSales: 'Head of Sales', headOfCs: 'Head of CS', cfo: 'CFO' };
  const ex = state.people.executives.find((e) => e.role === role);
  const emp = ex ? state.people.employees.find((p) => p.id === ex.employeeId) : undefined;
  return {
    name: emp ? `${emp.firstName} ${emp.lastName}` : `(${roleDe[role]} vakant)`,
    roleDe: roleDe[role] ?? role,
    refId: ex?.id ?? null,
    company: null,
  };
}

export function assistantSender(state: CompanyState): MessageSender {
  return { name: state.people.assistant.name, roleDe: 'Chief of Staff', refId: state.people.assistant.id, company: null };
}

// ────────────────────────────────────────────────────────────────────
// Proaktive Nachrichten des Teams — Bedingung + Cooldown, deterministisch.
// ────────────────────────────────────────────────────────────────────
export function generateWeeklyComms(state: CompanyState): void {
  const w = state.meta.week;
  const cd = (templateId: string, weeks: number): boolean => {
    const last = state.comms.cooldowns[templateId];
    if (last !== undefined && w - last < weeks) return false;
    state.comms.cooldowns[templateId] = w;
    return true;
  };
  const fmtK = (v: number) => `${Math.round(v / 1000)} k€`;

  const runway = runwayWeeks(state);
  const churn = effectiveMonthlyChurn(state);
  const burn = netBurnMonthly(state);

  // CFO: Runway-Warnung
  if (runway < 26 && cd('cfo-runway', 6)) {
    addMessage(state, {
      from: execSender(state, 'cfo'),
      subjectDe: `Liquidität: Runway bei ${Math.round(runway)} Wochen`,
      bodyDe: `kurz und ohne Umschweife: Bei ${fmtK(burn)} Netto-Burn pro Monat reicht die Kasse noch ~${Math.round(runway)} Wochen. Ich habe drei Szenarien gerechnet — ohne Gegenmaßnahme melde ich das dem Board vor dem nächsten Call. Optionen aus meiner Sicht: Kreditlinie ziehen (Puffer), Burn senken (OpEx), oder Umsatz beschleunigen (dauert). Sag mir, welchen Pfad du willst, ich bereite die Zahlen auf.`,
      kind: 'exec',
      eventInstanceId: null,
      delegable: false,
      suggestedActionType: 'RAISE_DEBT',
      templateId: 'cfo-runway',
      priority: 'hoch',
    });
  }

  // CFO: Monatsreport
  if (w > 0 && w % 4 === 0 && cd('cfo-monthly', 4)) {
    const mrr = totalMrr(state);
    addMessage(state, {
      from: execSender(state, 'cfo'),
      subjectDe: `Monatsreport W${w}: MRR ${fmtK(mrr)}, Burn ${fmtK(burn)}`,
      bodyDe: `anbei die Kurzfassung des Monats: MRR ${fmtK(mrr)}/Monat, Netto-Burn ${fmtK(burn)}/Monat, Kasse ${fmtK(state.finance.cash)}, Logo-Churn ${(churn * 100).toFixed(1)} %/Monat. Details wie immer im Finanzen-Tab. Auffälligkeiten habe ich markiert — Rückfragen gern im Chat.`,
      kind: 'exec',
      eventInstanceId: null,
      delegable: false,
      suggestedActionType: null,
      templateId: 'cfo-monthly',
    });
  }

  // CTO: Tech-Debt
  if (state.product.techDebt > 65 && cd('cto-techdebt', 8)) {
    addMessage(state, {
      from: execSender(state, 'cto'),
      subjectDe: `Tech-Debt bei ${Math.round(state.product.techDebt)}/100 — wir bauen auf Sand`,
      bodyDe: `ich will nicht dramatisieren, also nur Fakten: Velocity ist bei ${currentVelocity(state).toFixed(1)} Punkten/Woche, Deploys dauern länger, und die Alt-Komponenten sind der wahrscheinlichste Auslöser für den nächsten Ausfall. Mein Vorschlag: ein Quartal mit mindestens 30 % Debt-Anteil in der R&D-Allokation. Das kostet Features, ja. Ein 6-Stunden-Outage kostet mehr.`,
      kind: 'exec',
      eventInstanceId: null,
      delegable: false,
      suggestedActionType: 'SET_RND_ALLOCATION',
      templateId: 'cto-techdebt',
    });
  }

  // Head of CS: Churn
  if (churn > 0.032 && cd('cs-churn', 8)) {
    addMessage(state, {
      from: execSender(state, 'headOfCs'),
      subjectDe: 'Der Churn entsteht in den ersten 90 Tagen — Vorschlag Onboarding-Programm',
      bodyDe: `ich habe die Kündigungsgespräche der letzten Wochen ausgewertet: Die meisten Abgänge sind Kunden unter 6 Monaten, und fast alle nennen denselben Grund — sie sind nie richtig angekommen. Mit einem strukturierten Onboarding (CS-Budget rauf, dediziertes Playbook) kriegen wir die frühen Kohorten stabil. Die Zahlen dazu liegen im Kunden-Tab. Gib mir das Budget, und ich fange Montag an.`,
      kind: 'exec',
      eventInstanceId: null,
      delegable: false,
      suggestedActionType: 'SET_CS_BUDGET',
      templateId: 'cs-churn',
    });
  }

  // Head of Sales: Pipeline dünn
  if (state.customers.pipeline.lastWeekLeads < 16 && w > 2 && cd('sales-pipeline', 6)) {
    addMessage(state, {
      from: execSender(state, 'headOfSales'),
      subjectDe: 'Pipeline läuft trocken — meine Leute haben nichts zu tun',
      bodyDe: `${state.customers.pipeline.lastWeekLeads} Leads letzte Woche. Meine AEs drehen Däumchen, und Däumchendrehen ist teuer. Entweder wir drehen Marketing auf, oder ich brauche die Freigabe, über Outbound zu gehen. So oder so: Ohne Futter vorne wird hinten nichts abgeschlossen.`,
      kind: 'exec',
      eventInstanceId: null,
      delegable: false,
      suggestedActionType: 'SET_MARKETING_BUDGET',
      templateId: 'sales-pipeline',
    });
  }

  // Head of Sales: Preis-Beschwerde
  if (state.customers.priceIndex > 1.08 && cd('sales-price', 10)) {
    addMessage(state, {
      from: execSender(state, 'headOfSales'),
      subjectDe: 'Neue Preise: Ich verliere Deals an NordCloud',
      bodyDe: `seit der Preiserhöhung höre ich in jedem zweiten Gespräch „zu teuer". NordCloud liegt 20 % unter uns und die Interessenten wissen das. Ich sage nicht, dass die Erhöhung falsch war — aber dann brauche ich entweder Rabatt-Spielraum für umkämpfte Deals oder bessere Argumente vom Produkt. Aktuell habe ich beides nicht.`,
      kind: 'exec',
      eventInstanceId: null,
      delegable: false,
      suggestedActionType: 'PRICE_CHANGE',
      templateId: 'sales-price',
    });
  }

  // Mitarbeiter: Stimmungs-Beschwerde aus der unzufriedensten Abteilung
  const worstDept = (Object.entries(state.people.moraleByDept) as [keyof typeof state.people.moraleByDept, number][])
    .sort((a, b) => a[1] - b[1])[0];
  if (worstDept && worstDept[1] < 45 && cd('employee-morale', 5)) {
    const rng = stream(state.meta.seed, 'msg-employee', w);
    const emps = state.people.employees.filter((e) => e.dept === worstDept[0]);
    const emp = emps[Math.floor(rng() * Math.max(1, emps.length))];
    if (emp) {
      addMessage(state, {
        from: { name: `${emp.firstName} ${emp.lastName}`, roleDe: emp.roleTitleDe, refId: emp.id, company: null },
        subjectDe: `Ehrliches Feedback aus ${deptDe(worstDept[0])}`,
        bodyDe: `ich schreibe dir direkt, weil es sonst niemand tut: Die Stimmung bei uns ist im Keller. Die Gründe kennst du — Unsicherheit, Arbeitslast, und das Gefühl, dass Entscheidungen über unsere Köpfe hinweg fallen. Ich spreche nicht nur für mich. Ein paar von uns schauen sich bereits um. Es wäre gut, wenn du dich mal blicken lässt oder jemand aus der Führung das Thema ernsthaft übernimmt.`,
        kind: 'employee',
        eventInstanceId: null,
        delegable: true,
        suggestedActionType: null,
        templateId: 'employee-morale',
      });
    }
  }

  // Kunde: Support-Eskalation bei hoher Bug-Last
  if (state.product.bugBacklog > 40 && cd('customer-complaint', 5)) {
    const rng = stream(state.meta.seed, 'msg-customer', w);
    const ka = state.customers.keyAccounts.filter((k) => k.status !== 'churned');
    const target = ka[Math.floor(rng() * Math.max(1, ka.length))];
    if (target) {
      addMessage(state, {
        from: { name: 'Leitung IT-Betrieb', roleDe: 'Kunde', refId: target.id, company: target.name },
        subjectDe: `${target.name}: Ticket-Rückstau wird zum Problem`,
        bodyDe: `wir schätzen die Zusammenarbeit, aber die letzten Wochen häufen sich bei uns die offenen Tickets. Zwei Vorfälle blieben tagelang unbeantwortet. Wir erwarten bis Ende nächster Woche einen Plan, wie sich das ändert — sonst müssen wir das Thema auf Einkaufsebene heben.`,
        kind: 'external',
        eventInstanceId: null,
        delegable: true,
        suggestedActionType: null,
        templateId: 'customer-complaint',
        priority: 'hoch',
      });
      target.health = clamp(target.health - 3, 0, 100);
    }
  }

  // Sekretärin: Wochen-Briefing (immer)
  addMessage(state, {
    from: assistantSender(state),
    subjectDe: `Dein Briefing für Woche ${w + 1}`,
    bodyDe: buildBriefingDe(state),
    kind: 'briefing',
    eventInstanceId: null,
    delegable: false,
    suggestedActionType: null,
    templateId: 'briefing',
    priority: state.openEvents.some((e) => e.status === 'open') ? 'hoch' : 'normal',
  });
}

/** Regelbasiertes Briefing der Sekretärin — erste Anlaufstelle beim Login. */
export function buildBriefingDe(state: CompanyState): string {
  const w = state.meta.week;
  const lines: string[] = [];
  const open = state.openEvents.filter((e) => e.status === 'open');
  if (open.length > 0) {
    lines.push(`⚠ ${open.length} offene(s) Ereignis(se) warten auf deine Entscheidung — bitte zuerst ansehen, Fristen laufen.`);
  }
  const appts = state.calendar.appointments.filter((a) => a.week === w + 1);
  if (appts.length > 0) {
    lines.push(`📅 Termine: ${appts.map((a) => `${['Mo', 'Di', 'Mi', 'Do', 'Fr'][a.weekday]} ${a.titleDe}`).join(' · ')}.`);
  }
  const runway = runwayWeeks(state);
  if (runway < 26) lines.push(`💶 Runway ${Math.round(runway)} Wochen — der CFO möchte dazu einen Beschluss.`);
  const dueEvals = state.decisionLog.filter((d) => d.evaluateAtWeek === w + 1).length;
  if (dueEvals > 0) lines.push(`✎ ${dueEvals} Entscheidung(en) werden diese Woche am Ergebnis gemessen.`);
  const morale = avgSatisfaction(state);
  if (morale < 48) lines.push(`👥 Team-Stimmung bei ${Math.round(morale)}/100 — ich höre Flurfunk, der dir nicht gefallen wird.`);
  if (lines.length === 0) lines.push('Ruhige Lage: keine offenen Fristen, keine Alarme. Guter Moment für Strategisches.');
  return `guten Morgen! Hier dein Überblick:\n\n${lines.map((l) => '· ' + l).join('\n')}\n\nIch halte dir den Rücken frei — wenn du etwas verschieben willst, sag Bescheid.`;
}

// ────────────────────────────────────────────────────────────────────
// Kalender
// ────────────────────────────────────────────────────────────────────
export function upkeepCalendar(state: CompanyState): void {
  const w = state.meta.week;
  const cal = state.calendar;
  const nextWeek: WeekIndex = w + 1;

  // Leadership-Sync jeden Montag
  if (!cal.appointments.some((a) => a.week === nextWeek && a.kind === 'leadershipSync')) {
    cal.appointments.push({
      id: nextId(state, 'apt'),
      week: nextWeek,
      weekday: 0,
      titleDe: 'Leadership-Sync',
      kind: 'leadershipSync',
      agendaDe: buildAgendaDe(state),
      participants: state.people.executives
        .map((ex) => state.people.employees.find((e) => e.id === ex.employeeId))
        .filter((e): e is NonNullable<typeof e> => Boolean(e))
        .map((e) => `${e.firstName} ${e.lastName}`),
      linkedEntityId: null,
    });
  }

  // Board-Call quartalsweise (W13, 26, 39 …)
  if (nextWeek > 0 && nextWeek % 13 === 0 && !cal.appointments.some((a) => a.week === nextWeek && a.kind === 'boardCall')) {
    cal.appointments.push({
      id: nextId(state, 'apt'),
      week: nextWeek,
      weekday: 3,
      titleDe: `Board-Call Q${Math.floor(nextWeek / 13)}`,
      kind: 'boardCall',
      agendaDe: ['Zahlen des Quartals (MRR, Burn, Runway)', 'Fortschritt Turnaround-Plan', 'Vertrauensbild des Boards'],
      participants: ['Almberg Capital (Lead)', 'Unabhängiges Board-Mitglied', 'Gründer-Vertreter'],
      linkedEntityId: null,
    });
  }

  // Key-Account-Renewal-Calls: 1 Woche vor Renewal
  for (const ka of state.customers.keyAccounts) {
    if (ka.status === 'churned') continue;
    const callWeek = ka.renewalWeek - 1;
    if (callWeek === nextWeek && !cal.appointments.some((a) => a.linkedEntityId === ka.id && a.week === callWeek)) {
      cal.appointments.push({
        id: nextId(state, 'apt'),
        week: callWeek,
        weekday: 2,
        titleDe: `Renewal-Gespräch ${ka.name}`,
        kind: 'customerCall',
        agendaDe: [`Vertragsverlängerung (${Math.round(ka.mrr / 1000)} k€ MRR)`, `Zufriedenheit: ${Math.round(ka.health)}/100`, 'Eskalationen & Wünsche'],
        participants: ['Frau Berger (' + ka.name + ')', execName(state, 'headOfCs')],
        linkedEntityId: ka.id,
      });
    }
  }

  // Alte Termine aufräumen
  cal.appointments = cal.appointments.filter((a) => a.week >= w - 8);
}

function execName(state: CompanyState, role: 'cto' | 'headOfSales' | 'headOfCs' | 'cfo'): string {
  return execSender(state, role).name;
}

/** Agenda-Vorschlag der Sekretärin aus dem aktuellen Lagebild. */
export function buildAgendaDe(state: CompanyState): string[] {
  const agenda: string[] = [];
  const churn = effectiveMonthlyChurn(state);
  if (churn > 0.03) agenda.push(`Churn ${(churn * 100).toFixed(1)} %/M — Maßnahmenstand`);
  if (runwayWeeks(state) < 26) agenda.push('Liquiditätsplan & Burn');
  if (state.product.techDebt > 60) agenda.push(`Tech-Debt ${Math.round(state.product.techDebt)}/100 — Stabilisierung`);
  const open = state.openEvents.filter((e) => e.status === 'open');
  if (open.length > 0) agenda.push(`Offene Ereignisse (${open.length})`);
  if (agenda.length < 3) agenda.push('Pipeline & Forecast', 'Personal & Stimmung');
  return agenda.slice(0, 4);
}

// ────────────────────────────────────────────────────────────────────
// Delegation
// ────────────────────────────────────────────────────────────────────
export function executeDelegation(state: CompanyState, action: DelegateMessageAction, decisionId: string): { summaryDe: string; analysisDe: string[] } {
  const msg = state.comms.messages.find((m) => m.id === action.messageId);
  if (!msg) throw new Error('Nachricht nicht gefunden.');
  if (!msg.delegable) throw new Error('Diese Nachricht ist nicht delegierbar.');
  if (msg.handledWeek !== null) throw new Error('Diese Nachricht ist bereits erledigt.');
  const ex = state.people.executives.find((e) => e.role === action.execRole);
  if (!ex) throw new Error('Diese Führungskraft gibt es nicht (mehr).');

  msg.handledWeek = state.meta.week;
  const delay = 1 + (state.meta.week + msg.id.length) % 2; // 1–2 Wochen, deterministisch
  schedule(state, delay, `Delegation „${msg.subjectDe}"`, decisionId, { kind: 'DELEGATION_RESULT', messageId: msg.id, execId: ex.id }, 'decision');
  const emp = state.people.employees.find((e) => e.id === ex.employeeId);
  return {
    summaryDe: `Delegiert an ${emp ? emp.firstName + ' ' + emp.lastName : action.execRole}: „${msg.subjectDe}"`,
    analysisDe: [
      `Ergebnis in ${delay} Woche(n) — Erfolgswahrscheinlichkeit hängt an Kompetenz (Performance ${emp ? Math.round(emp.performance) : '?'} / 100) und Beziehung (${ex.relationshipToCeo}/100).`,
      'Delegieren ist eine echte CEO-Fähigkeit: Nicht alles gehört auf deinen Tisch — aber Verantwortung bleibt bei dir.',
    ],
  };
}

/** Fälliges Delegations-Ergebnis zustellen (aus dem Wochentick). */
export function deliverDelegationResult(state: CompanyState, messageId: string, execId: string, occ: Occurrence[]): void {
  const msg = state.comms.messages.find((m) => m.id === messageId);
  const ex = state.people.executives.find((e) => e.id === execId);
  if (!msg || !ex) return;
  const emp = state.people.employees.find((e) => e.id === ex.employeeId);
  const perf = emp ? emp.performance : 55;
  const successProb = clamp(0.35 + (perf / 100) * 0.5 + (ex.relationshipToCeo - 50) / 400, 0.25, 0.93);
  const roll = stream(state.meta.seed, 'delegation', state.meta.week, msg.id.length * 31 + execId.length)();
  const success = roll < successProb;

  const sender = { name: emp ? `${emp.firstName} ${emp.lastName}` : 'Führungsteam', roleDe: 'Rückmeldung', refId: ex.id, company: null };
  if (success) {
    if (msg.templateId === 'customer-complaint' && msg.from.refId) {
      const ka = state.customers.keyAccounts.find((k) => k.id === msg.from.refId);
      if (ka) ka.health = clamp(ka.health + 8, 0, 100);
      state.reputation.customers = clamp(state.reputation.customers + 1, 0, 100);
    } else if (msg.templateId === 'employee-morale') {
      for (const e of state.people.employees) e.satisfaction = clamp(e.satisfaction + 3, 0, 100);
    }
    ex.relationshipToCeo = clamp(ex.relationshipToCeo + 2, 0, 100);
    addMessage(state, {
      from: sender,
      subjectDe: `Erledigt: „${msg.subjectDe}"`,
      bodyDe: `kurzes Update: Das Thema ist durch. Ich habe direkt mit den Beteiligten gesprochen, Maßnahmen sind umgesetzt, Rückmeldung war positiv. Details gern im nächsten Sync — aber du musst hier nichts mehr tun. Danke für das Vertrauen.`,
      kind: 'delegation',
      eventInstanceId: null,
      delegable: false,
      suggestedActionType: null,
      templateId: 'delegation-result',
    });
    occ.push({ icon: '✅', textDe: `Delegation erfolgreich: „${msg.subjectDe}" (${sender.name}).`, severity: 'good' });
  } else {
    if (msg.templateId === 'customer-complaint' && msg.from.refId) {
      const ka = state.customers.keyAccounts.find((k) => k.id === msg.from.refId);
      if (ka) ka.health = clamp(ka.health - 5, 0, 100);
    }
    addMessage(state, {
      from: sender,
      subjectDe: `Rückmeldung nötig: „${msg.subjectDe}"`,
      bodyDe: `ich muss ehrlich sein: Ich habe das Thema nicht gelöst bekommen. Die Gespräche liefen zäh, und an zwei Stellen brauche ich deine Rückendeckung oder Budget. Lass uns kurz sprechen — unbeantwortet wird das eher größer als kleiner.`,
      kind: 'delegation',
      eventInstanceId: null,
      delegable: false,
      suggestedActionType: null,
      templateId: 'delegation-result',
      priority: 'hoch',
    });
    occ.push({ icon: '⚠️', textDe: `Delegation gescheitert: „${msg.subjectDe}" — Thema zurück auf deinem Tisch.`, severity: 'warn' });
  }
}

// ────────────────────────────────────────────────────────────────────
// Intents aus der Erzählschicht (protokolliert als GameEvent 'INTENT')
// ────────────────────────────────────────────────────────────────────
export function applyCommsIntent(state: CompanyState, intent: CommsIntent): void {
  switch (intent.kind) {
    case 'EXEC_RELATIONSHIP': {
      const ex = state.people.executives.find((e) => e.id === intent.execId);
      if (!ex) return;
      const delta = clamp(Math.round(intent.delta), -2, 2);
      ex.relationshipToCeo = clamp(ex.relationshipToCeo + delta, 0, 100);
      break;
    }
  }
}

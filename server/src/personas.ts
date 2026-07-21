import { z } from 'zod';
import {
  boardSummaryDe,
  ceoLifeSummaryDe,
  computeKpis,
  effectiveMonthlyChurn,
  takeoverSummaryDe,
  crisisSummaryDe,
  macroSummaryDe,
  rivalrySummaryDe,
  politicsSummaryDe,
  laborSummaryDe,
  legalSummaryDe,
  runwayWeeks,
  totalMrr,
  type CompanyState,
  type Executive,
} from '@boardroom/shared';
import { getDb } from './db.js';
import { llmJson } from './llm.js';

/**
 * Persona-Schicht (Phase 2): spielt Führungsteam, Sekretärin und Meeting-
 * Runden als Gesprächspartner. Reine Erzählung — Zahlen kommen ausschließlich
 * aus dem State-Auszug, Beziehungseffekte laufen als begrenzte Intents zurück.
 */

export interface ThreadTurn {
  author: string;
  authorRole: string;
  isPlayer: boolean;
  text: string;
  atISO: string;
}

export function getThread(gameId: string, threadKey: string): ThreadTurn[] {
  const rows = getDb()
    .prepare('SELECT author, author_role, is_player, text, at_iso FROM chat_messages WHERE game_id = ? AND thread_key = ? ORDER BY id')
    .all(gameId, threadKey) as { author: string; author_role: string; is_player: number; text: string; at_iso: string }[];
  return rows.map((r) => ({ author: r.author, authorRole: r.author_role, isPlayer: r.is_player === 1, text: r.text, atISO: r.at_iso }));
}

export function appendTurn(gameId: string, threadKey: string, turn: Omit<ThreadTurn, 'atISO'>): ThreadTurn {
  const atISO = new Date().toISOString();
  getDb()
    .prepare('INSERT INTO chat_messages (game_id, thread_key, author, author_role, is_player, text, at_iso) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(gameId, threadKey, turn.author, turn.authorRole, turn.isPlayer ? 1 : 0, turn.text, atISO);
  return { ...turn, atISO };
}

/** Kompakter, wahrheitsgetreuer State-Auszug für Persona-Prompts. */
export function stateBriefDe(state: CompanyState): string {
  const k = computeKpis(state).values;
  return [
    `Firma: ${state.identity.companyName} (${state.identity.productPitch || 'B2B-SaaS'}), Woche ${state.meta.week}.`,
    `Werte: ${state.identity.values.join(', ')} · Motto: „${state.identity.motto}“.`,
    `MRR ${Math.round(totalMrr(state) / 1000)} k€/M · Cash ${Math.round(state.finance.cash / 1000)} k€ · Runway ${Math.round(runwayWeeks(state))} W · Logo-Churn ${(effectiveMonthlyChurn(state) * 100).toFixed(1)} %/M.`,
    `Team ${state.people.employees.length} Köpfe · Ø-Zufriedenheit ${Math.round(k.avgSatisfaction)} · Tech-Debt ${Math.round(state.product.techDebt)}/100 · NPS ${Math.round(state.product.nps)}.`,
    `Arbeitsbeziehungen: ${laborSummaryDe(state.labor)}${state.labor.negotiation ? ` · laufende Tarifrunde: Forderung +${(state.labor.negotiation.demandPct * 100).toFixed(1)} %` : ''}.`,
    `Struktur: ${legalSummaryDe(state)}.`,
    `Aufsichtsrat: ${boardSummaryDe(state)}. Board-Vertrauen ${state.ceo.boardTrust}/100. Offene Ereignisse: ${state.openEvents.filter((e) => e.status === 'open').map((e) => e.cardId).join(', ') || 'keine'}.`,
    `CEO persönlich: ${ceoLifeSummaryDe(state)}.`,
    ...(state.takeover.status !== 'none' ? [`⚠️ Übernahme: ${takeoverSummaryDe(state)}.`] : []),
    ...(state.crisis.status !== 'none' ? [`⚠️ Krise: ${crisisSummaryDe(state)}.`] : []),
    `Konjunktur: ${macroSummaryDe(state)}.`,
    ...(state.rivalry.status !== 'none' ? [`⚔️ Wettbewerber-Angriff: ${rivalrySummaryDe(state)}.`] : []),
    ...(state.politics.politicalCapital > 8 || state.politics.exposure > 0 ? [`Politik & Lobbyismus: ${politicsSummaryDe(state)}.`] : []),
  ].join('\n');
}

const zPersonaReply = z.object({
  replyDe: z.string().min(1).max(2500),
  relationshipDelta: z.number().int().min(-2).max(2),
});

export interface PersonaResolved {
  name: string;
  roleDe: string;
  systemDe: string;
  fallbackDe: string;
  /** Optionaler Fallback-Pool (Phase 7): rotiert pro Gesprächsrunde, damit Offline-Antworten nicht identisch klingen. */
  fallbackPoolDe?: string[];
  execId: string | null;
}

export function resolvePersona(state: CompanyState, threadKey: string): PersonaResolved | null {
  if (threadKey === 'legal') {
    return {
      name: 'Dr. Katharina Brandt',
      roleDe: 'Kanzlei Brandt & Kollegen',
      execId: null,
      systemDe: `Du bist Dr. Katharina Brandt, Partnerin der (fiktiven) Wirtschaftskanzlei Brandt & Kollegen, in einem CEO-TRAININGS-SIMULATOR. Du berätst den CEO simuliert zu Arbeitsrecht (Kündigungen, Abmahnungen, Betriebsrat/Mitbestimmung, Tarifrecht), Gesellschaftsrecht (Rechtsformwahl GmbH/UG/AG, Formwechsel, Kapitalerhöhung, Gesellschafter-/Hauptversammlung, Satzung), Vertragsrecht (AGB, SLAs), DSGVO, M&A-Due-Diligence und Kapitalmarktthemen (nur die AG ist börsenfähig, § 2 AktG) — als AUSBILDUNGSINHALT. Stil: präzise, strukturiert (kurze nummerierte Punkte), nennt typische Fristen/Risiken/Optionen und was die Gegenseite tun könnte; empfiehlt bei Detailfragen weitere Prüfung. Du erinnerst gelegentlich charmant daran, dass jede Antwort Honorar kostet („Die Uhr läuft, Herr/Frau CEO."). WICHTIG: Beginne JEDE Antwort mit dem Kürzel „[Simulierte Ausbildungs-Beratung — keine echte Rechtsberatung]“. Erfinde keine konkreten Paragraphen-Zitate mit Detailinhalt; bleib bei allgemein bekannten Konzepten (z. B. 72h-Meldefrist Art. 33 DSGVO, KSchG-Grundsätze).`,
      fallbackDe: '[Simulierte Ausbildungs-Beratung — keine echte Rechtsberatung]\n\nDanke für Ihre Anfrage. Kurzeinordnung folgt schriftlich; für die Detailprüfung brauchen wir die Unterlagen. Drei Punkte vorab: (1) Fristen notieren und wahren, (2) nichts Schriftliches ohne Gegenlesen herausgeben, (3) Kommunikation intern bündeln. Wir melden uns. — Brandt (Offline-Modus: Für ausführliche simulierte Beratung einen API-Key (OpenAI/Anthropic) hinterlegen; das Honorar wurde dennoch gebucht — Anwaltszeit kostet.)',
    };
  }
  if (threadKey === 'dm:assistant') {
    const a = state.people.assistant;
    return {
      name: a.name,
      roleDe: 'Chief of Staff',
      execId: null,
      systemDe: `Du bist ${a.name}, Chief of Staff / Sekretärin des CEO in einem Unternehmens-Simulator. Persönlichkeit: ${a.personalityDe}. Du kennst Kalender, Inbox und Flurfunk. Du organisierst, priorisierst, erinnerst an Fristen — und gibst ehrliche Einschätzungen zur Stimmung im Haus. Du triffst KEINE Geschäftsentscheidungen und nennst keine Zahlen, die nicht im Lagebild stehen.`,
      fallbackDe: 'Notiert! Ich kümmere mich darum und lege dir alles Relevante ins nächste Briefing. Wenn es eilt: Die wichtigsten Punkte stehen im aktuellen Wochen-Briefing in deiner Inbox.',
    };
  }
  if (threadKey === 'roadshow') {
    const ipo = state.ipo;
    if (ipo.status !== 'roadshow' && ipo.status !== 'public') return null;
    const spanTxt = ipo.bookLow !== null && ipo.bookHigh !== null ? `Bookbuilding-Spanne ${ipo.bookLow.toFixed(2)}–${ipo.bookHigh.toFixed(2)} €` : 'Notiert';
    return {
      name: 'Investoren-Q&A',
      roleDe: ipo.status === 'roadshow' ? 'Roadshow (institutionelle Investoren)' : 'Investor Relations',
      execId: null,
      systemDe: `Du spielst wechselnde institutionelle Investoren (Fondsmanager, Analysten) in der ${ipo.status === 'roadshow' ? `IPO-Roadshow (${spanTxt})` : 'IR-Sprechstunde einer börsennotierten Firma'} eines CEO-Trainings-Simulators. Stil: höflich, aber unbequem — ihr bohrt bei Churn, Unit Economics, Wettbewerbsvorteil, Use of Proceeds und Management-Track-Record. Jede Antwort: 1–2 harte Fragen oder eine pointierte Einschätzung, max. 100 Wörter, auf Deutsch, Anrede „Sie". Keine erfundenen Zahlen über die Firma — nur das Lagebild. Kauf-/Zeichnungszusagen gibst du NIE; die Nachfrage entscheidet die Simulation.`,
      fallbackDe: 'Interessant. Zwei Fragen für die nächste Runde: Wie entwickelt sich die Netto-Kundenbindung der letzten Kohorten — und wofür genau ist der Emissionserlös eingeplant? Wir melden uns über die Bank. (Offline-Modus: Für lebendige Q&A einen API-Key (OpenAI/Anthropic) hinterlegen.)',
    };
  }
  const exec = state.people.executives.find((e) => 'dm:' + e.id === threadKey);
  if (exec) return execPersona(state, exec);
  // Phase 7: JEDE Mitarbeiter:in ist ansprechbar — Persona aus dem Steckbrief.
  const emp = state.people.employees.find((e) => 'dm:' + e.id === threadKey);
  if (emp) return employeePersona(state, emp);
  return null;
}

/** Chat-Persona für normale Mitarbeitende — Ton aus Steckbrief + Stimmung. */
function employeePersona(state: CompanyState, emp: CompanyState['people']['employees'][number]): PersonaResolved {
  const name = `${emp.firstName} ${emp.lastName}`;
  const mood = emp.satisfaction < 40 ? 'frustriert und vorsichtig' : emp.satisfaction < 60 ? 'neutral bis abwartend' : 'motiviert und offen';
  const tenureYears = Math.max(0, (state.meta.week - emp.hiredWeek) / 52).toFixed(1);
  return {
    name,
    roleDe: emp.roleTitleDe,
    execId: null,
    systemDe: `Du bist ${name} (${emp.age}), ${emp.roleTitleDe} in der Abteilung ${emp.dept} eines Unternehmens-Simulators (CEO-Training). Persönlichkeit: ${emp.personalityDe}. Hobby: ${emp.hobbyDe}. Stärke: ${emp.strengthDe}. Betriebszugehörigkeit: ~${tenureYears} Jahre. Aktuelle Stimmung: ${mood} (Zufriedenheit ${Math.round(emp.satisfaction)}/100). Der CEO schreibt dir direkt — das ist für dich ${emp.satisfaction < 50 ? 'eher ungewohnt, du bleibst höflich-distanziert' : 'okay, du freust dich über das Interesse'}. Sprich aus DEINER Arbeitsebene (konkrete Alltagsbeobachtungen, keine Vorstandsperspektive), auf Deutsch, per Du, max. 90 Wörter, IN DEINEM CHARAKTER. Erfinde keine Firmen-Zahlen — nutze nur das Lagebild. Über Gehalt sprichst du ehrlich, aber ohne Forderungskatalog.`,
    fallbackDe: `Danke, dass du fragst! Bei uns in ${emp.dept} ist gerade gut zu tun. Wenn du Details brauchst, sag Bescheid.`,
    fallbackPoolDe: employeeFallbacks(emp, mood),
  };
}

function employeeFallbacks(emp: CompanyState['people']['employees'][number], mood: string): string[] {
  const dept: Record<string, string[]> = {
    engineering: [
      `Kurzer Stand von mir: Der Sprint läuft, aber die Altlasten im Code bremsen uns mehr, als man von außen sieht. Wenn du einmal mit reinschauen willst — jederzeit.`,
      `Ehrlich? ${mood.startsWith('frustriert') ? 'Die Stimmung war schon besser. Zu viele Baustellen parallel.' : 'Läuft ordentlich gerade.'} Was mir helfen würde: weniger Kontextwechsel, mehr Fokuszeit.`,
      `Schön, dass du direkt fragst. Aus Engineering-Sicht: Deploy-Zeiten sind unser größter Zeitfresser. Mein Hobby (${emp.hobbyDe}) hält mich derweil geerdet. 🙂`,
    ],
    sales: [
      `Pipeline-Gefühl von der Front: Interessenten gibt es, aber die Abschlüsse ziehen sich. Zwei, drei gute Referenzkunden würden Wunder wirken.`,
      `Danke der Nachfrage! ${mood.startsWith('motiviert') ? 'Ich bin heiß auf das Quartal.' : 'Ich kämpfe mich durch, ehrlich gesagt.'} Wenn du mal bei einem Kundentermin dabei sein willst — Türen auf.`,
      `Direkt von der Vertriebsfront: Der Wettbewerb ist laut geworden. Uns hilft jedes Argument aus dem Produkt. Sag mir, was ich versprechen darf — und was nicht.`,
    ],
    marketing: [
      `Kampagnen laufen, aber ohne größeres Budget bleibt es Handarbeit. Eine echte Kundenstory würde mehr bringen als drei Anzeigen.`,
      `Schön, von dir zu hören! Content-Plan steht, die Leads kommen ${mood.startsWith('frustriert') ? 'zäher als geplant' : 'ganz ordentlich'}. Feedback jederzeit willkommen.`,
    ],
    cs: [
      `Vom Support-Radar: Die Ticket-Themen wiederholen sich — Onboarding und zwei alte Bugs. Wenn Engineering da Zeit findet, wird es spürbar ruhiger.`,
      `Danke fürs Fragen! Die Kunden sind ${mood.startsWith('motiviert') ? 'überwiegend zufrieden' : 'gemischter Stimmung'}, aber Antwortzeiten sind unser Engpass. Jede zusätzliche Hand hilft.`,
    ],
    ga: [
      `Aus dem Backoffice: Rechnungen, Verträge, Ablage — unspektakulär, aber im Griff. Zwei Prozesse würde ich gern automatisieren, wenn ich darf.`,
      `Alles im Rahmen bei mir. ${mood.startsWith('frustriert') ? 'Etwas viel auf einmal gerade, ehrlich gesagt.' : 'Die Zahlen sind gepflegt, die Ordner sortiert.'} Was brauchst du?`,
    ],
  };
  const pool = dept[emp.dept] ?? dept.ga!;
  return pool.map((t) => t + ' (Offline-Modus: Mit API-Key antworte ich frei in meinem Charakter.)');
}

function execPersona(state: CompanyState, exec: Executive): PersonaResolved {
  const emp = state.people.employees.find((e) => e.id === exec.employeeId);
  const roleDe = { cto: 'CTO', headOfSales: 'Head of Sales', headOfCs: 'Head of Customer Success', cfo: 'CFO' }[exec.role];
  const name = emp ? `${emp.firstName} ${emp.lastName}` : roleDe;
  return {
    name,
    roleDe,
    execId: exec.id,
    systemDe: `Du bist ${name}, ${roleDe} in einem Unternehmens-Simulator (CEO-Training). Persönlichkeit: ${exec.personalityDe}. Deine Agenda: ${exec.agendaDe} Beziehung zum CEO: ${exec.relationshipToCeo}/100 (unter 40: reserviert-förmlich; über 70: offen, auch mal unbequem ehrlich). Du vertrittst DEINE Abteilungssicht mit eigenen Interessen, widersprichst fachlich fundiert, bleibst aber professionell. Antworte kurz (max. 120 Wörter), auf Deutsch, per Du. Erfinde KEINE Zahlen — nutze nur das Lagebild. Wenn der CEO eine Entscheidung von dir verlangt, erinnere ihn, dass Entscheidungen über das Entscheidungs-Panel laufen.`,
    fallbackDe: `Verstanden. Lass uns das im nächsten Leadership-Sync vertiefen — ich bereite die Zahlen aus meinem Bereich vor. (${roleDe})`,
  };
}

/**
 * Antwort einer Persona auf eine Spieler-Nachricht. Liefert Antworttext +
 * begrenztes Beziehungs-Delta (0, wenn LLM nicht verfügbar).
 */
export async function personaReply(
  state: CompanyState,
  persona: PersonaResolved,
  threadKey: string,
  playerText: string,
): Promise<{ text: string; relationshipDelta: number }> {
  const history = getThread(state.meta.gameId, threadKey).slice(-10);
  const historyTxt = history.map((t) => `${t.isPlayer ? 'CEO' : t.author}: ${t.text}`).join('\n');
  const user = [
    '=== LAGEBILD (einzige erlaubte Zahlenquelle) ===',
    stateBriefDe(state),
    '=== BISHERIGES GESPRÄCH ===',
    historyTxt || '(neu)',
    '=== NEUE NACHRICHT DES CEO ===',
    playerText,
    '',
    'Antworte als JSON: {"replyDe": "...", "relationshipDelta": -2..2}. relationshipDelta misst, wie dieses Gespräch eure Arbeitsbeziehung verändert (0 = neutral; nur bei echter Wertschätzung/Brüskierung ±).',
  ].join('\n');

  const res = await llmJson('persona-chat', persona.systemDe, user, zPersonaReply, 800);
  if (res) return { text: res.replyDe, relationshipDelta: res.relationshipDelta };
  // Offline: aus dem Fallback-Pool rotieren, damit Wiederholungen nicht identisch klingen.
  if (persona.fallbackPoolDe && persona.fallbackPoolDe.length > 0) {
    return { text: persona.fallbackPoolDe[history.length % persona.fallbackPoolDe.length]!, relationshipDelta: 0 };
  }
  return { text: persona.fallbackDe, relationshipDelta: 0 };
}

const zMeetingTurns = z.object({
  turns: z.array(z.object({ speaker: z.string().min(1).max(60), textDe: z.string().min(1).max(900) })).min(1).max(5),
  boardTrustDelta: z.number().int().min(-3).max(3).optional(),
  trustReasonDe: z.string().max(160).optional(),
});

export interface MeetingRoundResult {
  turns: { speaker: string; roleDe: string; textDe: string }[];
  boardTrustDelta: number;
  trustReasonDe: string | null;
}

/** Meeting-Szene: mehrere Personas antworten in einer Runde. */
export async function meetingRound(
  state: CompanyState,
  appointmentId: string,
  playerText: string,
): Promise<MeetingRoundResult> {
  const apt = state.calendar.appointments.find((a) => a.id === appointmentId);
  if (!apt) throw new Error('Termin nicht gefunden.');

  const participants = apt.kind === 'boardCall'
    ? [
        { name: 'Dr. Martina Falk', roleDe: 'Lead-Investorin (Almberg Capital)', flavor: 'renditegetrieben, ungeduldig, fragt nach Zahlen und Zusagen' },
        { name: 'Prof. Heinrich Adam', roleDe: 'Unabhängiges Board-Mitglied', flavor: 'Governance-Gewissen, fragt nach Prozessen und Risiken' },
        { name: 'Sven Ostkamp', roleDe: 'Gründer-Vertreter', flavor: 'loyal, kennt jede Altlast, verteidigt das Team' },
      ]
    : apt.kind === 'earningsCall'
    ? [
        { name: 'Sandra Vieth', roleDe: 'Analystin, Bankhaus Cronberg', flavor: 'Sell-Side-Analystin: bohrt bei Guidance, Churn und Kohorten; will Zahlen, keine Adjektive' },
        { name: 'Marc Delius', roleDe: 'Analyst, Rheintal Research', flavor: 'skeptisch, vergleicht gnadenlos mit Wettbewerbern und der letzten Guidance; zitiert frühere Aussagen des CEO zurück' },
        { name: 'Investor Relations', roleDe: 'IR-Moderation', flavor: 'moderiert knapp, mahnt bei Aussagen, die eine Ad-hoc-Pflicht auslösen könnten (Safe-Harbour-Hinweise)' },
      ]
    : state.people.executives.map((ex) => {
        const emp = state.people.employees.find((e) => e.id === ex.employeeId);
        const roleDe = { cto: 'CTO', headOfSales: 'Head of Sales', headOfCs: 'Head of CS', cfo: 'CFO' }[ex.role];
        return { name: emp ? `${emp.firstName} ${emp.lastName}` : roleDe, roleDe, flavor: `${ex.personalityDe}; Agenda: ${ex.agendaDe}` };
      });

  const threadKey = 'meeting:' + appointmentId;
  const isBoard = apt.kind === 'boardCall';
  const history = getThread(state.meta.gameId, threadKey).slice(-12);
  const system = `Du inszenierst eine Meeting-Szene in einem CEO-Trainings-Simulator („${apt.titleDe}“). Teilnehmer:\n${participants
    .map((p) => `- ${p.name} (${p.roleDe}): ${p.flavor}`)
    .join('\n')}\nRegeln: 1–3 Wortmeldungen pro Runde, unterschiedliche Perspektiven, auch mal Widerspruch untereinander. Kurz und konkret, auf Deutsch. Keine erfundenen Zahlen — nur das Lagebild. Keine Entscheidungen treffen; das tut der CEO im Entscheidungs-Panel.${
    isBoard
      ? ' ZUSÄTZLICH: Bewerte nach jeder CEO-Aussage, wie sie beim Board ankommt: boardTrustDelta −3..+3 (0 = neutral; nur bei substanziellen Zusagen/Klarheit positiv, bei Ausweichen/Widersprüchen negativ) + trustReasonDe (max 1 Satz).'
      : ''
  }`;
  const user = [
    '=== LAGEBILD ===',
    stateBriefDe(state),
    `=== AGENDA ===\n${apt.agendaDe.join(' · ')}`,
    '=== BISHERIGER VERLAUF ===',
    history.map((t) => `${t.isPlayer ? 'CEO' : t.author}: ${t.text}`).join('\n') || '(Meeting beginnt)',
    '=== DER CEO SAGT ===',
    playerText,
    '',
    `Antworte als JSON: {"turns": [{"speaker": "Name", "textDe": "..."}]${isBoard ? ', "boardTrustDelta": n, "trustReasonDe": "..."' : ''}} — speaker exakt aus der Teilnehmerliste.`,
  ].join('\n');

  const res = await llmJson('meeting-scene', system, user, zMeetingTurns, 1200);
  if (res) {
    return {
      turns: res.turns.map((t) => ({
        speaker: t.speaker,
        roleDe: participants.find((p) => p.name === t.speaker)?.roleDe ?? 'Teilnehmer:in',
        textDe: t.textDe,
      })),
      boardTrustDelta: isBoard ? (res.boardTrustDelta ?? 0) : 0,
      trustReasonDe: res.trustReasonDe ?? null,
    };
  }
  const first = participants[0]!;
  return {
    turns: [
      {
        speaker: first.name,
        roleDe: first.roleDe,
        textDe: 'Danke für den Punkt — lass uns das anhand der Agenda durchgehen. Aus meiner Sicht ist der wichtigste nächste Schritt, die offenen Themen aus dem Lagebild zu priorisieren. (Offline-Modus: Für lebendige Meetings einen API-Key (OpenAI/Anthropic) hinterlegen.)',
      },
    ],
    boardTrustDelta: 0,
    trustReasonDe: null,
  };
}

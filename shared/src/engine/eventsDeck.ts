import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { ActiveRandomEvent, RandomEventCard } from '../types/randomEvents.js';
import type { MessageSender } from '../types/comms.js';
import type { Occurrence } from '../types/game.js';
import { DIFFICULTIES } from './scenarios/difficulty.js';
import { nextId, schedule } from './stateHelpers.js';
import { pick, stream } from './rng.js';
import { computeValuation } from './kpis.js';
import { addMessage } from './comms.js';

/**
 * Zufalls- & Krisenereignis-Deck (Phase 2: 13 Karten).
 *
 * Jedes Event kommt als Inbox-Nachricht herein und verlangt Reaktion — oder
 * bewusstes Ignorieren (nach Frist greift die Default-Option). Trigger sind
 * seed-gesteuert, szenariogewichtet und zum Teil zustandsabhängig
 * (Tech-Debt ⇒ Outage, Covenant-Bruch ⇒ Bank ruft an).
 */

export const EVENT_CARDS: RandomEventCard[] = [
  {
    id: 'KEY_ACCOUNT_AT_RISK',
    titleDe: 'Key Account droht zu kündigen',
    bodyTemplateDe:
      '${contact} von ${account} (MRR ${mrr}) hat angerufen: Man prüfe „Alternativen am Markt“. Gründe: zwei ungelöste Support-Eskalationen und das Gefühl, „nur noch eine Nummer“ zu sein. Das Renewal steht in ${renewalWeeks} Wochen an.',
    baseWeeklyWeight: 0.06,
    cooldownWeeks: 10,
    minWeek: 2,
    options: [
      {
        id: 'ceo_call_discount',
        labelDe: 'CEO-Termin + 15 % Loyalitätsrabatt für 12 Monate',
        immediateEffects: [{ kind: 'KEY_ACCOUNT_HEALTH_DELTA', accountId: 'BOUND', amount: 30 }],
        scheduledEffects: [],
        processQualityHint: 'defensible',
      },
      {
        id: 'cs_taskforce',
        labelDe: 'CS-Taskforce: 2 Wochen dedizierte Betreuung + Eskalations-Fix (12 k€)',
        immediateEffects: [
          { kind: 'KEY_ACCOUNT_HEALTH_DELTA', accountId: 'BOUND', amount: 22 },
          { kind: 'ONE_OFF_COST', amount: 12_000, labelDe: 'CS-Taskforce Key Account' },
        ],
        scheduledEffects: [{ delayWeeks: 2, effect: { kind: 'KEY_ACCOUNT_HEALTH_DELTA', accountId: 'BOUND', amount: 8 } }],
        processQualityHint: 'good',
      },
      {
        id: 'ignore',
        labelDe: 'Nicht reagieren („Der beruhigt sich wieder“)',
        immediateEffects: [{ kind: 'KEY_ACCOUNT_HEALTH_DELTA', accountId: 'BOUND', amount: -25 }],
        scheduledEffects: [],
        processQualityHint: 'bad',
      },
    ],
    defaultOptionId: 'ignore',
    autoResolveAfterWeeks: 2,
  },
  {
    id: 'ENGINEER_POACHED',
    titleDe: 'Konkurrenz-Offer für Schlüssel-Engineer',
    bodyTemplateDe:
      '${person} (${role}, Schlüsselperson) legt ein schriftliches Angebot von ${competitor} vor: +${offerPct} % Gehalt. ${person} würde „eigentlich gern bleiben“, will aber bis Ende nächster Woche Klarheit.',
    baseWeeklyWeight: 0.05,
    cooldownWeeks: 12,
    minWeek: 3,
    options: [
      {
        id: 'match_offer',
        labelDe: 'Angebot matchen (+20 % Gehalt für die Person)',
        immediateEffects: [{ kind: 'SATISFACTION_DELTA', dept: 'engineering', amount: 3 }],
        scheduledEffects: [{ delayWeeks: 3, effect: { kind: 'SATISFACTION_DELTA', dept: 'all', amount: -2 } }],
        processQualityHint: 'defensible',
      },
      {
        id: 'counter_growth',
        labelDe: 'Gegenangebot ohne Match: Tech-Lead-Rolle + Weiterbildungsbudget (6 k€)',
        immediateEffects: [{ kind: 'ONE_OFF_COST', amount: 6_000, labelDe: 'Weiterbildungspaket' }],
        scheduledEffects: [],
        processQualityHint: 'good',
      },
      {
        id: 'let_go',
        labelDe: 'Ziehen lassen („Niemand ist unersetzlich“)',
        immediateEffects: [],
        scheduledEffects: [],
        processQualityHint: 'risky',
      },
    ],
    defaultOptionId: 'let_go',
    autoResolveAfterWeeks: 2,
  },
  {
    id: 'MINOR_OUTAGE',
    titleDe: 'Ausfall: Plattform 6 Stunden offline',
    bodyTemplateDe:
      'Heute Nacht war die Plattform 6 Stunden nicht erreichbar — Auslöser war eine Alt-Komponente aus dem Tech-Debt-Bestand (Score: ${techDebt}/100). ${tickets} Support-Tickets, drei Key-Accounts fragen nach dem Bericht. Erste Erwähnungen auf LinkedIn.',
    baseWeeklyWeight: 0.04,
    cooldownWeeks: 8,
    minWeek: 2,
    options: [
      {
        id: 'public_postmortem',
        labelDe: 'Öffentliches Post-Mortem + Gutschrift für Betroffene (15 k€)',
        immediateEffects: [
          { kind: 'ONE_OFF_COST', amount: 15_000, labelDe: 'Service-Gutschriften Outage' },
          { kind: 'REPUTATION_DELTA', dimension: 'customers', amount: 4 },
          { kind: 'REPUTATION_DELTA', dimension: 'press', amount: 3 },
        ],
        scheduledEffects: [],
        processQualityHint: 'good',
      },
      {
        id: 'quiet_fix',
        labelDe: 'Still beheben, keine Kommunikation',
        immediateEffects: [{ kind: 'REPUTATION_DELTA', dimension: 'customers', amount: -3 }],
        scheduledEffects: [
          { delayWeeks: 2, effect: { kind: 'PRESS_STORY', tone: 'negative', topicDe: 'Blog eines Kunden: „Anbieter schwieg 6 Stunden lang“' } },
        ],
        processQualityHint: 'risky',
      },
    ],
    defaultOptionId: 'quiet_fix',
    autoResolveAfterWeeks: 2,
  },
  {
    id: 'SECURITY_BREACH',
    titleDe: 'Security-Breach: Kundendaten abgeflossen (DSGVO!)',
    bodyTemplateDe:
      'Das Engineering hat verdächtige Zugriffe entdeckt: Über eine ungepatchte Schnittstelle sind Kontaktdaten von ~${records} Kunden abgeflossen. Nach Art. 33 DSGVO läuft ab JETZT die 72-Stunden-Frist für die Meldung an die Aufsichtsbehörde. Die Forensik läuft, der CTO wartet auf deine Entscheidung zur Kommunikation.',
    baseWeeklyWeight: 0.025,
    cooldownWeeks: 30,
    minWeek: 6,
    options: [
      {
        id: 'report_notify',
        labelDe: 'Binnen 72 h melden + betroffene Kunden aktiv informieren (25 k€ Forensik/Komms)',
        immediateEffects: [
          { kind: 'ONE_OFF_COST', amount: 25_000, labelDe: 'Forensik + Breach-Kommunikation' },
          { kind: 'REPUTATION_DELTA', dimension: 'customers', amount: -2 },
          { kind: 'REPUTATION_DELTA', dimension: 'press', amount: -2 },
          { kind: 'ADD_MODIFIER', modifier: { target: 'churnMonthly', factor: 1.05, startWeek: 0, endWeek: 0, sourceDe: 'Breach-Verunsicherung' } },
        ],
        scheduledEffects: [{ delayWeeks: 4, effect: { kind: 'REPUTATION_DELTA', dimension: 'customers', amount: 4 } }],
        processQualityHint: 'good',
      },
      {
        id: 'report_only',
        labelDe: 'Nur der Behörde melden, Kunden nicht aktiv informieren (10 k€)',
        immediateEffects: [{ kind: 'ONE_OFF_COST', amount: 10_000, labelDe: 'Forensik Breach' }],
        scheduledEffects: [{ delayWeeks: 7, effect: { kind: 'DELAYED_SCANDAL', probability: 0.35, fine: 40_000, topicDe: 'Datenpanne wurde Kunden verschwiegen' } }],
        processQualityHint: 'risky',
      },
      {
        id: 'conceal',
        labelDe: 'Aussitzen und hoffen, dass es niemand merkt',
        immediateEffects: [],
        scheduledEffects: [{ delayWeeks: 8, effect: { kind: 'DELAYED_SCANDAL', probability: 0.6, fine: 120_000, topicDe: 'Vertuschte Datenpanne — Meldepflicht verletzt' } }],
        processQualityHint: 'bad',
      },
    ],
    defaultOptionId: 'conceal',
    autoResolveAfterWeeks: 1, // 72h-Frist!
  },
  {
    id: 'SHITSTORM',
    titleDe: 'Shitstorm auf Social Media',
    bodyTemplateDe:
      'Ein verärgerter Ex-Kunde hat einen Thread über euch geschrieben — Screenshots, spitze Formulierungen, ${reposts}+ Reposts in 24 Stunden. Der Ton kippt gerade von „ärgerlich“ zu „hämisch“. Marketing fragt im Minutentakt, ob es eine Sprachregelung gibt.',
    baseWeeklyWeight: 0.035,
    cooldownWeeks: 16,
    minWeek: 4,
    options: [
      {
        id: 'apologize',
        labelDe: 'Sachlich & öffentlich antworten: Fehler einräumen, Fix zusagen',
        immediateEffects: [{ kind: 'REPUTATION_DELTA', dimension: 'press', amount: -1 }],
        scheduledEffects: [{ delayWeeks: 2, effect: { kind: 'REPUTATION_DELTA', dimension: 'press', amount: 4 } }],
        processQualityHint: 'good',
      },
      {
        id: 'sit_out',
        labelDe: 'Aussitzen — kein Kommentar',
        immediateEffects: [
          { kind: 'REPUTATION_DELTA', dimension: 'press', amount: -4 },
          { kind: 'ADD_MODIFIER', modifier: { target: 'leadGen', factor: 0.9, startWeek: 0, endWeek: 0, sourceDe: 'Shitstorm-Nachwirkung' } },
        ],
        scheduledEffects: [],
        processQualityHint: 'risky',
      },
      {
        id: 'counterattack',
        labelDe: 'Gegenangriff: Ex-Kunden öffentlich widerlegen (riskant!)',
        immediateEffects: [],
        scheduledEffects: [],
        processQualityHint: 'risky',
      },
    ],
    defaultOptionId: 'sit_out',
    autoResolveAfterWeeks: 1,
  },
  {
    id: 'CEASE_DESIST',
    titleDe: 'Abmahnung: Patenttroll meldet sich',
    bodyTemplateDe:
      'Eine Kanzlei aus München mahnt euch im Auftrag der „${troll}“ ab: Euer Ticket-Routing verletze angeblich ein Softwarepatent von 2011. Gefordert: Unterlassung + 30 k€ „Lizenzpauschale“. Euer Anwalt hält das Patent für wackelig — aber ein Verfahren kostet Zeit, Geld und Nerven.',
    baseWeeklyWeight: 0.02,
    cooldownWeeks: 40,
    minWeek: 8,
    options: [
      {
        id: 'settle',
        labelDe: 'Zähneknirschend zahlen (30 k€, Ruhe sofort)',
        immediateEffects: [{ kind: 'ONE_OFF_COST', amount: 30_000, labelDe: 'Vergleich Patentabmahnung' }],
        scheduledEffects: [],
        processQualityHint: 'defensible',
      },
      {
        id: 'fight',
        labelDe: 'Verteidigen: Kanzlei mandatieren (3 × 8 k€ über 12 Wochen, Restrisiko)',
        immediateEffects: [{ kind: 'ONE_OFF_COST', amount: 8_000, labelDe: 'Anwaltskosten Patentstreit (1/3)' }],
        scheduledEffects: [
          { delayWeeks: 4, effect: { kind: 'ONE_OFF_COST', amount: 8_000, labelDe: 'Anwaltskosten Patentstreit (2/3)' } },
          { delayWeeks: 8, effect: { kind: 'ONE_OFF_COST', amount: 8_000, labelDe: 'Anwaltskosten Patentstreit (3/3)' } },
          { delayWeeks: 12, effect: { kind: 'DELAYED_SCANDAL', probability: 0.3, fine: 60_000, topicDe: 'Patentstreit in erster Instanz verloren' } },
        ],
        processQualityHint: 'defensible',
      },
    ],
    defaultOptionId: 'settle',
    autoResolveAfterWeeks: 3,
  },
  {
    id: 'DOWNTURN',
    titleDe: 'Wirtschaftsabschwung: Budgets frieren ein',
    bodyTemplateDe:
      'Die Einkaufsabteilungen eurer Zielkunden treten auf die Bremse: Zwei laufende Deals wurden „auf Q-nächstes verschoben“, der Branchenindex ist die dritte Woche in Folge gefallen. Der Head of Sales rechnet mit 10–15 % weniger Neugeschäft für die nächsten Monate.',
    baseWeeklyWeight: 0.015,
    cooldownWeeks: 52,
    minWeek: 10,
    options: [
      {
        id: 'hold_course',
        labelDe: 'Kurs halten: Investitionen weiterfahren, durchtauchen',
        immediateEffects: [{ kind: 'DEMAND_SHIFT', factor: 0.87, weeks: 12, sourceDe: 'Wirtschaftsabschwung' }],
        scheduledEffects: [],
        processQualityHint: 'defensible',
      },
      {
        id: 'preempt',
        labelDe: 'Sparprogramm ankündigen (Moral ↓, Investoren beruhigt)',
        immediateEffects: [
          { kind: 'DEMAND_SHIFT', factor: 0.87, weeks: 12, sourceDe: 'Wirtschaftsabschwung' },
          { kind: 'SATISFACTION_DELTA', dept: 'all', amount: -4 },
          { kind: 'REPUTATION_DELTA', dimension: 'investors', amount: 4 },
        ],
        scheduledEffects: [],
        processQualityHint: 'defensible',
      },
    ],
    defaultOptionId: 'hold_course',
    autoResolveAfterWeeks: 2,
  },
  {
    id: 'JOURNALIST_INQUIRY',
    titleDe: 'Journalist fragt kritisch an',
    bodyTemplateDe:
      '${journalist} vom Branchenmagazin „Digitalwirtschaft heute“ recherchiert zu „Wachstumsschmerzen im Mittelstands-SaaS“ — und hat offenbar mit Ex-Mitarbeitern gesprochen. Die Anfrage: 30 Minuten Interview mit dir, Deadline Freitag. Antworten werden zitiert — auch verkürzt.',
    baseWeeklyWeight: 0.04,
    cooldownWeeks: 12,
    minWeek: 3,
    options: [
      { id: 'interview', labelDe: 'Interview geben — offen, aber vorbereitet', immediateEffects: [], scheduledEffects: [], processQualityHint: 'defensible' },
      {
        id: 'statement',
        labelDe: 'Nur schriftliches Statement (kontrolliert, unpersönlich)',
        immediateEffects: [{ kind: 'REPUTATION_DELTA', dimension: 'press', amount: 1 }],
        scheduledEffects: [],
        processQualityHint: 'defensible',
      },
      {
        id: 'ignore',
        labelDe: 'Nicht reagieren',
        immediateEffects: [{ kind: 'REPUTATION_DELTA', dimension: 'press', amount: -3 }],
        scheduledEffects: [{ delayWeeks: 1, effect: { kind: 'PRESS_STORY', tone: 'negative', topicDe: '„Das Unternehmen wollte sich auf Anfrage nicht äußern“' } }],
        processQualityHint: 'risky',
      },
    ],
    defaultOptionId: 'ignore',
    autoResolveAfterWeeks: 1,
  },
  {
    id: 'ACQUISITION_OFFER',
    titleDe: 'Übernahmeangebot eines Wettbewerbers',
    bodyTemplateDe:
      'Der CEO von ${competitor} hat dich nach der Branchenkonferenz beiseitegenommen: Man wolle „anorganisch wachsen“ und bietet ${price} für 100 % der Anteile — Vollzug in 90 Tagen, Managementbindung 18 Monate. Das Angebot liegt schriftlich vor und ist 3 Wochen gültig. Das Board weiß noch nichts.',
    baseWeeklyWeight: 0.012,
    cooldownWeeks: 45,
    minWeek: 16,
    options: [
      { id: 'accept', labelDe: 'Annehmen — verkaufen und Exit realisieren', immediateEffects: [], scheduledEffects: [], processQualityHint: 'defensible' },
      { id: 'counter', labelDe: 'Nachverhandeln — höherer Preis oder kein Deal', immediateEffects: [], scheduledEffects: [], processQualityHint: 'defensible' },
      { id: 'explore', labelDe: 'Gespräche führen, Optionen offenhalten (Leak-Risiko)', immediateEffects: [], scheduledEffects: [], processQualityHint: 'defensible' },
      {
        id: 'decline',
        labelDe: 'Höflich ablehnen — wir bauen selbst',
        immediateEffects: [{ kind: 'REPUTATION_DELTA', dimension: 'investors', amount: 2 }],
        scheduledEffects: [],
        processQualityHint: 'good',
      },
    ],
    defaultOptionId: 'decline',
    autoResolveAfterWeeks: 3,
  },
  {
    id: 'GRANT_AWARD',
    titleDe: 'Förderbescheid: Digitalpreis gewonnen!',
    bodyTemplateDe:
      'Überraschungspost vom Wirtschaftsministerium: Eure Bewerbung beim Landes-Digitalpreis (eingereicht von der Marketing-Managerin, bevor du kamst) war erfolgreich — 50 k€ Preisgeld, Übergabe mit Presse-Termin. Glückwunsch. Die Frage ist nur, was ihr daraus macht.',
    baseWeeklyWeight: 0.018,
    cooldownWeeks: 50,
    minWeek: 5,
    options: [
      {
        id: 'accept_celebrate',
        labelDe: 'Annehmen, Team feiern lassen, Presse mitnehmen',
        immediateEffects: [
          { kind: 'ONE_OFF_INCOME', amount: 50_000, labelDe: 'Preisgeld Digitalpreis' },
          { kind: 'REPUTATION_DELTA', dimension: 'press', amount: 4 },
          { kind: 'SATISFACTION_DELTA', dept: 'all', amount: 3 },
        ],
        scheduledEffects: [],
        processQualityHint: 'good',
      },
      {
        id: 'donate',
        labelDe: 'Preisgeld für Ausbildungsprojekte spenden (PR-Coup, kein Cash)',
        immediateEffects: [
          { kind: 'REPUTATION_DELTA', dimension: 'press', amount: 7 },
          { kind: 'REPUTATION_DELTA', dimension: 'laborMarket', amount: 4 },
          { kind: 'SATISFACTION_DELTA', dept: 'all', amount: 4 },
        ],
        scheduledEffects: [],
        processQualityHint: 'defensible',
      },
    ],
    defaultOptionId: 'accept_celebrate',
    autoResolveAfterWeeks: 2,
  },
  {
    id: 'ACCOUNTING_FRAUD',
    titleDe: 'Betrugsfall in der Buchhaltung',
    bodyTemplateDe:
      'Der Controller bittet dich unter vier Augen um ein Gespräch: Beim Abgleich der Kreditorenkonten sind Scheinrechnungen über insgesamt ~35 k€ aufgefallen — mutmaßlich über Monate von einer Person in der Verwaltung gesteuert. Die Beweislage ist solide. Wie gehst du vor?',
    baseWeeklyWeight: 0.012,
    cooldownWeeks: 60,
    minWeek: 12,
    options: [
      {
        id: 'disclose',
        labelDe: 'Anzeigen, Person freistellen, Board & Team transparent informieren',
        immediateEffects: [
          { kind: 'ONE_OFF_COST', amount: 35_000, labelDe: 'Abschreibung Betrugsschaden' },
          { kind: 'REPUTATION_DELTA', dimension: 'investors', amount: 4 },
          { kind: 'REPUTATION_DELTA', dimension: 'press', amount: -2 },
        ],
        scheduledEffects: [],
        processQualityHint: 'good',
      },
      {
        id: 'quiet',
        labelDe: 'Still trennen, Schaden abschreiben, kein Aufheben',
        immediateEffects: [{ kind: 'ONE_OFF_COST', amount: 35_000, labelDe: 'Abschreibung Unregelmäßigkeiten' }],
        scheduledEffects: [{ delayWeeks: 6, effect: { kind: 'DELAYED_SCANDAL', probability: 0.4, fine: 25_000, topicDe: 'Vertuschter Betrugsfall wird publik' } }],
        processQualityHint: 'risky',
      },
    ],
    defaultOptionId: 'quiet',
    autoResolveAfterWeeks: 2,
  },
  {
    id: 'BANK_COVENANT_CALL',
    titleDe: 'Die Bank ruft an: Covenant verletzt',
    bodyTemplateDe:
      'Euer Firmenkundenbetreuer war ungewohnt förmlich: Die Mindestliquidität aus dem Kreditvertrag ist seit ${breachWeeks} Wochen unterschritten (Lücke: ${gap}). Man „müsse den Fall intern neu bewerten“ — sprich: Ohne glaubwürdigen Plan kann die Linie fällig gestellt werden.',
    baseWeeklyWeight: 0.5, // konditional: feuert nur bei anhaltender Verletzung
    cooldownWeeks: 20,
    minWeek: 4,
    options: [
      { id: 'cure', labelDe: 'Sondertilgung: Covenant sofort heilen (drückt die Kasse weiter)', immediateEffects: [], scheduledEffects: [], processQualityHint: 'defensible' },
      {
        id: 'waiver',
        labelDe: 'Waiver verhandeln: 15 k€ Gebühr, 8 Wochen Schonfrist',
        immediateEffects: [{ kind: 'ONE_OFF_COST', amount: 15_000, labelDe: 'Covenant-Waiver-Gebühr' }],
        scheduledEffects: [],
        processQualityHint: 'defensible',
      },
      { id: 'story', labelDe: 'Auf die Equity-Story setzen: Plan präsentieren, um Geduld bitten', immediateEffects: [], scheduledEffects: [], processQualityHint: 'risky' },
    ],
    defaultOptionId: 'story',
    autoResolveAfterWeeks: 2,
  },
  {
    id: 'PARTNERSHIP_OFFER',
    titleDe: 'Partnerschafts-Anfrage',
    bodyTemplateDe:
      'Die Geschäftsführung von ${partner} schlägt eine Vertriebspartnerschaft vor: gemeinsames Webinar-Programm, gegenseitige Empfehlungen, Co-Marketing-Budget. Ihre Kundenbasis überschneidet sich kaum mit eurer — das könnte ein günstiger Lead-Kanal sein. Oder verschwendete Zeit.',
    baseWeeklyWeight: 0.03,
    cooldownWeeks: 20,
    minWeek: 4,
    options: [
      {
        id: 'co_marketing',
        labelDe: 'Partnerschaft eingehen: Co-Marketing (8 k€, Lead-Schub für 8 Wochen)',
        immediateEffects: [
          { kind: 'ONE_OFF_COST', amount: 8_000, labelDe: 'Co-Marketing-Paket Partnerschaft' },
          { kind: 'ADD_MODIFIER', modifier: { target: 'leadGen', factor: 1.15, startWeek: 0, endWeek: 0, sourceDe: 'Vertriebspartnerschaft' } },
        ],
        scheduledEffects: [],
        processQualityHint: 'defensible',
      },
      { id: 'decline', labelDe: 'Freundlich ablehnen — Fokus halten', immediateEffects: [], scheduledEffects: [], processQualityHint: 'defensible' },
    ],
    defaultOptionId: 'decline',
    autoResolveAfterWeeks: 3,
  },
  {
    // Phase 6: nur börsennotiert relevant — weightFor gated auf pendingAdhocTopicDe.
    id: 'ADHOC_DUTY',
    titleDe: 'Ad-hoc-Pflicht: kursrelevante Insiderinformation',
    bodyTemplateDe:
      'Euer Kapitalmarktrechtler am Telefon, ungewohnt ernst: „${topic}" erfüllt alle Merkmale einer Insiderinformation nach Art. 17 MAR — euch unmittelbar betreffend, nicht öffentlich, kurserheblich. Grundsatz: UNVERZÜGLICHE Ad-hoc-Veröffentlichung. Ein Aufschub ist nur zulässig, wenn berechtigte Interessen ihn erfordern, keine Irreführung droht und Vertraulichkeit gewährleistet ist — und er fliegt euch um die Ohren, wenn es vorher leakt. Der Kurs wird so oder so leiden. Die Frage ist: kontrolliert jetzt oder unkontrolliert später.',
    baseWeeklyWeight: 0,
    cooldownWeeks: 0,
    minWeek: 0,
    options: [
      { id: 'disclose', labelDe: 'Sofort Ad-hoc veröffentlichen — Kursdelle, aber sauber', immediateEffects: [], scheduledEffects: [], processQualityHint: 'good' },
      { id: 'defer', labelDe: 'Formalen Aufschub beschließen und erst intern klären (Leak-Risiko, BaFin-Risiko)', immediateEffects: [], scheduledEffects: [], processQualityHint: 'risky' },
    ],
    defaultOptionId: 'disclose',
    autoResolveAfterWeeks: 1,
  },
];

// ────────────────────────────────────────────────────────────────────
// Karten-Hooks: Gewicht, Bindung, Absender der Inbox-Mail
// ────────────────────────────────────────────────────────────────────

function weightFor(card: RandomEventCard, state: CompanyState): number {
  const diff = DIFFICULTIES[state.meta.difficulty];
  let weight = card.baseWeeklyWeight * diff.eventWeightMult;
  switch (card.id) {
    case 'MINOR_OUTAGE':
      weight *= Math.max(0.2, state.product.techDebt / 45);
      break;
    case 'KEY_ACCOUNT_AT_RISK':
      weight *= state.customers.keyAccounts.some((k) => k.status === 'ok' && k.health < 60) ? 1.6 : 0.5;
      break;
    case 'SHITSTORM':
      weight *= state.reputation.press < 45 ? 1.6 : 0.8;
      break;
    case 'SECURITY_BREACH':
      weight *= Math.max(0.4, state.product.techDebt / 60);
      break;
    case 'BANK_COVENANT_CALL':
      // Konditional: nur bei ≥ 2 Wochen anhaltender minCash-Verletzung.
      if (state.finance.consecutiveMinCashBreachWeeks < 2) return 0;
      break;
    case 'ACQUISITION_OFFER': {
      // Attraktive Firmen werden eher angesprochen.
      const growth = state.history.length >= 5 ? 1.2 : 0.8;
      weight *= growth;
      break;
    }
    case 'ADHOC_DUTY':
      // Garantierter Trigger, sobald eine Ad-hoc-Pflicht ansteht (börsennotiert).
      return state.ipo.pendingAdhocTopicDe !== null ? 9 : 0;
    default:
      break;
  }
  return weight;
}

function bindEntity(card: RandomEventCard, state: CompanyState): { boundEntityId: string | null; ok: boolean } {
  switch (card.id) {
    case 'KEY_ACCOUNT_AT_RISK': {
      const target = [...state.customers.keyAccounts].filter((k) => k.status === 'ok').sort((a, b) => a.health - b.health)[0];
      if (!target) return { boundEntityId: null, ok: false };
      target.status = 'atRisk';
      return { boundEntityId: target.id, ok: true };
    }
    case 'ENGINEER_POACHED': {
      const target = state.people.employees.filter((e) => e.dept === 'engineering' && e.keyPerson).sort((a, b) => b.performance - a.performance)[0];
      return target ? { boundEntityId: target.id, ok: true } : { boundEntityId: null, ok: false };
    }
    case 'ACQUISITION_OFFER': {
      const comp = state.market.competitors.find((c) => c.strategy === 'enterpriseMove') ?? state.market.competitors[0];
      return comp ? { boundEntityId: comp.id, ok: true } : { boundEntityId: null, ok: false };
    }
    default:
      return { boundEntityId: null, ok: true };
  }
}

const PARTNER_POOL = ['Fernwerk Solutions GmbH', 'Bluetal Software AG', 'Konturo Systems', 'Nordlicht Digital GmbH'];
const JOURNALIST_POOL = ['Carla Simon', 'Jens Albach', 'Nora Wittkamp'];

function renderBody(card: RandomEventCard, state: CompanyState, instance: Pick<ActiveRandomEvent, 'boundEntityId' | 'data'>): string {
  let body = card.bodyTemplateDe;
  const fill = (key: string, value: string) => {
    body = body.split('${' + key + '}').join(value);
  };
  const k = (v: number) => `${Math.round(v / 1000)} k€`;
  switch (card.id) {
    case 'KEY_ACCOUNT_AT_RISK': {
      const ka = state.customers.keyAccounts.find((x) => x.id === instance.boundEntityId);
      if (ka) {
        fill('account', ka.name);
        fill('contact', 'Frau Berger');
        fill('mrr', k(ka.mrr));
        fill('renewalWeeks', String(Math.max(1, ka.renewalWeek - state.meta.week)));
      }
      break;
    }
    case 'ENGINEER_POACHED': {
      const emp = state.people.employees.find((e) => e.id === instance.boundEntityId);
      if (emp) {
        fill('person', `${emp.firstName} ${emp.lastName}`);
        fill('role', emp.roleTitleDe);
        fill('competitor', state.market.competitors[0]?.name ?? 'einem Wettbewerber');
        fill('offerPct', '20');
      }
      break;
    }
    case 'MINOR_OUTAGE':
      fill('techDebt', String(Math.round(state.product.techDebt)));
      fill('tickets', String(40 + Math.round(state.product.bugBacklog)));
      break;
    case 'SECURITY_BREACH':
      fill('records', String(instance.data.records ?? 1200));
      break;
    case 'SHITSTORM':
      fill('reposts', String(instance.data.reposts ?? 400));
      break;
    case 'CEASE_DESIST':
      fill('troll', 'IP Verwertungs GmbH & Co. KG');
      break;
    case 'JOURNALIST_INQUIRY':
      fill('journalist', JOURNALIST_POOL[(state.meta.week + state.idCounter) % JOURNALIST_POOL.length] ?? 'Carla Simon');
      break;
    case 'ACQUISITION_OFFER': {
      const comp = state.market.competitors.find((c) => c.id === instance.boundEntityId);
      fill('competitor', comp?.name ?? 'Vantiro');
      fill('price', `${((instance.data.priceEur ?? 0) / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} M€`);
      break;
    }
    case 'BANK_COVENANT_CALL':
      fill('breachWeeks', String(state.finance.consecutiveMinCashBreachWeeks));
      fill('gap', k(instance.data.gap ?? 0));
      break;
    case 'PARTNERSHIP_OFFER':
      fill('partner', PARTNER_POOL[(state.meta.week + state.idCounter) % PARTNER_POOL.length] ?? PARTNER_POOL[0]!);
      break;
    case 'ADHOC_DUTY':
      fill('topic', state.ipo.pendingAdhocTopicDe ?? 'Kursrelevantes Ereignis');
      break;
    default:
      break;
  }
  return body;
}

function mailSender(card: RandomEventCard, state: CompanyState, instance: ActiveRandomEvent): MessageSender {
  switch (card.id) {
    case 'KEY_ACCOUNT_AT_RISK': {
      const ka = state.customers.keyAccounts.find((x) => x.id === instance.boundEntityId);
      return { name: 'Frau Berger', roleDe: 'Einkauf', refId: instance.boundEntityId, company: ka?.name ?? null };
    }
    case 'ENGINEER_POACHED':
      return { name: 'Persönlich & vertraulich', roleDe: 'Mitarbeitergespräch', refId: instance.boundEntityId, company: null };
    case 'MINOR_OUTAGE':
    case 'SECURITY_BREACH':
      return { name: 'Incident-Response', roleDe: 'Engineering', refId: null, company: null };
    case 'JOURNALIST_INQUIRY':
      return { name: 'Redaktion', roleDe: 'Presseanfrage', refId: null, company: 'Digitalwirtschaft heute' };
    case 'ACQUISITION_OFFER': {
      const comp = state.market.competitors.find((c) => c.id === instance.boundEntityId);
      return { name: 'CEO', roleDe: 'M&A-Anfrage', refId: instance.boundEntityId, company: comp?.name ?? null };
    }
    case 'BANK_COVENANT_CALL':
      return { name: 'Firmenkundenbetreuung', roleDe: 'Ihre Hausbank', refId: null, company: 'Bayerische Handelsbank' };
    case 'PARTNERSHIP_OFFER':
      return { name: 'Geschäftsführung', roleDe: 'Partnerschaft', refId: null, company: 'Partnerunternehmen' };
    case 'GRANT_AWARD':
      return { name: 'Referat Digitalförderung', roleDe: 'Behörde', refId: null, company: 'Wirtschaftsministerium' };
    case 'ACCOUNTING_FRAUD':
      return { name: 'Controlling', roleDe: 'Vertraulich', refId: null, company: null };
    case 'ADHOC_DUTY':
      return { name: 'Dr. Katharina Brandt', roleDe: 'Kapitalmarktrecht', refId: null, company: 'Brandt & Kollegen' };
    default:
      return { name: 'Extern', roleDe: 'Eingang', refId: null, company: null };
  }
}

/** Beim Trigger festzuschreibende dynamische Zahlen. */
function instanceData(card: RandomEventCard, state: CompanyState): Record<string, number> {
  switch (card.id) {
    case 'SECURITY_BREACH': {
      const rng = stream(state.meta.seed, 'breach-size', state.meta.week);
      return { records: 400 + Math.floor(rng() * 2600) };
    }
    case 'SHITSTORM': {
      const rng = stream(state.meta.seed, 'storm-size', state.meta.week);
      return { reposts: 200 + Math.floor(rng() * 1800) };
    }
    case 'ACQUISITION_OFFER': {
      const valuation = computeValuation(state).value;
      return { priceEur: Math.round((valuation * 0.85) / 100_000) * 100_000 };
    }
    case 'BANK_COVENANT_CALL': {
      const cov = state.finance.debt.covenants.find((c) => c.type === 'minCash');
      const gap = cov && cov.type === 'minCash' ? Math.max(0, cov.value - state.finance.cash) : 0;
      return { gap: Math.round(gap) };
    }
    default:
      return {};
  }
}

// ────────────────────────────────────────────────────────────────────
// Trigger & Auflösung
// ────────────────────────────────────────────────────────────────────

export function maybeTriggerEvents(state: CompanyState, occurrences: Occurrence[]): ActiveRandomEvent[] {
  const week = state.meta.week;
  const rng = stream(state.meta.seed, 'events', week);
  const triggered: ActiveRandomEvent[] = [];

  for (const card of EVENT_CARDS) {
    if (triggered.length >= 1) break;
    if (week < card.minWeek) continue;
    const lastFired = state.eventCooldowns[card.id];
    if (lastFired !== undefined && week - lastFired < card.cooldownWeeks) continue;
    if (state.openEvents.some((e) => e.cardId === card.id && e.status === 'open')) continue;
    if (rng() >= weightFor(card, state)) continue;

    const bound = bindEntity(card, state);
    if (!bound.ok) continue;

    const data = instanceData(card, state);
    const instance: ActiveRandomEvent = {
      instanceId: nextId(state, 'ev'),
      cardId: card.id,
      triggeredWeek: week,
      bodyDe: '',
      boundEntityId: bound.boundEntityId,
      data,
      status: 'open',
      resolvedWeek: null,
      chosenOptionId: null,
    };
    instance.bodyDe = renderBody(card, state, instance);
    state.openEvents.push(instance);
    state.eventCooldowns[card.id] = week;
    triggered.push(instance);
    occurrences.push({ icon: '🚨', textDe: `Ereignis: ${card.titleDe}`, severity: card.id === 'GRANT_AWARD' ? 'good' : 'bad' });

    // Das Ereignis kommt als Inbox-Nachricht herein (Phase 2).
    addMessage(state, {
      from: mailSender(card, state, instance),
      subjectDe: card.titleDe,
      bodyDe: instance.bodyDe,
      kind: 'event',
      eventInstanceId: instance.instanceId,
      delegable: false,
      suggestedActionType: null,
      templateId: 'event:' + card.id,
      priority: 'hoch',
    });
  }
  return triggered;
}

export function resolveEventOption(
  state: CompanyState,
  instanceId: string,
  optionId: string,
  decisionId: string | null,
): { summaryDe: string; analysisDe: string[] } {
  const instance = state.openEvents.find((e) => e.instanceId === instanceId);
  if (!instance || instance.status !== 'open') throw new Error('Ereignis nicht offen.');
  const card = EVENT_CARDS.find((c) => c.id === instance.cardId);
  if (!card) throw new Error('Unbekannte Ereigniskarte.');
  const option = card.options.find((o) => o.id === optionId);
  if (!option) throw new Error('Unbekannte Option.');

  const analysis = applyOption(state, instance, card, option, decisionId);
  instance.status = 'resolved';
  instance.resolvedWeek = state.meta.week;
  instance.chosenOptionId = optionId;
  const mail = state.comms.messages.find((m) => m.eventInstanceId === instanceId);
  if (mail) mail.handledWeek = state.meta.week;

  analysis.push(`Prozess-Einordnung der gewählten Option: ${qualityDe(option.processQualityHint)}.`);
  return { summaryDe: `${card.titleDe} → ${option.labelDe}`, analysisDe: analysis };
}

function qualityDe(q: string): string {
  return (
    { good: 'sauber (Ursache adressiert)', defensible: 'vertretbar (bewusster Trade-off)', risky: 'riskant (Wette auf Glück)', bad: 'schwach (Problem ignoriert)' }[q] ?? q
  );
}

function applyOption(
  state: CompanyState,
  instance: ActiveRandomEvent,
  card: RandomEventCard,
  option: RandomEventCard['options'][number],
  decisionId: string | null,
): string[] {
  const src = `Ereignis „${card.titleDe}“`;
  const analysis: string[] = [];
  const week = state.meta.week;

  for (const fx of option.immediateEffects) {
    schedule(state, 0, src, decisionId, bindEffect(fx, instance, week), 'event');
  }
  for (const { delayWeeks, effect } of option.scheduledEffects) {
    schedule(state, delayWeeks, src, decisionId, bindEffect(effect, instance, week + delayWeeks), 'event');
  }

  // Kartenspezifische Direktfolgen
  switch (card.id) {
    case 'KEY_ACCOUNT_AT_RISK': {
      const ka = state.customers.keyAccounts.find((k) => k.id === instance.boundEntityId);
      if (ka) {
        if (option.id === 'ceo_call_discount') {
          ka.mrr = Math.round(ka.mrr * 0.85);
          ka.status = 'ok';
          analysis.push('Der Rabatt senkt den MRR dieses Accounts sofort um 15 % — dafür steigt die Rettungswahrscheinlichkeit deutlich.');
        } else if (option.id === 'cs_taskforce') {
          ka.status = 'ok';
        }
      }
      break;
    }
    case 'ENGINEER_POACHED': {
      const emp = state.people.employees.find((e) => e.id === instance.boundEntityId);
      if (emp) {
        if (option.id === 'match_offer') {
          emp.salaryMonthly = Math.round(emp.salaryMonthly * 1.2);
          emp.satisfaction = clamp(emp.satisfaction + 12, 0, 100);
          analysis.push('Achtung Präzedenzfall: Gehalts-Matches sprechen sich herum — die Erwartungen im Team steigen mit.');
        } else if (option.id === 'counter_growth') {
          const rng = stream(state.meta.seed, 'poach-counter', week, state.idCounter);
          if (rng() < 0.6) emp.satisfaction = clamp(emp.satisfaction + 8, 0, 100);
          else removeEmployee(state, emp.id);
        } else {
          removeEmployee(state, emp.id);
        }
      }
      break;
    }
    case 'SHITSTORM': {
      if (option.id === 'counterattack') {
        const rng = stream(state.meta.seed, 'storm-counter', week, state.idCounter);
        if (rng() < 0.3) {
          state.reputation.press = clamp(state.reputation.press + 5, 0, 100);
          analysis.push('Der Gegenangriff saß: Die Fakten waren auf eurer Seite, der Thread ist gedreht. Diesmal.');
        } else {
          state.reputation.press = clamp(state.reputation.press - 8, 0, 100);
          state.reputation.customers = clamp(state.reputation.customers - 3, 0, 100);
          analysis.push('Der Gegenangriff ging nach hinten los — „Unternehmen tritt nach unten“ ist jetzt die Story.');
        }
      }
      break;
    }
    case 'JOURNALIST_INQUIRY': {
      if (option.id === 'interview') {
        const rng = stream(state.meta.seed, 'interview', week, state.idCounter);
        const p = 0.5 + state.reputation.press / 400 + (state.playerProfile.strengths.includes('kommunikation') ? 0.12 : 0) - (state.playerProfile.weaknesses.includes('kommunikation') ? 0.12 : 0);
        if (rng() < p) {
          state.reputation.press = clamp(state.reputation.press + 6, 0, 100);
          schedule(state, 1, src, decisionId, { kind: 'ADD_MODIFIER', modifier: { target: 'leadGen', factor: 1.08, startWeek: week + 1, endWeek: week + 7, sourceDe: 'Positives Porträt in der Fachpresse' } }, 'event');
          analysis.push('Das Interview lief gut — ein differenziertes Porträt, das Vertrauen schafft.');
        } else {
          state.reputation.press = clamp(state.reputation.press - 5, 0, 100);
          analysis.push('Ein Halbsatz wurde aus dem Kontext gerissen und ist jetzt die Überschrift. Lektion: Interviews sind kein Gespräch, sie sind Rohmaterial.');
        }
      }
      break;
    }
    case 'ACQUISITION_OFFER': {
      if (option.id === 'accept') {
        const price = instance.data.priceEur ?? 0;
        state.meta.status = 'exited';
        state.meta.endReasonDe = `Exit: Verkauf an ${state.market.competitors.find((c) => c.id === instance.boundEntityId)?.name ?? 'einen Wettbewerber'} für ${(price / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} M€. Dein Anteil (${(state.ceo.equityShare * 100).toFixed(0)} %): ${((price * state.ceo.equityShare) / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} M€ vor Steuern.`;
        analysis.push('Exit realisiert. Ob es der richtige Zeitpunkt war, zeigt das Post-Mortem — Verkaufen ist auch eine Fähigkeit.');
      } else if (option.id === 'counter') {
        // BATNA-Poker: 50/50, ob der Käufer nachlegt oder abspringt.
        const rng = stream(state.meta.seed, 'ma-counter', week, state.idCounter);
        const comp = state.market.competitors.find((c) => c.id === instance.boundEntityId);
        if (rng() < 0.5) {
          const uplift = 1.1 + rng() * 0.05; // +10–15 %
          const newPrice = Math.round(((instance.data.priceEur ?? 0) * uplift) / 100_000) * 100_000;
          const improved: ActiveRandomEvent = {
            instanceId: nextId(state, 'ev'),
            cardId: 'ACQUISITION_OFFER',
            triggeredWeek: week,
            bodyDe: `${comp?.name ?? 'Der Interessent'} hat nachgelegt: Das verbesserte Angebot liegt bei ${(newPrice / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} M€ für 100 % der Anteile („final offer", 3 Wochen gültig). Der M&A-Berater der Gegenseite schreibt dazu: „Mehr gibt das Board nicht frei."`,
            boundEntityId: instance.boundEntityId,
            data: { priceEur: newPrice },
            status: 'open',
            resolvedWeek: null,
            chosenOptionId: null,
          };
          state.openEvents.push(improved);
          addMessage(state, {
            from: { name: 'CEO', roleDe: 'M&A-Anfrage', refId: instance.boundEntityId, company: comp?.name ?? null },
            subjectDe: 'Verbessertes Übernahmeangebot („final offer")',
            bodyDe: improved.bodyDe,
            kind: 'event',
            eventInstanceId: improved.instanceId,
            delegable: false,
            suggestedActionType: null,
            templateId: 'event:ACQUISITION_OFFER',
            priority: 'hoch',
          });
          analysis.push(`Das Pokern hat sich gelohnt: ${comp?.name ?? 'Der Käufer'} legt auf ${(newPrice / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} M€ nach (+${((uplift - 1) * 100).toFixed(0)} %). Das neue Angebot liegt als eigenes Ereignis in der Inbox.`);
        } else {
          state.reputation.investors = clamp(state.reputation.investors + 1, 0, 100);
          analysis.push('Der Käufer zieht zurück: „Dann eben nicht." Nachverhandeln ist immer eine Wette auf die eigene BATNA — diesmal war seine Alternative besser als deine. Das Board respektiert immerhin das Selbstbewusstsein.');
        }
      } else if (option.id === 'explore') {
        const rng = stream(state.meta.seed, 'ma-leak', week, state.idCounter);
        if (rng() < 0.25) {
          schedule(state, 2, src, decisionId, { kind: 'PRESS_STORY', tone: 'neutral', topicDe: 'Gerüchte über Übernahmegespräche machen die Runde' }, 'event');
          analysis.push('Gespräche laufen — aber irgendjemand redet. Übernahmegerüchte verunsichern Kunden und Team.');
        }
      }
      break;
    }
    case 'BANK_COVENANT_CALL': {
      if (option.id === 'cure') {
        const gap = instance.data.gap ?? 0;
        const repay = Math.min(state.finance.debt.principal, gap + 20_000);
        schedule(state, 0, src, decisionId, { kind: 'DEBT_REPAY', amount: repay }, 'event');
        analysis.push(`Sondertilgung über ${Math.round(repay / 1000)} k€ eingeplant — heilt den Covenant, verkürzt aber den Runway.`);
      } else if (option.id === 'story') {
        const rng = stream(state.meta.seed, 'covenant-story', week, state.idCounter);
        if (rng() < state.reputation.investors / 100) {
          analysis.push('Die Bank kauft euch den Plan ab — vorerst. Der nächste Verstoß wird teurer.');
        } else {
          state.ceo.boardTrust = clamp(state.ceo.boardTrust - 6, 0, 100);
          state.ceo.trustLog.push({ week, delta: -6, reasonDe: 'Bank eskaliert Covenant-Bruch ans Board — der Plan hat nicht überzeugt.' });
          analysis.push('Die Bank war nicht überzeugt und hat das Board direkt informiert. Das kostet Vertrauen.');
        }
      }
      break;
    }
    case 'ADHOC_DUTY': {
      const ipo = state.ipo;
      const topic = ipo.pendingAdhocTopicDe ?? 'Kursrelevantes Ereignis';
      if (option.id === 'disclose') {
        if (ipo.sharePrice !== null) ipo.sharePrice = Math.round(ipo.sharePrice * 0.92 * 100) / 100;
        state.reputation.press = clamp(state.reputation.press + 2, 0, 100);
        state.pressLog.push({ week, tone: 'neutral', topicDe: `Ad-hoc-Mitteilung von ${state.identity.companyName}: ${topic}` });
        analysis.push('Der Kurs nimmt ~−8 % — aber kontrolliert, mit eurer Einordnung, ohne Rechtsrisiko. Kapitalmarkt-Vertrauen ist ein Marathon: Wer schlechte Nachrichten selbst meldet, dem glaubt man auch die guten.');
      } else {
        const rng = stream(state.meta.seed, 'adhoc-defer', week, state.idCounter);
        if (rng() < 0.5) {
          if (ipo.sharePrice !== null) ipo.sharePrice = Math.round(ipo.sharePrice * 0.8 * 100) / 100;
          schedule(state, 0, src, decisionId, { kind: 'ONE_OFF_COST', amount: 50_000, labelDe: 'BaFin-Bußgeld: verspätete Ad-hoc-Mitteilung' }, 'event');
          state.reputation.press = clamp(state.reputation.press - 7, 0, 100);
          state.ceo.boardTrust = clamp(state.ceo.boardTrust - 6, 0, 100);
          state.ceo.trustLog.push({ week, delta: -6, reasonDe: 'Ad-hoc-Aufschub geleakt — BaFin-Verfahren, Kurssturz, Vertrauensschaden.' });
          state.pressLog.push({ week, tone: 'negative', topicDe: `${state.identity.companyName} verschwieg kursrelevante Information — BaFin prüft` });
          analysis.push('Es ist geleakt: „Unternehmen verschwieg …" ist jetzt die Schlagzeile. Kurs −20 %, 50 k€ Bußgeld, und ab jetzt liest der Markt jede eurer Meldungen mit spitzen Fingern.');
        } else {
          if (ipo.sharePrice !== null) ipo.sharePrice = Math.round(ipo.sharePrice * 0.97 * 100) / 100;
          analysis.push('Der Aufschub hat gehalten — diesmal. Merke trotzdem: Du hast Rechtsrisiko gegen ein paar Tage Ruhe getauscht. Beim nächsten Mal würfelst du wieder.');
        }
      }
      ipo.pendingAdhocTopicDe = null;
      break;
    }
    default:
      break;
  }
  return analysis;
}

function bindEffect(
  fx: import('../types/effects.js').EffectPayload,
  instance: ActiveRandomEvent,
  effectiveWeek: number,
): import('../types/effects.js').EffectPayload {
  if (fx.kind === 'KEY_ACCOUNT_HEALTH_DELTA' && fx.accountId === 'BOUND') {
    return { ...fx, accountId: instance.boundEntityId ?? fx.accountId };
  }
  // ADD_MODIFIER mit startWeek/endWeek = 0 aus Kartendefinitionen: relative Dauer nachziehen.
  if (fx.kind === 'ADD_MODIFIER' && fx.modifier.startWeek === 0 && fx.modifier.endWeek === 0) {
    const weeks = fx.modifier.sourceDe.includes('Partnerschaft') ? 8 : fx.modifier.sourceDe.includes('Breach') ? 6 : 6;
    return { ...fx, modifier: { ...fx.modifier, startWeek: effectiveWeek, endWeek: effectiveWeek + weeks } };
  }
  return fx;
}

export function removeEmployee(state: CompanyState, employeeId: string): void {
  const idx = state.people.employees.findIndex((e) => e.id === employeeId);
  if (idx >= 0) state.people.employees.splice(idx, 1);
}

export function autoResolveOverdueEvents(state: CompanyState, occurrences: Occurrence[]): void {
  for (const instance of state.openEvents) {
    if (instance.status !== 'open') continue;
    const card = EVENT_CARDS.find((c) => c.id === instance.cardId);
    if (!card) continue;
    if (state.meta.week - instance.triggeredWeek >= card.autoResolveAfterWeeks) {
      const option = card.options.find((o) => o.id === card.defaultOptionId);
      if (!option) continue;
      applyOption(state, instance, card, option, null);
      instance.status = 'autoResolved';
      instance.resolvedWeek = state.meta.week;
      instance.chosenOptionId = option.id;
      const mail = state.comms.messages.find((m) => m.eventInstanceId === instance.instanceId);
      if (mail) mail.handledWeek = state.meta.week;
      occurrences.push({
        icon: '⏰',
        textDe: `Ignoriert und verjährt: „${card.titleDe}“ — Default-Folge: ${option.labelDe}`,
        severity: 'bad',
      });
    }
  }
  // Erledigte Events begrenzen (Verlauf bleibt im Event-Log erhalten).
  if (state.openEvents.length > 60) {
    state.openEvents = state.openEvents.filter((e, i) => e.status === 'open' || i >= state.openEvents.length - 60);
  }
}

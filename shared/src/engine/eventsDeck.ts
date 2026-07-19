import type { CompanyState } from '../types/company.js';
import type { ActiveRandomEvent, RandomEventCard } from '../types/randomEvents.js';
import type { Occurrence } from '../types/game.js';
import { DIFFICULTIES } from './scenarios/difficulty.js';
import { nextId, schedule } from './stateHelpers.js';
import { stream } from './rng.js';

/**
 * Zufalls- & Krisenereignis-Deck.
 *
 * Phase 1: 3 Karten, die die komplette Mechanik tragen (Trigger nach Gewicht/
 * Cooldown/Seed, Bindung an konkrete Entitäten mit NAMEN, Optionen mit
 * Sofort- und Folgeeffekten, Auto-Auflösung bei Ignorieren).
 * Phase 2 erweitert das Deck auf 10+ Karten (DSGVO-Breach mit 72h-Frist,
 * Shitstorm, Covenant-Bruch, Übernahmeangebot, …).
 */

export const EVENT_CARDS: RandomEventCard[] = [
  {
    id: 'KEY_ACCOUNT_AT_RISK',
    titleDe: 'Key Account droht zu kündigen',
    bodyTemplateDe:
      '${contact} von ${account} (MRR ${mrr}) hat angerufen: Man prüfe „Alternativen am Markt". Gründe: zwei ungelöste Support-Eskalationen und das Gefühl, „nur noch eine Nummer" zu sein. Das Renewal steht in ${renewalWeeks} Wochen an.',
    baseWeeklyWeight: 0.06,
    cooldownWeeks: 10,
    minWeek: 2,
    options: [
      {
        id: 'ceo_call_discount',
        labelDe: 'CEO-Termin + 15 % Loyalitätsrabatt für 12 Monate',
        immediateEffects: [{ kind: 'KEY_ACCOUNT_HEALTH_DELTA', accountId: 'BOUND', amount: 30 }],
        scheduledEffects: [{ delayWeeks: 0, effect: { kind: 'ONE_OFF_COST', amount: 0, labelDe: 'Rabatt wirkt über reduzierten MRR' } }],
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
        labelDe: 'Nicht reagieren („Der beruhigt sich wieder")',
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
      '${person} (${role}, Schlüsselperson) legt ein schriftliches Angebot von ${competitor} vor: +${offerPct} % Gehalt. ${person} würde „eigentlich gern bleiben", will aber bis Ende nächster Woche Klarheit.',
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
        labelDe: 'Ziehen lassen („Niemand ist unersetzlich")',
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
    baseWeeklyWeight: 0.04, // wird mit Tech-Debt skaliert (siehe maybeTriggerEvents)
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
          { delayWeeks: 2, effect: { kind: 'PRESS_STORY', tone: 'negative', topicDe: 'Blog eines Kunden: „Anbieter schwieg 6 Stunden lang"' } },
        ],
        processQualityHint: 'risky',
      },
    ],
    defaultOptionId: 'quiet_fix',
    autoResolveAfterWeeks: 2,
  },
];

/** Platzhalter im Kartentext aus dem State füllen — Namen machen es menschlich. */
function renderBody(card: RandomEventCard, state: CompanyState, boundEntityId: string | null): string {
  let body = card.bodyTemplateDe;
  const fill = (key: string, value: string) => {
    body = body.split('${' + key + '}').join(value);
  };
  if (card.id === 'KEY_ACCOUNT_AT_RISK') {
    const ka = state.customers.keyAccounts.find((k) => k.id === boundEntityId);
    if (ka) {
      fill('account', ka.name);
      fill('contact', 'Frau Berger'); // Ansprechpartner-Persona (Phase 2: eigene Kontakte je Account)
      fill('mrr', `${Math.round(ka.mrr / 1000)} k€`);
      fill('renewalWeeks', String(Math.max(1, ka.renewalWeek - state.meta.week)));
    }
  } else if (card.id === 'ENGINEER_POACHED') {
    const emp = state.people.employees.find((e) => e.id === boundEntityId);
    if (emp) {
      fill('person', `${emp.firstName} ${emp.lastName}`);
      fill('role', emp.roleTitleDe);
      fill('competitor', state.market.competitors[0]?.name ?? 'einem Wettbewerber');
      fill('offerPct', '20');
    }
  } else if (card.id === 'MINOR_OUTAGE') {
    fill('techDebt', String(Math.round(state.product.techDebt)));
    fill('tickets', String(40 + Math.round(state.product.bugBacklog)));
  }
  return body;
}

/**
 * Wöchentlicher Event-Roll (max. 1 neues Event pro Woche).
 * Seed-gesteuert, gewichtet nach Schwierigkeit und Zustands-Anfälligkeit.
 */
export function maybeTriggerEvents(state: CompanyState, occurrences: Occurrence[]): ActiveRandomEvent[] {
  const week = state.meta.week;
  const diff = DIFFICULTIES[state.meta.difficulty];
  const rng = stream(state.meta.seed, 'events', week);
  const triggered: ActiveRandomEvent[] = [];

  const candidates = EVENT_CARDS.filter((card) => {
    if (week < card.minWeek) return false;
    const lastFired = state.eventCooldowns[card.id];
    if (lastFired !== undefined && week - lastFired < card.cooldownWeeks) return false;
    if (state.openEvents.some((e) => e.cardId === card.id && e.status === 'open')) return false;
    return true;
  });

  for (const card of candidates) {
    if (triggered.length >= 1) break;
    let weight = card.baseWeeklyWeight * diff.eventWeightMult;
    if (card.id === 'MINOR_OUTAGE') weight *= Math.max(0.2, state.product.techDebt / 45); // Tech-Debt macht anfällig
    if (card.id === 'KEY_ACCOUNT_AT_RISK') {
      const hasFragile = state.customers.keyAccounts.some((k) => k.status === 'ok' && k.health < 60);
      weight *= hasFragile ? 1.6 : 0.5;
    }
    if (rng() >= weight) continue;

    let boundEntityId: string | null = null;
    if (card.id === 'KEY_ACCOUNT_AT_RISK') {
      const target = [...state.customers.keyAccounts]
        .filter((k) => k.status === 'ok')
        .sort((a, b) => a.health - b.health)[0];
      if (!target) continue;
      boundEntityId = target.id;
      target.status = 'atRisk';
    } else if (card.id === 'ENGINEER_POACHED') {
      const target = state.people.employees
        .filter((e) => e.dept === 'engineering' && e.keyPerson)
        .sort((a, b) => b.performance - a.performance)[0];
      if (!target) continue;
      boundEntityId = target.id;
    }

    const instance: ActiveRandomEvent = {
      instanceId: nextId(state, 'ev'),
      cardId: card.id,
      triggeredWeek: week,
      bodyDe: renderBody(card, state, boundEntityId),
      boundEntityId,
      status: 'open',
      resolvedWeek: null,
      chosenOptionId: null,
    };
    state.openEvents.push(instance);
    state.eventCooldowns[card.id] = week;
    triggered.push(instance);
    occurrences.push({ icon: '🚨', textDe: `Ereignis: ${card.titleDe}`, severity: 'bad' });
  }
  return triggered;
}

/** Vom Spieler gewählte Option anwenden (über Aktion RESPOND_EVENT). */
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

  applyOption(state, instance, card, option, decisionId);
  instance.status = 'resolved';
  instance.resolvedWeek = state.meta.week;
  instance.chosenOptionId = optionId;

  const analysis: string[] = [];
  if (card.id === 'KEY_ACCOUNT_AT_RISK' && optionId === 'ceo_call_discount') {
    analysis.push('Der Rabatt senkt den MRR dieses Accounts sofort um 15 % für 12 Monate — dafür steigt die Rettungswahrscheinlichkeit deutlich.');
  }
  if (card.id === 'ENGINEER_POACHED' && optionId === 'match_offer') {
    analysis.push('Achtung Präzedenzfall: Gehalts-Matches sprechen sich herum — Folgeeffekt auf die Erwartungen im Team ist eingeplant.');
  }
  analysis.push(`Prozess-Einordnung der gewählten Option: ${qualityDe(option.processQualityHint)}.`);
  return { summaryDe: `${card.titleDe} → ${option.labelDe}`, analysisDe: analysis };
}

function qualityDe(q: string): string {
  return (
    { good: 'sauber (Ursache adressiert)', defensible: 'vertretbar (kauft Zeit, hat Nebenkosten)', risky: 'riskant (Wette auf Glück)', bad: 'schwach (Problem ignoriert)' }[q] ?? q
  );
}

/** Effekte einer Option in den State bringen (BOUND wird an die Ziel-Entität gebunden). */
function applyOption(
  state: CompanyState,
  instance: ActiveRandomEvent,
  card: RandomEventCard,
  option: RandomEventCard['options'][number],
  decisionId: string | null,
): void {
  const src = `Ereignis „${card.titleDe}"`;
  for (const fx of option.immediateEffects) {
    const bound = bindEffect(fx, instance);
    schedule(state, 0, src, decisionId, bound, 'event');
  }
  for (const { delayWeeks, effect } of option.scheduledEffects) {
    schedule(state, delayWeeks, src, decisionId, bindEffect(effect, instance), 'event');
  }

  // Kartenspezifische Direktfolgen (State-Flags, keine Geldflüsse):
  if (card.id === 'KEY_ACCOUNT_AT_RISK') {
    const ka = state.customers.keyAccounts.find((k) => k.id === instance.boundEntityId);
    if (ka) {
      if (option.id === 'ceo_call_discount') {
        ka.mrr = Math.round(ka.mrr * 0.85); // Loyalitätsrabatt
        ka.status = 'ok';
      } else if (option.id === 'cs_taskforce') {
        ka.status = 'ok';
      }
      // 'ignore': bleibt atRisk — der Tick entscheidet beim Renewal über die Kündigung.
    }
  } else if (card.id === 'ENGINEER_POACHED') {
    const emp = state.people.employees.find((e) => e.id === instance.boundEntityId);
    if (emp) {
      if (option.id === 'match_offer') {
        emp.salaryMonthly = Math.round(emp.salaryMonthly * 1.2);
        emp.satisfaction = Math.min(100, emp.satisfaction + 12);
      } else if (option.id === 'counter_growth') {
        // Ausgang seed-abhängig: bleibt die Person für Perspektive statt Geld?
        const rng = stream(state.meta.seed, 'poach-counter', state.meta.week, state.idCounter);
        if (rng() < 0.6) {
          emp.satisfaction = Math.min(100, emp.satisfaction + 8);
        } else {
          removeEmployee(state, emp.id);
        }
      } else {
        removeEmployee(state, emp.id);
      }
    }
  }
}

function bindEffect(fx: import('../types/effects.js').EffectPayload, instance: ActiveRandomEvent): import('../types/effects.js').EffectPayload {
  if (fx.kind === 'KEY_ACCOUNT_HEALTH_DELTA' && fx.accountId === 'BOUND') {
    return { ...fx, accountId: instance.boundEntityId ?? fx.accountId };
  }
  return fx;
}

/** Mitarbeiter entfernen (Kündigung/Abgang) — Velocity-Folgen zieht der Tick nach. */
export function removeEmployee(state: CompanyState, employeeId: string): void {
  const idx = state.people.employees.findIndex((e) => e.id === employeeId);
  if (idx >= 0) state.people.employees.splice(idx, 1);
}

/** Offene Events nach Frist automatisch (meist ungünstig) auflösen. */
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
      occurrences.push({
        icon: '⏰',
        textDe: `Ignoriert und verjährt: „${card.titleDe}" — Default-Folge: ${option.labelDe}`,
        severity: 'bad',
      });
    }
  }
}

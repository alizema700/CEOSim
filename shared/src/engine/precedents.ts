import type { CompanyState } from '../types/company.js';
import type { DecisionRecord, PrecedentRef } from '../types/evaluation.js';
import { PRECEDENT_CASES, type PrecedentTag } from '../data/precedents.js';
import { fnv1a } from './rng.js';
import { runwayWeeks } from './derive.js';

/**
 * Präzedenzfall-Matching (Phase 4): deterministisch, lokal, ohne API.
 *
 * Statt Cloud-Embeddings nutzt Phase 4 ein Tag-Scoring: Aktionstyp + Kontext-
 * Flags des Unternehmens ergeben ein Tag-Profil, Fälle werden nach Überlapp
 * gerankt (Tiebreak: stabiler Hash aus Entscheidung+Fall). Ein Embedding-
 * Backend kann später hinter derselben Funktion eingezogen werden.
 */

const ACTION_TAGS: Record<string, PrecedentTag[]> = {
  PRICE_CHANGE: ['pricing', 'churn', 'customer'],
  LAYOFF: ['layoffs', 'culture', 'crisis-comms', 'values'],
  SET_MARKETING_BUDGET: ['marketing', 'customer'],
  SET_CS_BUDGET: ['churn', 'customer'],
  SET_RND_ALLOCATION: ['techdebt', 'product', 'focus'],
  ADJUST_SALARIES: ['salary', 'culture', 'hiring'],
  RAISE_DEBT: ['debt', 'downturn', 'governance'],
  REPAY_DEBT: ['debt', 'governance'],
  START_HIRING: ['hiring', 'culture'],
  DELEGATE_MESSAGE: ['culture', 'governance'],
  START_PROJECT: ['innovation', 'marketing', 'focus'],
  HIRE_CONSULTANT: ['governance', 'focus'],
};

const EVENT_TAGS: Record<string, PrecedentTag[]> = {
  SECURITY_BREACH: ['security', 'crisis-comms', 'fraud'],
  SHITSTORM: ['press', 'crisis-comms', 'comms'],
  JOURNALIST_INQUIRY: ['press', 'comms'],
  ACQUISITION_OFFER: ['ma', 'exit', 'governance'],
  CEASE_DESIST: ['governance', 'crisis-comms'],
  ACCOUNTING_FRAUD: ['fraud', 'governance'],
  BANK_COVENANT_CALL: ['debt', 'governance', 'downturn'],
  DOWNTURN: ['downturn', 'focus'],
  GRANT_AWARD: ['press', 'marketing'],
  PARTNERSHIP_OFFER: ['marketing', 'ma'],
  KEY_ACCOUNT_AT_RISK: ['customer', 'churn', 'crisis-comms'],
  ENGINEER_POACHED: ['hiring', 'salary', 'culture'],
  MINOR_OUTAGE: ['techdebt', 'crisis-comms', 'security'],
};

export function findPrecedents(state: CompanyState, decision: DecisionRecord, valuesConflict: boolean): PrecedentRef[] {
  let tags: PrecedentTag[] = [...(ACTION_TAGS[decision.action.type] ?? [])];

  if (decision.action.type === 'RESPOND_EVENT') {
    const instanceId = decision.action.eventInstanceId;
    const ev = state.openEvents.find((e) => e.instanceId === instanceId);
    tags = [...(EVENT_TAGS[ev?.cardId ?? ''] ?? ['crisis-comms'])];
  }
  // Kontext-Verstärker aus der Lage des Unternehmens
  if (valuesConflict) tags.push('values');
  if (runwayWeeks(state) < 16) tags.push('downturn', 'debt');
  if (decision.action.type === 'LAYOFF' && decision.action.generousSeverance) tags.push('comms');

  const tagSet = new Set(tags);
  const scored = PRECEDENT_CASES.map((c) => {
    const overlap = c.tags.filter((t) => tagSet.has(t)).length;
    const tiebreak = (fnv1a(decision.id + c.id) % 1000) / 10_000;
    return { c, score: overlap + tiebreak };
  })
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map(({ c }) => ({
    caseId: c.id,
    titleDe: `${c.company} ${c.year}: ${c.titleDe.split(':')[1]?.trim() ?? c.titleDe}`,
    relevanceDe: `${c.decisionDe} → ${c.outcomeDe} Lehre: ${c.lessonDe}`,
  }));
}

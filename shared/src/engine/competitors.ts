import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Competitor } from '../types/market.js';
import type { Occurrence } from '../types/game.js';
import { stream } from './rng.js';
import { nextId } from './stateHelpers.js';
import { addMessage } from './comms.js';

/**
 * Konkurrenz-Agenten (Phase 5).
 *
 * Jeder Wettbewerber zieht eigenständig — seed-deterministisch, ohne LLM.
 * Die „Persönlichkeit" steckt in strategy + aggressiveness; das LLM darf
 * Züge später nur ERZÄHLEN (Dossiers, Chat mit Konkurrenz-CEOs), niemals
 * erzeugen. Max. ein Agenten-Zug pro Woche (sonst wird es Rauschen);
 * Cooldowns pro Zug in market.agentCooldowns.
 *
 * Züge:
 * - priceWar      → Rabattoffensive: eigener Preisindex ↓, saugt Leads ab.
 * - featureRace   → Launch: Feature-Score ↑, drückt eure Win-Rate.
 * - enterpriseMove→ Key-Account-Poaching: gezielter Angriff auf euren
 *                   verwundbarsten Großkunden (inkl. Warn-Mail des Kunden).
 * - Reaktion      → Preiskämpfer kontern eure Preiserhöhungen mit einer
 *                   Wechselkampagne (Churn-Druck), Wahrscheinlichkeit =
 *                   Aggressivität.
 */

const MOVE_COOLDOWN_WEEKS: Record<string, number> = {
  campaign: 10,
  launch: 9,
  poach: 13,
  reactPrice: 16,
};

export function tickCompetitorAgents(state: CompanyState, occ: Occurrence[]): void {
  const week = state.meta.week;
  if (week < 3) return; // die ersten Wochen gehören dem Onboarding

  let moved = false;
  for (const comp of state.market.competitors) {
    if (moved) break;
    const rng = stream(state.meta.seed, 'agent:' + comp.id, week);

    // ── Reaktion: Spieler hat vor 2 Wochen die Preise spürbar erhöht ──
    const lastChange = state.customers.lastPriceChangeWeek;
    if (
      comp.strategy === 'priceWar' &&
      lastChange !== null &&
      week - lastChange === 2 &&
      state.customers.priceIndex > 1.04 &&
      cooldownOver(state, comp, 'reactPrice', week) &&
      rng() < comp.aggressiveness
    ) {
      startCooldown(state, comp, 'reactPrice', week);
      state.activeModifiers.push({
        id: nextId(state, 'mod'),
        target: 'churnMonthly',
        factor: 1.07,
        startWeek: week,
        endWeek: week + 6,
        sourceDe: `Wechselkampagne von ${comp.name} nach eurer Preiserhöhung`,
      });
      state.pressLog.push({ week, tone: 'neutral', topicDe: `${comp.name} wirbt offensiv um wechselwillige Kunden („Wir rechnen Ihre Restlaufzeit an")` });
      occ.push({ icon: '⚔️', textDe: `${comp.name} kontert eure Preiserhöhung mit einer Wechselkampagne — Bestandskunden werden aktiv abgeworben (6 Wochen erhöhter Churn-Druck).`, severity: 'warn' });
      moved = true;
      continue;
    }

    // ── Autonome Züge (unabhängig vom Spieler) ────────────────────────
    const p = 0.05 + comp.aggressiveness * 0.08;
    if (rng() >= p) continue;

    switch (comp.strategy) {
      case 'priceWar': {
        if (!cooldownOver(state, comp, 'campaign', week)) break;
        startCooldown(state, comp, 'campaign', week);
        comp.priceIndex = Math.max(0.55, Math.round((comp.priceIndex - 0.04) * 100) / 100);
        state.activeModifiers.push({
          id: nextId(state, 'mod'),
          target: 'leadGen',
          factor: 0.92,
          startWeek: week,
          endWeek: week + 4,
          sourceDe: `Rabattoffensive von ${comp.name}`,
        });
        state.pressLog.push({ week, tone: 'neutral', topicDe: `${comp.name} startet Rabattoffensive (Preisindex jetzt ${comp.priceIndex.toFixed(2)})` });
        occ.push({ icon: '⚔️', textDe: `${comp.name} startet eine Rabattoffensive („3 Monate geschenkt") — euer Lead-Zufluss leidet ~4 Wochen.`, severity: 'warn' });
        moved = true;
        break;
      }
      case 'featureRace': {
        if (!cooldownOver(state, comp, 'launch', week)) break;
        startCooldown(state, comp, 'launch', week);
        comp.featureScore = clamp(comp.featureScore + 5, 0, 100);
        state.activeModifiers.push({
          id: nextId(state, 'mod'),
          target: 'trialWinRate',
          factor: 0.94,
          startWeek: week,
          endWeek: week + 6,
          sourceDe: `Produkt-Launch von ${comp.name}`,
        });
        state.pressLog.push({ week, tone: 'neutral', topicDe: `${comp.name} launcht neues Release mit viel Marketing-Getöse` });
        occ.push({ icon: '🚀', textDe: `${comp.name} launcht ein großes Release — in Vergleichs-Calls taucht jetzt eine Feature-Liste auf, gegen die ihr argumentieren müsst (Win-Rate ↓ für ~6 Wochen).`, severity: 'warn' });
        moved = true;
        break;
      }
      case 'enterpriseMove': {
        if (!cooldownOver(state, comp, 'poach', week)) break;
        const target = [...state.customers.keyAccounts]
          .filter((k) => k.status !== 'churned')
          .sort((a, b) => a.health - b.health)[0];
        if (!target) break;
        startCooldown(state, comp, 'poach', week);
        target.health = clamp(target.health - 12, 0, 100);
        addMessage(state, {
          from: { name: 'Frau Berger', roleDe: 'Einkauf', refId: target.id, company: target.name },
          subjectDe: `Vergleichsangebot von ${comp.name} liegt auf dem Tisch`,
          bodyDe: `wir wollen fair mit Ihnen umgehen, deshalb dieser Hinweis: ${comp.name} hat uns ein sehr aggressives Angebot vorgelegt — inklusive Migrationsteam und Compliance-Paket. Unsere Fachabteilung ist angetan. Wir sind ${state.identity.companyName} verbunden, aber Sie wissen, wie Einkauf funktioniert: Geben Sie uns einen Grund zu bleiben.`,
          kind: 'external',
          eventInstanceId: null,
          delegable: true,
          suggestedActionType: null,
          templateId: 'poach:' + comp.id,
          priority: 'hoch',
        });
        occ.push({ icon: '🎯', textDe: `${comp.name} greift gezielt euren Key-Account ${target.name} an — Health ${Math.round(target.health)}/100.`, severity: 'bad' });
        moved = true;
        break;
      }
    }
  }
}

function cooldownOver(state: CompanyState, comp: Competitor, move: string, week: number): boolean {
  const last = state.market.agentCooldowns[comp.id + ':' + move];
  return last === undefined || week - last >= (MOVE_COOLDOWN_WEEKS[move] ?? 10);
}

function startCooldown(state: CompanyState, comp: Competitor, move: string, week: number): void {
  state.market.agentCooldowns[comp.id + ':' + move] = week;
}

import {
  clamp,
  DEPARTMENTS,
  monthlyToWeeklyRate,
  toCents,
  WEEKS_PER_MONTH,
  type Department,
} from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { BalanceSheet, CashFlowStatement, IncomeStatement, OpexLine } from '../types/finance.js';
import { EMPLOYER_COST_FACTOR } from '../types/people.js';
import type { Alert, Occurrence, WeekReport } from '../types/game.js';
import type { EffectPayload } from '../types/effects.js';
import { gaussian, intBetween, stream } from './rng.js';

import { personaBits, personName, ROLE_TITLES } from './names.js';
import {
  avgSatisfaction,
  locationOf,
  cohortMrr,
  currentVelocity,
  headcount,
  keyAccountMrr,
  modifierProduct,
  officeCostMonthly,
  runwayWeeks,
  totalMrr,
  weekToDateISO,
} from './derive.js';
import { computeKpis } from './kpis.js';
import { checkInvariants, assertInvariants } from './invariants.js';
import { updateBoardTrust } from './board.js';
import { maybeTriggerEvents, autoResolveOverdueEvents, removeEmployee } from './eventsDeck.js';
import { deptDe, nextId, schedule } from './stateHelpers.js';
import { addMessage, deliverDelegationResult, generateWeeklyComms, upkeepCalendar } from './comms.js';
import { projectsMonthlyCost, tickProjects } from './projects.js';
import { tickCompetitorAgents } from './competitors.js';
import { applyEquityInjection } from './funding.js';
import { applyMaIntegration } from './ma.js';
import { applyIpoListing, tickIpo } from './ipo.js';
import { coveredEmployees, tickLabor } from './labor.js';
import { tickLegal } from './legal.js';
import { effectiveCorporateTaxRate } from '../types/legal.js';
import { tickGovernance } from './governance.js';
import { tickCeo } from './ceo.js';
import { tickTakeover } from './takeover.js';
import { tickCrisis } from './crisis.js';
import { tickRivalry } from './rivalry.js';
import { politicsTaxRelief, tickPolitics } from './politics.js';
import { tickMacro } from './macro.js';
import { tickMacroShocks } from './macroShocks.js';

/**
 * ═══ DER WOCHENTICK ═══
 *
 * „Woche abschließen" führt in fester Reihenfolge aus:
 *  1. Fällige geplante Effekte anwenden (inkl. Layoffs, Kredit, Gehaltsrunde)
 *  2. Personal: Hiring-Pipeline, Kündigungs-Rolls, Moral-Drift
 *  3. Produkt: Velocity → Features/Tech-Debt/Bugs, NPS-Drift
 *  4. Kunden: Pipeline → Neukunden; Churn & Expansion; Key-Account-Renewals
 *  5. Finanz-Ledger: Fakturierung, Zahlungseingänge, Payroll, Lieferanten,
 *     Zinsen, Steuern, Einmaleffekte → GuV, Cash-Flow, Bilanz
 *  6. Markt & Reputation: Wettbewerber-Drift, Reputations-Annäherung
 *  7. Zufallsereignisse & Auto-Auflösung ignorierter Events
 *  8. Board-Vertrauen + Game-Over-Checks
 *  9. KPI-Snapshot + INVARIANTEN (hart!)
 *
 * Alle Zufälle laufen über seed-abgeleitete Substreams — gleicher Seed +
 * gleiche Entscheidungen ⇒ exakt gleicher Verlauf.
 */
export function closeWeek(state: CompanyState): WeekReport {
  if (state.meta.status !== 'active') {
    throw new Error('Spiel ist beendet — keine weiteren Wochen möglich.');
  }
  const week = state.meta.week;
  const occurrences: Occurrence[] = [];

  // Ledger sammelt alle Geldbewegungen der Woche an EINEM Ort.
  const ledger = {
    revenueRecognized: 0,
    billedToAR: 0,
    collections: 0,
    annualPrepayCash: 0,
    deferredReleased: 0,
    cogsBooked: 0,
    otherOpexBooked: 0, // Nicht-Personal → AP
    apPaid: 0,
    payrollPaid: 0,
    interestPaid: 0,
    taxPaid: 0,
    oneOffsPaid: 0,
    debtDrawn: 0,
    debtRepaid: 0,
    equityRaised: 0,
    dividendsPaid: 0,
  };
  const cashStart = state.finance.cash;

  // ── 1. Fällige geplante Effekte ────────────────────────────────────
  const due = state.scheduledEffects.filter((fx) => fx.dueWeek <= week);
  state.scheduledEffects = state.scheduledEffects.filter((fx) => fx.dueWeek > week);
  for (const fx of due) {
    applyEffect(state, fx.effect, fx.sourceDe, ledger, occurrences);
  }

  // ── 1b. CEO als Mensch: Energie, Vermögen, Fokus-Modifikatoren ─────
  // Früh, damit der Wochenfokus Velocity/Leads/Bindung DIESER Woche prägt.
  tickCeo(state, occurrences);
  tickMacro(state, occurrences);
  tickMacroShocks(state, occurrences);

  // ── 2. Personal ───────────────────────────────────────────────────
  tickPeople(state, ledger, occurrences);

  // ── 3. Produkt & Projekte ─────────────────────────────────────────
  tickProduct(state, occurrences);
  tickProjects(state, occurrences);

  // ── 4. Kunden ─────────────────────────────────────────────────────
  tickCustomers(state, ledger, occurrences);

  // ── 5. Finanz-Ledger → Statements ─────────────────────────────────
  const { income, cashflow, balance } = closeLedger(state, ledger, cashStart);

  // ── 6. Markt, Reputation, Konkurrenz-Agenten & Börse (Phase 5/6) ──
  tickMarketAndReputation(state, occurrences);
  tickCompetitorAgents(state, occurrences);
  tickIpo(state, occurrences);
  tickLabor(state, occurrences);
  tickLegal(state, occurrences);
  tickGovernance(state, occurrences);
  tickTakeover(state, occurrences);
  tickCrisis(state, occurrences);
  tickRivalry(state, occurrences);
  tickPolitics(state, occurrences);

  // ── 7. Zufallsereignisse ──────────────────────────────────────────
  autoResolveOverdueEvents(state, occurrences);
  const triggeredEvents = maybeTriggerEvents(state, occurrences);

  // ── 7b. Kommunikation & Kalender (Phase 2) ────────────────────────
  upkeepCalendar(state);
  generateWeeklyComms(state);

  // ── 8. Board & Game-Over ──────────────────────────────────────────
  const { delta: trustDelta, drivers } = updateBoardTrust(state);
  if (state.finance.cash < 0 && state.meta.status === 'active') {
    state.meta.status = 'insolvent';
    state.meta.endReasonDe =
      'Zahlungsunfähigkeit: Die Kasse ist negativ. Ohne frische Liquidität ist Insolvenzantrag zu stellen (§ 15a InsO im echten Leben binnen 3 Wochen).';
    occurrences.push({ icon: '💀', textDe: 'INSOLVENZ — die Kasse ist leer.', severity: 'bad' });
  }

  // ── 9. Woche vorrücken, Snapshot, Invarianten ─────────────────────
  state.meta.week = week + 1;
  const kpis = computeKpis(state);
  state.history.push(kpis);

  const invariants = checkInvariants(state, cashflow, balance);
  assertInvariants(invariants, week);

  const evaluationsDue = state.decisionLog
    .filter((d) => d.evaluateAtWeek === state.meta.week && !state.evaluations.some((e) => e.decisionId === d.id))
    .map((d) => d.id);

  return {
    week,
    dateISO: weekToDateISO(state.meta.startDateISO, week),
    incomeStatement: income,
    cashFlow: cashflow,
    balanceSheet: balance,
    kpis,
    occurrences,
    triggeredEvents,
    boardTrustDelta: trustDelta,
    trustDrivers: drivers,
    alerts: buildAlerts(state),
    evaluationsDue,
    invariants,
  };
}

type Ledger = {
  revenueRecognized: number; billedToAR: number; collections: number;
  annualPrepayCash: number; deferredReleased: number; cogsBooked: number;
  otherOpexBooked: number; apPaid: number; payrollPaid: number;
  interestPaid: number; taxPaid: number; oneOffsPaid: number;
  debtDrawn: number; debtRepaid: number; equityRaised: number;
  dividendsPaid: number;
};

// ────────────────────────────────────────────────────────────────────
function applyEffect(state: CompanyState, fx: EffectPayload, sourceDe: string, ledger: Ledger, occ: Occurrence[]): void {
  const week = state.meta.week;
  switch (fx.kind) {
    case 'HIRES_ARRIVE': {
      const rng = stream(state.meta.seed, 'hire', week, state.idCounter);
      const loc = locationOf(state);
      const SAL: Record<string, number> = { werkstudent: 1650, junior: 3900, mid: 5100, senior: 6600, lead: 8200 };
      for (let i = 0; i < fx.count; i++) {
        const { firstName, lastName } = personName(rng);
        const specialist = fx.specialistRoleDe?.trim();
        state.people.employees.push({
          id: nextId(state, 'emp'),
          firstName, lastName,
          dept: fx.dept,
          roleTitleDe: specialist || (ROLE_TITLES[fx.dept]?.[fx.seniority] ?? 'Mitarbeiter:in'),
          seniority: fx.seniority,
          // Spezialrollen (Quant, ML, Kryptographie …) kosten ~15 % Aufschlag.
          salaryMonthly: Math.round(SAL[fx.seniority]! * (specialist ? 1.15 : 1) * loc.payrollIndex * gaussian(rng, 1, 0.04)),
          performance: Math.round(gaussian(rng, fx.seniority === 'werkstudent' ? 58 : 70, 10) + (specialist ? 4 : 0)),
          satisfaction: 72,
          // Werkstudierende fluktuieren stärker (Studienende, Praktikawechsel).
          attritionRiskWeekly: fx.seniority === 'werkstudent' ? 0.007 : 0.0035,
          keyPerson: false,
          hiredWeek: week,
          rampWeeksRemaining: fx.seniority === 'werkstudent' ? 3 : 6,
          ...personaBits(rng, fx.seniority),
        });
        ledger.oneOffsPaid += fx.costPerHire;
        occ.push({ icon: '👋', textDe: `${firstName} ${lastName} startet als ${specialist || (ROLE_TITLES[fx.dept]?.[fx.seniority] ?? fx.seniority)} in ${deptDe(fx.dept)}.`, severity: 'good' });
      }
      break;
    }
    case 'EXECUTE_LAYOFF': {
      const victims = state.people.employees
        .filter((e) => e.dept === fx.dept)
        .sort((a, b) => a.performance - b.performance || b.salaryMonthly - a.salaryMonthly)
        .slice(0, fx.count);
      // Mitbestimmung (Phase 8): Mit Betriebsrat gilt ein Sozialplan —
      // höhere Mindestabfindung, dafür etwas gedämpfte Moral-Folgen bei
      // fairem Vorgehen; ein harter Abbau OHNE faires Paket eskaliert.
      const council = state.labor.worksCouncil;
      const socialPlan = council ? 1 : 0; // +1 Monat Abfindung als Sozialplan-Floor
      let severance = 0;
      for (const v of victims) {
        const tenureYears = Math.max(0.5, (week - v.hiredWeek) / 52);
        const months = (Math.min(6, 0.5 * tenureYears) + socialPlan) * (fx.generousSeverance ? 1.6 : 1);
        severance += v.salaryMonthly * months;
        removeEmployee(state, v.id);
        occ.push({ icon: '📦', textDe: `${v.firstName} ${v.lastName} (${v.roleTitleDe}) verlässt das Unternehmen.`, severity: 'bad' });
      }
      ledger.oneOffsPaid += Math.round(severance);
      const moraleHit = (fx.generousSeverance ? -6 : -12) + (council && fx.generousSeverance ? 2 : 0);
      bumpSatisfaction(state, 'all', moraleHit);
      state.reputation.laborMarket = clamp(state.reputation.laborMarket + (fx.generousSeverance ? -3 : -7), 0, 100);
      state.labor.tension = clamp(state.labor.tension + (fx.generousSeverance ? 6 : 16) + (council ? 6 : 0), 0, 100);
      const attritionDelay = 2 + (fx.count % 4);
      schedule(state, attritionDelay, sourceDe, null, {
        kind: 'ATTRITION_WAVE', dept: 'all', extraQuitProbability: fx.generousSeverance ? 0.01 : 0.025,
      }, 'system');
      if (council && !fx.generousSeverance) {
        // Harter Abbau ohne faires Paket trotz Betriebsrat ⇒ Arbeitskampf.
        occ.push({ icon: '🪧', textDe: 'Der Betriebsrat widerspricht dem Stellenabbau und ruft zum Protest — ohne Sozialplan-Konsens droht Streik.', severity: 'bad' });
        schedule(state, 1, sourceDe, null, { kind: 'WARNING_STRIKE', full: false }, 'system');
      }
      const valueClash = state.identity.values.some((v) => /mensch|team|respekt|fair/i.test(v)) || /mensch/i.test(state.identity.motto);
      if (valueClash && !fx.generousSeverance) {
        bumpSatisfaction(state, 'all', -4);
        state.reputation.press = clamp(state.reputation.press - 4, 0, 100);
        occ.push({ icon: '🗞️', textDe: `Interner Unmut: „${state.identity.motto}" wird in Austrittsgesprächen zitiert — die Werte wirken jetzt hohl.`, severity: 'bad' });
      }
      if (fx.count >= 5) {
        schedule(state, 1, sourceDe, null, { kind: 'PRESS_STORY', tone: 'negative', topicDe: `Stellenabbau bei ${state.identity.companyName}` }, 'system');
      }
      break;
    }
    case 'DEBT_DRAW':
      ledger.debtDrawn += fx.amount;
      state.finance.debt.principal += fx.amount;
      occ.push({ icon: '🏦', textDe: `Kreditlinie gezogen: ${k(fx.amount)}.`, severity: 'info' });
      break;
    case 'DEBT_REPAY': {
      const amt = Math.min(fx.amount, state.finance.debt.principal);
      ledger.debtRepaid += amt;
      state.finance.debt.principal -= amt;
      occ.push({ icon: '🏦', textDe: `Kredit getilgt: ${k(amt)}.`, severity: 'info' });
      break;
    }
    case 'SALARY_RAISE':
      for (const e of state.people.employees) {
        e.salaryMonthly = Math.round(e.salaryMonthly * (1 + fx.pct));
        e.satisfaction = clamp(e.satisfaction + 8, 0, 100);
      }
      occ.push({ icon: '💶', textDe: `Gehaltsrunde +${(fx.pct * 100).toFixed(1)} % wirksam.`, severity: 'good' });
      break;
    case 'SATISFACTION_DELTA':
      bumpSatisfaction(state, fx.dept, fx.amount);
      break;
    case 'REPUTATION_DELTA':
      state.reputation[fx.dimension] = clamp(state.reputation[fx.dimension] + fx.amount, 0, 100);
      break;
    case 'ADD_MODIFIER':
      state.activeModifiers.push({ ...fx.modifier, id: nextId(state, 'mod') });
      break;
    case 'ATTRITION_WAVE': {
      const rng = stream(state.meta.seed, 'attrition-wave', week);
      const pool = state.people.employees.filter((e) => fx.dept === 'all' || e.dept === fx.dept);
      for (const e of pool) {
        if (rng() < fx.extraQuitProbability * (e.satisfaction < 45 ? 1.6 : 1)) {
          occ.push({ icon: '🚪', textDe: `${e.firstName} ${e.lastName} kündigt — Nachwirkung: ${sourceDe}.`, severity: 'bad' });
          removeEmployee(state, e.id);
        }
      }
      break;
    }
    case 'RENEWAL_REPRICING': {
      // ~85 % der Listenänderung setzt sich im Bestand durch (Verhandlungen, Grandfathering).
      for (const c of state.customers.cohorts) {
        c.arpaMonthly *= 1 + fx.priceDeltaApplied * 0.85;
      }
      occ.push({
        icon: '🏷️',
        textDe: `Renewal-Repricing greift: Bestands-ARPA ${fx.priceDeltaApplied > 0 ? '+' : ''}${(fx.priceDeltaApplied * 85).toFixed(0)} % (85 % der Listenänderung).`,
        severity: 'info',
      });
      break;
    }
    case 'COMPETITOR_PRICE_MOVE': {
      const comp = state.market.competitors.find((c) => c.id === fx.competitorId);
      if (comp) {
        comp.priceIndex = Math.max(0.4, comp.priceIndex + fx.priceIndexDelta);
        occ.push({ icon: '⚔️', textDe: `${comp.name} zieht nach und ändert die Preise (Index jetzt ${comp.priceIndex.toFixed(2)}).`, severity: 'warn' });
      }
      break;
    }
    case 'KEY_ACCOUNT_HEALTH_DELTA': {
      const ka = state.customers.keyAccounts.find((a) => a.id === fx.accountId);
      if (ka && ka.status !== 'churned') ka.health = clamp(ka.health + fx.amount, 0, 100);
      break;
    }
    case 'PRESS_STORY': {
      const dRep = fx.tone === 'positive' ? 4 : fx.tone === 'negative' ? -5 : 0;
      state.reputation.press = clamp(state.reputation.press + dRep, 0, 100);
      state.pressLog.push({ week, tone: fx.tone, topicDe: fx.topicDe });
      occ.push({
        icon: '🗞️',
        textDe: `Presse (${fx.tone === 'positive' ? 'wohlwollend' : fx.tone === 'negative' ? 'kritisch' : 'neutral'}): ${fx.topicDe}`,
        severity: fx.tone === 'negative' ? 'bad' : fx.tone === 'positive' ? 'good' : 'info',
      });
      break;
    }
    case 'ONE_OFF_COST':
      if (fx.amount > 0) {
        ledger.oneOffsPaid += fx.amount;
        occ.push({ icon: '🧾', textDe: `Einmalkosten: ${fx.labelDe} (${k(fx.amount)}).`, severity: 'warn' });
      }
      break;
    case 'ONE_OFF_INCOME':
      if (fx.amount > 0) {
        ledger.oneOffsPaid -= fx.amount; // negativer Einmaleffekt = Ertrag
        occ.push({ icon: '💰', textDe: `Einmalertrag: ${fx.labelDe} (+${k(fx.amount)}).`, severity: 'good' });
      }
      break;
    case 'DEMAND_SHIFT':
      state.activeModifiers.push({
        id: nextId(state, 'mod'),
        target: 'demandIndex',
        factor: fx.factor,
        startWeek: week,
        endWeek: week + fx.weeks,
        sourceDe: fx.sourceDe,
      });
      occ.push({ icon: '🌫️', textDe: `Marktweite Nachfrage verschiebt sich (×${fx.factor.toFixed(2)} für ${fx.weeks} Wochen): ${fx.sourceDe}.`, severity: 'warn' });
      break;
    case 'DELEGATION_RESULT':
      deliverDelegationResult(state, fx.messageId, fx.execId, occ);
      break;
    case 'DELAYED_SCANDAL': {
      const rng = stream(state.meta.seed, 'scandal', week, fx.fine);
      if (rng() < fx.probability) {
        ledger.oneOffsPaid += fx.fine;
        state.reputation.press = clamp(state.reputation.press - 8, 0, 100);
        state.reputation.investors = clamp(state.reputation.investors - 5, 0, 100);
        state.ceo.boardTrust = clamp(state.ceo.boardTrust - 8, 0, 100);
        state.ceo.trustLog.push({ week, delta: -8, reasonDe: `Skandal aufgeflogen: ${fx.topicDe}` });
        occ.push({ icon: '🔥', textDe: `ES IST RAUSGEKOMMEN: ${fx.topicDe} — Bußgeld/Schaden ${k(fx.fine)}, Presse & Board toben.`, severity: 'bad' });
        // Börsennotiert? Dann ist das eine Insiderinformation ⇒ Ad-hoc-Pflicht (Art. 17 MAR).
        if (state.ipo.status === 'public') {
          state.ipo.pendingAdhocTopicDe = fx.topicDe;
          if (state.ipo.sharePrice !== null) state.ipo.sharePrice = Math.round(state.ipo.sharePrice * 0.95 * 100) / 100;
        }
      }
      break;
    }
    case 'EQUITY_INJECTION': {
      // Cash fließt ausschließlich über das Ledger (CFF); Cap Table, Einlage
      // und Board-Folgen setzt applyEquityInjection.
      ledger.equityRaised += fx.round.amount;
      applyEquityInjection(state, fx.round, fx.esopTopUp);
      occ.push({
        icon: '💎',
        textDe: `Finanzierungsrunde geschlossen: ${fx.round.investorName} investiert ${k(fx.round.amount)} @ ${(fx.round.preMoney / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} M€ pre-money (${(fx.round.newInvestorShare * 100).toFixed(1)} % Verwässerung).`,
        severity: 'good',
      });
      break;
    }
    case 'MA_INTEGRATION':
      applyMaIntegration(state, fx.targetId, occ);
      break;
    case 'EMPLOYEE_RAISE': {
      const e = state.people.employees.find((x) => x.id === fx.employeeId);
      if (e) {
        e.salaryMonthly = Math.round(e.salaryMonthly * (1 + fx.pct));
        e.satisfaction = clamp(e.satisfaction + 10 + fx.pct * 40, 0, 100);
        e.attritionRiskWeekly = Math.max(0.0015, e.attritionRiskWeekly * 0.8);
        occ.push({ icon: '💶', textDe: `${e.firstName} ${e.lastName}: Gehalt +${(fx.pct * 100).toFixed(0)} % — Bindung und Stimmung steigen.`, severity: 'good' });
        // Neid-Effekt: große Sprünge sprechen sich in der Abteilung herum.
        if (fx.pct > 0.12) {
          for (const k of state.people.employees) {
            if (k.dept === e.dept && k.id !== e.id) k.satisfaction = clamp(k.satisfaction - 2, 0, 100);
          }
          occ.push({ icon: '🗣️', textDe: `Die Erhöhung von ${e.firstName} ${e.lastName} spricht sich in ${deptDe(e.dept)} herum — Kolleg:innen rechnen nach.`, severity: 'warn' });
        }
      }
      break;
    }
    case 'CEO_SALARY_SET':
      state.ceo.salaryMonthly = fx.monthlyAmount;
      occ.push({ icon: '🏛️', textDe: `Aufsichtsrat wirksam: CEO-Vergütung jetzt ${k(fx.monthlyAmount)}/Monat.`, severity: 'info' });
      break;
    case 'TARIF_RAISE': {
      // Nur die Tarif-Belegschaft (AT/Execs bleiben außen vor).
      let n = 0;
      for (const e of coveredEmployees(state)) {
        e.salaryMonthly = Math.round(e.salaryMonthly * (1 + fx.pct));
        e.satisfaction = clamp(e.satisfaction + (fx.viaStrike ? 5 : 9), 0, 100);
        e.attritionRiskWeekly = Math.max(0.0015, e.attritionRiskWeekly * 0.9);
        n++;
      }
      occ.push({ icon: '💶', textDe: `Tariferhöhung +${(fx.pct * 100).toFixed(1)} % für ${n} Tarifbeschäftigte wirksam.`, severity: 'info' });
      break;
    }
    case 'WARNING_STRIKE': {
      const label = fx.full ? 'Streik' : 'Warnstreik';
      // Produktivität bricht ein, Vertrieb/Neugeschäft stockt.
      state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'velocity', factor: fx.full ? 0.45 : 0.7, startWeek: week, endWeek: week + (fx.full ? 2 : 1), sourceDe: `${label} (Tarifkonflikt)` });
      state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'leadGen', factor: fx.full ? 0.8 : 0.9, startWeek: week, endWeek: week + 2, sourceDe: `${label}: Vertrieb gestört` });
      state.reputation.press = clamp(state.reputation.press - (fx.full ? 6 : 3), 0, 100);
      state.pressLog.push({ week, tone: 'negative', topicDe: `${label} bei ${state.identity.companyName} — Belegschaft legt die Arbeit nieder` });
      occ.push({ icon: '✊', textDe: `${label}: Die Belegschaft legt die Arbeit nieder — Velocity und Neugeschäft leiden${fx.full ? ' deutlich' : ''}. Ein Abschluss wird dringend.`, severity: 'bad' });
      break;
    }
    case 'DIVIDEND_PAYOUT': {
      // Ausschüttung aus der Gewinnrücklage: Cash-Abfluss (CFF) + Rücklage runter.
      // Bilanz-Identität: Aktiva (Cash) −X, Eigenkapital (Retained) −X.
      ledger.dividendsPaid += fx.amount;
      state.finance.retainedEarnings -= fx.amount;
      state.legal.dividends.push({ week, amount: fx.amount });
      state.reputation.investors = clamp(state.reputation.investors + 4, 0, 100);
      occ.push({ icon: '💰', textDe: `Gewinnausschüttung ${k(fx.amount)} an die Gesellschafter beschlossen und ausgezahlt.`, severity: 'info' });
      break;
    }
    case 'IPO_LISTING': {
      // Bruttoerlös über CFF (Ledger), Fees als Einmalaufwand durch die GuV,
      // Einlage ins Eigenkapital — Bilanz-Identität hält konstruktionsbedingt.
      const { grossProceeds, fees } = applyIpoListing(state, fx.pricePerShare, fx.subscriptionRatio, occ);
      ledger.equityRaised += grossProceeds;
      ledger.oneOffsPaid += fees;
      state.finance.contributedCapital += grossProceeds;
      break;
    }
  }
}

// ────────────────────────────────────────────────────────────────────
function tickPeople(state: CompanyState, ledger: Ledger, occ: Occurrence[]): void {
  const week = state.meta.week;

  // Hiring-Pipeline: besetzte Ausschreibungen führen direkt zu Neuzugängen.
  for (const req of [...state.people.openRequisitions]) {
    req.expectedWeeksToFill -= 1;
    if (req.expectedWeeksToFill <= 0) {
      state.people.openRequisitions = state.people.openRequisitions.filter((r) => r.id !== req.id);
      applyEffect(
        state,
        { kind: 'HIRES_ARRIVE', dept: req.dept, seniority: req.seniority, count: req.count, costPerHire: req.costPerHire, specialistRoleDe: req.specialistRoleDe },
        `Ausschreibung W${req.openedWeek}`,
        ledger,
        occ,
      );
    }
  }

  // Ramp & Moral-Drift & Kündigungs-Rolls
  const rng = stream(state.meta.seed, 'attrition', week);
  const attritionMult = modifierProduct(state, 'attritionRisk');
  for (const e of [...state.people.employees]) {
    if (e.rampWeeksRemaining > 0) e.rampWeeksRemaining -= 1;
    // Moral driftet zur Ziel-Stimmung (Reputation, Runway-Angst, Basis 62)
    const anxiety = runwayWeeks(state) < 16 ? -8 : 0;
    const target = 62 + (state.reputation.laborMarket - 52) * 0.3 + anxiety;
    e.satisfaction = clamp(e.satisfaction + (target - e.satisfaction) * 0.06, 0, 100);
    const satFactor = e.satisfaction < 35 ? 3.0 : e.satisfaction < 50 ? 1.8 : e.satisfaction > 75 ? 0.5 : 1.0;
    if (rng() < e.attritionRiskWeekly * satFactor * attritionMult) {
      occ.push({ icon: '🚪', textDe: `${e.firstName} ${e.lastName} (${e.roleTitleDe}) kündigt${e.keyPerson ? ' — Schlüsselperson!' : ''}.`, severity: 'bad' });
      addMessage(state, {
        from: { name: `${e.firstName} ${e.lastName}`, roleDe: e.roleTitleDe, refId: e.id, company: null },
        subjectDe: 'Meine Kündigung',
        bodyDe: `hiermit kündige ich mein Arbeitsverhältnis fristgerecht. Die Entscheidung ist mir nicht leicht gefallen — aber ${e.satisfaction < 45 ? 'die letzten Monate haben mich ausgelaugt, und ich sehe hier aktuell keine Perspektive für mich' : 'ich habe ein Angebot bekommen, das ich nicht ausschlagen kann'}. Für die Übergabe stehe ich selbstverständlich bereit. Danke für die gemeinsame Zeit.`,
        kind: 'employee',
        eventInstanceId: null,
        delegable: false,
        suggestedActionType: 'START_HIRING',
        templateId: 'resignation',
        priority: e.keyPerson ? 'hoch' : 'normal',
      });
      if (e.keyPerson) {
        state.activeModifiers.push({
          id: nextId(state, 'mod'), target: 'velocity', factor: 0.9,
          startWeek: week, endWeek: week + 8, sourceDe: `Wissensverlust: Abgang ${e.firstName} ${e.lastName}`,
        });
      }
      removeEmployee(state, e.id);
    }
  }

  // Moral-Cache je Abteilung aktualisieren
  for (const d of DEPARTMENTS) {
    const emps = state.people.employees.filter((e) => e.dept === d);
    state.people.moraleByDept[d] = emps.length
      ? Math.round(emps.reduce((s, e) => s + e.satisfaction, 0) / emps.length)
      : 50;
  }
}

// ────────────────────────────────────────────────────────────────────
function tickProduct(state: CompanyState, occ: Occurrence[]): void {
  const v = currentVelocity(state);
  state.product.velocityPointsPerWeek = Math.round(v * 10) / 10;
  const a = state.product.rndAllocation;
  state.product.featurePointsShipped += v * a.features;
  // Tech-Debt: Feature-Druck erzeugt Schulden, Debt-Arbeit tilgt.
  state.product.techDebt = clamp(state.product.techDebt + a.features * 0.5 - a.techDebt * v * 0.09, 0, 100);
  // Bugs entstehen mit Feature-Arbeit (mehr bei hohem Debt), Fixes reduzieren.
  state.product.bugBacklog = Math.max(
    0,
    state.product.bugBacklog + a.features * v * 0.10 * (1 + state.product.techDebt / 100) - a.bugfixes * v * 0.5,
  );
  // NPS nähert sich einem Zielwert aus Produktqualität an.
  const npsTarget = 45 - state.product.bugBacklog * 0.55 - state.product.techDebt * 0.12;
  state.product.nps = Math.round((state.product.nps + (npsTarget - state.product.nps) * 0.05) * 10) / 10;
  state.product.dauMauRatio = clamp(state.product.dauMauRatio + (state.product.nps / 100 - state.product.dauMauRatio + 0.25) * 0.02, 0.05, 0.95);

  if (state.product.techDebt > 80) {
    occ.push({ icon: '🧨', textDe: `Tech-Debt bei ${Math.round(state.product.techDebt)}/100 — Deploys dauern Tage, das Outage-Risiko ist massiv erhöht.`, severity: 'warn' });
  }
}

// ────────────────────────────────────────────────────────────────────
function tickCustomers(state: CompanyState, ledger: Ledger, occ: Occurrence[]): void {
  const week = state.meta.week;
  const cust = state.customers;
  const rng = stream(state.meta.seed, 'customers', week);

  // — Pipeline: Budget → Leads → Trials → Wins —
  const weeklyMarketing = state.finance.budgetsMonthly.marketing / WEEKS_PER_MONTH;
  const pressFactor = 0.7 + 0.6 * (state.reputation.press / 100);
  const leadGenMult = modifierProduct(state, 'leadGen') * state.market.demandIndex * modifierProduct(state, 'demandIndex');
  // Abnehmender Grenznutzen: √-Skalierung oberhalb der Basis von 25 k€/Monat.
  const budgetFactor = Math.sqrt(Math.max(0, state.finance.budgetsMonthly.marketing) / 25_000);
  const leads = Math.round(25 * budgetFactor * pressFactor * leadGenMult * gaussian(rng, 1, 0.08));
  cust.pipeline.lastWeekLeads = leads;
  cust.pipeline.trials.push({ count: leads * cust.pipeline.leadToTrialRate, weeksToDecision: 3 });

  // Trials reifen; entscheidungsreife konvertieren.
  let wins = 0;
  const remaining: typeof cust.pipeline.trials = [];
  for (const t of cust.pipeline.trials) {
    const aged = { count: t.count, weeksToDecision: t.weeksToDecision - 1 };
    if (aged.weeksToDecision <= 0) {
      const salesCap = state.people.employees.filter((e) => e.dept === 'sales').length * 3.2; // Abschlüsse/Woche-Kapazität
      const npsF = 0.85 + 0.3 * ((state.product.nps + 100) / 200);
      const priceF = clamp(1 - (cust.priceIndex - 1) * 0.9, 0.55, 1.25); // teurer ⇒ weniger Wins
      const custRepF = 0.8 + 0.4 * (state.reputation.customers / 100);
      const winRate = cust.pipeline.trialWinRate * npsF * priceF * custRepF * modifierProduct(state, 'trialWinRate');
      wins += Math.min(aged.count * winRate, salesCap);
    } else {
      remaining.push(aged);
    }
  }
  cust.pipeline.trials = remaining.slice(-6);

  // Wins auf Quartals-Kohorten verteilen (85 % SMB / 15 % Mid-Market).
  if (wins > 0.01) {
    const qStart = week - (week % 13);
    for (const [segId, share] of [['seg_smb', 0.85], ['seg_mm', 0.15]] as const) {
      const seg = cust.segments.find((s) => s.id === segId);
      if (!seg) continue;
      const n = wins * share;
      let coh = cust.cohorts.find((c) => c.segmentId === segId && c.startWeek === qStart);
      if (!coh) {
        coh = {
          id: nextId(state, 'coh'), segmentId: segId, startWeek: qStart,
          logosMonthly: 0, logosAnnual: 0,
          arpaMonthly: seg.baseArpaMonthly * cust.priceIndex,
          baseMonthlyChurn: segId === 'seg_smb' ? 0.05 : 0.026, // junge Kohorten churnen stark
          monthlyExpansion: segId === 'seg_smb' ? 0.005 : 0.009,
        };
        cust.cohorts.push(coh);
      }
      const annualN = n * seg.annualContractShare;
      coh.logosMonthly += n - annualN;
      coh.logosAnnual += annualN;
      // Jahresvorauszahler: 12 Monate Cash sofort, Ertrag über Deferred.
      const prepay = annualN * coh.arpaMonthly * 12;
      ledger.annualPrepayCash += prepay;
      state.finance.deferredRevenue += prepay;
    }
  }
  cust.pipeline.recentNewLogos.push(wins);
  const smSpendWeekly =
    (state.finance.budgetsMonthly.marketing +
      state.people.employees.filter((e) => e.dept === 'sales' || e.dept === 'marketing')
        .reduce((s, e) => s + e.salaryMonthly, 0) * EMPLOYER_COST_FACTOR) / WEEKS_PER_MONTH;
  cust.pipeline.recentSmSpend.push(smSpendWeekly);
  if (cust.pipeline.recentNewLogos.length > 26) cust.pipeline.recentNewLogos.shift();
  if (cust.pipeline.recentSmSpend.length > 26) cust.pipeline.recentSmSpend.shift();

  // — Churn, Expansion, Kohorten-Reife —
  const churnMult = modifierProduct(state, 'churnMonthly') * (1 - clamp((state.product.nps - 12) / 400, -0.1, 0.15));
  let churnedLogos = 0;
  for (const c of cust.cohorts) {
    const ageWeeks = week - c.startWeek;
    // Alterskurve: Churn sinkt mit Kohortenalter (Überlebende sind loyaler).
    if (ageWeeks > 0 && ageWeeks % 13 === 0 && c.baseMonthlyChurn > 0.015) {
      c.baseMonthlyChurn = Math.max(0.013, c.baseMonthlyChurn * 0.94);
    }
    const wRate = monthlyToWeeklyRate(clamp(c.baseMonthlyChurn * churnMult, 0, 0.5));
    const lost = c.logosMonthly * wRate;
    c.logosMonthly -= lost;
    churnedLogos += lost;
    // Jahresverträge churnen nur zum Renewal (jährlich, gestaffelt über das Quartal):
    if (ageWeeks > 0 && ageWeeks % 52 === 0) {
      const renewalChurn = clamp(c.baseMonthlyChurn * churnMult * 6, 0, 0.6); // gebündelte Jahresentscheidung
      const lostA = c.logosAnnual * renewalChurn;
      c.logosAnnual -= lostA;
      churnedLogos += lostA;
      // Verbleibende zahlen erneut 12 Monate voraus:
      const prepay = c.logosAnnual * c.arpaMonthly * 12;
      ledger.annualPrepayCash += prepay;
      state.finance.deferredRevenue += prepay;
    }
    const expW = monthlyToWeeklyRate(clamp(c.monthlyExpansion * modifierProduct(state, 'expansionMonthly'), 0, 0.1));
    c.arpaMonthly *= 1 + expW;
  }
  cust.cohorts = cust.cohorts.filter((c) => c.logosMonthly + c.logosAnnual > 0.05);
  if (churnedLogos >= 1) {
    occ.push({ icon: '📉', textDe: `${Math.round(churnedLogos)} Kunde(n) haben diese Woche gekündigt.`, severity: churnedLogos > 4 ? 'bad' : 'info' });
  }

  // — Key-Accounts: Health-Drift & Renewals —
  for (const ka of cust.keyAccounts) {
    if (ka.status === 'churned') continue;
    const drift = (state.product.nps - 10) * 0.02 + (state.reputation.customers - 55) * 0.015 - 0.15;
    ka.health = clamp(ka.health + drift + gaussian(stream(state.meta.seed, 'ka', week, fnvLite(ka.id)), 0, 0.8), 0, 100);
    if (week === ka.renewalWeek) {
      const renewProb = clamp(ka.health / 100 + 0.15, 0.05, 0.97) * (ka.status === 'atRisk' ? 0.55 : 1);
      const roll = stream(state.meta.seed, 'ka-renewal', week, fnvLite(ka.id))();
      if (roll < renewProb) {
        ka.renewalWeek = week + 52;
        const prepay = ka.mrr * 12;
        ledger.annualPrepayCash += prepay;
        state.finance.deferredRevenue += prepay;
        occ.push({ icon: '🤝', textDe: `${ka.name} verlängert um 12 Monate (${k(ka.mrr)}/Monat).`, severity: 'good' });
      } else {
        ka.status = 'churned';
        occ.push({ icon: '💔', textDe: `${ka.name} kündigt zum Renewal — ${k(ka.mrr)} MRR brechen weg.`, severity: 'bad' });
        state.reputation.customers = clamp(state.reputation.customers - 2, 0, 100);
      }
    }
  }
}

function fnvLite(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// ────────────────────────────────────────────────────────────────────
function closeLedger(state: CompanyState, ledger: Ledger, cashStart: number) {
  const f = state.finance;
  const wf = 1 / WEEKS_PER_MONTH;

  // Umsatz-Anerkennung: Monatsverträge → Rechnung (AR); Jahresverträge → aus Deferred.
  let monthlyMrr = 0;
  let annualMrr = 0;
  for (const c of state.customers.cohorts) {
    monthlyMrr += c.logosMonthly * c.arpaMonthly;
    annualMrr += c.logosAnnual * c.arpaMonthly;
  }
  annualMrr += keyAccountMrr(state);

  const recMonthly = monthlyMrr * wf;
  const recAnnualWanted = annualMrr * wf;
  const recAnnual = Math.min(recAnnualWanted, f.deferredRevenue);
  const shortfall = recAnnualWanted - recAnnual; // Deferred leer ⇒ Rest wird fakturiert
  ledger.revenueRecognized = recMonthly + recAnnual + shortfall;
  ledger.billedToAR = recMonthly + shortfall;
  ledger.deferredReleased = recAnnual;
  f.deferredRevenue -= recAnnual;
  f.accountsReceivable += ledger.billedToAR;

  // Zahlungseingänge nach DSO
  const collectRate = Math.min(1, 7 / f.dsoDays);
  const collections = f.accountsReceivable * collectRate;
  f.accountsReceivable -= collections;
  ledger.collections = collections;

  // COGS & Nicht-Personal-OpEx → AP, Zahlung nach DPO
  ledger.cogsBooked = ledger.revenueRecognized * f.cogsRate;
  const b = f.budgetsMonthly;
  const projectsCostM = projectsMonthlyCost(state);
  const coachFee = state.ceo.coach?.monthlyFee ?? 0; // Executive-Coaching (Phase 12)
  const otherOpexMonthly = b.marketing + b.customerSuccess + b.rndTools + b.gaOther + officeCostMonthly(state) + projectsCostM + coachFee;
  ledger.otherOpexBooked = otherOpexMonthly * wf;
  f.accountsPayable += ledger.cogsBooked + ledger.otherOpexBooked;
  const payRate = Math.min(1, 7 / f.dpoDays);
  ledger.apPaid = f.accountsPayable * payRate;
  f.accountsPayable -= ledger.apPaid;

  // Payroll (wöchentlich, direkt aus Cash)
  const payrollByDept: Record<Department, number> = { engineering: 0, sales: 0, marketing: 0, cs: 0, ga: 0 };
  for (const e of state.people.employees) payrollByDept[e.dept] += e.salaryMonthly * EMPLOYER_COST_FACTOR * wf;
  const ceoPay = state.ceo.salaryMonthly * EMPLOYER_COST_FACTOR * wf;
  ledger.payrollPaid = DEPARTMENTS.reduce((s, d) => s + payrollByDept[d], 0) + ceoPay;

  // Zins (wöchentlich zahlungswirksam)
  ledger.interestPaid = f.debt.principal * f.debt.annualRate * (7 / 365);

  // GuV
  const opex: Record<OpexLine, { payroll: number; other: number }> = {
    salesMarketing: { payroll: payrollByDept.sales + payrollByDept.marketing, other: b.marketing * wf },
    rnd: { payroll: payrollByDept.engineering, other: b.rndTools * wf },
    customerSuccess: { payroll: payrollByDept.cs, other: b.customerSuccess * wf },
    ga: { payroll: payrollByDept.ga + ceoPay, other: (b.gaOther + officeCostMonthly(state) + projectsCostM + coachFee) * wf },
  };
  const opexTotal = Object.values(opex).reduce((s, o) => s + o.payroll + o.other, 0);
  const grossProfit = ledger.revenueRecognized - ledger.cogsBooked;
  const ebitda = grossProfit - opexTotal;
  const ebt = ebitda - ledger.oneOffsPaid - ledger.interestPaid;
  // Steuern nur auf positives Ergebnis UND wenn Verlustvorträge aufgebraucht (vereinfachtes Modell).
  // Deutsche Kapitalgesellschaft: KSt + Soli + Gewerbesteuer (Hebesatz je Stadt);
  // ausländische Standorte behalten ihren pauschalen Satz.
  const loc = locationOf(state);
  const taxRate = Math.max(0, effectiveCorporateTaxRate(state.legal, loc.country, loc.taxRate) - politicsTaxRelief(state));
  const tax = ebt > 0 && f.retainedEarnings > 0 ? ebt * taxRate : 0;
  ledger.taxPaid = tax;
  const netIncome = ebt - tax;

  const income: IncomeStatement = {
    revenue: toCents(ledger.revenueRecognized),
    cogs: toCents(ledger.cogsBooked),
    grossProfit: toCents(grossProfit),
    opex: Object.fromEntries(
      Object.entries(opex).map(([k2, v]) => [k2, { payroll: toCents(v.payroll), other: toCents(v.other) }]),
    ) as IncomeStatement['opex'],
    opexTotal: toCents(opexTotal),
    ebitda: toCents(ebitda),
    oneOffs: toCents(ledger.oneOffsPaid),
    interest: toCents(ledger.interestPaid),
    tax: toCents(tax),
    netIncome: toCents(netIncome),
  };

  // Cash bewegen (ALLE Flüsse der Woche an einem Ort)
  const cfoNet =
    ledger.collections + ledger.annualPrepayCash - ledger.payrollPaid - ledger.apPaid -
    ledger.interestPaid - ledger.taxPaid - ledger.oneOffsPaid;
  const cffNet = ledger.debtDrawn - ledger.debtRepaid + ledger.equityRaised - ledger.dividendsPaid;
  f.cash = cashStart + cfoNet + cffNet;

  // Eigenkapital fortschreiben
  f.retainedEarnings += netIncome;

  // Covenant-Verletzungs-Zähler (Bank-Eskalations-Event)
  const minCashCov = f.debt.covenants.find((c) => c.type === 'minCash');
  if (minCashCov && minCashCov.type === 'minCash' && f.cash < minCashCov.value) {
    f.consecutiveMinCashBreachWeeks += 1;
  } else {
    f.consecutiveMinCashBreachWeeks = 0;
  }

  const cashflow: CashFlowStatement = {
    cashStart: toCents(cashStart),
    operations: {
      collections: toCents(ledger.collections + ledger.annualPrepayCash),
      payroll: toCents(-ledger.payrollPaid),
      suppliers: toCents(-ledger.apPaid),
      interest: toCents(-ledger.interestPaid),
      tax: toCents(-ledger.taxPaid),
      oneOffs: toCents(-ledger.oneOffsPaid),
      net: toCents(cfoNet),
    },
    investing: { net: 0 },
    financing: {
      debtDrawn: toCents(ledger.debtDrawn),
      debtRepaid: toCents(-ledger.debtRepaid),
      equityRaised: toCents(ledger.equityRaised - ledger.dividendsPaid),
      net: toCents(cffNet),
    },
    netChange: toCents(cfoNet + cffNet),
    cashEnd: toCents(f.cash),
  };

  const assetsTotal = f.cash + f.accountsReceivable;
  const liabTotal = f.accountsPayable + f.deferredRevenue + f.debt.principal;
  const equityTotal = f.contributedCapital + f.retainedEarnings;
  const balance: BalanceSheet = {
    assets: { cash: toCents(f.cash), accountsReceivable: toCents(f.accountsReceivable), total: toCents(assetsTotal) },
    liabilities: {
      accountsPayable: toCents(f.accountsPayable),
      deferredRevenue: toCents(f.deferredRevenue),
      debt: toCents(f.debt.principal),
      total: toCents(liabTotal),
    },
    equity: { contributed: toCents(f.contributedCapital), retained: toCents(f.retainedEarnings), total: toCents(equityTotal) },
    identityDelta: toCents(assetsTotal - liabTotal - equityTotal),
  };

  return { income, cashflow, balance };
}

// ────────────────────────────────────────────────────────────────────
function tickMarketAndReputation(state: CompanyState, occ: Occurrence[]): void {
  const week = state.meta.week;
  const rng = stream(state.meta.seed, 'market', week);

  // Markt wächst; Wettbewerber driften in Feature-Score & Marktanteil.
  state.market.tamMrr *= 1 + monthlyToWeeklyRate(state.market.marketGrowthMonthly);
  const playerShare = totalMrr(state) / state.market.tamMrr;
  for (const c of state.market.competitors) {
    c.featureScore = clamp(c.featureScore + (c.strategy === 'featureRace' ? 0.25 : 0.1) * gaussian(rng, 1, 0.5), 0, 100);
    const drift = (c.strategy === 'priceWar' ? 0.0004 : 0.0002) * gaussian(rng, 1, 0.6);
    c.marketShare = clamp(c.marketShare + drift - (playerShare > 0.06 ? 0.0001 : 0), 0.01, 0.5);
  }

  // Reputation nähert sich Treibern an.
  const rep = state.reputation;
  const npsPull = (state.product.nps - 10) * 0.04;
  rep.customers = clamp(rep.customers + (55 + npsPull - rep.customers) * 0.05, 0, 100);
  const moraleAvg = avgSatisfaction(state);
  rep.laborMarket = clamp(rep.laborMarket + (moraleAvg * 0.9 - rep.laborMarket) * 0.04, 0, 100);
  rep.press = clamp(rep.press + (50 - rep.press) * 0.02, 0, 100); // Presse vergisst langsam
  const runway = runwayWeeks(state);
  const invTarget = runway > 52 ? 62 : runway > 26 ? 52 : 38;
  rep.investors = clamp(rep.investors + (invTarget - rep.investors) * 0.06, 0, 100);

  // Abgelaufene Modifikatoren aufräumen
  state.activeModifiers = state.activeModifiers.filter((m) => m.endWeek >= week);
}

// ────────────────────────────────────────────────────────────────────
function buildAlerts(state: CompanyState): Alert[] {
  const alerts: Alert[] = [];
  const runway = runwayWeeks(state);
  if (runway < 13) {
    alerts.push({ id: 'runway-critical', severity: 'critical', titleDe: `Runway: ${Math.round(runway)} Wochen`, bodyDe: 'Ohne Gegenmaßnahmen ist die Zahlungsunfähigkeit absehbar. Optionen: Kosten senken, Kredit ziehen, Umsatz beschleunigen.' });
  } else if (runway < 26) {
    alerts.push({ id: 'runway-warn', severity: 'warn', titleDe: `Runway: ${Math.round(runway)} Wochen`, bodyDe: 'Unter 6 Monaten Reichweite wird das Board unruhig — ein Plan zur Verlängerung gehört auf die Agenda.' });
  }
  for (const cov of state.finance.debt.covenants) {
    if (cov.type === 'minCash' && state.finance.cash < cov.value * 1.2) {
      alerts.push({
        id: 'covenant-' + cov.type,
        severity: state.finance.cash < cov.value ? 'critical' : 'warn',
        titleDe: state.finance.cash < cov.value ? `Covenant VERLETZT: ${cov.labelDe}` : `Covenant-Puffer schmilzt: ${cov.labelDe}`,
        bodyDe: `Kasse: ${k(state.finance.cash)}. Bei anhaltender Verletzung kann die Bank die Linie fällig stellen.`,
      });
    }
  }
  for (const ev of state.openEvents.filter((e) => e.status === 'open')) {
    alerts.push({ id: 'event-' + ev.instanceId, severity: 'warn', titleDe: 'Offenes Ereignis wartet auf Entscheidung', bodyDe: ev.bodyDe.slice(0, 140) + '…' });
  }
  if (state.product.techDebt > 70) {
    alerts.push({ id: 'techdebt', severity: 'warn', titleDe: `Tech-Debt: ${Math.round(state.product.techDebt)}/100`, bodyDe: 'Velocity leidet, Outage-Wahrscheinlichkeit erhöht. Der CTO fordert ein Stabilisierungs-Quartal.' });
  }
  const morale = avgSatisfaction(state);
  if (morale < 45) {
    alerts.push({ id: 'morale', severity: 'warn', titleDe: `Team-Zufriedenheit: ${Math.round(morale)}/100`, bodyDe: 'Kündigungswelle droht. Ursachen: Unsicherheit, Gehaltsniveau, Führung.' });
  }
  if (state.ceo.probation) {
    alerts.push({ id: 'probation', severity: 'critical', titleDe: 'BEWÄHRUNG: Das Board hat dich formal abgemahnt', bodyDe: `Ziele bis Woche ${state.ceo.probation.endsWeek}: ` + state.ceo.probation.targets.map((t) => t.labelDe).join(' · ') });
  }
  return alerts;
}

function bumpSatisfaction(state: CompanyState, dept: Department | 'all', amount: number): void {
  for (const e of state.people.employees) {
    if (dept === 'all' || e.dept === dept) e.satisfaction = clamp(e.satisfaction + amount, 0, 100);
  }
}

function k(v: number): string {
  return `${Math.round(v / 1000)} k€`;
}

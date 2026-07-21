import {
  DEPARTMENTS,
  type Department,
  type Money,
  type Seniority,
} from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { GameSetup } from '../types/game.js';
import type { Employee, Executive, ExecutiveRole } from '../types/people.js';
import { EMPLOYER_COST_FACTOR } from '../types/people.js';
import type { CustomerCohort, KeyAccount } from '../types/customers.js';
import { resolveLocationProfile } from './scenarios/locations.js';
import { DIFFICULTIES } from './scenarios/difficulty.js';
import { accountName, personaBits, personName, ROLE_TITLES } from './names.js';
import { gaussian, intBetween, stream } from './rng.js';
import { computeKpis } from './kpis.js';
import { addMessage, execSender, upkeepCalendar } from './comms.js';
import { generateMaTargets } from './ma.js';
import { initialIpoState } from '../types/ipo.js';
import { initialLaborState } from '../types/labor.js';
import { balancedFocus } from '../types/ceo.js';
import { initialTakeoverState } from '../types/takeover.js';
import { initialCrisisState } from '../types/crisis.js';
import { initialLegalState } from './legal.js';
import { buildInitialBoard } from './governance.js';
import { ESOP_CLIFF_WEEKS, ESOP_VEST_WEEKS, defaultGrantPercent } from './equity.js';

/**
 * Spielinitialisierung: baut aus GameSetup + Seed den Start-CompanyState.
 *
 * Phase 1 implementiert das Szenario „saas-turnaround":
 * Du übernimmst als neuer CEO eine B2B-SaaS-Firma mit solidem Produktumsatz,
 * aber gefährlich hohem SMB-Churn, gewachsenem Tech-Debt und ~10 Monaten
 * Runway. Das Board erwartet einen glaubwürdigen Turnaround-Plan.
 */

const SENIORITY_SALARY: Record<Seniority, Money> = {
  werkstudent: 1650,
  junior: 3900,
  mid: 5100,
  senior: 6600,
  lead: 8200,
};

const EXEC_SALARY = 9800;

/** Personalplan des Übernahme-Szenarios: [dept, seniority, anzahl]. */
const SAAS_STAFF_PLAN: [Department, Seniority, number][] = [
  ['engineering', 'lead', 1], // wird CTO
  ['engineering', 'senior', 3],
  ['engineering', 'mid', 3],
  ['engineering', 'junior', 2],
  ['sales', 'lead', 1], // Head of Sales
  ['sales', 'senior', 1],
  ['sales', 'mid', 2],
  ['sales', 'junior', 1],
  ['marketing', 'mid', 2],
  ['marketing', 'junior', 1],
  ['cs', 'lead', 1], // Head of CS
  ['cs', 'mid', 2],
  ['cs', 'junior', 1],
  ['ga', 'lead', 1], // CFO/Controller
  ['ga', 'senior', 1],
  ['ga', 'mid', 2],
  ['ga', 'junior', 1],
];

const EXEC_PERSONAS: {
  role: ExecutiveRole;
  dept: Department;
  personalityDe: string;
  agendaDe: string;
}[] = [
  {
    role: 'cto',
    dept: 'engineering',
    personalityDe: 'ruhig, gründlich, allergisch gegen Abkürzungen; kommuniziert in Diagrammen',
    agendaDe: 'Will ein Quartal Tech-Debt-Abbau durchsetzen, bevor „noch ein Feature" versprochen wird.',
  },
  {
    role: 'headOfSales',
    dept: 'sales',
    personalityDe: 'energisch, optimistisch, deal-getrieben; verspricht gern zu viel',
    agendaDe: 'Will Rabatt-Spielraum und zwei zusätzliche AEs, um die Pipeline zu heben.',
  },
  {
    role: 'headOfCs',
    dept: 'cs',
    personalityDe: 'empathisch, datenaffin, brennt für Kunden; chronisch unterbesetzt',
    agendaDe: 'Will ein Onboarding-Programm, weil der Churn in den ersten 90 Tagen entsteht.',
  },
  {
    role: 'cfo',
    dept: 'ga',
    personalityDe: 'nüchtern, präzise, warnt früh; denkt in Szenarien',
    agendaDe: 'Will den Burn unter 60 k€/Monat drücken und die Covenant-Puffer schützen.',
  },
];

function nextId(state: { idCounter: number }, prefix: string): string {
  state.idCounter += 1;
  return `${prefix}_${state.idCounter.toString(36)}`;
}

export function createCompany(setup: GameSetup, seed: number, gameId: string, createdAtISO: string): CompanyState {
  if (setup.scenarioId !== 'saas-turnaround' && setup.scenarioId !== 'distressed') {
    throw new Error(`Szenario ${setup.scenarioId} ist noch nicht implementiert.`);
  }
  /**
   * Szenario 2 (Phase 6): „Sanierungsfall" — dieselbe Firma, aber zwei Jahre
   * schlechter geführt: fast leere Kasse, Lieferanten auf der Bremse, Bank
   * nervös, Produkt verwahrlost, Team zermürbt. Runway ist hier von Tag 1
   * die einzige Uhr, die zählt.
   */
  const dz = setup.scenarioId === 'distressed';
  const loc = resolveLocationProfile(setup.identity.locationId, setup.identity.location);
  const diff = DIFFICULTIES[setup.difficulty];
  const counter = { idCounter: 0 };

  // ── Personal ──────────────────────────────────────────────────────
  const rngPeople = stream(seed, 'init:people', 0);
  const employees: Employee[] = [];
  for (const [dept, seniority, count] of SAAS_STAFF_PLAN) {
    for (let i = 0; i < count; i++) {
      const { firstName, lastName } = personName(rngPeople);
      const baseSalary = seniority === 'lead' && EXEC_PERSONAS.some((e) => e.dept === dept)
        ? EXEC_SALARY
        : SENIORITY_SALARY[seniority];
      employees.push({
        id: nextId(counter, 'emp'),
        firstName,
        lastName,
        dept,
        roleTitleDe: ROLE_TITLES[dept]?.[seniority] ?? 'Mitarbeiter:in',
        seniority,
        salaryMonthly: Math.round(baseSalary * loc.payrollIndex * gaussian(rngPeople, 1, 0.05)),
        performance: Math.round(gaussian(rngPeople, 68, 12)),
        satisfaction: Math.round(gaussian(rngPeople, dz ? 49 : 58, 10)), // gedrückt: Übernahme-Unsicherheit (Sanierungsfall: zermürbt)
        attritionRiskWeekly: 0.0035,
        keyPerson: seniority === 'lead' || (seniority === 'senior' && rngPeople() < 0.4),
        hiredWeek: -intBetween(rngPeople, 20, 200),
        rampWeeksRemaining: 0,
        ...personaBits(rngPeople, seniority),
      });
    }
  }

  // ESOP-Grants (Phase 10): Schlüsselpersonen halten Optionen, die seit ihrem
  // Eintritt vesten (4 Jahre / 1-Jahr-Cliff). Bleibt unter dem 10-%-Pool.
  {
    let esopAlloc = 0;
    for (const e of employees) {
      if (!e.keyPerson) continue;
      const pct = defaultGrantPercent(e);
      if (esopAlloc + pct > 0.09) break; // Puffer im Pool lassen
      e.equityGrant = { percent: pct, grantWeek: e.hiredWeek, cliffWeeks: ESOP_CLIFF_WEEKS, vestWeeks: ESOP_VEST_WEEKS };
      esopAlloc += pct;
    }
  }

  const executives: Executive[] = EXEC_PERSONAS.map((p) => {
    const emp = employees.find((e) => e.dept === p.dept && e.seniority === 'lead');
    if (!emp) throw new Error('Führungskraft ohne Mitarbeiter-Datensatz');
    return {
      id: nextId(counter, 'exec'),
      employeeId: emp.id,
      role: p.role,
      personalityDe: p.personalityDe,
      agendaDe: p.agendaDe,
      relationshipToCeo: 55,
    };
  });

  const assistantName = personName(rngPeople);
  const assistant = {
    id: nextId(counter, 'asst'),
    name: `${assistantName.firstName} ${assistantName.lastName}`,
    personalityDe: 'organisiert bis zur Unheimlichkeit, loyal, kennt jeden Flurfunk; sagt dir auch unbequeme Dinge — freundlich, aber unmissverständlich',
  };

  // ── Kunden ────────────────────────────────────────────────────────
  const rngCust = stream(seed, 'init:customers', 0);
  const segSmb = { id: 'seg_smb', nameDe: 'SMB', baseArpaMonthly: 450, annualContractShare: 0.2 };
  const segMm = { id: 'seg_mm', nameDe: 'Mid-Market', baseArpaMonthly: 1850, annualContractShare: 0.6 };

  // Bestand in 4 Alters-Kohorten je Segment aufteilen (ältere churnen weniger).
  const cohorts: CustomerCohort[] = [];
  const smbTotal = dz ? 232 : 262;
  const mmTotal = dz ? 15 : 18;
  const split = [0.18, 0.24, 0.27, 0.31]; // jüngste → älteste
  const ageWeeks = [7, 33, 59, 111];
  split.forEach((share, i) => {
    const churnByAge = (dz ? [0.072, 0.056, 0.041, 0.03] : [0.058, 0.045, 0.034, 0.026])[i] ?? 0.03; // DAS Problem: junge Kohorten churnen massiv
    cohorts.push({
      id: nextId(counter, 'coh'),
      segmentId: segSmb.id,
      startWeek: -(ageWeeks[i] ?? 30),
      logosMonthly: smbTotal * share * 0.8,
      logosAnnual: smbTotal * share * 0.2,
      arpaMonthly: segSmb.baseArpaMonthly * gaussian(rngCust, 1, 0.03),
      baseMonthlyChurn: churnByAge,
      monthlyExpansion: 0.005,
    });
    cohorts.push({
      id: nextId(counter, 'coh'),
      segmentId: segMm.id,
      startWeek: -(ageWeeks[i] ?? 30),
      logosMonthly: mmTotal * share * 0.4,
      logosAnnual: mmTotal * share * 0.6,
      arpaMonthly: segMm.baseArpaMonthly * gaussian(rngCust, 1, 0.03),
      baseMonthlyChurn: (dz ? [0.034, 0.026, 0.02, 0.015] : [0.028, 0.022, 0.017, 0.013])[i] ?? 0.018,
      monthlyExpansion: 0.009,
    });
  });

  const takenNames = new Set<string>();
  const kaMrr = [14000, 11000, 9000, 7500, 6500];
  const keyAccounts: KeyAccount[] = kaMrr.map((mrr, i) => ({
    id: nextId(counter, 'ka'),
    name: accountName(rngCust, takenNames),
    segmentId: segMm.id,
    mrr,
    health: intBetween(rngCust, 55, 80) - (i === 0 ? (dz ? 22 : 12) : 0), // größter Account ist angespannt
    renewalWeek: intBetween(rngCust, 9, 48),
    status: dz && i === 0 ? 'atRisk' : 'ok',
  }));

  // ── Finanzen ──────────────────────────────────────────────────────
  const cash = Math.round((dz ? 340_000 : 900_000) * diff.startingCashMult);
  const cohortMrr = cohorts.reduce((s, c) => s + (c.logosMonthly + c.logosAnnual) * c.arpaMonthly, 0);
  const totalMrr = cohortMrr + kaMrr.reduce((a, b) => a + b, 0);
  const dso = dz ? 44 : 38;
  const accountsReceivable = Math.round(totalMrr * (dso / 30.44));
  const accountsPayable = dz ? 148_000 : 96_000; // Sanierungsfall: Lieferanten warten bereits
  // Jahresvorauszahler: im Schnitt 6 Monate Leistung noch offen.
  const annualMrr =
    cohorts.reduce((s, c) => s + c.logosAnnual * c.arpaMonthly, 0) + kaMrr.reduce((a, b) => a + b, 0);
  const deferredRevenue = Math.round(annualMrr * 6);
  const debtPrincipal = dz ? 540_000 : 300_000;
  const contributedCapital = 2_500_000;
  const assets = cash + accountsReceivable;
  const liabilities = accountsPayable + deferredRevenue + debtPrincipal;
  // Retained Earnings als Residualgröße, damit die Bilanz ab Woche 0 exakt aufgeht.
  const retainedEarnings = assets - liabilities - contributedCapital;

  const state: CompanyState = {
    meta: {
      gameId,
      seed,
      scenarioId: setup.scenarioId,
      difficulty: setup.difficulty,
      week: 0,
      startDateISO: '2026-01-05',
      status: 'active',
      endReasonDe: null,
      createdAtISO,
    },
    identity: { ...setup.identity, location: loc },
    playerProfile: setup.playerProfile,
    capTable: [
      { id: 'cap_founders', holder: 'Altgesellschafter (Gründer)', kind: 'founder', share: 0.52 },
      { id: 'cap_investor', holder: 'Almberg Capital (Lead-Investor)', kind: 'investor', share: 0.33 },
      { id: 'cap_esop', holder: 'Mitarbeiterbeteiligung (ESOP)', kind: 'esop', share: 0.1 },
      { id: 'cap_ceo', holder: setup.playerProfile.ceoName + ' (CEO)', kind: 'ceo', share: 0.05 },
    ],
    finance: {
      cash,
      accountsReceivable,
      accountsPayable,
      deferredRevenue,
      debt: {
        principal: debtPrincipal,
        annualRate: dz ? 0.095 : 0.08,
        creditLine: dz ? 700_000 : 600_000,
        covenants: [
          { type: 'minCash', value: dz ? 120_000 : 150_000, labelDe: dz ? 'Mindestliquidität 120 k€' : 'Mindestliquidität 150 k€' },
          { type: 'maxDebtToArr', value: dz ? 0.6 : 0.5, labelDe: dz ? 'Verschuldung max. 60 % vom ARR' : 'Verschuldung max. 50 % vom ARR' },
        ],
      },
      contributedCapital,
      retainedEarnings,
      dsoDays: dso,
      dpoDays: dz ? 33 : 24,
      cogsRate: 0.22,
      consecutiveMinCashBreachWeeks: 0,
      budgetsMonthly: {
        marketing: dz ? 17_000 : 25_000,
        customerSuccess: dz ? 4_000 : 6_000,
        rndTools: 8_000,
        gaOther: 12_000,
      },
    },
    customers: {
      segments: [segSmb, segMm],
      cohorts,
      keyAccounts,
      pipeline: {
        lastWeekLeads: 0,
        trials: [
          { count: 14, weeksToDecision: 1 },
          { count: 16, weeksToDecision: 2 },
          { count: 18, weeksToDecision: 3 },
        ],
        leadToTrialRate: 0.28,
        trialWinRate: dz ? 0.13 : 0.15,
        recentNewLogos: [],
        recentSmSpend: [],
      },
      priceIndex: 1.0,
      lastPriceChangeWeek: null,
    },
    people: {
      employees,
      executives,
      assistant,
      openRequisitions: [],
      moraleByDept: Object.fromEntries(DEPARTMENTS.map((d) => [d, dz ? 50 : 58])) as Record<Department, number>,
      attritionModifier: 1.0,
    },
    product: {
      techDebt: dz ? 79 : 62,
      velocityPointsPerWeek: 0, // wird im ersten Tick berechnet
      bugBacklog: dz ? 58 : 34,
      nps: dz ? 1 : 12,
      dauMauRatio: 0.42,
      featurePointsShipped: 0,
      rndAllocation: { features: 0.7, techDebt: 0.15, bugfixes: 0.15 },
    },
    market: {
      tamMrr: 4_200_000,
      marketGrowthMonthly: 0.008,
      demandIndex: 1.0,
      competitors: [
        {
          id: 'comp_klarwerk',
          name: 'Klarwerk Software',
          strategyDe: 'Feature-Race: liefert schnell, Qualität mittel, laut im Marketing.',
          strategy: 'featureRace',
          priceIndex: 1.05,
          featureScore: 66,
          marketShare: 0.09,
          aggressiveness: 0.55,
        },
        {
          id: 'comp_nordcloud',
          name: 'NordCloud Systems',
          strategyDe: 'Preiskampf: 20 % billiger, dünner Support, jagt SMB-Kunden.',
          strategy: 'priceWar',
          priceIndex: 0.8,
          featureScore: 48,
          marketShare: 0.07,
          aggressiveness: 0.75,
        },
        {
          id: 'comp_vantiro',
          name: 'Vantiro',
          strategyDe: 'Enterprise-Move: Compliance-Features, Konzernvertrieb, langsam aber kapitalstark.',
          strategy: 'enterpriseMove',
          priceIndex: 1.35,
          featureScore: 72,
          marketShare: 0.11,
          aggressiveness: 0.35,
        },
      ],
      agentCooldowns: {},
      maTargets: generateMaTargets(seed, counter),
    },
    reputation: dz
      ? { customers: 46, press: 39, laborMarket: 45, investors: 41 }
      : { customers: 55, press: 50, laborMarket: 52, investors: 54 },
    ceo: {
      boardTrust: dz ? 47 : 58,
      trustLog: [{ week: 0, delta: 0, reasonDe: dz ? 'Amtsantritt als Sanierer: Das Board hat wenig Geduld übrig — es zählt nur noch der Plan.' : 'Amtsantritt: Das Board gewährt einen Vertrauensvorschuss — und erwartet einen Plan.' }],
      reputation: 50,
      salaryMonthly: 12_000,
      equityShare: 0.05,
      probation: null,
      skills: { finanzen: 20, strategie: 20, leadership: 20, kommunikation: 20, krisenmanagement: 20, governance: 20 },
      energy: dz ? 68 : 78,
      focus: balancedFocus(),
      personalNetCash: 0,
      coach: null,
      publicLog: [],
    },
    scheduledEffects: [],
    activeModifiers: [],
    openEvents: [],
    eventCooldowns: {},
    comms: { messages: [], cooldowns: {} },
    calendar: { appointments: [] },
    projects: [],
    pressLog: [],
    funding: { rounds: [], investorBoardSeat: false, ventureDebtTaken: false },
    ipo: initialIpoState(),
    labor: initialLaborState(loc.regulationDensity, dz),
    legal: initialLegalState(seed, loc),
    board: buildInitialBoard(seed, setup.playerProfile.ceoName),
    takeover: initialTakeoverState(),
    crisis: initialCrisisState(),
    history: [],
    decisionLog: [],
    evaluations: [],
    idCounter: counter.idCounter,
  };

  // Payroll-Plausibilität absichern (Invariante: > 0).
  const payroll = employees.reduce((s, e) => s + e.salaryMonthly, 0) * EMPLOYER_COST_FACTOR;
  if (payroll <= 0) throw new Error('Init: Payroll darf nicht 0 sein');

  // Woche-0-Snapshot: Dashboard & Charts haben ab der ersten Sekunde Daten.
  state.history.push(computeKpis(state));

  // Willkommens-Kommunikation: Briefing der Assistentin + Antritts-Mail des CFO.
  addMessage(state, {
    from: { name: assistant.name, roleDe: 'Chief of Staff', refId: assistant.id, company: null },
    subjectDe: `Willkommen bei ${setup.identity.companyName} — dein Antritts-Briefing`,
    bodyDe: dz
      ? `willkommen — und ich sage das ohne Umschweife: Du übernimmst einen Sanierungsfall. Die Lage: ~${Math.round(totalMrrOf(state) / 1000)} k€ MRR, aber die Kasse ist fast leer, die Lieferanten sind bereits vertröstet, die Bank prüft die Covenants monatlich und das Team hat zwei Chef-Wechsel hinter sich. Jede Woche ohne Entscheidung ist eine Woche weniger Runway.\n\nMein Rat für Woche 1: Finanzen-Tab ZUERST (Runway, Covenants), dann die härteste Frage ehrlich beantworten: Was wird abgeschaltet, damit der Kern überlebt? Das Board erwartet keinen Visionsvortrag — es erwartet einen 13-Wochen-Liquiditätsplan.\n\nIch bin da. ${assistant.name.split(' ')[0]}`
      : `herzlich willkommen an Bord! Ich bin ${assistant.name}, deine Chief of Staff — ich halte dir Kalender, Inbox und Flurfunk im Griff.\n\nDie Lage in einem Absatz: Das Produkt ist solide, der Umsatz auch (~${Math.round(totalMrrOf(state) / 1000)} k€ MRR) — aber die jungen Kunden-Kohorten kündigen zu schnell, das Engineering schiebt Altlasten vor sich her, und die Kasse reicht bei aktuellem Tempo nicht ewig. Das Board hat dich geholt, um genau das zu drehen.\n\nMein Rat für Woche 1: Sprich mit dem Führungsteam (Chat), sieh dir Kunden & Finanzen an, triff die ersten Entscheidungen — und schließe dann die Woche ab. Ich melde mich jeden Montag mit deinem Briefing.\n\n${assistant.name.split(' ')[0]}`,
    kind: 'briefing',
    eventInstanceId: null,
    delegable: false,
    suggestedActionType: null,
    templateId: 'welcome',
    priority: 'hoch',
  });
  addMessage(state, {
    from: execSender(state, 'cfo'),
    subjectDe: 'Zahlenwerk zum Amtsantritt (bitte lesen)',
    bodyDe: `willkommen! Damit wir vom ersten Tag an dieselben Zahlen sehen: Kasse ${Math.round(state.finance.cash / 1000)} k€, Netto-Burn ~${Math.round(netBurnOf(state) / 1000)} k€/Monat, Kreditlinie zu ${Math.round((state.finance.debt.principal / state.finance.debt.creditLine) * 100)} % gezogen, Covenants im Finanzen-Tab. Meine ehrliche Einschätzung: Wir haben Zeit für einen sauberen Turnaround — aber nicht für zwei Anläufe. Ich schicke dir monatlich den Report und melde mich sofort, wenn etwas kippt.`,
    kind: 'exec',
    eventInstanceId: null,
    delegable: false,
    suggestedActionType: null,
    templateId: 'welcome-cfo',
  });

  // Erster Termin: Leadership-Sync am Montag der Woche 1.
  upkeepCalendar(state);

  return state;
}

// Kleine lokale Helfer (vermeiden Import-Zyklen in init):
function totalMrrOf(state: CompanyState): number {
  const coh = state.customers.cohorts.reduce((s, c) => s + (c.logosMonthly + c.logosAnnual) * c.arpaMonthly, 0);
  const ka = state.customers.keyAccounts.reduce((s, k) => s + (k.status !== 'churned' ? k.mrr : 0), 0);
  return coh + ka;
}
function netBurnOf(state: CompanyState): number {
  const payroll = state.people.employees.reduce((s, e) => s + e.salaryMonthly, 0) * EMPLOYER_COST_FACTOR;
  const b = state.finance.budgetsMonthly;
  return Math.max(0, payroll + b.marketing + b.customerSuccess + b.rndTools + b.gaOther - totalMrrOf(state) * (1 - state.finance.cogsRate));
}

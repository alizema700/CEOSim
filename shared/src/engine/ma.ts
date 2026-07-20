import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { MaTarget } from '../types/funding.js';
import type { Occurrence } from '../types/game.js';
import { gaussian, intBetween, pick, stream, type Rng } from './rng.js';
import { personaBits, personName, ROLE_TITLES } from './names.js';
import { nextId, schedule } from './stateHelpers.js';
import { addMessage, assistantSender } from './comms.js';
import { locationOf } from './derive.js';

/**
 * M&A-Zukäufe (Phase 5): 2 Kaufziele mit versteckten Red Flags.
 * Due Diligence (15 k€) deckt sie auf — kaufen ohne DD heißt, sie voll
 * einzusammeln. Integration bringt Kulturkonflikt-Risiko; Synergien
 * materialisieren sich (nicht) seed-gesteuert.
 */

export function generateMaTargets(seed: number, counter: { idCounter: number }): MaTarget[] {
  const rng = stream(seed, 'ma-targets', 0);
  const mkId = (p: string) => {
    counter.idCounter += 1;
    return `${p}_${counter.idCounter.toString(36)}`;
  };

  const t1Mrr = 25_000 + Math.round(rng() * 20_000);
  const t2Mrr = 45_000 + Math.round(rng() * 25_000);
  return [
    {
      id: mkId('mat'),
      name: 'TicketFuchs GmbH',
      pitchDe: 'Kleiner Helpdesk-Anbieter für Handwerksbetriebe. Loyaler Kundenstamm, müdes Produkt — die Gründer wollen aussteigen.',
      askPrice: Math.round(t1Mrr * 12 * (2.2 + rng() * 0.6)),
      mrr: t1Mrr,
      claimedMonthlyChurn: 0.022,
      employees: 6,
      techDebt: 74,
      redFlags: [
        { id: 'rf-churn', labelDe: 'Churn ist geschönt: Die letzten 2 Quartale liegen real bei ~3,5 %/Monat (Auffüllung durch Rabatt-Deals).', kind: 'churn-higher', severity: 2 },
        { id: 'rf-debt', labelDe: 'Kern-Modul läuft auf einer nicht mehr gewarteten Framework-Version — Migrationsaufwand erheblich.', kind: 'tech-debt-worse', severity: 2 },
      ],
      ddDone: false,
      status: 'available',
    },
    {
      id: mkId('mat'),
      name: 'Klaro Support Systems',
      pitchDe: 'Mid-Market-Support-Suite mit gutem Ruf im Gesundheitswesen. Preis ambitioniert, Team stark.',
      askPrice: Math.round(t2Mrr * 12 * (3.0 + rng() * 0.8)),
      mrr: t2Mrr,
      claimedMonthlyChurn: 0.015,
      employees: 11,
      techDebt: 45,
      redFlags: [
        { id: 'rf-key', labelDe: 'Der größte Kunde (≈ 22 % des MRR) hat intern bereits eine Ausschreibung für einen Wechsel gestartet.', kind: 'key-customer-leaving', severity: 3 },
        { id: 'rf-suit', labelDe: 'Ein Ex-Mitarbeiter klagt auf virtuelle Anteile — Streitwert ~60 k€, Ausgang offen.', kind: 'pending-lawsuit', severity: 1 },
      ],
      ddDone: false,
      status: 'available',
    },
  ];
}

export function maTarget(state: CompanyState, targetId: string): MaTarget {
  const t = state.market.maTargets.find((x) => x.id === targetId);
  if (!t) throw new Error('Kaufziel nicht gefunden.');
  return t;
}

/** Integration ausführen (vom Wochentick über MA_INTEGRATION-Effekt). */
export function applyMaIntegration(state: CompanyState, targetId: string, occ: Occurrence[]): void {
  const t = state.market.maTargets.find((x) => x.id === targetId);
  if (!t || t.status !== 'acquired') return;
  const week = state.meta.week;
  const rng: Rng = stream(state.meta.seed, 'ma-integration', week, t.id.length);

  // Kundenbasis als neue Kohorte (echter Churn ggf. schlechter als beworben)
  const churnFlag = t.redFlags.find((f) => f.kind === 'churn-higher');
  const realChurn = churnFlag ? t.claimedMonthlyChurn * (1 + 0.6 * churnFlag.severity) : t.claimedMonthlyChurn;
  const arpa = 380 + Math.round(rng() * 120);
  const logos = t.mrr / arpa;
  state.customers.cohorts.push({
    id: nextId(state, 'coh'),
    segmentId: 'seg_smb',
    startWeek: week,
    logosMonthly: logos * 0.75,
    logosAnnual: logos * 0.25,
    arpaMonthly: arpa,
    baseMonthlyChurn: realChurn,
    monthlyExpansion: 0.004,
  });

  // Team kommt mit (benannte Menschen, gedrückte Stimmung — Übernahme!)
  const loc = locationOf(state);
  const SAL: Record<string, number> = { junior: 3900, mid: 5100, senior: 6600 };
  for (let i = 0; i < t.employees; i++) {
    const { firstName, lastName } = personName(rng);
    const seniority = (['junior', 'mid', 'mid', 'senior'] as const)[intBetween(rng, 0, 3)]!;
    const dept = pick(rng, ['engineering', 'cs', 'sales'] as const);
    state.people.employees.push({
      id: nextId(state, 'emp'),
      firstName, lastName, dept,
      roleTitleDe: ROLE_TITLES[dept]?.[seniority] ?? 'Mitarbeiter:in',
      seniority,
      salaryMonthly: Math.round(SAL[seniority]! * loc.payrollIndex * gaussian(rng, 1, 0.05)),
      performance: Math.round(gaussian(rng, 62, 12)),
      satisfaction: Math.round(gaussian(rng, 45, 8)), // Übernahme-Schock
      attritionRiskWeekly: 0.005,
      keyPerson: false,
      hiredWeek: week,
      rampWeeksRemaining: 4,
      ...personaBits(rng, seniority),
    });
  }

  // Tech-Debt mischt sich ein
  const debtFlag = t.redFlags.find((f) => f.kind === 'tech-debt-worse');
  const targetDebt = t.techDebt + (debtFlag ? 10 * debtFlag.severity : 0);
  state.product.techDebt = clamp((state.product.techDebt * 2 + targetDebt) / 3, 0, 100);

  // Kulturkonflikt: Moral-Dämpfer + Kündigungswelle-Risiko
  for (const e of state.people.employees) e.satisfaction = clamp(e.satisfaction - 3, 0, 100);
  schedule(state, 3, `Integration ${t.name}`, null, { kind: 'ATTRITION_WAVE', dept: 'all', extraQuitProbability: 0.015 }, 'system');

  // Red Flags materialisieren
  const keyFlag = t.redFlags.find((f) => f.kind === 'key-customer-leaving');
  if (keyFlag) {
    schedule(state, 6, `Integration ${t.name}`, null, { kind: 'ADD_MODIFIER', modifier: { target: 'churnMonthly', factor: 1.12, startWeek: week + 6, endWeek: week + 14, sourceDe: `Großkunde von ${t.name} wechselt wie befürchtet` } }, 'system');
  }
  const suitFlag = t.redFlags.find((f) => f.kind === 'pending-lawsuit');
  if (suitFlag) {
    schedule(state, 8, `Integration ${t.name}`, null, { kind: 'DELAYED_SCANDAL', probability: 0.5, fine: 60_000, topicDe: `Altlast-Klage aus der Übernahme von ${t.name}` }, 'system');
  }

  // Synergien: materialisieren sich (nicht) — 60 %.
  if (rng() < 0.6) {
    schedule(state, 8, `Integration ${t.name}`, null, { kind: 'ADD_MODIFIER', modifier: { target: 'leadGen', factor: 1.08, startWeek: week + 8, endWeek: week + 34, sourceDe: `Cross-Selling-Synergien ${t.name}` } }, 'system');
    occ.push({ icon: '🔗', textDe: `Integration ${t.name}: Erste Cross-Selling-Synergien zeichnen sich ab.`, severity: 'good' });
  } else {
    occ.push({ icon: '🧩', textDe: `Integration ${t.name}: Die erhofften Synergien lassen auf sich warten — Integrationen sind Arbeit, keine Folien.`, severity: 'warn' });
  }

  addMessage(state, {
    from: assistantSender(state),
    subjectDe: `Willkommen an Bord: das Team von ${t.name}`,
    bodyDe: `die Übernahme ist vollzogen — ${t.employees} neue Kolleg:innen sind ab heute Teil von ${state.identity.companyName}. Ich habe Onboarding-Termine aufgesetzt. Ehrlicher Hinweis: Die Stimmung drüben ist angespannt (Übernahmen sind das immer). Ein persönliches Wort von dir würde viel bewegen.`,
    kind: 'system',
    eventInstanceId: null,
    delegable: false,
    suggestedActionType: null,
    templateId: 'ma-integration',
    priority: 'hoch',
  });
  occ.push({ icon: '🤝', textDe: `Übernahme vollzogen: ${t.name} (+${Math.round(t.mrr / 1000)} k€ MRR, +${t.employees} Mitarbeitende).`, severity: 'good' });
}

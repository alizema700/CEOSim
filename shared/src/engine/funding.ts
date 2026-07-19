import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { FundingRound, TermSheetOffer } from '../types/funding.js';
import { computeValuation } from './kpis.js';
import { netBurnMonthly, runwayWeeks } from './derive.js';
import { fnv1a, stream } from './rng.js';

/**
 * Fundraising (Phase 5).
 *
 * Term Sheets entstehen deterministisch aus State + Seed + Woche. Zwei
 * Angebote mit echten Trade-offs (Didaktik: Die Bewertung ist nur EINE
 * Stellschraube):
 *  A) Growth-VC: höhere Bewertung — aber participating Preference,
 *     Board-Seat und ESOP-Top-up pre-money.
 *  B) Konservativ: niedrigere Bewertung — saubere 1x non-participating,
 *     kein Board-Seat.
 */

const VC_POOL_A = ['Helvetia Growth Partners', 'Nordwind Ventures', 'Axiom Capital'];
const VC_POOL_B = ['Bodensee Beteiligungen', 'Fabrikstraße Invest', 'Quellental Capital'];

export function generateTermSheets(state: CompanyState): TermSheetOffer[] {
  const week = state.meta.week;
  if (week < 6) return [];
  if (state.meta.status !== 'active') return [];
  const lastRound = state.funding.rounds[state.funding.rounds.length - 1];
  if (lastRound && week - lastRound.week < 26) return []; // max. eine Runde pro ~Halbjahr

  const rng = stream(state.meta.seed, 'termsheets', week);
  const valuation = computeValuation(state).value;
  const burn = Math.max(30_000, netBurnMonthly(state));
  const roundK = (v: number) => Math.round(v / 50_000) * 50_000;

  // Zielsumme: ~18 Monate Burn, gedeckelt relativ zur Bewertung.
  const targetAmount = clamp(roundK(burn * 18), 500_000, Math.max(500_000, roundK(valuation * 0.35)));

  const growthPre = roundK(valuation * (1.05 + rng() * 0.2));
  const conservativePre = roundK(valuation * (0.75 + rng() * 0.15));
  const investorA = VC_POOL_A[Math.floor(rng() * VC_POOL_A.length)]!;
  const investorB = VC_POOL_B[Math.floor(rng() * VC_POOL_B.length)]!;

  const offers: TermSheetOffer[] = [
    {
      id: '',
      investorName: investorA,
      investorStyleDe: 'Growth-VC: renditegetrieben, will Tempo und Kontrolle.',
      amount: targetAmount,
      preMoney: growthPre,
      liquidationPref: '1x-participating',
      boardSeat: true,
      esopTopUp: 0.05,
      validWeek: week,
      noteDe: 'Höhere Bewertung — aber participating Preference (Investor kassiert beim Exit doppelt: erst Einsatz, dann Anteil), Board-Seat mit Vetorechten und 5 % ESOP-Top-up PRE-Money (verwässert nur euch).',
    },
    {
      id: '',
      investorName: investorB,
      investorStyleDe: 'Evergreen-Fonds: geduldig, gründerfreundliche Terms.',
      amount: targetAmount,
      preMoney: conservativePre,
      liquidationPref: '1x',
      boardSeat: false,
      esopTopUp: 0,
      validWeek: week,
      noteDe: 'Niedrigere Bewertung — dafür saubere 1x non-participating Preference, kein Board-Seat, kein ESOP-Top-up. Beim mittelmäßigen Exit oft das BESSERE Angebot.',
    },
  ];
  for (const o of offers) o.id = offerId(o, state.meta.seed);
  return offers;
}

function offerId(o: TermSheetOffer, seed: number): string {
  return 'ts_' + fnv1a([seed, o.investorName, o.amount, o.preMoney, o.liquidationPref, o.boardSeat, o.esopTopUp, o.validWeek].join('|')).toString(36);
}

export function validateTermSheet(state: CompanyState, offer: TermSheetOffer): string[] {
  const errors: string[] = [];
  const current = generateTermSheets(state);
  const match = current.find((o) => o.id === offer.id);
  if (!match) {
    errors.push('Dieses Term Sheet ist nicht (mehr) gültig — Angebote verfallen wöchentlich. Bitte neu laden.');
  }
  return errors;
}

/**
 * Wird vom Wochentick über den EQUITY_INJECTION-Effekt aufgerufen.
 * WICHTIG: Der Cash-Zufluss läuft über ledger.equityRaised (CFF) im Tick —
 * hier wird NUR die Einlage (contributedCapital) gebucht, damit die
 * Bilanz-Identität konstruktionsbedingt hält.
 */
export function applyEquityInjection(state: CompanyState, round: FundingRound, esopTopUp: number): void {
  const f = state.finance;
  f.contributedCapital += round.amount;

  // Cap Table: erst ESOP-Top-up pre-money (verwässert Bestand), dann Investor.
  if (esopTopUp > 0) {
    for (const e of state.capTable) e.share *= 1 - esopTopUp;
    const esop = state.capTable.find((e) => e.kind === 'esop');
    if (esop) esop.share += esopTopUp;
    else state.capTable.push({ id: 'cap_esop2', holder: 'ESOP-Aufstockung', kind: 'esop', share: esopTopUp });
  }
  const investorShare = round.newInvestorShare;
  for (const e of state.capTable) e.share *= 1 - investorShare;
  state.capTable.push({
    id: 'cap_r' + state.funding.rounds.length,
    holder: `${round.investorName} (Runde W${round.week})`,
    kind: 'investor',
    share: investorShare,
  });
  const ceo = state.capTable.find((e) => e.kind === 'ceo');
  state.ceo.equityShare = ceo ? ceo.share : state.ceo.equityShare * (1 - investorShare);

  state.funding.rounds.push(round);
  if (round.boardSeat) state.funding.investorBoardSeat = true;

  state.reputation.investors = clamp(state.reputation.investors + 8, 0, 100);
  state.ceo.boardTrust = clamp(state.ceo.boardTrust + 6, 0, 100);
  state.ceo.trustLog.push({
    week: state.meta.week,
    delta: 6,
    reasonDe: `Finanzierungsrunde geschlossen: ${round.investorName}, ${Math.round(round.amount / 1000)} k€ @ ${(round.preMoney / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} M€ pre-money.`,
  });
}

export function buildRound(state: CompanyState, offer: TermSheetOffer): FundingRound {
  const postMoney = offer.preMoney + offer.amount;
  return {
    week: state.meta.week,
    investorName: offer.investorName,
    amount: offer.amount,
    preMoney: offer.preMoney,
    postMoney,
    newInvestorShare: offer.amount / postMoney,
    liquidationPref: offer.liquidationPref,
    boardSeat: offer.boardSeat,
  };
}

// ── Venture Debt ─────────────────────────────────────────────────────
export function validateVentureDebt(state: CompanyState, amount: number): string[] {
  const errors: string[] = [];
  const arr = computeValuation(state).arr;
  if (state.funding.ventureDebtTaken) errors.push('Venture Debt wurde bereits gezogen — mehr gibt der Markt dieser Firma nicht.');
  if (arr < 1_500_000) errors.push('Venture-Debt-Geber verlangen mind. ~1,5 M€ ARR.');
  if (amount < 100_000) errors.push('Unter 100 k€ lohnt sich die Struktur nicht.');
  if (amount > arr * 0.25) errors.push(`Mehr als 25 % vom ARR (${Math.round((arr * 0.25) / 1000)} k€) finanziert kein Venture-Debt-Fonds.`);
  if (runwayWeeks(state) < 8) errors.push('Bei unter 8 Wochen Runway steigt kein Debt-Fonds mehr ein — das Fenster ist zu.');
  return errors;
}

/** Zieht Venture Debt: teurere Konditionen, sofortige Linie, Cash im Tick. */
export function applyVentureDebtTerms(state: CompanyState, amount: number): void {
  const d = state.finance.debt;
  // Blended Rate: Bestand zu alter Rate, Neuvolumen zu 13 %.
  const newRate = d.principal + amount > 0 ? (d.principal * d.annualRate + amount * 0.13) / (d.principal + amount) : 0.13;
  d.creditLine += amount;
  d.annualRate = Math.round(newRate * 10_000) / 10_000;
  state.funding.ventureDebtTaken = true;
}

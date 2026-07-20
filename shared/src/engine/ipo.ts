import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import { IPO_FLOAT_SHARE, PRE_IPO_SHARES, type IpoBank } from '../types/ipo.js';
import { IPO_PREP_WEEKS, IPO_ROADSHOW_WEEKS } from '../types/actions.js';
import { computeValuation, mrrGrowthMonthly } from './kpis.js';
import { modifierProduct, totalMrr } from './derive.js';
import { stream } from './rng.js';
import { nextId } from './stateHelpers.js';
import { addMessage, assistantSender } from './comms.js';

/**
 * IPO-Engine (Phase 6). Deterministisch: Freischaltung, Bookbuilding,
 * Zeichnungsnachfrage, Kursverlauf und Earnings-Verdikte kommen aus
 * Seed + State. Das LLM spielt nur die Menschen (Roadshow-Q&A, Analysten).
 */

export const IPO_BANKS: IpoBank[] = [
  {
    id: 'bank_gsq',
    name: 'Großbank Quandt & Cie.',
    styleDe: 'Bulge Bracket: maximale Platzierungskraft, internationale Bücher, Prestige.',
    feePct: 0.07,
    demandBoost: 1.12,
    tradeoffDe: '7 % Fee ist happig — dafür füllt sie das Buch auch bei Gegenwind und der Name beruhigt Anleger.',
  },
  {
    id: 'bank_sud',
    name: 'Süddeutsche Industriebank',
    styleDe: 'Solides Mittelstands-Haus: gute Investorenbasis in DACH, faire Konditionen.',
    feePct: 0.05,
    demandBoost: 1.0,
    tradeoffDe: 'Der ausgewogene Standardweg: 5 % Fee, verlässliche, aber nicht spektakuläre Nachfrage.',
  },
  {
    id: 'bank_dix',
    name: 'DirektInvest X',
    styleDe: 'Digitaler Discount-Underwriter: schlanker Prozess, dünnes Platzierungsnetz.',
    feePct: 0.035,
    demandBoost: 0.88,
    tradeoffDe: 'Billig — aber wenn die Nachfrage hakt, rettet dich hier niemand. Für heiße Bücher ok, für wacklige riskant.',
  },
];

export function ipoBank(bankId: string): IpoBank {
  const b = IPO_BANKS.find((x) => x.id === bankId);
  if (!b) throw new Error('Unbekannte Bank.');
  return b;
}

/** Freischalt-Kriterien — bewusst sichtbar/erklärbar (Didaktik). */
export function ipoEligibility(state: CompanyState): { ok: boolean; criteria: { labelDe: string; ok: boolean }[] } {
  const arr = totalMrr(state) * 12;
  const growth = mrrGrowthMonthly(state);
  const criteria = [
    { labelDe: `ARR ≥ 2,5 M€ (aktuell ${(arr / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} M€)`, ok: arr >= 2_500_000 },
    { labelDe: `MRR-Wachstum ≥ 0,8 %/Monat (aktuell ${(growth * 100).toFixed(1)} %)`, ok: growth >= 0.008 },
    { labelDe: `Board-Vertrauen ≥ 55 (aktuell ${Math.round(state.ceo.boardTrust)})`, ok: state.ceo.boardTrust >= 55 },
    { labelDe: `Mindestens 30 Wochen Historie (aktuell ${state.meta.week})`, ok: state.meta.week >= 30 },
    { labelDe: 'Keine laufende Covenant-Verletzung', ok: state.finance.consecutiveMinCashBreachWeeks === 0 },
  ];
  return { ok: criteria.every((c) => c.ok), criteria };
}

/** Wöchentlicher IPO-Tick: Freischaltung, Prep→Roadshow, Kurs, Earnings. */
export function tickIpo(state: CompanyState, occ: Occurrence[]): void {
  const ipo = state.ipo;
  const week = state.meta.week;

  // ── Freischaltung ──────────────────────────────────────────────────
  if (ipo.status === 'locked' || ipo.status === 'withdrawn') {
    if (ipoEligibility(state).ok) {
      ipo.status = 'eligible';
      ipo.eligibleSinceWeek = week;
      occ.push({ icon: '🔔', textDe: 'Die Firma ist IPO-reif: Investmentbanken haben sich gemeldet (Tab „Börse").', severity: 'good' });
      addMessage(state, {
        from: assistantSender(state),
        subjectDe: 'Drei Banken wollen euch an die Börse bringen',
        bodyDe: `es ist offiziell: Mit den aktuellen Zahlen seid ihr ein IPO-Kandidat. Drei Institute haben Pitch-Unterlagen geschickt — Details im Börse-Tab. Ehrlicher Hinweis: Ein Börsengang ist kein Pokal, sondern ein Betriebssystemwechsel (Quartalsdruck, Ad-hoc-Pflichten, Analysten). Er will gewollt sein.`,
        kind: 'system',
        eventInstanceId: null,
        delegable: false,
        suggestedActionType: null,
        templateId: 'ipo-eligible',
        priority: 'hoch',
      });
    }
    return;
  }

  // ── Vorbereitung → Roadshow ────────────────────────────────────────
  if (ipo.status === 'preparing' && ipo.preparationStartWeek !== null) {
    if (week - ipo.preparationStartWeek >= IPO_PREP_WEEKS) {
      const bank = ipoBank(ipo.bankId!);
      const fairPerShare = computeValuation(state).value / PRE_IPO_SHARES;
      const rng = stream(state.meta.seed, 'ipo-book', week);
      const mid = fairPerShare * bank.demandBoost * (0.95 + rng() * 0.1);
      ipo.bookLow = Math.round(mid * 0.9 * 100) / 100;
      ipo.bookHigh = Math.round(mid * 1.1 * 100) / 100;
      ipo.roadshowEndsWeek = week + IPO_ROADSHOW_WEEKS;
      ipo.status = 'roadshow';
      occ.push({ icon: '✈️', textDe: `Roadshow gestartet: Bookbuilding-Spanne ${ipo.bookLow.toFixed(2)}–${ipo.bookHigh.toFixed(2)} € je Aktie. Pricing bis Woche ${ipo.roadshowEndsWeek}.`, severity: 'info' });
      addMessage(state, {
        from: { name: bank.name, roleDe: 'Equity Capital Markets', refId: null, company: bank.name },
        subjectDe: `Roadshow läuft — Spanne ${ipo.bookLow.toFixed(2)}–${ipo.bookHigh.toFixed(2)} €`,
        bodyDe: `der Prospekt ist gebilligt, die Roadshow läuft. Erste Rückmeldungen aus den 1:1s sind im Börse-Tab. Sie können jederzeit im Roadshow-Chat mit Investoren sprechen — und müssen bis Woche ${ipo.roadshowEndsWeek} preisen. Unsere Empfehlung folgt, aber die Entscheidung liegt bei Ihnen: Zu hoch gepreist bricht die Erstnotiz ein, zu niedrig lassen Sie Geld auf dem Tisch.`,
        kind: 'external',
        eventInstanceId: null,
        delegable: false,
        suggestedActionType: null,
        templateId: 'ipo-roadshow',
        priority: 'hoch',
      });
    }
    return;
  }

  // ── Roadshow-Frist verpasst ⇒ IPO verschoben ───────────────────────
  if (ipo.status === 'roadshow' && ipo.roadshowEndsWeek !== null && week > ipo.roadshowEndsWeek) {
    ipo.status = 'withdrawn';
    ipo.bankId = null;
    ipo.bookLow = null;
    ipo.bookHigh = null;
    ipo.roadshowEndsWeek = null;
    ipo.preparationStartWeek = null;
    state.ceo.boardTrust = clamp(state.ceo.boardTrust - 5, 0, 100);
    state.ceo.trustLog.push({ week, delta: -5, reasonDe: 'IPO verschoben: Die Roadshow lief aus, ohne dass gepreist wurde.' });
    state.reputation.investors = clamp(state.reputation.investors - 6, 0, 100);
    state.pressLog.push({ week, tone: 'negative', topicDe: `${state.identity.companyName} verschiebt Börsengang „wegen Marktbedingungen"` });
    occ.push({ icon: '🛑', textDe: 'IPO verschoben — kein Pricing innerhalb des Fensters. Das kostet Glaubwürdigkeit (und die Prospektkosten sind weg).', severity: 'bad' });
    return;
  }

  // ── Börsennotiert: Kurs & Earnings ─────────────────────────────────
  if (ipo.status === 'public' && ipo.sharePrice !== null) {
    const fair = computeValuation(state).value / ipo.sharesOutstanding;
    const rng = stream(state.meta.seed, 'share-price', week);
    const noise = 1 + (rng() - 0.5) * 0.05 * modifierProduct(state, 'demandIndex');
    let price = (ipo.sharePrice + (fair - ipo.sharePrice) * 0.15) * noise;

    // Earnings-Call fällig?
    if (ipo.nextEarningsWeek !== null && week >= ipo.nextEarningsWeek) {
      const actual = mrrGrowthMonthly(state);
      const expected = ipo.guidanceGrowthMonthly ?? 0.008;
      const diff = actual - expected;
      const verdict: 'beat' | 'met' | 'missed' = diff >= 0.004 ? 'beat' : diff >= -0.003 ? 'met' : 'missed';
      const reaction = verdict === 'beat' ? 0.06 + rng() * 0.04 : verdict === 'met' ? 0.005 : -(0.08 + rng() * 0.06);
      price *= 1 + reaction;
      ipo.earningsHistory.push({ week, verdict, growthActual: actual, growthExpected: expected, priceReaction: reaction });
      ipo.guidanceGrowthMonthly = clamp(actual, 0.002, 0.03);
      ipo.nextEarningsWeek = week + 13;

      const vDe = verdict === 'beat' ? 'Erwartungen ÜBERTROFFEN' : verdict === 'met' ? 'Erwartungen getroffen' : 'Erwartungen VERFEHLT';
      state.ceo.boardTrust = clamp(state.ceo.boardTrust + (verdict === 'beat' ? 2 : verdict === 'missed' ? -3 : 0.5), 0, 100);
      state.pressLog.push({ week, tone: verdict === 'missed' ? 'negative' : verdict === 'beat' ? 'positive' : 'neutral', topicDe: `Quartalszahlen: ${state.identity.companyName} — ${vDe} (Kurs ${reaction >= 0 ? '+' : ''}${(reaction * 100).toFixed(0)} %)` });
      occ.push({
        icon: verdict === 'missed' ? '📉' : '📈',
        textDe: `Earnings-Call: ${vDe} (Wachstum ${(actual * 100).toFixed(1)} % vs. Guidance ${(expected * 100).toFixed(1)} %/M) — Kurs ${reaction >= 0 ? '+' : ''}${(reaction * 100).toFixed(0)} %. Neue Guidance: ${(ipo.guidanceGrowthMonthly * 100).toFixed(1)} %/M.`,
        severity: verdict === 'missed' ? 'bad' : verdict === 'beat' ? 'good' : 'info',
      });
      addMessage(state, {
        from: { name: 'Investor Relations', roleDe: 'IR-Desk', refId: null, company: null },
        subjectDe: `Earnings-Call W${week}: ${vDe}`,
        bodyDe: `der Call ist durch. Wachstum ${(actual * 100).toFixed(1)} %/M gegen ${(expected * 100).toFixed(1)} % Guidance ⇒ ${vDe}. Kursreaktion ${reaction >= 0 ? '+' : ''}${(reaction * 100).toFixed(1)} %. ${verdict === 'missed' ? 'Zwei verfehlte Quartale in Folge und die Analysten drehen die Story — wir brauchen einen Plan, KEINE Beschönigung.' : verdict === 'beat' ? 'Wichtig: Guidance steigt automatisch mit — der Markt gewöhnt sich an Erfolge schneller, als er verzeiht.' : 'Solide. Langweilig ist an der Börse ein Kompliment.'} Transkript-Fragen kannst du im Termin nachspielen (Kalender).`,
        kind: 'system',
        eventInstanceId: null,
        delegable: false,
        suggestedActionType: null,
        templateId: 'earnings-' + week,
        priority: 'hoch',
      });
      // Nächster Termin in den Kalender
      state.calendar.appointments.push({
        id: nextId(state, 'apt'),
        week: ipo.nextEarningsWeek,
        weekday: 3,
        titleDe: `Earnings-Call Q${ipo.earningsHistory.length + 1} (börsennotiert)`,
        kind: 'earningsCall',
        agendaDe: [`Guidance: ${(ipo.guidanceGrowthMonthly * 100).toFixed(1)} %/M MRR-Wachstum`, 'Analysten-Q&A (Kurs reagiert auf Zahlen, nicht auf Rhetorik)'],
        participants: ['Analysten-Konsortium', 'Investor Relations'],
        linkedEntityId: null,
      });
    }

    ipo.sharePrice = Math.max(0.2, Math.round(price * 100) / 100);
    ipo.priceHistory.push({ week, price: ipo.sharePrice });
    if (ipo.priceHistory.length > 260) ipo.priceHistory.shift();
  }
}

/**
 * Listing vollziehen (IPO_LISTING-Effekt im Tick): neue Aktien, Bruttoerlös
 * über ledger.equityRaised (vom Aufrufer), Fees separat als Einmalaufwand.
 */
export function applyIpoListing(
  state: CompanyState,
  pricePerShare: number,
  subscriptionRatio: number,
  occ: Occurrence[],
): { grossProceeds: number; fees: number } {
  const ipo = state.ipo;
  const bank = ipoBank(ipo.bankId!);
  const week = state.meta.week;

  const newShares = Math.round((PRE_IPO_SHARES * IPO_FLOAT_SHARE) / (1 - IPO_FLOAT_SHARE));
  const grossProceeds = newShares * pricePerShare;
  const fees = Math.round(grossProceeds * bank.feePct);

  ipo.newSharesIssued = newShares;
  ipo.sharesOutstanding = PRE_IPO_SHARES + newShares;
  ipo.offerPrice = pricePerShare;
  ipo.subscriptionRatio = subscriptionRatio;
  ipo.listedWeek = week;
  ipo.status = 'public';
  ipo.nextEarningsWeek = week + 13;
  ipo.guidanceGrowthMonthly = clamp(mrrGrowthMonthly(state), 0.004, 0.025);

  // Erstnotiz: Überzeichnung ⇒ Pop (Geld auf dem Tisch), Unterzeichnung ⇒ Absacker.
  const rng = stream(state.meta.seed, 'ipo-pop', week);
  const pop = clamp(0.85 + (subscriptionRatio - 1) * 0.35 + rng() * 0.1, 0.75, 1.45);
  ipo.sharePrice = Math.round(pricePerShare * pop * 100) / 100;
  ipo.priceHistory.push({ week, price: ipo.sharePrice });

  // Cap Table: Altbestand skaliert, Streubesitz kommt dazu.
  const floatShare = newShares / ipo.sharesOutstanding;
  for (const e of state.capTable) e.share *= 1 - floatShare;
  state.capTable.push({ id: 'cap_public', holder: 'Streubesitz (Börse)', kind: 'public', share: floatShare });
  const ceo = state.capTable.find((e) => e.kind === 'ceo');
  if (ceo) state.ceo.equityShare = ceo.share;

  state.funding.rounds.push({
    week,
    investorName: `Börsengang (${bank.name})`,
    amount: grossProceeds,
    preMoney: PRE_IPO_SHARES * pricePerShare,
    postMoney: ipo.sharesOutstanding * pricePerShare,
    newInvestorShare: floatShare,
    liquidationPref: 'keine (Publikum)',
    boardSeat: false,
  });

  state.reputation.press = clamp(state.reputation.press + 6, 0, 100);
  state.reputation.investors = clamp(state.reputation.investors + 8, 0, 100);
  state.ceo.boardTrust = clamp(state.ceo.boardTrust + 5, 0, 100);
  state.ceo.trustLog.push({ week, delta: 5, reasonDe: `Börsengang vollzogen: ${(grossProceeds / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} M€ brutto @ ${pricePerShare.toFixed(2)} €/Aktie.` });
  state.pressLog.push({ week, tone: 'positive', topicDe: `${state.identity.companyName} feiert Börsendebüt — Erstnotiz ${ipo.sharePrice.toFixed(2)} € (${pop >= 1 ? '+' : ''}${((pop - 1) * 100).toFixed(0)} % zum Ausgabepreis)` });
  occ.push({
    icon: '🔔',
    textDe: `BÖRSENGANG: ${(grossProceeds / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} M€ brutto (Fee ${(bank.feePct * 100).toFixed(1)} %), Erstnotiz ${ipo.sharePrice.toFixed(2)} € (${pop >= 1 ? '+' : ''}${((pop - 1) * 100).toFixed(0)} %). ${pop > 1.2 ? 'Kräftiger Pop — schön für die Zeichner, aber das war DEIN Geld auf dem Tisch.' : pop < 0.95 ? 'Erstnotiz unter Ausgabepreis — zu ambitioniert gepreist.' : 'Sauberes Debüt.'}`,
    severity: pop < 0.95 ? 'warn' : 'good',
  });
  addMessage(state, {
    from: assistantSender(state),
    subjectDe: '🔔 Ihr seid börsennotiert — was sich ab heute ändert',
    bodyDe: `Glückwunsch zum Debüt! Und jetzt der unbequeme Teil, damit du ihn von mir hörst statt von der BaFin: Ab sofort gelten Quartals-Earnings-Calls gegen Guidance (erster Termin steht im Kalender), Ad-hoc-Publizitätspflicht bei kursrelevanten Ereignissen und ein Kurs, der jede Woche über deinen Kopf abstimmt. Der Streubesitz hält ${(floatShare * 100).toFixed(1)} %. Cash aus dem IPO ist verbucht — verbrenn es nicht für Symbolprojekte.`,
    kind: 'briefing',
    eventInstanceId: null,
    delegable: false,
    suggestedActionType: null,
    templateId: 'ipo-listed',
    priority: 'hoch',
  });
  // Erster Earnings-Call in den Kalender
  state.calendar.appointments.push({
    id: nextId(state, 'apt'),
    week: ipo.nextEarningsWeek,
    weekday: 3,
    titleDe: 'Earnings-Call Q1 (börsennotiert)',
    kind: 'earningsCall',
    agendaDe: [`Guidance: ${(ipo.guidanceGrowthMonthly * 100).toFixed(1)} %/M MRR-Wachstum`, 'Analysten-Q&A'],
    participants: ['Analysten-Konsortium', 'Investor Relations'],
    linkedEntityId: null,
  });

  return { grossProceeds, fees };
}

/** Zeichnungsnachfrage beim Pricing — deterministisch, didaktisch erklärbar. */
export function subscriptionRatioFor(state: CompanyState, pricePerShare: number): number {
  const ipo = state.ipo;
  const bank = ipoBank(ipo.bankId!);
  const mid = ((ipo.bookLow ?? 1) + (ipo.bookHigh ?? 1)) / 2;
  const priceFactor = Math.pow(mid / pricePerShare, 1.6); // teurer ⇒ weniger Nachfrage
  const repFactor = 0.75 + 0.5 * (state.reputation.investors / 100);
  const demand = modifierProduct(state, 'demandIndex') * state.market.demandIndex;
  const rng = stream(state.meta.seed, 'ipo-demand', state.meta.week);
  return Math.round(bank.demandBoost * priceFactor * repFactor * demand * (0.9 + rng() * 0.2) * 100) / 100;
}

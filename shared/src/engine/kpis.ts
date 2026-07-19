import type { CompanyState } from '../types/company.js';
import type { KpiDefinition, KpiId, KpiSnapshot, ValuationBreakdown } from '../types/kpi.js';
import {
  avgArpa,
  avgSatisfaction,
  effectiveMonthlyChurn,
  avgExpansionMonthly,
  ebitdaMonthly,
  headcount,
  keyAccountMrr,
  netBurnMonthly,
  runwayWeeks,
  smSpendMonthly,
  totalLogos,
  totalMrr,
  weekToDateISO,
} from './derive.js';

/**
 * Abgeleitete Kennzahlen: immer berechnet, nie Wahrheit im State.
 * Jede Kennzahl trägt Formel + Definition für die UI-Tooltips.
 */

export const KPI_DEFINITIONS: Record<KpiId, KpiDefinition> = {
  mrr: {
    id: 'mrr', labelDe: 'MRR', labelEn: 'MRR', unit: 'eurPerMonth',
    formulaDe: 'MRR = Σ (Kunden × ARPA) über alle Kohorten + Key-Accounts',
    definitionDe: 'Monatlich wiederkehrender Umsatz. Die zentrale Wachstumsgröße eines SaaS-Unternehmens.',
  },
  arr: {
    id: 'arr', labelDe: 'ARR', labelEn: 'ARR', unit: 'eur',
    formulaDe: 'ARR = MRR × 12',
    definitionDe: 'Annualisierter wiederkehrender Umsatz. Basis für Bewertungs-Multiples.',
  },
  mrrGrowthMonthly: {
    id: 'mrrGrowthMonthly', labelDe: 'MRR-Wachstum (mtl.)', labelEn: 'MRR growth (m/m)', unit: 'pct',
    formulaDe: 'g = (MRR_heute ÷ MRR_vor_4_Wochen)^(1 Monat/4 Wochen) − 1',
    definitionDe: 'Monatliche Wachstumsrate des MRR, annualisierbar zu (1+g)^12−1.',
    goodWhen: { comparator: 'gte', value: 0.01 },
    badWhen: { comparator: 'lte', value: -0.005 },
  },
  grossMarginPct: {
    id: 'grossMarginPct', labelDe: 'Bruttomarge', labelEn: 'Gross margin', unit: 'pct',
    formulaDe: 'Bruttomarge = (Umsatz − COGS) ÷ Umsatz',
    definitionDe: 'Anteil des Umsatzes nach direkten Leistungskosten (Hosting, Support-Infrastruktur).',
    goodWhen: { comparator: 'gte', value: 0.75 },
  },
  ebitdaMonthly: {
    id: 'ebitdaMonthly', labelDe: 'EBITDA (mtl.)', labelEn: 'EBITDA (monthly)', unit: 'eurPerMonth',
    formulaDe: 'EBITDA = Umsatz − COGS − OpEx (vor Zinsen, Steuern, Abschreibungen)',
    definitionDe: 'Operatives Ergebnis. Zeigt, ob das Kerngeschäft Geld verdient oder verbrennt.',
  },
  ebitdaMarginPct: {
    id: 'ebitdaMarginPct', labelDe: 'EBITDA-Marge', labelEn: 'EBITDA margin', unit: 'pct',
    formulaDe: 'Marge = EBITDA ÷ Umsatz',
    definitionDe: 'EBITDA relativ zum Umsatz — Profitabilitätsmaß unabhängig von der Unternehmensgröße.',
  },
  netBurnMonthly: {
    id: 'netBurnMonthly', labelDe: 'Netto-Burn (mtl.)', labelEn: 'Net burn (monthly)', unit: 'eurPerMonth',
    formulaDe: 'Burn = −(EBITDA − Zinsen). Positiv = Kasse schrumpft.',
    definitionDe: 'Monatlicher Netto-Geldabfluss aus dem laufenden Geschäft.',
    badWhen: { comparator: 'gte', value: 100_000 },
  },
  runwayWeeks: {
    id: 'runwayWeeks', labelDe: 'Runway', labelEn: 'Runway', unit: 'weeks',
    formulaDe: 'Runway = Cash ÷ (Netto-Burn ÷ 4,35 Wochen)',
    definitionDe: 'Wochen bis zur Zahlungsunfähigkeit bei unverändertem Burn. Unter 26 Wochen wird das Board nervös, unter 13 ist es eine Krise.',
    goodWhen: { comparator: 'gte', value: 52 },
    badWhen: { comparator: 'lte', value: 26 },
  },
  customers: {
    id: 'customers', labelDe: 'Kunden', labelEn: 'Customers', unit: 'count',
    formulaDe: 'Kunden = Σ Logos aller Kohorten + aktive Key-Accounts',
    definitionDe: 'Anzahl zahlender Kunden (Logos).',
  },
  arpa: {
    id: 'arpa', labelDe: 'ARPA', labelEn: 'ARPA', unit: 'eurPerMonth',
    formulaDe: 'ARPA = MRR ÷ Kundenanzahl',
    definitionDe: 'Durchschnittlicher Monatsumsatz pro Kunde (Average Revenue per Account).',
  },
  logoChurnMonthly: {
    id: 'logoChurnMonthly', labelDe: 'Logo-Churn (mtl.)', labelEn: 'Logo churn (monthly)', unit: 'pct',
    formulaDe: 'Churn = kundengewichteter Ø der Kohorten-Churnraten × aktive Modifikatoren',
    definitionDe: 'Anteil der Kunden, der pro Monat kündigt. Der stille Killer jedes SaaS-Geschäfts.',
    goodWhen: { comparator: 'lte', value: 0.02 },
    badWhen: { comparator: 'gte', value: 0.035 },
  },
  nrr: {
    id: 'nrr', labelDe: 'NRR', labelEn: 'NRR', unit: 'pct',
    formulaDe: 'NRR ≈ (1 − Churn + Expansion)^12 (annualisiert aus aktuellen Monatsraten)',
    definitionDe: 'Net Revenue Retention: Umsatzentwicklung des Bestands inkl. Upgrades. >100 % heißt: Wachstum sogar ohne Neukunden.',
    goodWhen: { comparator: 'gte', value: 1.0 },
    badWhen: { comparator: 'lte', value: 0.85 },
  },
  grr: {
    id: 'grr', labelDe: 'GRR', labelEn: 'GRR', unit: 'pct',
    formulaDe: 'GRR ≈ (1 − Churn)^12 (annualisiert, ohne Expansion)',
    definitionDe: 'Gross Revenue Retention: was vom Bestandsumsatz nach 12 Monaten übrig bleibt, Upgrades nicht mitgezählt.',
    goodWhen: { comparator: 'gte', value: 0.9 },
  },
  ltv: {
    id: 'ltv', labelDe: 'LTV', labelEn: 'LTV', unit: 'eur',
    formulaDe: 'LTV = ARPA × Bruttomarge ÷ Monats-Churn',
    definitionDe: 'Erwarteter Deckungsbeitrag über die gesamte Kundenlebenszeit.',
  },
  cac: {
    id: 'cac', labelDe: 'CAC', labelEn: 'CAC', unit: 'eur',
    formulaDe: 'CAC = S&M-Ausgaben (letzte 13 Wochen) ÷ Neukunden (letzte 13 Wochen)',
    definitionDe: 'Kosten, einen Neukunden zu gewinnen (Sales- und Marketing-Vollkosten).',
  },
  ltvCacRatio: {
    id: 'ltvCacRatio', labelDe: 'LTV/CAC', labelEn: 'LTV/CAC', unit: 'ratio',
    formulaDe: 'LTV ÷ CAC',
    definitionDe: 'Wertschöpfung pro Akquise-Euro. Faustregel: > 3 gesund, < 1 wertvernichtend.',
    goodWhen: { comparator: 'gte', value: 3 },
    badWhen: { comparator: 'lte', value: 1 },
  },
  cacPaybackMonths: {
    id: 'cacPaybackMonths', labelDe: 'CAC-Payback', labelEn: 'CAC payback', unit: 'months',
    formulaDe: 'Payback = CAC ÷ (ARPA × Bruttomarge)',
    definitionDe: 'Monate, bis ein Neukunde seine Akquisekosten verdient hat. < 12 gut, > 24 kritisch.',
    goodWhen: { comparator: 'lte', value: 12 },
    badWhen: { comparator: 'gte', value: 24 },
  },
  ruleOf40: {
    id: 'ruleOf40', labelDe: 'Rule of 40', labelEn: 'Rule of 40', unit: 'pct',
    formulaDe: 'Rule of 40 = MRR-Wachstum p. a. + EBITDA-Marge',
    definitionDe: 'Wachstum und Profitabilität zusammen sollten 40 % erreichen — der Standard-Gesundheitscheck für SaaS.',
    goodWhen: { comparator: 'gte', value: 0.4 },
  },
  magicNumber: {
    id: 'magicNumber', labelDe: 'Magic Number', labelEn: 'Magic number', unit: 'ratio',
    formulaDe: 'Magic Number = Netto-Neu-ARR (13 W, annualisiert) ÷ S&M-Ausgaben (13 W)',
    definitionDe: 'Vertriebseffizienz: > 0,75 heißt, mehr Vertriebsinvestition lohnt sich; < 0,5 heißt, erst Effizienz fixen.',
    goodWhen: { comparator: 'gte', value: 0.75 },
  },
  dsoDays: {
    id: 'dsoDays', labelDe: 'DSO', labelEn: 'DSO', unit: 'days',
    formulaDe: 'DSO = Ø Tage von Rechnung bis Zahlungseingang',
    definitionDe: 'Days Sales Outstanding: wie lange Kunden zum Zahlen brauchen. Jeder Tag bindet Liquidität.',
    badWhen: { comparator: 'gte', value: 55 },
  },
  dpoDays: {
    id: 'dpoDays', labelDe: 'DPO', labelEn: 'DPO', unit: 'days',
    formulaDe: 'DPO = Ø Tage bis zur Bezahlung eigener Lieferanten',
    definitionDe: 'Days Payables Outstanding: wie lange du selbst zum Zahlen brauchst — verlängert die eigene Liquidität.',
  },
  cccDays: {
    id: 'cccDays', labelDe: 'Cash Conversion Cycle', labelEn: 'Cash conversion cycle', unit: 'days',
    formulaDe: 'CCC = DSO − DPO (SaaS ohne Lagerbestand)',
    definitionDe: 'Tage, die Kapital im Umlaufvermögen gebunden ist. Negativ = Kunden finanzieren dein Geschäft.',
  },
  workingCapital: {
    id: 'workingCapital', labelDe: 'Working Capital', labelEn: 'Working capital', unit: 'eur',
    formulaDe: 'WC = (Cash + Forderungen) − (Verbindlichkeiten + Deferred Revenue)',
    definitionDe: 'Kurzfristiges Nettoumlaufvermögen — Puffer für den laufenden Betrieb.',
  },
  revenueConcentrationHhi: {
    id: 'revenueConcentrationHhi', labelDe: 'Umsatz-Konzentration (HHI)', labelEn: 'Revenue concentration (HHI)', unit: 'index',
    formulaDe: 'HHI = Σ (Umsatzanteil_Kunde²) × 10 000',
    definitionDe: 'Herfindahl-Index der Kundenumsätze. Hohe Werte = Klumpenrisiko: Ein Kündiger reißt ein Loch.',
    badWhen: { comparator: 'gte', value: 400 },
  },
  valuation: {
    id: 'valuation', labelDe: 'Bewertung', labelEn: 'Valuation', unit: 'eur',
    formulaDe: 'Bewertung = ARR × Multiple(Wachstum, NRR, Churn, Marge)',
    definitionDe: 'Indikative Unternehmensbewertung auf Multiple-Basis — was ein Käufer heute ungefähr zahlen würde.',
  },
  headcount: {
    id: 'headcount', labelDe: 'Mitarbeiter', labelEn: 'Headcount', unit: 'count',
    formulaDe: 'Headcount = Anzahl aktiver Beschäftigter (ohne CEO)',
    definitionDe: 'Aktive Mitarbeiterzahl.',
  },
  marketSharePct: {
    id: 'marketSharePct', labelDe: 'Marktanteil', labelEn: 'Market share', unit: 'pct',
    formulaDe: 'Marktanteil = eigenes MRR ÷ adressierbares Markt-MRR',
    definitionDe: 'Eigener Anteil am adressierbaren Markt (TAM auf MRR-Basis).',
  },
  productNps: {
    id: 'productNps', labelDe: 'Produkt-NPS', labelEn: 'Product NPS', unit: 'score',
    formulaDe: 'NPS = % Promotoren − % Detraktoren (−100 … +100)',
    definitionDe: 'Weiterempfehlungsbereitschaft der Nutzer. Treibt Win-Rate und Churn.',
    goodWhen: { comparator: 'gte', value: 30 },
    badWhen: { comparator: 'lte', value: 0 },
  },
  avgSatisfaction: {
    id: 'avgSatisfaction', labelDe: 'Team-Zufriedenheit', labelEn: 'Team satisfaction', unit: 'score',
    formulaDe: 'Ø Zufriedenheit aller Mitarbeiter (0–100)',
    definitionDe: 'Stimmung im Team. Treibt Kündigungen, Velocity und Arbeitgeber-Reputation.',
    goodWhen: { comparator: 'gte', value: 65 },
    badWhen: { comparator: 'lte', value: 45 },
  },
  boardTrust: {
    id: 'boardTrust', labelDe: 'Board-Vertrauen', labelEn: 'Board trust', unit: 'score',
    formulaDe: 'Vertrauen 0–100; jede Änderung wird mit Begründung protokolliert',
    definitionDe: 'Unter 40: Abmahnung und Bewährung. Unter 20: Misstrauensvotum — Abwahl.',
    goodWhen: { comparator: 'gte', value: 60 },
    badWhen: { comparator: 'lte', value: 40 },
  },
};

/** Trailing-Fenster-Summe der letzten n Einträge. */
function tail(arr: number[], n: number): number[] {
  return arr.slice(Math.max(0, arr.length - n));
}
function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

export function computeValuation(state: CompanyState): ValuationBreakdown {
  const arr = totalMrr(state) * 12;
  const growthM = mrrGrowthMonthly(state);
  const churn = effectiveMonthlyChurn(state);
  const nrr = Math.pow(1 - churn + avgExpansionMonthly(state), 12);
  const ebitdaMargin = totalMrr(state) > 0 ? ebitdaMonthly(state) / totalMrr(state) : -1;

  const drivers: string[] = [];
  let multiple = 3.0;
  const growthBoost = Math.max(-1.5, Math.min(6, growthM * 12 * 25));
  multiple += growthBoost;
  drivers.push(`Wachstum ${(growthM * 12 * 100).toFixed(0)} % p. a. ⇒ ${growthBoost >= 0 ? '+' : ''}${growthBoost.toFixed(1)}×`);
  const nrrBoost = Math.max(-2, Math.min(2, (nrr - 1) * 8));
  multiple += nrrBoost;
  drivers.push(`NRR ${(nrr * 100).toFixed(0)} % ⇒ ${nrrBoost >= 0 ? '+' : ''}${nrrBoost.toFixed(1)}×`);
  if (churn > 0.03) {
    multiple -= 1.0;
    drivers.push(`Churn ${(churn * 100).toFixed(1)} %/M über 3 % ⇒ −1,0×`);
  }
  if (ebitdaMargin > 0) {
    multiple += 0.8;
    drivers.push('Profitabel ⇒ +0,8×');
  }
  multiple = Math.max(0.8, Math.min(15, multiple));
  return { arr, multiple, driversDe: drivers, value: arr * multiple };
}

export function mrrGrowthMonthly(state: CompanyState): number {
  const h = state.history;
  if (h.length < 5) return 0;
  const nowSnap = h[h.length - 1];
  const pastSnap = h[h.length - 5];
  const now = nowSnap?.values.mrr ?? 0;
  const past = pastSnap?.values.mrr ?? 0;
  if (past <= 0) return 0;
  return Math.pow(now / past, 30.44 / 28) - 1;
}

/** Alle KPIs als Snapshot berechnen (wird wöchentlich in die History gelegt). */
export function computeKpis(state: CompanyState): KpiSnapshot {
  const mrr = totalMrr(state);
  const churn = effectiveMonthlyChurn(state);
  const expansion = avgExpansionMonthly(state);
  const gm = 1 - state.finance.cogsRate;
  const arpa = avgArpa(state);
  const growthM = mrrGrowthMonthly(state);
  const ebitdaM = ebitdaMonthly(state);

  const p = state.customers.pipeline;
  const newLogos13w = sum(tail(p.recentNewLogos, 13));
  const smSpend13w = sum(tail(p.recentSmSpend, 13));
  const cac = newLogos13w > 0.5 ? smSpend13w / newLogos13w : 0;
  const ltv = churn > 0.0005 ? (arpa * gm) / churn : arpa * gm * 120;

  // Magic Number: Netto-Neu-MRR der letzten 13 Wochen aus der History.
  const h = state.history;
  const mrr13wAgo = h.length >= 13 ? (h[h.length - 13]?.values.mrr ?? mrr) : (h[0]?.values.mrr ?? mrr);
  const netNewArrAnnualized = (mrr - mrr13wAgo) * 4 * 12;
  const magicNumber = smSpend13w > 0 ? netNewArrAnnualized / (smSpend13w * 4) : 0;

  const totalRevenueMrr = mrr;
  const hhi =
    totalRevenueMrr > 0
      ? state.customers.keyAccounts
          .filter((k) => k.status !== 'churned')
          .reduce((s, k) => s + Math.pow(k.mrr / totalRevenueMrr, 2), 0) * 10_000
      : 0;

  const f = state.finance;
  const values: Record<KpiId, number> = {
    mrr,
    arr: mrr * 12,
    mrrGrowthMonthly: growthM,
    grossMarginPct: gm,
    ebitdaMonthly: ebitdaM,
    ebitdaMarginPct: mrr > 0 ? ebitdaM / mrr : 0,
    netBurnMonthly: netBurnMonthly(state),
    runwayWeeks: runwayWeeks(state),
    customers: totalLogos(state),
    arpa,
    logoChurnMonthly: churn,
    nrr: Math.pow(1 - churn + expansion, 12),
    grr: Math.pow(1 - churn, 12),
    ltv,
    cac,
    ltvCacRatio: cac > 0 ? ltv / cac : 0,
    cacPaybackMonths: arpa * gm > 0 && cac > 0 ? cac / (arpa * gm) : 0,
    ruleOf40: (Math.pow(1 + growthM, 12) - 1) + (mrr > 0 ? ebitdaM / mrr : 0),
    magicNumber,
    dsoDays: f.dsoDays,
    dpoDays: f.dpoDays,
    cccDays: f.dsoDays - f.dpoDays,
    workingCapital: f.cash + f.accountsReceivable - f.accountsPayable - f.deferredRevenue,
    revenueConcentrationHhi: hhi,
    valuation: computeValuation(state).value,
    headcount: headcount(state),
    marketSharePct: state.market.tamMrr > 0 ? mrr / state.market.tamMrr : 0,
    productNps: state.product.nps,
    avgSatisfaction: avgSatisfaction(state),
    boardTrust: state.ceo.boardTrust,
  };

  return {
    week: state.meta.week,
    dateISO: weekToDateISO(state.meta.startDateISO, state.meta.week),
    values,
  };
}

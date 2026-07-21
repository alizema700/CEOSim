import { CONSULTANT_FEE, IPO_PREP_COST, IPO_PREP_WEEKS, MA_DD_FEE, type ActionValidation, type PlayerAction } from '../types/actions.js';
import type { CompanyState } from '../types/company.js';
import type { DecisionRecord, Hypothesis } from '../types/evaluation.js';
import type { EffectPayload } from '../types/effects.js';
import { totalMrr, runwayWeeks } from './derive.js';
import { computeKpis } from './kpis.js';
import { deptDe, nextId, schedule as scheduleFx } from './stateHelpers.js';
import { resolveEventOption } from './eventsDeck.js';
import { executeDelegation } from './comms.js';
import { clampClassification, startProject } from './projects.js';
import { stream } from './rng.js';
import { buildRound, generateTermSheets, validateTermSheet, validateVentureDebt, applyVentureDebtTerms } from './funding.js';
import { maTarget } from './ma.js';
import { IPO_BANKS, ipoBank, ipoEligibility, subscriptionRatioFor } from './ipo.js';
import { applyTarifBinding, applyTarifOffer } from './labor.js';
import type { Occurrence } from '../types/game.js';
import { FORMWECHSEL_FEE_AG, FORMWECHSEL_WEEKS, MIN_KAPITAL, NOTARY_CAPITAL_FEE_MIN, NOTARY_CAPITAL_FEE_RATE, isPublicCapable, legalFamily, organNames } from '../types/legal.js';
import { computeResolution, recordResolution } from './governance.js';
import { ESOP_CLIFF_WEEKS, ESOP_VEST_WEEKS, esopUnallocated } from './equity.js';

export { deptDe };

/**
 * Aktions-Schicht: validiert Spieler-Aktionen und wendet sie an.
 *
 * WICHTIG: Aktionen mutieren nur Absichts-Felder (Budgets, Preisindex,
 * Ausschreibungen, Event-Status) und legen ScheduledEffects an. Alle Geld-
 * und Personalbewegungen führt ausschließlich der Wochentick aus — dadurch
 * bleibt die Kapitalflussrechnung konstruktionsbedingt konsistent.
 */

const PRICE_COOLDOWN_WEEKS = 8;

export function validateAction(state: CompanyState, action: PlayerAction): ActionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const f = state.finance;

  switch (action.type) {
    case 'PRICE_CHANGE': {
      if (Math.abs(action.pct) > 0.3) errors.push('Preisänderung ist auf ±30 % begrenzt.');
      if (Math.abs(action.pct) < 0.005) errors.push('Preisänderung unter 0,5 % hat keinen Effekt.');
      const last = state.customers.lastPriceChangeWeek;
      if (last !== null && state.meta.week - last < PRICE_COOLDOWN_WEEKS) {
        errors.push(`Preis wurde in Woche ${last} geändert — nächste Änderung frühestens Woche ${last + PRICE_COOLDOWN_WEEKS} (Markt braucht Verlässlichkeit).`);
      }
      if (action.pct > 0.15) warnings.push('Mehr als +15 % auf einmal riskiert einen spürbaren Churn-Spike beim Renewal.');
      break;
    }
    case 'START_HIRING': {
      if (action.count < 1 || action.count > 10) errors.push('1–10 Stellen pro Ausschreibung.');
      if (!Number.isInteger(action.count)) errors.push('Anzahl muss ganzzahlig sein.');
      if (runwayWeeks(state) < 20) warnings.push('Runway unter 20 Wochen — jede neue Stelle verkürzt ihn weiter.');
      break;
    }
    case 'LAYOFF': {
      const inDept = state.people.employees.filter((e) => e.dept === action.dept).length;
      if (action.count < 1) errors.push('Mindestens 1 Stelle.');
      if (action.count > inDept) errors.push(`Nur ${inDept} Beschäftigte in dieser Abteilung.`);
      if (action.count >= inDept && inDept > 0) warnings.push('Die komplette Abteilung abzubauen legt deren Funktion still.');
      const humane = state.identity.values.some((v) => /mensch|team|respekt|fair/i.test(v)) || /mensch/i.test(state.identity.motto);
      if (humane && !action.generousSeverance) {
        warnings.push(`Eure Werte („${state.identity.values.join('", „')}") versprechen etwas anderes — eine harte Trennung ohne faire Abfindung wird intern und extern zitiert werden.`);
      }
      break;
    }
    case 'SET_MARKETING_BUDGET': {
      if (action.monthlyAmount < 0) errors.push('Budget kann nicht negativ sein.');
      if (action.monthlyAmount > 250_000) errors.push('Mehr als 250 k€/Monat ist in dieser Unternehmensgröße nicht absorbierbar.');
      break;
    }
    case 'SET_RND_ALLOCATION': {
      const sumAlloc = action.features + action.techDebt + action.bugfixes;
      if (Math.abs(sumAlloc - 1) > 0.001) errors.push('Die Allokation muss in Summe 100 % ergeben.');
      if (action.features < 0 || action.techDebt < 0 || action.bugfixes < 0) errors.push('Keine negativen Anteile.');
      if (action.techDebt < 0.05 && state.product.techDebt > 60) warnings.push('Tech-Debt über 60 und keine Tilgung: Das Ausfallrisiko steigt jede Woche.');
      break;
    }
    case 'SET_CS_BUDGET': {
      if (action.monthlyAmount < 0) errors.push('Budget kann nicht negativ sein.');
      if (action.monthlyAmount > 100_000) errors.push('Mehr als 100 k€/Monat CS-Programme sind nicht sinnvoll einsetzbar.');
      break;
    }
    case 'ADJUST_SALARIES': {
      if (action.pct <= 0 || action.pct > 0.15) errors.push('Gehaltsrunde: 0–15 %.');
      break;
    }
    case 'RAISE_DEBT': {
      if (action.amount <= 0) errors.push('Betrag muss positiv sein.');
      const newPrincipal = f.debt.principal + action.amount;
      if (newPrincipal > f.debt.creditLine) {
        errors.push(`Kreditlinie ${fmt(f.debt.creditLine)} — es sind nur noch ${fmt(Math.max(0, f.debt.creditLine - f.debt.principal))} ziehbar.`);
      }
      const arr = totalMrr(state) * 12;
      const cov = f.debt.covenants.find((c) => c.type === 'maxDebtToArr');
      if (cov && cov.type === 'maxDebtToArr' && arr > 0 && newPrincipal / arr > cov.value) {
        errors.push(`Covenant „${cov.labelDe}" würde verletzt (${((newPrincipal / arr) * 100).toFixed(0)} % > ${cov.value * 100} %).`);
      }
      break;
    }
    case 'REPAY_DEBT': {
      if (action.amount <= 0) errors.push('Betrag muss positiv sein.');
      if (action.amount > f.debt.principal) errors.push('Mehr Tilgung als Restschuld.');
      if (action.amount > f.cash * 0.8) warnings.push('Diese Tilgung würde über 80 % der Kasse binden.');
      break;
    }
    case 'RESPOND_EVENT': {
      const ev = state.openEvents.find((e) => e.instanceId === action.eventInstanceId);
      if (!ev) errors.push('Ereignis nicht gefunden.');
      else if (ev.status !== 'open') errors.push('Ereignis ist bereits entschieden.');
      break;
    }
    case 'DELEGATE_MESSAGE': {
      const msg = state.comms.messages.find((m) => m.id === action.messageId);
      if (!msg) errors.push('Nachricht nicht gefunden.');
      else if (!msg.delegable) errors.push('Diese Nachricht ist nicht delegierbar.');
      else if (msg.handledWeek !== null) errors.push('Diese Nachricht ist bereits erledigt.');
      if (!state.people.executives.some((e) => e.role === action.execRole)) errors.push('Diese Führungskraft ist nicht (mehr) an Bord.');
      break;
    }
    case 'START_PROJECT': {
      const c = clampClassification(action.classification);
      if (state.projects.filter((p) => p.status === 'running').length >= 5) errors.push('Maximal 5 Projekte parallel — Fokus ist auch eine Entscheidung.');
      if (c.costOneOff > f.cash * 0.6) errors.push(`Die Einmalkosten (${fmt(c.costOneOff)}) würden über 60 % der Kasse binden.`);
      if (runwayWeeks(state) < 16 && c.costOneOff + c.costMonthly * 3 > 30_000) {
        warnings.push('Runway unter 16 Wochen — jedes Experiment konkurriert jetzt direkt mit der Zahlungsfähigkeit.');
      }
      break;
    }
    case 'HIRE_CONSULTANT': {
      if (f.cash < CONSULTANT_FEE * 2) errors.push(`Ein Engagement kostet ${fmt(CONSULTANT_FEE)} — dafür ist die Kasse zu knapp.`);
      if (runwayWeeks(state) < 13) warnings.push('Berater in der Liquiditätskrise? Die Analyse, die du brauchst, steht vermutlich schon im Dashboard.');
      break;
    }
    case 'ACCEPT_TERM_SHEET': {
      errors.push(...validateTermSheet(state, action.offer));
      if (action.offer.liquidationPref === '1x-participating') {
        warnings.push('Participating Preference: Beim Exit kassiert der Investor Einsatz UND prozentualen Anteil — bei mittleren Exits geht das massiv zu Lasten der Gründer.');
      }
      if (action.offer.boardSeat) {
        warnings.push('Board-Seat mit Vetorechten: Das Board wird fordernder — deine Fehlertoleranz sinkt spürbar.');
      }
      break;
    }
    case 'RAISE_VENTURE_DEBT': {
      errors.push(...validateVentureDebt(state, action.amount));
      break;
    }
    case 'MA_DUE_DILIGENCE': {
      const t = state.market.maTargets.find((x) => x.id === action.targetId);
      if (!t) errors.push('Kaufziel nicht gefunden.');
      else {
        if (t.status !== 'available') errors.push('Dieses Ziel steht nicht (mehr) zum Verkauf.');
        if (t.ddDone) errors.push('Die Due Diligence liegt bereits vor (siehe Strategie → M&A).');
      }
      if (f.cash < MA_DD_FEE * 2) errors.push(`Die Due Diligence kostet ${fmt(MA_DD_FEE)} — dafür ist die Kasse zu knapp.`);
      break;
    }
    case 'MA_ACQUIRE': {
      const t = state.market.maTargets.find((x) => x.id === action.targetId);
      if (!t) errors.push('Kaufziel nicht gefunden.');
      else {
        if (t.status !== 'available') errors.push('Dieses Ziel steht nicht (mehr) zum Verkauf.');
        if (t.askPrice > f.cash * 0.85) {
          errors.push(`Kaufpreis ${fmt(t.askPrice)} übersteigt 85 % der Kasse (${fmt(f.cash)}) — ohne frisches Kapital nicht darstellbar.`);
        }
        if (!t.ddDone) warnings.push('Kauf OHNE Due Diligence: Du übernimmst alle versteckten Altlasten ungeprüft. Die DD ist fast immer gut investiertes Geld.');
        if (runwayWeeks(state) < 20) warnings.push('Akquisition bei unter 20 Wochen Runway: Integrationen kosten Cash UND Management-Aufmerksamkeit.');
      }
      break;
    }
    case 'IPO_SELECT_BANK': {
      if (!IPO_BANKS.some((b) => b.id === action.bankId)) errors.push('Unbekannte Bank.');
      if (state.ipo.status !== 'eligible' && state.ipo.status !== 'withdrawn') {
        errors.push(state.ipo.status === 'public' ? 'Ihr seid bereits börsennotiert.' : state.ipo.status === 'locked' ? 'Die Firma erfüllt die IPO-Kriterien noch nicht (siehe Börse-Tab).' : 'Der IPO-Prozess läuft bereits.');
      }
      const elig = ipoEligibility(state);
      if (!elig.ok) errors.push('IPO-Kriterien aktuell nicht erfüllt: ' + elig.criteria.filter((c) => !c.ok).map((c) => c.labelDe).join(' · '));
      if (f.cash < IPO_PREP_COST * 2) errors.push(`Prospekt, Audit & Anwälte kosten ~${fmt(IPO_PREP_COST)} — dafür ist die Kasse zu knapp.`);
      break;
    }
    case 'ADJUST_EMPLOYEE_SALARY': {
      const emp = state.people.employees.find((e) => e.id === action.employeeId);
      if (!emp) errors.push('Mitarbeiter:in nicht (mehr) im Unternehmen.');
      if (action.pct < 0.01 || action.pct > 0.25) errors.push('Individuelle Erhöhung: 1–25 %.');
      if (action.pct > 0.15) warnings.push('Über 15 % sprechen sich herum — Kolleg:innen mit ähnlicher Rolle werden nachziehen wollen (Neid-Effekt).');
      if (runwayWeeks(state) < 16) warnings.push('Gehaltserhöhungen bei unter 16 Wochen Runway senden ein gemischtes Signal.');
      break;
    }
    case 'SET_CEO_SALARY': {
      if (action.monthlyAmount < 8_000 || action.monthlyAmount > 45_000) errors.push('CEO-Gehalt: 8–45 k€/Monat (Marktband dieser Unternehmensgröße).');
      if (action.monthlyAmount > state.ceo.salaryMonthly && runwayWeeks(state) < 13) {
        errors.push('Mitten in der Liquiditätskrise setzt der Aufsichtsrat dafür nicht einmal eine Sitzung an.');
      }
      if (action.monthlyAmount > state.ceo.salaryMonthly * 1.2) {
        warnings.push('Mehr als +20 % auf einmal: Das Board wird fragen, welcher Meilenstein das rechtfertigt.');
      }
      break;
    }
    case 'CREATE_APPOINTMENT': {
      if (action.titleDe.trim().length < 3 || action.titleDe.length > 80) errors.push('Titel: 3–80 Zeichen.');
      if (action.week < state.meta.week || action.week > state.meta.week + 12) errors.push('Termine nur in dieser bis +12 Wochen.');
      if (!Number.isInteger(action.weekday) || action.weekday < 0 || action.weekday > 4) errors.push('Wochentag: Montag–Freitag.');
      if (action.agendaDe.length > 5 || action.agendaDe.some((a) => a.length > 120)) errors.push('Max. 5 Agenda-Punkte à 120 Zeichen.');
      break;
    }
    case 'IPO_PRICE': {
      const ipo = state.ipo;
      if (ipo.status !== 'roadshow') errors.push('Pricing ist nur während der Roadshow möglich.');
      else {
        const lo = ipo.bookLow ?? 0;
        const hi = ipo.bookHigh ?? 0;
        if (action.pricePerShare < lo * 0.75) errors.push(`Unter ${(lo * 0.75).toFixed(2)} € macht die Bank nicht mit (Spanne ${lo.toFixed(2)}–${hi.toFixed(2)} €).`);
        if (action.pricePerShare > hi * 1.08) errors.push(`Mehr als ~8 % über der Spanne (${hi.toFixed(2)} €) trägt das Buch nicht.`);
        if (action.pricePerShare > hi) warnings.push('Über der Spanne zu preisen ist eine Wette auf ein heißes Buch — wenn die Zeichnungsquote kippt, platzt der IPO öffentlich.');
        if (action.pricePerShare < lo) warnings.push('Unter der Spanne: sicheres Buch, aber du lässt bewusst Geld auf dem Tisch.');
      }
      break;
    }
    case 'SET_TARIF_BINDING': {
      if (action.status === state.labor.tarifStatus) errors.push('Dieser Tarifstatus ist bereits aktiv.');
      if (state.labor.negotiation !== null) errors.push('Während einer laufenden Tarifrunde lässt sich die Bindung nicht ändern — erst den Abschluss.');
      if (action.status === 'none') {
        warnings.push('Tarifflucht ist ein tiefer Einschnitt: Arbeitgebermarke, Betriebsfrieden und Vertrauen leiden dauerhaft — und bei Betriebsrat/hoher Organisation droht Streik.');
      } else if (runwayWeeks(state) < 16) {
        warnings.push('Tarifbeitritt hebt sofort die Löhne — bei knappem Runway will das gut überlegt sein.');
      }
      break;
    }
    case 'NEGOTIATE_TARIF': {
      if (!state.labor.negotiation) errors.push('Es läuft gerade keine Tarifrunde.');
      if (action.offerPct < 0 || action.offerPct > 0.15) errors.push('Angebot: 0–15 %.');
      else if (state.labor.negotiation && action.offerPct < state.labor.negotiation.floorPct) {
        warnings.push(`Dein Angebot liegt unter der erwarteten Schmerzgrenze (~${(state.labor.negotiation.floorPct * 100).toFixed(1)} %) — mit Ablehnung und Warnstreik ist zu rechnen.`);
      }
      break;
    }
    case 'CONVERT_LEGAL_FORM': {
      const l = state.legal;
      const country = state.identity.location?.country ?? 'Deutschland';
      const fam = legalFamily(country);
      if (l.pendingConversion) errors.push('Es läuft bereits ein Formwechsel.');
      if (action.toForm === l.rechtsform) errors.push('Diese Rechtsform besteht bereits.');
      else if (action.toForm !== fam.ipoTarget) errors.push(`In ${country} führt der Weg zur Börsenfähigkeit über die ${fam.ipoTarget} — ein anderer Formwechsel ist hier nicht vorgesehen.`);
      if (l.nennkapital < MIN_KAPITAL[action.toForm]) errors.push(`Für die ${action.toForm} sind mindestens ${MIN_KAPITAL[action.toForm].toLocaleString('de-DE')} € Nennkapital nötig — erst Kapitalerhöhung (aktuell ${Math.round(l.nennkapital).toLocaleString('de-DE')} €).`);
      if (!l.pendingConversion && action.toForm !== l.rechtsform) {
        // Formwechsel ist eine Satzungsänderung: 75 % Zustimmung der Gesellschafter.
        const res = computeResolution(state, 'formwechsel', `Formwechsel zur ${action.toForm}`);
        if (!res.passed) errors.push(`Die Gesellschafter tragen den Formwechsel nicht mit: nur ${(res.forShare * 100).toFixed(0)} % Zustimmung, ${(res.requiredShare * 100).toFixed(0)} % nötig (Satzungsänderung). Es braucht mehr Rückhalt im Aufsichtsrat.`);
      }
      if (f.cash < FORMWECHSEL_FEE_AG) errors.push(`Für Notar, Umwandlungsbericht und Prüfung sind ${FORMWECHSEL_FEE_AG.toLocaleString('de-DE')} € nötig — die Liquidität reicht nicht.`);
      if (isPublicCapable(action.toForm)) warnings.push('Als börsenfähige Gesellschaft gelten strengere Publizitäts- und Governance-Pflichten — dafür wird ein Börsengang erst möglich.');
      break;
    }
    case 'CAPITAL_INCREASE': {
      const l = state.legal;
      if (action.targetNennkapital <= l.nennkapital) errors.push('Das Ziel-Nennkapital muss über dem aktuellen liegen.');
      if (action.targetNennkapital > f.contributedCapital) errors.push(`Aus Gesellschaftsmitteln lässt sich höchstens bis zum eingezahlten Kapital (${Math.round(f.contributedCapital).toLocaleString('de-DE')} €) erhöhen.`);
      if (action.targetNennkapital > 10_000_000) errors.push('Unrealistisch hohes Nennkapital.');
      break;
    }
    case 'HOLD_SHAREHOLDER_MEETING': {
      if (state.legal.lastMeetingWeek !== null && state.meta.week - state.legal.lastMeetingWeek < 8) {
        warnings.push('Eine weitere Versammlung so kurz nach der letzten ist unüblich — die ordentliche ist erst später wieder fällig.');
      }
      break;
    }
    case 'DISTRIBUTE_DIVIDEND': {
      if (action.amount <= 0) errors.push('Ausschüttungsbetrag muss positiv sein.');
      if (action.amount > f.retainedEarnings) errors.push(`Es lässt sich nur aus der Gewinnrücklage ausschütten (max. ${Math.max(0, Math.round(f.retainedEarnings)).toLocaleString('de-DE')} €).`);
      const minCashCov = f.debt.covenants.find((c) => c.type === 'minCash');
      if (minCashCov && minCashCov.type === 'minCash' && f.cash - action.amount < minCashCov.value) errors.push('Die Ausschüttung würde die Mindestliquidität (Covenant) reißen.');
      if (action.amount > 0 && action.amount <= f.retainedEarnings) {
        // Ausschüttung ist ein Gesellschafterbeschluss (einfache Mehrheit).
        const divRes = computeResolution(state, 'dividende', 'Gewinnausschüttung');
        if (!divRes.passed) errors.push(`Die Gesellschafterversammlung lehnt die Ausschüttung ab (${(divRes.forShare * 100).toFixed(0)} % Zustimmung, ${(divRes.requiredShare * 100).toFixed(0)} % nötig).`);
      }
      if (runwayWeeks(state) < 30) warnings.push('Ausschüttung bei knappem Runway: Das Kapital fehlt dann für Wachstum und Puffer — der Aufsichtsrat schaut genau hin.');
      break;
    }
    case 'GRANT_OPTIONS': {
      const emp = state.people.employees.find((e) => e.id === action.employeeId);
      if (!emp) errors.push('Unbekannte Person.');
      else if (emp.equityGrant) errors.push(`${emp.firstName} ${emp.lastName} hat bereits einen Options-Grant.`);
      if (action.percent < 0.0005 || action.percent > 0.02) errors.push('Grant: 0,05 % bis 2,0 % pro Person.');
      if (action.percent > esopUnallocated(state)) errors.push(`Der ESOP-Pool hat nur noch ${(esopUnallocated(state) * 100).toFixed(2)} % frei.`);
      break;
    }
  }
  return { ok: errors.length === 0, errorsDe: errors, warningsDe: warnings };
}

function fmt(v: number): string {
  return `${Math.round(v / 1000)} k€`;
}

function fmtM(v: number): string {
  return `${(v / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} M€`;
}

function schedule(state: CompanyState, delayWeeks: number, sourceDe: string, sourceId: string | null, effect: EffectPayload): void {
  scheduleFx(state, delayWeeks, sourceDe, sourceId, effect, 'decision');
}

/**
 * Wendet eine validierte Aktion an. Gibt den DecisionRecord zurück
 * (Bewertungs-Pipeline: Hypothese wurde vorher vom UI eingesammelt).
 */
export function applyAction(state: CompanyState, action: PlayerAction, hypothesis: Hypothesis | null, decisionId: string): DecisionRecord {
  const v = validateAction(state, action);
  if (!v.ok) throw new Error('Aktion ungültig: ' + v.errorsDe.join(' '));

  const week = state.meta.week;
  const analysis: string[] = [];
  let summary = '';

  switch (action.type) {
    case 'PRICE_CHANGE': {
      const pctTxt = `${action.pct > 0 ? '+' : ''}${(action.pct * 100).toFixed(0)} %`;
      state.customers.priceIndex *= 1 + action.pct;
      state.customers.lastPriceChangeWeek = week;
      summary = `Listenpreis ${pctTxt}${action.applyToExisting ? ' (auch Bestand beim Renewal)' : ' (nur Neugeschäft)'}`;
      analysis.push(`Neugeschäfts-ARPA ändert sich ab sofort um ${pctTxt}; die Win-Rate reagiert gegenläufig (Preis-Elastizität).`);
      if (action.applyToExisting) {
        const churnFactor = 1 + Math.max(0, action.pct) * 2.2;
        schedule(state, 4, `Preisänderung W${week}`, decisionId, {
          kind: 'ADD_MODIFIER',
          modifier: { target: 'churnMonthly', factor: churnFactor, startWeek: week + 4, endWeek: week + 14, sourceDe: `Renewal-Repricing (${pctTxt})` },
        });
        schedule(state, 4, `Preisänderung W${week}`, decisionId, { kind: 'RENEWAL_REPRICING', segmentId: 'all', priceDeltaApplied: action.pct });
        analysis.push(`Bestandskunden werden ab Woche ${week + 4} beim Renewal umgestellt — erhöhtes Kündigungsrisiko für ~10 Wochen (Faktor ${churnFactor.toFixed(2)} auf den Churn).`);
      }
      if (action.pct < -0.08) {
        schedule(state, 3, `Preissenkung W${week}`, decisionId, { kind: 'COMPETITOR_PRICE_MOVE', competitorId: 'comp_nordcloud', priceIndexDelta: -0.06 });
        analysis.push('NordCloud Systems (Preiskämpfer) wird voraussichtlich in 2–4 Wochen nachziehen.');
      }
      break;
    }
    case 'START_HIRING': {
      const baseFill = { werkstudent: 3, junior: 5, mid: 7, senior: 10, lead: 13 }[action.seniority];
      const specialist = action.specialistRoleDe?.trim().slice(0, 40) || undefined;
      // Spezialrollen sind rarer am Markt: +2 Wochen Suchzeit.
      const repFactor = 1 + (55 - state.reputation.laborMarket) / 100;
      const fill = Math.max(2, Math.round(baseFill * repFactor) + (specialist ? 2 : 0));
      state.people.openRequisitions.push({
        id: nextId(state, 'req'),
        dept: action.dept,
        seniority: action.seniority,
        count: action.count,
        specialistRoleDe: specialist,
        openedWeek: week,
        expectedWeeksToFill: fill,
        costPerHire: action.seniority === 'lead' ? 18_000 : action.seniority === 'senior' ? 12_000 : action.seniority === 'werkstudent' ? 1_500 : 7_000,
      });
      summary = `${action.count}× ${specialist ?? action.seniority} in ${deptDe(action.dept)} ausgeschrieben`;
      analysis.push(`Time-to-Fill ≈ ${fill} Wochen (Arbeitsmarkt-Reputation ${state.reputation.laborMarket}/100 wirkt als Faktor ${repFactor.toFixed(2)}${specialist ? '; Spezialrolle: +2 Wochen Suche, ~+15 % Gehalt' : ''}).`);
      analysis.push(
        action.seniority === 'werkstudent'
          ? 'Werkstudierende: günstig und motiviert, aber geringere Kapazität und höhere Fluktuation (Studienende) — gut für Support-Spitzen, kein Ersatz für Senior-Erfahrung.'
          : 'Kosten entstehen erst bei Besetzung: Recruiting-Fee einmalig, danach laufende Payroll mit ~6 Wochen Einarbeitung (50 % Produktivität).',
      );
      break;
    }
    case 'LAYOFF': {
      schedule(state, 0, `Entlassungsrunde W${week}`, decisionId, {
        kind: 'EXECUTE_LAYOFF', dept: action.dept, count: action.count, generousSeverance: action.generousSeverance,
      });
      summary = `${action.count} Stelle(n) in ${deptDe(action.dept)} abgebaut${action.generousSeverance ? ' (faires Paket)' : ''}`;
      analysis.push('Abfindungen werden diese Woche zahlungswirksam; die Payroll sinkt ab nächster Woche.');
      analysis.push(`Folgeeffekte: Moral ↓ ${action.generousSeverance ? 'moderat' : 'deutlich'}, Arbeitsmarkt-Reputation ↓, erhöhtes freiwilliges Kündigungsrisiko in Woche ${week + 2}–${week + 8}.`);
      break;
    }
    case 'SET_MARKETING_BUDGET': {
      const old = state.finance.budgetsMonthly.marketing;
      state.finance.budgetsMonthly.marketing = action.monthlyAmount;
      summary = `Marketing-Budget: ${fmt(old)} → ${fmt(action.monthlyAmount)}/Monat`;
      analysis.push('Lead-Zufluss folgt dem Budget mit 2–6 Wochen Verzögerung (Kampagnen-Anlauf), mit abnehmendem Grenznutzen.');
      break;
    }
    case 'SET_RND_ALLOCATION': {
      state.product.rndAllocation = { features: action.features, techDebt: action.techDebt, bugfixes: action.bugfixes };
      summary = `R&D-Allokation: ${(action.features * 100).toFixed(0)} % Features / ${(action.techDebt * 100).toFixed(0)} % Tech-Debt / ${(action.bugfixes * 100).toFixed(0)} % Bugs`;
      analysis.push('Feature-Fokus erhöht kurzfristig den Wettbewerbs-Score, lässt aber Tech-Debt wachsen — Velocity und Ausfallrisiko reagieren mit Wochen Verzögerung.');
      break;
    }
    case 'SET_CS_BUDGET': {
      const old = state.finance.budgetsMonthly.customerSuccess;
      state.finance.budgetsMonthly.customerSuccess = action.monthlyAmount;
      summary = `CS-Programme: ${fmt(old)} → ${fmt(action.monthlyAmount)}/Monat`;
      if (action.monthlyAmount > old) {
        const factor = Math.max(0.75, 1 - (action.monthlyAmount - old) / 120_000);
        schedule(state, 4, `CS-Ausbau W${week}`, decisionId, {
          kind: 'ADD_MODIFIER',
          modifier: { target: 'churnMonthly', factor, startWeek: week + 4, endWeek: week + 30, sourceDe: 'CS-/Onboarding-Programm' },
        });
        analysis.push(`Churn-Wirkung ab Woche ${week + 4}: Faktor ≈ ${factor.toFixed(2)} auf die Monats-Churnrate (Programme brauchen Anlaufzeit).`);
      } else {
        analysis.push('Kürzung wirkt sofort auf die Kosten; der Bestand merkt fehlende Betreuung erst mit Verzögerung.');
      }
      break;
    }
    case 'ADJUST_SALARIES': {
      schedule(state, 0, `Gehaltsrunde W${week}`, decisionId, { kind: 'SALARY_RAISE', pct: action.pct });
      summary = `Gehaltsrunde +${(action.pct * 100).toFixed(1)} % für alle`;
      analysis.push(`Payroll steigt dauerhaft um ~${(action.pct * 100).toFixed(1)} %; Zufriedenheit und Bindung steigen sofort.`);
      break;
    }
    case 'RAISE_DEBT': {
      schedule(state, 0, `Kreditziehung W${week}`, decisionId, { kind: 'DEBT_DRAW', amount: action.amount });
      summary = `Kreditlinie gezogen: ${fmt(action.amount)}`;
      analysis.push(`Cash +${fmt(action.amount)} diese Woche; Zinslast steigt um ${fmt((action.amount * state.finance.debt.annualRate) / 12)}/Monat.`);
      break;
    }
    case 'REPAY_DEBT': {
      schedule(state, 0, `Tilgung W${week}`, decisionId, { kind: 'DEBT_REPAY', amount: action.amount });
      summary = `Kredit getilgt: ${fmt(action.amount)}`;
      analysis.push('Zinslast sinkt; dafür ist die Liquiditätsreserve kleiner.');
      break;
    }
    case 'RESPOND_EVENT': {
      const res = resolveEventOption(state, action.eventInstanceId, action.optionId, decisionId);
      summary = res.summaryDe;
      analysis.push(...res.analysisDe);
      break;
    }
    case 'DELEGATE_MESSAGE': {
      const res = executeDelegation(state, action, decisionId);
      summary = res.summaryDe;
      analysis.push(...res.analysisDe);
      break;
    }
    case 'START_PROJECT': {
      const c = clampClassification(action.classification);
      const project = startProject(state, c, decisionId);
      summary = `Projekt gestartet: „${project.titleDe}“ (${fmt(c.costOneOff)} einmalig + ${fmt(c.costMonthly)}/M, ${c.durationWeeks} Wochen)`;
      analysis.push(`Erfolgswahrscheinlichkeit laut Klassifikation: ${(c.successProb * 100).toFixed(0)} % — Auflösung in Woche ${week + c.durationWeeks}, seed-gesteuert.`);
      analysis.push(`Begründung: ${c.rationaleDe}`);
      if (c.comparablesDe.length > 0) analysis.push(`Vergleichsfälle: ${c.comparablesDe.join(' · ')}`);
      break;
    }
    case 'HIRE_CONSULTANT': {
      const topicDe = { churn: 'Churn-Kohorten-Deepdive', pricing: 'Pricing-Studie', market: 'Markteintritts-Optionen', costs: 'Kostenstruktur-Analyse' }[action.topic];
      schedule(state, 0, `Berater-Engagement (${topicDe})`, decisionId, { kind: 'ONE_OFF_COST', amount: CONSULTANT_FEE, labelDe: `Berater-Honorar: ${topicDe}` });
      summary = `Berater beauftragt: ${topicDe} (${fmt(CONSULTANT_FEE)})`;
      analysis.push('Der Report liegt in Kürze unter Strategie → Berater. Didaktischer Hinweis: Berater liefern Struktur und Vergleichswissen — die Verantwortung für die Entscheidung bleibt bei dir.');
      break;
    }
    case 'ACCEPT_TERM_SHEET': {
      // Anti-Manipulation: nicht das eingereichte Objekt verwenden, sondern das
      // deterministisch regenerierte Angebot mit derselben ID (Validierung hat
      // die Existenz bereits geprüft).
      const offer = generateTermSheets(state).find((o) => o.id === action.offer.id) ?? action.offer;
      const round = buildRound(state, offer);
      schedule(state, 0, `Finanzierungsrunde W${week}`, decisionId, { kind: 'EQUITY_INJECTION', round, esopTopUp: offer.esopTopUp });
      const keepFactor = (1 - offer.esopTopUp) * (1 - round.newInvestorShare);
      summary = `Term Sheet angenommen: ${offer.investorName} — ${fmt(offer.amount)} @ ${fmtM(offer.preMoney)} pre-money`;
      analysis.push(
        `Verwässerung: Der Investor erhält ${(round.newInvestorShare * 100).toFixed(1)} %` +
          (offer.esopTopUp > 0 ? `, zusätzlich ${(offer.esopTopUp * 100).toFixed(0)} % ESOP-Top-up PRE-Money` : '') +
          ` — dein Anteil sinkt von ${(state.ceo.equityShare * 100).toFixed(1)} % auf ~${(state.ceo.equityShare * keepFactor * 100).toFixed(1)} %.`,
      );
      analysis.push(`Liquidation Preference: ${offer.liquidationPref === '1x-participating' ? '1x PARTICIPATING — der Investor bekommt beim Exit erst den Einsatz zurück und ist danach nochmal prozentual dabei.' : '1x non-participating — marktüblich fair.'}`);
      analysis.push('Der Cash-Zufluss wird beim Wochenabschluss als Finanzierungs-Cashflow gebucht; der Cap Table ist ab dann aktualisiert (Finanzen-Tab).');
      if (offer.boardSeat) analysis.push('Der neue Board-Seat erhöht den Erwartungsdruck: Wachstum wird ab jetzt härter getrackt.');
      break;
    }
    case 'RAISE_VENTURE_DEBT': {
      applyVentureDebtTerms(state, action.amount);
      schedule(state, 0, `Venture Debt W${week}`, decisionId, { kind: 'DEBT_DRAW', amount: action.amount });
      summary = `Venture Debt aufgenommen: ${fmt(action.amount)}`;
      analysis.push(`Kreditlinie +${fmt(action.amount)}; Blended-Zins jetzt ${(state.finance.debt.annualRate * 100).toFixed(2)} % p. a. — teurer als die Hausbank, dafür ohne Verwässerung.`);
      analysis.push('Merke: Venture Debt verlängert den Runway, ersetzt aber keine Equity-Story — die Tilgung muss aus dem Geschäft kommen.');
      break;
    }
    case 'MA_DUE_DILIGENCE': {
      const t = maTarget(state, action.targetId);
      t.ddDone = true;
      // Befunde rechtfertigen einen Preisabschlag (vereinfachte Nachverhandlung).
      const severitySum = t.redFlags.reduce((s, fl) => s + fl.severity, 0);
      const discount = Math.min(0.2, severitySum * 0.04);
      if (discount > 0) t.askPrice = Math.round((t.askPrice * (1 - discount)) / 10_000) * 10_000;
      schedule(state, 0, `Due Diligence ${t.name}`, decisionId, { kind: 'ONE_OFF_COST', amount: MA_DD_FEE, labelDe: `Due Diligence: ${t.name}` });
      summary = `Due Diligence: ${t.name} (${fmt(MA_DD_FEE)})`;
      analysis.push(
        t.redFlags.length > 0
          ? `Der Bericht liegt vor — ${t.redFlags.length} Befund(e): ${t.redFlags.map((fl) => fl.labelDe).join(' · ')}`
          : 'Der Bericht ist unauffällig — saubere Bücher.',
      );
      if (discount > 0) analysis.push(`Die Befunde haben den Kaufpreis in der Nachverhandlung um ${(discount * 100).toFixed(0)} % auf ${fmt(t.askPrice)} gedrückt — DD zahlt sich doppelt aus: Wissen + Hebel.`);
      break;
    }
    case 'MA_ACQUIRE': {
      const t = maTarget(state, action.targetId);
      t.status = 'acquired';
      schedule(state, 0, `Übernahme ${t.name}`, decisionId, { kind: 'ONE_OFF_COST', amount: t.askPrice, labelDe: `Kaufpreis ${t.name}` });
      schedule(state, 1, `Übernahme ${t.name}`, decisionId, { kind: 'MA_INTEGRATION', targetId: t.id });
      summary = `Übernahme: ${t.name} für ${fmt(t.askPrice)}`;
      analysis.push('Der Kaufpreis wird diese Woche zahlungswirksam (vereinfachte Buchung als Einmalaufwand durch die GuV — kein Goodwill-Ansatz in diesem Modell).');
      analysis.push(`Integration ab Woche ${week + 1}: ~${fmt(t.mrr)} MRR und ${t.employees} Mitarbeitende kommen an Bord — mit Kulturrisiko und ${t.ddDone ? 'den bekannten DD-Befunden' : 'allen UNGEPRÜFTEN Altlasten'}.`);
      analysis.push('Realitäts-Check: Die meisten Übernahmen scheitern nicht am Kaufpreis, sondern an der Integration (vgl. Fall-Bibliothek: Daimler-Chrysler, HP/Autonomy).');
      break;
    }
    case 'ADJUST_EMPLOYEE_SALARY': {
      const emp = state.people.employees.find((e) => e.id === action.employeeId)!;
      schedule(state, 0, `Gehaltsanpassung ${emp.firstName} ${emp.lastName} W${week}`, decisionId, {
        kind: 'EMPLOYEE_RAISE', employeeId: action.employeeId, pct: action.pct,
      });
      summary = `Gehalt ${emp.firstName} ${emp.lastName} (${emp.roleTitleDe}): +${(action.pct * 100).toFixed(0)} %`;
      analysis.push(`Neues Gehalt ab dieser Woche: ~${fmt(Math.round(emp.salaryMonthly * (1 + action.pct)))}/Monat (Arbeitgeberkosten ×1,22). Zufriedenheit und Bindung dieser Person steigen sofort.`);
      if (action.pct > 0.12) analysis.push('Ab ~12 % spricht sich die Erhöhung in der Abteilung herum — rechne mit Nachzieh-Erwartungen.');
      break;
    }
    case 'SET_CEO_SALARY': {
      // Deterministische Aufsichtsrats-Entscheidung: Vertrauen + Lage + Sprunghöhe.
      const current = state.ceo.salaryMonthly;
      const raisePct = action.monthlyAmount / current - 1;
      const rng = stream(state.meta.seed, 'ceo-salary', week);
      if (raisePct <= 0) {
        schedule(state, 0, `CEO-Vergütung W${week}`, decisionId, { kind: 'CEO_SALARY_SET', monthlyAmount: action.monthlyAmount });
        summary = `CEO-Gehalt gesenkt: ${fmt(current)} → ${fmt(action.monthlyAmount)}/Monat`;
        if (raisePct <= -0.1) {
          state.ceo.boardTrust = Math.min(100, state.ceo.boardTrust + 2);
          state.ceo.trustLog.push({ week, delta: 2, reasonDe: 'CEO verzichtet auf eigenes Gehalt — das Board registriert das Signal.' });
          analysis.push('Gehaltsverzicht in der Krise ist ein starkes Signal nach innen und außen — das Board honoriert es (+2 Vertrauen).');
        } else {
          analysis.push('Der Aufsichtsrat winkt die Senkung ohne Diskussion durch.');
        }
      } else {
        const threshold = 55 + raisePct * 120; // +10 % braucht ~67 Vertrauen, +25 % ~85
        const jitter = (rng() - 0.5) * 8;
        const approved = state.ceo.boardTrust + jitter >= threshold;
        if (approved) {
          schedule(state, 0, `CEO-Vergütung W${week}`, decisionId, { kind: 'CEO_SALARY_SET', monthlyAmount: action.monthlyAmount });
          const grudge = runwayWeeks(state) < 40 ? Math.min(3, Math.round(raisePct * 12)) : 0;
          if (grudge > 0) {
            state.ceo.boardTrust = Math.max(0, state.ceo.boardTrust - grudge);
            state.ceo.trustLog.push({ week, delta: -grudge, reasonDe: `Aufsichtsrat genehmigt CEO-Gehaltserhöhung (+${(raisePct * 100).toFixed(0)} %) — murrend, solange der Runway nicht komfortabel ist.` });
          }
          summary = `Aufsichtsrat GENEHMIGT: CEO-Gehalt ${fmt(current)} → ${fmt(action.monthlyAmount)}/Monat`;
          analysis.push(`Der Vergütungsausschuss stimmt zu${grudge > 0 ? `, vermerkt aber Bedenken im Protokoll (−${grudge} Vertrauen)` : ''}. Wirksam ab dieser Woche.`);
        } else {
          state.ceo.boardTrust = Math.max(0, state.ceo.boardTrust - 2);
          state.ceo.trustLog.push({ week, delta: -2, reasonDe: `Aufsichtsrat LEHNT CEO-Gehaltserhöhung ab (beantragt: +${(raisePct * 100).toFixed(0)} %).` });
          summary = `Aufsichtsrat LEHNT AB: CEO-Gehalt bleibt bei ${fmt(current)}/Monat`;
          analysis.push(`Begründung des Vergütungsausschusses: Bei ${Math.round(state.ceo.boardTrust)}/100 Vertrauen und aktueller Lage ist ein Sprung von +${(raisePct * 100).toFixed(0)} % nicht vermittelbar. Der Antrag selbst kostet Kapital (−2 Vertrauen) — Timing ist auch hier ein Hebel.`);
        }
      }
      break;
    }
    case 'CREATE_APPOINTMENT': {
      const execNames = state.people.executives.map((ex) => {
        const emp = state.people.employees.find((e) => e.id === ex.employeeId);
        return emp ? `${emp.firstName} ${emp.lastName}` : ex.role;
      });
      state.calendar.appointments.push({
        id: nextId(state, 'apt'),
        week: action.week,
        weekday: action.weekday,
        titleDe: action.titleDe.trim(),
        kind: 'custom',
        agendaDe: action.agendaDe.map((a) => a.trim()).filter(Boolean),
        participants: [...execNames, state.people.assistant.name],
        linkedEntityId: null,
      });
      summary = `Termin angesetzt: „${action.titleDe.trim()}“ (Woche ${action.week})`;
      analysis.push('Der Termin steht im Kalender und ist dort als Meeting-Szene spielbar — das Führungsteam nimmt teil.');
      break;
    }
    case 'SET_TARIF_BINDING': {
      // Betriebsrat kann die Tarifflucht nicht verhindern, aber sie ist ohne
      // seine Anhörung ein schwerer Vertrauensbruch — die Warnung steht im UI.
      const laborOcc: Occurrence[] = [];
      analysis.push(...applyTarifBinding(state, action.status, laborOcc));
      // Sofort-Occurrences (z. B. „Tarifausstieg beschlossen") in die Analyse
      // spiegeln — der Entscheidungs-Record trägt keine Occurrence-Liste.
      for (const o of laborOcc) analysis.push(`${o.icon} ${o.textDe}`);
      summary =
        action.status === 'none'
          ? 'Tarifausstieg (Tarifflucht) beschlossen'
          : action.status === 'verband'
            ? 'Flächentarifvertrag (Arbeitgeberverband) beigetreten'
            : 'Haustarifvertrag abgeschlossen';
      break;
    }
    case 'NEGOTIATE_TARIF': {
      const laborOcc: Occurrence[] = [];
      const demand = state.labor.negotiation?.demandPct ?? 0;
      analysis.push(...applyTarifOffer(state, action.offerPct, laborOcc));
      for (const o of laborOcc) analysis.push(`${o.icon} ${o.textDe}`);
      summary = `Tarifangebot: +${(action.offerPct * 100).toFixed(1)} % (Forderung war +${(demand * 100).toFixed(1)} %)`;
      break;
    }
    case 'CONVERT_LEGAL_FORM': {
      const l = state.legal;
      const res = recordResolution(state, 'formwechsel', `Formwechsel zur ${action.toForm}`);
      l.pendingConversion = { toForm: action.toForm, startedWeek: week, effectiveWeek: week + FORMWECHSEL_WEEKS };
      schedule(state, 0, `Formwechsel W${week}`, decisionId, { kind: 'ONE_OFF_COST', amount: FORMWECHSEL_FEE_AG, labelDe: `Formwechsel zur ${action.toForm}: Notar, Umwandlungsbericht, Prüfung` });
      summary = `Formwechsel zur ${action.toForm} eingeleitet — wirksam in ~${FORMWECHSEL_WEEKS} Wochen`;
      analysis.push(`Gesellschafterbeschluss: ${(res.forShare * 100).toFixed(0)} % Zustimmung (${res.votes.filter((v) => v.vote === 'ja').length}/${res.votes.length} Sitze dafür).`);
      analysis.push(`Beurkundung, Umwandlungsbericht und Registeranmeldung laufen (${fmt(FORMWECHSEL_FEE_AG)} sofort fällig). Erst mit der Eintragung ins Register ist die ${action.toForm} wirksam.`);
      if (isPublicCapable(action.toForm)) analysis.push(`Ab dann gilt die zweistufige/überwachte Governance der ${action.toForm} — und erst diese Rechtsform ist börsenfähig, ein Börsengang wird rechtlich möglich.`);
      break;
    }
    case 'CAPITAL_INCREASE': {
      const l = state.legal;
      const inc = action.targetNennkapital - l.nennkapital;
      const fee = Math.max(NOTARY_CAPITAL_FEE_MIN, Math.round(inc * NOTARY_CAPITAL_FEE_RATE));
      l.nennkapital = action.targetNennkapital;
      schedule(state, 0, `Kapitalerhöhung W${week}`, decisionId, { kind: 'ONE_OFF_COST', amount: fee, labelDe: 'Kapitalerhöhung: Notar & Handelsregister' });
      summary = `Nennkapital erhöht auf ${fmt(action.targetNennkapital)}`;
      analysis.push(`Aus Gesellschaftsmitteln umgewandelt: mehr gezeichnetes Haftungskapital (Vertrauensbasis für Banken & Partner), aber gebunden — nicht ausschüttbar. Notar/Handelsregister: ${fmt(fee)}.`);
      if (action.targetNennkapital >= MIN_KAPITAL.AG && l.rechtsform === 'GmbH') analysis.push('Das Nennkapital reicht jetzt für einen Formwechsel zur AG.');
      break;
    }
    case 'HOLD_SHAREHOLDER_MEETING': {
      const l = state.legal;
      const o = organNames(l.rechtsform);
      l.lastMeetingWeek = week;
      l.nextMeetingWeek = week + 52;
      const solid = state.ceo.boardTrust >= 50 || computeKpis(state).values.ebitdaMonthly > 0;
      if (solid) {
        state.ceo.boardTrust = Math.min(100, state.ceo.boardTrust + 2);
        state.ceo.trustLog.push({ week, delta: 2, reasonDe: `Entlastung durch die ${o.versammlung} erteilt.` });
      }
      summary = `${o.versammlung} abgehalten — Jahresabschluss festgestellt, ${l.rechtsform === 'AG' ? 'Vorstand' : 'Geschäftsführung'} ${solid ? 'entlastet' : 'unter Vorbehalt'}`;
      analysis.push(`Ordentliche ${o.versammlung}: Feststellung des Jahresabschlusses, Ergebnisverwendung und Entlastung. Nächste turnusmäßige Versammlung in 52 Wochen.`);
      break;
    }
    case 'GRANT_OPTIONS': {
      const emp = state.people.employees.find((e) => e.id === action.employeeId)!;
      emp.equityGrant = { percent: action.percent, grantWeek: week, cliffWeeks: ESOP_CLIFF_WEEKS, vestWeeks: ESOP_VEST_WEEKS };
      // Bindung ohne Cash: Zufriedenheit hoch, Kündigungsrisiko runter.
      emp.satisfaction = Math.min(100, emp.satisfaction + 8);
      emp.attritionRiskWeekly = Math.max(0.0015, emp.attritionRiskWeekly * 0.8);
      summary = `Optionen vergeben: ${(action.percent * 100).toFixed(2)} % an ${emp.firstName} ${emp.lastName}`;
      analysis.push(`Vesting über 4 Jahre mit 1-Jahr-Cliff (§ Golden Handcuffs): erst nach 12 Monaten vestet der erste Teil, dann linear. Bindung ohne Gehaltssprung — der unverdiente Teil verfällt bei Abgang zurück in den Pool.`);
      analysis.push(`Zufriedenheit steigt, das Kündigungsrisiko sinkt — besonders wirksam bei Schlüsselpersonen, deren Abgang Wissen und Velocity kostet.`);
      break;
    }
    case 'DISTRIBUTE_DIVIDEND': {
      recordResolution(state, 'dividende', `Gewinnausschüttung ${fmt(action.amount)}`);
      schedule(state, 0, `Dividende W${week}`, decisionId, { kind: 'DIVIDEND_PAYOUT', amount: action.amount });
      const ceoCut = action.amount * state.ceo.equityShare;
      summary = `Gewinnausschüttung ${fmt(action.amount)} beschlossen`;
      analysis.push('Die Dividende fließt diese Woche ab (Finanzierungs-Cashflow) und mindert die Gewinnrücklage — der Runway sinkt entsprechend.');
      analysis.push(`Auf deinen Anteil (${(state.ceo.equityShare * 100).toFixed(1)} %) entfallen ~${fmt(ceoCut)} vor Kapitalertragsteuer. Investoren sehen Rendite — aber ausgeschüttetes Kapital fehlt fürs Wachstum.`);
      break;
    }
    case 'IPO_SELECT_BANK': {
      const bank = ipoBank(action.bankId);
      state.ipo.status = 'preparing';
      state.ipo.bankId = bank.id;
      state.ipo.preparationStartWeek = week;
      state.ipo.pendingAdhocTopicDe = null;
      schedule(state, 0, `IPO-Vorbereitung W${week}`, decisionId, { kind: 'ONE_OFF_COST', amount: IPO_PREP_COST, labelDe: 'IPO-Vorbereitung: Prospekt, Audit, Kanzlei' });
      summary = `IPO-Mandat an ${bank.name} (Fee ${(bank.feePct * 100).toFixed(1)} %)`;
      analysis.push(`${bank.styleDe} — ${bank.tradeoffDe}`);
      analysis.push(`Vorbereitung dauert ~${IPO_PREP_WEEKS} Wochen (Prospekt, Audit, ${fmt(IPO_PREP_COST)} sofort fällig), danach startet die 3-wöchige Roadshow mit Bookbuilding.`);
      analysis.push('Ab jetzt schaut der Kapitalmarkt zu: Verschieben oder abbrechen kostet Glaubwürdigkeit — nicht nur Geld.');
      break;
    }
    case 'IPO_PRICE': {
      const ipo = state.ipo;
      const ratio = subscriptionRatioFor(state, action.pricePerShare);
      if (ratio < 0.9) {
        // Buch nicht voll: IPO platzt öffentlich — die Gier-Lektion.
        ipo.status = 'withdrawn';
        ipo.bankId = null;
        ipo.bookLow = null;
        ipo.bookHigh = null;
        ipo.roadshowEndsWeek = null;
        ipo.preparationStartWeek = null;
        state.ceo.boardTrust = Math.max(0, state.ceo.boardTrust - 6);
        state.ceo.trustLog.push({ week, delta: -6, reasonDe: 'IPO geplatzt: Zeichnungsbuch bei diesem Preis nicht voll geworden.' });
        state.reputation.investors = Math.max(0, state.reputation.investors - 8);
        state.pressLog.push({ week, tone: 'negative', topicDe: `IPO von ${state.identity.companyName} abgesagt — „Bewertungsvorstellungen nicht durchsetzbar"` });
        summary = `IPO GEPLATZT: Pricing ${action.pricePerShare.toFixed(2)} € fand keine Abnehmer (Zeichnungsquote ${ratio.toFixed(2)}×)`;
        analysis.push('Das Buch war bei diesem Preis nicht voll — die Bank hat den Deal gezogen. Prospektkosten sind versenkt, die Presse schreibt „abgesagt", und der nächste Anlauf wird teurer.');
        analysis.push('Lektion: Der letzte Euro Bewertung ist der teuerste. Ein IPO muss ZEICHNERN Rendite lassen, sonst kommt keiner.');
      } else {
        schedule(state, 0, `IPO-Pricing W${week}`, decisionId, { kind: 'IPO_LISTING', pricePerShare: action.pricePerShare, subscriptionRatio: ratio });
        summary = `IPO gepreist: ${action.pricePerShare.toFixed(2)} €/Aktie (Zeichnungsquote ${ratio.toFixed(2)}×)`;
        analysis.push(`Zeichnungsquote ${ratio.toFixed(2)}× — ${ratio >= 1.3 ? 'deutlich überzeichnet: sichere Platzierung, aber die Erstnotiz wird springen (Geld auf dem Tisch).' : ratio >= 1 ? 'solide gedeckt.' : 'knapp — die Bank stützt, aber die Erstnotiz könnte unter Druck geraten.'}`);
        analysis.push('Listing und Mittelzufluss laufen mit dem Wochenabschluss: Bruttoerlös als Finanzierungs-Cashflow, Bank-Fee als Einmalaufwand, Streubesitz im Cap Table.');
      }
      break;
    }
  }

  const kpis = computeKpis(state);
  const record: DecisionRecord = {
    id: decisionId,
    week,
    action,
    summaryDe: summary,
    hypothesis,
    immediateAnalysisDe: analysis,
    // Leichte Verwaltungs-Aktionen (Termine) laufen NICHT durch die
    // Bewertungs-Pipeline — der Sentinel wird nie fällig.
    evaluateAtWeek: action.type === 'CREATE_APPOINTMENT' ? 9_999_999 : week + 4,
    kpiBaseline: {
      mrr: kpis.values.mrr,
      logoChurnMonthly: kpis.values.logoChurnMonthly,
      netBurnMonthly: kpis.values.netBurnMonthly,
      runwayWeeks: kpis.values.runwayWeeks,
      avgSatisfaction: kpis.values.avgSatisfaction,
      customers: kpis.values.customers,
      ebitdaMonthly: kpis.values.ebitdaMonthly,
      boardTrust: kpis.values.boardTrust,
    },
  };
  state.decisionLog.push(record);
  return record;
}

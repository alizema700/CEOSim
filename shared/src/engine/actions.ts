import { CONSULTANT_FEE, IPO_PREP_COST, IPO_PREP_WEEKS, MA_DD_FEE, type ActionValidation, type PlayerAction } from '../types/actions.js';
import type { CompanyState } from '../types/company.js';
import type { DecisionRecord, Hypothesis } from '../types/evaluation.js';
import type { EffectPayload } from '../types/effects.js';
import { totalMrr, runwayWeeks } from './derive.js';
import { computeKpis, computeValuation } from './kpis.js';
import { acceptanceShare, defendedTakeover, succeedTakeover } from './takeover.js';
import { respondCrisis } from './crisis.js';
import { BOARD_MEETING_COOLDOWN, BOARD_MEETING_ENERGY, holdBoardMeeting } from './governance.js';
import { restQuality } from './ceo.js';
import { respondStrike } from './rivalry.js';
import { doLobby } from './politics.js';
import { LOBBY_COST, LOBBY_LABELS } from '../types/politics.js';
import { buyInsurance, cancelInsurance } from './insurance.js';
import { INSURANCE_SPECS } from '../types/insurance.js';
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
import { FOCUS_POINTS } from '../types/ceo.js';
import { clamp } from '../types/common.js';
import { computeLegacy } from './legacy.js';

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

/** Öffentliche Auftritte (Phase 12): Kosten & Reputationswirkung je Format. */
const PUBLIC_SPECS = {
  interview: { labelDe: 'Medien-Interview', fee: 3_000, energy: 8, press: 4, labor: 2, investors: 1, ceoRep: 4 },
  keynote: { labelDe: 'Konferenz-Keynote', fee: 9_000, energy: 14, press: 7, labor: 5, investors: 3, ceoRep: 7 },
  'thought-leadership': { labelDe: 'Fachbeitrag (Thought Leadership)', fee: 1_500, energy: 6, press: 3, labor: 4, investors: 2, ceoRep: 5 },
} as const;
const COACH_MONTHLY_FEE = 6_000;
const CEO_SKILL_LABELS: Record<string, string> = { finanzen: 'Finanzen', strategie: 'Strategie', leadership: 'Leadership', kommunikation: 'Kommunikation', krisenmanagement: 'Krisenmanagement', governance: 'Governance' };
const FOCUS_LABELS: Record<string, string> = { produkt: 'Produkt', vertrieb: 'Vertrieb', team: 'Team', investoren: 'Investoren', aussenwirkung: 'Außenwirkung' };

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
    case 'SET_CEO_FOCUS': {
      const f = action.focus;
      const vals = [f.produkt, f.vertrieb, f.team, f.investoren, f.aussenwirkung];
      if (vals.some((v) => !Number.isInteger(v) || v < 0 || v > FOCUS_POINTS)) errors.push(`Jeder Bereich: 0..${FOCUS_POINTS} Punkte (ganzzahlig).`);
      const sum = vals.reduce((a, b2) => a + b2, 0);
      if (sum !== FOCUS_POINTS) errors.push(`Genau ${FOCUS_POINTS} Fokuspunkte verteilen (aktuell ${sum}).`);
      if (state.ceo.energy < 25) warnings.push('Bei niedriger Energie verpufft ein zugespitzter Fokus — Erholung wirkt gerade mehr.');
      break;
    }
    case 'CEO_REST': {
      if (state.ceo.energy > 82) warnings.push('Deine Energie ist bereits hoch — eine Auszeit bringt jetzt wenig und kostet sichtbare Präsenz.');
      break;
    }
    case 'CEO_PUBLIC_APPEARANCE': {
      if (state.ceo.energy < 12) errors.push('Zu wenig Energie für einen öffentlichen Auftritt — erst erholen.');
      break;
    }
    case 'HIRE_COACH': {
      if (state.ceo.coach && state.ceo.coach.skill === action.skill) errors.push('Genau dieses Coaching läuft bereits.');
      if (runwayWeeks(state) < 16) warnings.push('Coaching bei knappem Runway ist Luxus — der Aufsichtsrat könnte fragen.');
      break;
    }
    case 'STEP_DOWN': {
      if (state.meta.week < 4) warnings.push('So früh gibt es kaum eine Bilanz — ein Rücktritt jetzt bewertet vor allem den Startzustand.');
      else warnings.push('Endgültig: Mit dem Rücktritt endet die Amtszeit und die Legacy-Bilanz wird festgeschrieben.');
      break;
    }
    case 'TAKEOVER_RESPOND': {
      const t = state.takeover;
      if (t.status === 'none') errors.push('Aktuell gibt es keine Übernahmesituation.');
      if ((action.mode === 'accept' || action.mode === 'negotiate') && t.status !== 'tender') errors.push('Erst mit einem konkreten Übernahmeangebot möglich.');
      if (action.mode === 'poison_pill') {
        if (state.ceo.boardTrust < 45) errors.push('Der Aufsichtsrat trägt eine Giftpille bei diesem Vertrauen (< 45) nicht mit.');
        if (f.cash < 120_000) errors.push('Zu wenig Liquidität für die Abwehrkosten (~120 k€).');
        warnings.push('Giftpillen sichern die Unabhängigkeit, gelten Investoren aber als Entrenchment — die entgangene Prämie wird dir angekreidet.');
      }
      if (action.mode === 'accept') warnings.push('Endgültig: Die Annahme verkauft die Firma und beendet deine Amtszeit — dafür der Höchstpreis auf dein Konto.');
      break;
    }

    case 'CRISIS_RESPOND': {
      if (state.crisis.status !== 'active') errors.push('Aktuell gibt es keine akute Krise.');
      if (action.mode === 'investigate' && f.cash < 80_000) errors.push('Zu wenig Liquidität für eine externe Aufklärung (~80 k€).');
      if (action.mode === 'silent') warnings.push('Schweigen ist ein Vabanquespiel: Der Sturm kann verebben — oder sich ohne Gegenstimme hochschaukeln.');
      if (action.mode === 'defend') warnings.push('Gegenrede trägt nur, wenn die Faktenlage hält. Bei starker Empörung befeuert sie den Sturm.');
      break;
    }

    case 'HOLD_BOARD_MEETING': {
      const since = state.meta.week - state.board.lastMeetingWeek;
      if (since < BOARD_MEETING_COOLDOWN) errors.push(`Zu früh für die nächste Sitzung — noch ${BOARD_MEETING_COOLDOWN - since} Woche(n) Sperre.`);
      if (state.ceo.energy < BOARD_MEETING_ENERGY) errors.push(`Zu wenig Energie (${Math.round(state.ceo.energy)}/100) für eine überzeugende Sitzung.`);
      break;
    }

    case 'CEO_PERSONAL_TIME': {
      if (action.kind === 'network' && f.cash < 4_000) errors.push('Zu wenig Liquidität fürs Netzwerken (~4 k€ für Events/Reisen).');
      break;
    }

    case 'COUNTER_COMPETITOR': {
      if (state.rivalry.status !== 'active') errors.push('Aktuell läuft kein Wettbewerber-Angriff.');
      if (action.mode === 'match' && f.cash < 35_000) errors.push('Zu wenig Liquidität für eine Gegenkampagne (~35 k€).');
      if (action.mode === 'counter' && f.cash < 25_000) errors.push('Zu wenig Liquidität für eine Gegenoffensive (~25 k€).');
      if (action.mode === 'ignore') warnings.push('Aushalten spart Ressourcen — aber ohne Antwort kann der Angriff sich verschärfen.');
      break;
    }

    case 'CEO_INVEST': {
      if (action.amount <= 0) errors.push('Betrag muss positiv sein.');
      if (action.amount > state.ceo.personalNetCash) errors.push(`Dein angespartes Netto-Cash reicht nicht (verfügbar ${fmt(state.ceo.personalNetCash)}).`);
      if (action.instrument === 'angel') warnings.push('Angel-Wetten sind hochriskant: seltene Exits, aber auch Totalausfälle.');
      break;
    }
    case 'CEO_DIVEST': {
      const held = state.ceo.portfolio[action.instrument];
      if (action.amount <= 0) errors.push('Betrag muss positiv sein.');
      if (action.amount > held) errors.push(`So viel ist in diesem Instrument nicht angelegt (aktuell ${fmt(held)}).`);
      break;
    }

    case 'TREASURY_ALLOCATE': {
      if (action.amount <= 0) errors.push('Betrag muss positiv sein.');
      if (action.amount > f.cash) errors.push(`So viel liquide Mittel sind nicht frei (Kasse ${fmt(f.cash)}).`);
      const minCash = f.debt.covenants.find((c) => c.type === 'minCash');
      if (minCash && f.cash - action.amount < minCash.value) warnings.push(`Nach der Anlage unterschreitet die Kasse die Mindestliquidität (${fmt(minCash.value)}) — Covenant-Risiko. Treasury zählt nicht als Runway-Puffer.`);
      else if (action.amount > f.cash * 0.6) warnings.push('Ein großer Teil der Liquidität wandert in die Treasury — sie ist nicht sofort als Runway-Puffer verfügbar.');
      break;
    }
    case 'TREASURY_WITHDRAW': {
      if (action.amount <= 0) errors.push('Betrag muss positiv sein.');
      if (action.amount > f.treasury) errors.push(`So viel ist nicht in der Treasury angelegt (aktuell ${fmt(f.treasury)}).`);
      break;
    }

    case 'TOWNHALL': {
      if (state.ceo.energy < 8) errors.push(`Zu wenig Energie (${Math.round(state.ceo.energy)}/100) für eine überzeugende Betriebsversammlung.`);
      if (action.theme === 'transparenz' && runwayWeeks(state) < 10) warnings.push('Radikale Transparenz bei knappem Runway ist mutig: Ehrlichkeit schafft Vertrauen — kann bei schlechter Lage aber auch verunsichern.');
      break;
    }
    case 'LAUNCH_INITIATIVE': {
      if (action.budget <= 0) errors.push('Budget muss positiv sein.');
      if (action.budget > f.cash) errors.push(`Zu wenig Liquidität für dieses Initiativ-Budget (Kasse ${fmt(f.cash)}).`);
      if (action.budget > 0 && action.budget < 20_000) warnings.push('Unter ~20 k€ ist die Wirkung einer strategischen Initiative gering — Erfolgschance & Hebel sind klein.');
      if (action.budget > f.cash * 0.5) warnings.push('Ein großer Teil der Kasse fließt in eine unsichere Wette — bei Misserfolg ist das Budget verbrannt.');
      break;
    }
    case 'AUSTERITY': {
      if (f.budgetsMonthly.marketing + f.budgetsMonthly.gaOther < 5_000) warnings.push('Die kürzbaren Budgets (Marketing, G&A) sind bereits sehr niedrig — viel Spielraum bleibt nicht.');
      else warnings.push('Ein Sparprogramm verlängert den Runway, dämpft aber Lead-Zufluss und Moral — als Signal an die Belegschaft nicht zu unterschätzen.');
      break;
    }
    case 'KEY_ACCOUNT_OFFENSIVE': {
      if (state.ceo.energy < 7) errors.push(`Zu wenig Energie (${Math.round(state.ceo.energy)}/100) für eine Kunden-Offensive.`);
      if (f.cash < 8_000) errors.push('Zu wenig Liquidität für Reisen & Betreuung (~8 k€).');
      break;
    }
    case 'BRAND_CAMPAIGN': {
      if (action.budget <= 0) errors.push('Budget muss positiv sein.');
      if (action.budget > f.cash) errors.push(`Zu wenig Liquidität für die Kampagne (Kasse ${fmt(f.cash)}).`);
      if (action.budget > 0 && action.budget < 15_000) warnings.push('Unter ~15 k€ verpufft eine Markenkampagne meist — für Sichtbarkeit braucht es Reichweite.');
      break;
    }
    case 'SPECIAL_BONUS': {
      if (action.amount <= 0) errors.push('Bonus-Summe muss positiv sein.');
      if (action.amount > f.cash) errors.push(`Zu wenig Liquidität für den Bonus (Kasse ${fmt(f.cash)}).`);
      if (action.amount > 0 && action.amount < 5_000) warnings.push('Ein sehr kleiner Bonus wirkt eher symbolisch — die Geste zählt, aber der Moral-Effekt ist gering.');
      break;
    }
    case 'STAR_HIRE': {
      if (f.cash < 60_000) errors.push('Zu wenig Liquidität für einen Star-Neuzugang (~60 k€ Signing/Package).');
      if (runwayWeeks(state) < 16) warnings.push('Ein teurer Top-Hire bei knappem Runway ist ein Risiko — der Aufsichtsrat schaut genau hin.');
      break;
    }
    case 'CUSTOMER_ADVISORY_BOARD': {
      if (f.cash < 15_000) errors.push('Zu wenig Liquidität für einen Kundenbeirat (~15 k€ Organisation/Events).');
      break;
    }
    case 'ETHICS_PROGRAM': {
      if (f.cash < 25_000) errors.push('Zu wenig Liquidität für ein Ethik-/Compliance-Programm (~25 k€).');
      break;
    }
    case 'BUY_INSURANCE': {
      if (state.insurance.policies[action.kind]?.active) errors.push(`${INSURANCE_SPECS[action.kind].labelDe} ist bereits abgeschlossen.`);
      if (runwayWeeks(state) < 8) warnings.push('Sehr knapper Runway: Prämien sind laufende Kosten — bei akuter Liquiditätsnot zuerst das Überleben sichern.');
      break;
    }
    case 'CANCEL_INSURANCE': {
      if (!state.insurance.policies[action.kind]?.active) errors.push(`${INSURANCE_SPECS[action.kind].labelDe} ist nicht aktiv.`);
      else warnings.push('Kündigen spart die Prämie — aber ein Schaden trifft dich danach ungedeckt (volles Eigenrisiko).');
      break;
    }

    case 'LOBBY': {
      if (f.cash < LOBBY_COST[action.focus]) errors.push(`Zu wenig Liquidität fürs Lobbying (${fmt(LOBBY_COST[action.focus])}).`);
      if (state.politics.exposure > 55) warnings.push('Hohes Skandal-Risiko: Weiteres aggressives Lobbying kann als Affäre auffliegen (Presse/Investoren).');
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
    case 'SET_CEO_FOCUS': {
      state.ceo.focus = { ...action.focus };
      const strong = (Object.entries(action.focus) as [string, number][]).filter(([, v]) => v > 1).map(([k]) => FOCUS_LABELS[k]);
      const weak = (Object.entries(action.focus) as [string, number][]).filter(([, v]) => v === 0).map(([k]) => FOCUS_LABELS[k]);
      summary = strong.length ? `Wochenfokus: Schwerpunkt ${strong.join(' & ')}` : 'Wochenfokus: ausgeglichen';
      analysis.push('Der Fokus wirkt ab dieser Woche: mehr Punkte = spürbarer Rückenwind (Velocity/Leads/Bindung/Vertrauen/Marke), vernachlässigte Felder bekommen leichten Gegenwind. Ausgeglichen ist neutral und nachhaltig.');
      if (weak.length) analysis.push(`Bewusst vernachlässigt: ${weak.join(', ')} — dort ist mit Gegenwind zu rechnen.`);
      analysis.push('Zugespitzter Fokus zehrt an der Energie; bei niedriger Energie fällt die Wirkung kleiner aus.');
      break;
    }
    case 'CEO_REST': {
      const before = state.ceo.energy;
      const gain = Math.round(28 * restQuality(state)); // Gesundheit & Work-Life bestimmen die Erholung
      state.ceo.energy = Math.min(100, state.ceo.energy + gain);
      if (before > 70) {
        state.ceo.boardTrust = Math.max(0, state.ceo.boardTrust - 1);
        state.ceo.trustLog.push({ week, delta: -1, reasonDe: 'CEO nimmt sich bei hoher Energie eine Auszeit — das Board registriert die Abwesenheit.' });
      }
      summary = `Auszeit genommen — Energie ${Math.round(before)} → ${Math.round(state.ceo.energy)}`;
      analysis.push('Erholung ist kein Nichtstun: Ausgeruht triffst du bessere Entscheidungen, hältst zugespitzten Fokus länger durch und beugst Burnout vor.');
      break;
    }
    case 'CEO_PUBLIC_APPEARANCE': {
      const spec = PUBLIC_SPECS[action.kind];
      schedule(state, 0, `PR-Auftritt W${week}`, decisionId, { kind: 'ONE_OFF_COST', amount: spec.fee, labelDe: `Öffentlicher Auftritt: ${spec.labelDe}` });
      state.ceo.energy = Math.max(0, state.ceo.energy - spec.energy);
      const rng = stream(state.meta.seed, 'ceo-public', week);
      const gaffeProb = clamp(0.28 - state.ceo.skills.kommunikation / 400 - state.ceo.energy / 500, 0.05, 0.4);
      const gaffe = rng() < gaffeProb;
      if (gaffe) {
        const hit = Math.round(spec.press * 0.8);
        state.reputation.press = clamp(state.reputation.press - hit, 0, 100);
        state.ceo.reputation = clamp(state.ceo.reputation - 4, 0, 100);
        state.ceo.publicLog.push({ week, kindDe: spec.labelDe, outcomeDe: 'Fettnäpfchen', reputationDelta: -hit });
        summary = `${spec.labelDe} ging daneben — die Presse zitiert die falschen Sätze`;
        analysis.push('Ein unglücklicher Auftritt: Ohne Vorbereitung und Kommunikationsstärke wird aus Sichtbarkeit ein Bumerang — die Reputation leidet.');
      } else {
        state.reputation.press = clamp(state.reputation.press + spec.press, 0, 100);
        state.reputation.laborMarket = clamp(state.reputation.laborMarket + spec.labor, 0, 100);
        state.reputation.investors = clamp(state.reputation.investors + spec.investors, 0, 100);
        state.ceo.reputation = clamp(state.ceo.reputation + spec.ceoRep, 0, 100);
        state.ceo.publicLog.push({ week, kindDe: spec.labelDe, outcomeDe: 'gelungen', reputationDelta: spec.press });
        summary = `${spec.labelDe}: die CEO-Marke wächst`;
        analysis.push('Sichtbarkeit zahlt auf mehrere Konten ein: Presse, Arbeitgebermarke (zieht Talent an) und Investoren-Wahrnehmung. Der Effekt ist weich, aber real — und kostet Energie.');
      }
      break;
    }
    case 'HIRE_COACH': {
      const prev = state.ceo.coach;
      state.ceo.coach = { skill: action.skill, sinceWeek: week, monthlyFee: COACH_MONTHLY_FEE };
      summary = `Executive-Coaching: Schwerpunkt ${CEO_SKILL_LABELS[action.skill]}`;
      analysis.push(`Ein Coach hebt „${CEO_SKILL_LABELS[action.skill]}" langsam über die Wochen und stärkt deine Energie-Resilienz. Laufende Kosten ~${fmt(COACH_MONTHLY_FEE)}/Monat (G&A).`);
      if (prev) analysis.push(`Wechsel vom bisherigen Schwerpunkt „${CEO_SKILL_LABELS[prev.skill]}".`);
      break;
    }
    case 'STEP_DOWN': {
      const legacy = computeLegacy(state);
      state.meta.status = 'retired';
      state.meta.endReasonDe = `Rücktritt nach ${week} Wochen — „${legacy.titleDe}" (Legacy-Score ${legacy.overall}/100, Note ${legacy.grade}). Die Amtszeit-Bilanz liegt vor.`;
      summary = `Amtsende: Rücktritt als CEO nach ${week} Wochen`;
      analysis.push('Du schließt deine Amtszeit selbst ab. Die vollständige Amtszeit-Bilanz bewertet Unternehmenswert, Kapitaleffizienz, Kunden, Menschen, Governance und dein persönliches Erbe.');
      break;
    }
    case 'TAKEOVER_RESPOND': {
      const t = state.takeover;
      const takeoverOcc: Occurrence[] = [];
      if (action.mode === 'accept') {
        t.defensesUsed.push('Angebot angenommen');
        succeedTakeover(state, takeoverOcc);
        summary = `Übernahmeangebot von ${t.bidderName} angenommen — Exit`;
        analysis.push('Ein Verkauf zum Höchstpreis ist keine Niederlage: Für die Eigentümer (und dich) ist die Prämie oft mehr wert als der unsichere Alleingang.');
      } else if (action.mode === 'negotiate') {
        const gain = clamp(0.04 + (state.ceo.skills.kommunikation + state.ceo.skills.strategie) / 2000, 0.04, 0.14);
        const before = t.premiumPct;
        t.premiumPct = Math.round((t.premiumPct + gain) * 100) / 100;
        if (t.premiumPct > 0.62) {
          defendedTakeover(state, takeoverOcc, `${t.bidderName} lehnt die überzogene Nachforderung ab und zieht sich zurück.`);
          summary = `Nachverhandlung überreizt — ${t.bidderName} springt ab`;
          analysis.push('Zu hart gepokert: Der Bieter zieht sich zurück. Die Firma bleibt unabhängig — aber der Wert-Aufschlag ist vom Tisch.');
        } else {
          t.offerValue = Math.round(computeValuation(state).value * (1 + t.premiumPct));
          if (t.deadlineWeek !== null) t.deadlineWeek += 1;
          t.defensesUsed.push(`Nachverhandelt auf +${(t.premiumPct * 100).toFixed(0)} %`);
          summary = `Angebot hochverhandelt: +${(before * 100).toFixed(0)} % → +${(t.premiumPct * 100).toFixed(0)} % Prämie`;
          analysis.push(`Wertmaximierung: Prämie von +${(before * 100).toFixed(0)} % auf +${(t.premiumPct * 100).toFixed(0)} % gehoben (${fmt(t.offerValue)}). Jetzt kannst du zum besseren Preis annehmen — oder weiter verteidigen.`);
        }
      } else if (action.mode === 'poison_pill') {
        schedule(state, 0, `Übernahmeabwehr W${week}`, decisionId, { kind: 'ONE_OFF_COST', amount: 120_000, labelDe: 'Übernahmeabwehr: Investmentbank & Kanzlei (Giftpille)' });
        state.ceo.boardTrust = Math.max(0, state.ceo.boardTrust - 4);
        state.reputation.investors = clamp(state.reputation.investors - 8, 0, 100);
        t.defensesUsed.push('Giftpille (Poison Pill)');
        defendedTakeover(state, takeoverOcc, 'Die Giftpille verwässert den Angreifer und macht die Übernahme prohibitiv teuer — der Bieter gibt auf.');
        summary = `Giftpille gezündet — ${t.bidderName} abgewehrt`;
        analysis.push('Die Giftpille rettet die Unabhängigkeit, gilt Investoren aber als Entrenchment: Ihnen entgeht die Prämie (−8 Investoren-Reputation, −4 Board-Vertrauen, 120 k€ Abwehrkosten).');
      } else {
        const resist = clamp((state.ceo.boardTrust - 50) / 100 + state.ceo.reputation / 300 + state.ceo.skills.kommunikation / 400, 0, 0.35);
        t.defenseResistance += resist;
        t.defensesUsed.push('Aktionäre überzeugt');
        const acc = acceptanceShare(state, t.premiumPct, t.defenseResistance);
        if (acc <= 0.5) {
          defendedTakeover(state, takeoverOcc, 'Die Aktionäre folgen deiner Standalone-Story und lehnen das Angebot ab.');
          summary = `Aktionäre überzeugt — ${t.bidderName} abgewehrt`;
          analysis.push('Deine Glaubwürdigkeit (Board-Vertrauen, CEO-Marke, Kommunikation) trägt: Die Eigentümer glauben an mehr Wert im Alleingang.');
        } else {
          summary = `Überzeugungsarbeit — aber der Druck bleibt (${(acc * 100).toFixed(0)} % würden annehmen)`;
          analysis.push(`Es reicht noch nicht: ${(acc * 100).toFixed(0)} % der Anteile würden das Angebot annehmen (> 50 % = Übernahme). Nachverhandeln, Giftpille — oder annehmen.`);
        }
      }
      for (const o of takeoverOcc) analysis.push(`${o.icon} ${o.textDe}`);
      break;
    }
    case 'CRISIS_RESPOND': {
      const crisisOcc: Occurrence[] = [];
      const headline = state.crisis.headlineDe;
      respondCrisis(state, action.mode, crisisOcc);
      const modeLabel = action.mode === 'apologize' ? 'Entschuldigung' : action.mode === 'defend' ? 'Gegenrede' : action.mode === 'silent' ? 'Kein Kommentar' : 'Transparente Aufklärung';
      summary = `Krise „${headline}": ${modeLabel}`;
      analysis.push('Krisenreaktionen wirken über deine CEO-Marke, Kommunikation und den Board-Rückhalt — je glaubwürdiger die Führung, desto stärker die Deeskalation.');
      if (state.crisis.status === 'none') analysis.push('Der Sturm ist abgeklungen — die öffentliche Aufmerksamkeit wandert weiter.');
      else analysis.push(`Der Sturm läuft weiter (Schwere ${Math.round(state.crisis.severity)}/100, Stufe ${state.crisis.stage}). Dranbleiben — eine einzelne Reaktion beendet ihn selten.`);
      for (const o of crisisOcc) analysis.push(`${o.icon} ${o.textDe}`);
      break;
    }
    case 'HOLD_BOARD_MEETING': {
      const rec = holdBoardMeeting(state, action.approach);
      state.board.lastMeeting = rec;
      state.board.lastMeetingWeek = week;
      state.ceo.boardTrust = clamp(state.ceo.boardTrust + rec.trustDelta, 0, 100);
      state.ceo.energy = Math.max(0, state.ceo.energy - BOARD_MEETING_ENERGY);
      summary = `Vorstandssitzung (${rec.approachDe}): Board-Vertrauen ${rec.trustDelta >= 0 ? '+' : ''}${rec.trustDelta}`;
      analysis.push(`Ansprache-Stil „${rec.approachDe}" — die Sitze reagieren nach Passung zu ihrem Mandat. Board-Vertrauen ${rec.trustDelta >= 0 ? '+' : ''}${rec.trustDelta}, Energie −${BOARD_MEETING_ENERGY}.`);
      for (const r of rec.reactions) analysis.push(`${r.name} (${r.affiliationDe}): ${r.moodDe} (${r.delta >= 0 ? '+' : ''}${r.delta}).`);
      break;
    }
    case 'CEO_PERSONAL_TIME': {
      const p = state.ceo.personal;
      if (action.kind === 'sport') {
        p.health = clamp(p.health + 14, 0, 100);
        summary = `Privatzeit: Sport & Gesundheit — Gesundheit ${Math.round(p.health)}/100`;
        analysis.push('Bewegung und Schlaf zahlen sich aus: Gesundheit hebt die Wirkung deiner Auszeiten (mehr Energie pro Erholung) und beugt Burnout vor.');
      } else if (action.kind === 'family') {
        p.workLife = clamp(p.workLife + 16, 0, 100);
        summary = `Privatzeit: Familie & Freunde — Work-Life ${Math.round(p.workLife)}/100`;
        analysis.push('Zeit mit den Menschen, die zählen: Eine bessere Work-Life-Balance macht Erholung wirksamer und hält dich über die lange Amtszeit stabil.');
      } else {
        schedule(state, 0, `Netzwerken W${week}`, decisionId, { kind: 'ONE_OFF_COST', amount: 4_000, labelDe: 'Netzwerk-Events & Reisen (CEO)' });
        p.network = clamp(p.network + 14, 0, 100);
        state.reputation.laborMarket = clamp(state.reputation.laborMarket + 1, 0, 100);
        // Ab starkem Netzwerk öffnet sich einmalig ein Mentor.
        if (p.mentorDe === null && p.network >= 62) {
          const rng = stream(state.meta.seed, 'ceo-mentor', week);
          const mentors = ['einer erfahrenen Ex-Vorständin', 'einem seriellen Gründer', 'einer Aufsichtsrats-Veteranin'];
          p.mentorDe = mentors[Math.floor(rng() * mentors.length)] ?? mentors[0]!;
          state.ceo.skills.strategie = clamp(state.ceo.skills.strategie + 3, 0, 100);
          analysis.push(`Aus dem Netzwerk wird ein Mentor: Du gewinnst ${p.mentorDe} als Sparringspartner (+Strategie).`);
        }
        summary = `Privatzeit: Netzwerk pflegen — Netzwerk ${Math.round(p.network)}/100`;
        analysis.push('Beziehungen sind Türöffner: Ein starkes Netzwerk bringt Talent, Kapitalzugänge und Rat — und senkt das Risiko von Fettnäpfchen bei öffentlichen Auftritten.');
      }
      break;
    }

    // ── Strategische CEO-Züge (Phase 22, C1) ─────────────────────────
    case 'TOWNHALL': {
      state.ceo.energy = Math.max(0, state.ceo.energy - 8);
      schedule(state, 0, `Townhall W${week}`, decisionId, { kind: 'ONE_OFF_COST', amount: 5_000, labelDe: 'Betriebsversammlung: Organisation & Catering' });
      const komm = state.ceo.skills.kommunikation ?? 50;
      const lead = state.ceo.skills.leadership ?? 50;
      const eff = 0.6 + komm / 250; // 0,6..1,0
      if (action.theme === 'motivation') {
        schedule(state, 0, `Townhall-Moral W${week}`, decisionId, { kind: 'SATISFACTION_DELTA', dept: 'all', amount: Math.round(8 * eff) });
        state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'attritionRisk', factor: 0.85, startWeek: week, endWeek: week + 4, sourceDe: 'Townhall: Motivation' });
        summary = 'Townhall (Motivation): die Belegschaft zieht wieder an einem Strang';
        analysis.push(`Eine mitreißende Ansprache hebt Zufriedenheit und senkt kurzfristig die Kündigungsneigung. Wirkung skaliert mit deiner Kommunikationsstärke (${Math.round(komm)}/100).`);
      } else if (action.theme === 'strategie') {
        const vf = 1 + 0.08 * eff;
        state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'velocity', factor: vf, startWeek: week, endWeek: week + 4, sourceDe: 'Townhall: Strategie' });
        schedule(state, 0, `Townhall-Fokus W${week}`, decisionId, { kind: 'SATISFACTION_DELTA', dept: 'all', amount: Math.round(3 * eff) });
        summary = 'Townhall (Strategie): klare Richtung, mehr Fokus im Team';
        analysis.push(`Ein klares „Warum" richtet die Kräfte aus — Engineering-Velocity +${Math.round((vf - 1) * 100)} % für ~4 Wochen (skaliert mit Leadership ${Math.round(lead)}/100).`);
      } else {
        state.reputation.laborMarket = clamp(state.reputation.laborMarket + Math.round(5 * eff), 0, 100);
        schedule(state, 0, `Townhall-Transparenz W${week}`, decisionId, { kind: 'SATISFACTION_DELTA', dept: 'all', amount: Math.round(4 * eff) });
        state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'attritionRisk', factor: 0.9, startWeek: week, endWeek: week + 4, sourceDe: 'Townhall: Transparenz' });
        summary = 'Townhall (Transparenz): offene Zahlen, mehr Vertrauen';
        analysis.push('Radikale Offenheit über Lage und Ziele zahlt auf Vertrauen und Arbeitgebermarke ein — die Bindung steigt, das Team trägt harte Entscheidungen eher mit.');
      }
      break;
    }
    case 'LAUNCH_INITIATIVE': {
      schedule(state, 0, `Initiative W${week}`, decisionId, { kind: 'ONE_OFF_COST', amount: action.budget, labelDe: `Strategische Initiative: ${action.focus}` });
      const strat = state.ceo.skills.strategie ?? 50;
      const successProb = clamp(0.35 + strat / 220 + Math.min(action.budget, 300_000) / 1_500_000, 0.3, 0.85);
      const rng = stream(state.meta.seed, 'ceo-initiative', week);
      const success = rng() < successProb;
      const focusLabel = action.focus === 'produkt' ? 'Produkt-Offensive' : action.focus === 'markt' ? 'Markt-Expansion' : 'Effizienz-Programm';
      if (success) {
        if (action.focus === 'produkt') {
          state.product.nps = clamp(state.product.nps + 8, -100, 100);
          state.product.techDebt = clamp(state.product.techDebt - 6, 0, 100);
        } else if (action.focus === 'markt') {
          state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'demandIndex', factor: 1.12, startWeek: week, endWeek: week + 8, sourceDe: 'Initiative: Markt-Expansion' });
          state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'leadGen', factor: 1.1, startWeek: week, endWeek: week + 8, sourceDe: 'Initiative: Markt-Expansion' });
        } else {
          state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'velocity', factor: 1.12, startWeek: week, endWeek: week + 8, sourceDe: 'Initiative: Effizienz' });
          state.product.techDebt = clamp(state.product.techDebt - 8, 0, 100);
        }
        summary = `Strategische Initiative „${focusLabel}" zahlt sich aus`;
        analysis.push(`Die Wette geht auf (Erfolgschance war ~${Math.round(successProb * 100)} %, skaliert mit Strategie ${Math.round(strat)}/100 & Budget). Der Effekt wirkt über die nächsten Wochen.`);
      } else {
        if (action.focus === 'produkt') state.product.nps = clamp(state.product.nps - 2, -100, 100);
        else schedule(state, 0, `Initiative-Nachwehen W${week}`, decisionId, { kind: 'SATISFACTION_DELTA', dept: 'all', amount: -2 });
        summary = `Strategische Initiative „${focusLabel}" floppt — Budget verbrannt`;
        analysis.push(`Die Wette geht nicht auf: Das Budget von ${fmt(action.budget)} ist ausgegeben, der erhoffte Hebel bleibt aus. Größeres Budget und mehr Strategie-Kompetenz heben die Erfolgschance.`);
      }
      break;
    }
    case 'AUSTERITY': {
      const fin = state.finance;
      const cut = action.intensity === 'mild' ? 0.8 : 0.6;
      const savedM = Math.round(fin.budgetsMonthly.marketing * (1 - cut));
      const savedG = Math.round(fin.budgetsMonthly.gaOther * (1 - cut));
      fin.budgetsMonthly.marketing = Math.round(fin.budgetsMonthly.marketing * cut);
      fin.budgetsMonthly.gaOther = Math.round(fin.budgetsMonthly.gaOther * cut);
      schedule(state, 0, `Sparprogramm W${week}`, decisionId, { kind: 'SATISFACTION_DELTA', dept: 'all', amount: action.intensity === 'mild' ? -3 : -6 });
      state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'attritionRisk', factor: action.intensity === 'mild' ? 1.08 : 1.18, startWeek: week, endWeek: week + 4, sourceDe: 'Sparprogramm' });
      summary = `Sparprogramm (${action.intensity === 'mild' ? 'moderat' : 'hart'}): Budgets gekürzt, Runway verlängert`;
      analysis.push(`Marketing & G&A gekürzt (−${fmt((savedM + savedG))}/Monat). Der Runway steigt, aber weniger Marketing bremst den Lead-Zufluss und das Sparsignal drückt die Moral. Budgets später wieder unter „Entscheidungen" hochsetzen.`);
      break;
    }
    case 'KEY_ACCOUNT_OFFENSIVE': {
      state.ceo.energy = Math.max(0, state.ceo.energy - 7);
      schedule(state, 0, `Key-Accounts W${week}`, decisionId, { kind: 'ONE_OFF_COST', amount: 8_000, labelDe: 'Key-Account-Betreuung: Reisen & Events' });
      const komm = state.ceo.skills.kommunikation ?? 50;
      const lead = state.ceo.skills.leadership ?? 50;
      const eff = 0.6 + (komm + lead) / 500;
      state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'churnMonthly', factor: clamp(1 - 0.15 * eff, 0.8, 0.97), startWeek: week, endWeek: week + 4, sourceDe: 'Key-Account-Offensive' });
      state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'expansionMonthly', factor: 1 + 0.06 * eff, startWeek: week, endWeek: week + 4, sourceDe: 'Key-Account-Offensive' });
      summary = 'Key-Account-Offensive: Top-Kunden persönlich betreut';
      analysis.push(`Chefsache Kundenbindung: Persönliche Betreuung senkt den Churn und öffnet Upsell-Türen bei den größten Accounts (~4 Wochen). Wirkung skaliert mit Kommunikation & Leadership (${Math.round((komm + lead) / 2)}/100).`);
      break;
    }
    case 'BRAND_CAMPAIGN': {
      schedule(state, 0, `Markenkampagne W${week}`, decisionId, { kind: 'ONE_OFF_COST', amount: action.budget, labelDe: 'Markenkampagne (PR & Reichweite)' });
      const intensity = clamp(action.budget / 150_000, 0.3, 1.2);
      state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'leadGen', factor: 1 + 0.15 * intensity, startWeek: week, endWeek: week + 6, sourceDe: 'Markenkampagne' });
      state.reputation.press = clamp(state.reputation.press + Math.round(4 * intensity), 0, 100);
      state.reputation.laborMarket = clamp(state.reputation.laborMarket + Math.round(2 * intensity), 0, 100);
      summary = `Markenkampagne gestartet (${fmt(action.budget)}) — mehr Sichtbarkeit & Leads`;
      analysis.push(`Ein einmaliger Reichweiten-Push hebt den Lead-Zufluss (+${Math.round(15 * intensity)} % für ~6 Wochen) und die Presse-/Arbeitgeber-Wahrnehmung. Anders als das laufende Marketing-Budget wirkt die Kampagne als Welle.`);
      break;
    }
    case 'SPECIAL_BONUS': {
      schedule(state, 0, `Sonderbonus W${week}`, decisionId, { kind: 'ONE_OFF_COST', amount: action.amount, labelDe: 'Sonderbonus an die Belegschaft' });
      const headcount = Math.max(1, state.people.employees.length);
      const perHead = action.amount / headcount;
      const boost = Math.round(clamp((perHead / 1000) * 3, 3, 14));
      schedule(state, 0, `Bonus-Moral W${week}`, decisionId, { kind: 'SATISFACTION_DELTA', dept: 'all', amount: boost });
      state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'attritionRisk', factor: 0.85, startWeek: week, endWeek: week + 4, sourceDe: 'Sonderbonus' });
      summary = `Sonderbonus (${fmt(action.amount)}) — Zufriedenheit +${boost}`;
      analysis.push(`~${fmt(perHead)} pro Kopf: Ein sichtbares Dankeschön hebt die Zufriedenheit spürbar und senkt kurzfristig die Kündigungsneigung. Wirkung pro Kopf zählt — bei großer Belegschaft braucht es entsprechend mehr.`);
      break;
    }
    case 'STAR_HIRE': {
      schedule(state, 0, `Star-Hire W${week}`, decisionId, { kind: 'ONE_OFF_COST', amount: 60_000, labelDe: `Star-Neuzugang (${deptDe(action.dept)}): Signing & Package` });
      const deptLabel = deptDe(action.dept);
      if (action.dept === 'engineering') {
        state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'velocity', factor: 1.1, startWeek: week, endWeek: week + 8, sourceDe: `Star-Neuzugang (${deptLabel})` });
      } else if (action.dept === 'sales') {
        state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'leadGen', factor: 1.08, startWeek: week, endWeek: week + 8, sourceDe: `Star-Neuzugang (${deptLabel})` });
        state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'trialWinRate', factor: 1.05, startWeek: week, endWeek: week + 8, sourceDe: `Star-Neuzugang (${deptLabel})` });
      } else {
        state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'leadGen', factor: 1.12, startWeek: week, endWeek: week + 8, sourceDe: `Star-Neuzugang (${deptLabel})` });
      }
      state.reputation.laborMarket = clamp(state.reputation.laborMarket + 3, 0, 100);
      summary = `Star-Neuzugang für ${deptLabel} gewonnen`;
      analysis.push(`Ein prägender Kopf hebt die Schlagkraft in ${deptLabel} für ~8 Wochen und strahlt auf die Arbeitgebermarke aus (Talent zieht Talent an). Das Package kostet 60 k€ — die Wirkung ist real, aber endlich.`);
      break;
    }
    case 'CUSTOMER_ADVISORY_BOARD': {
      schedule(state, 0, `Kundenbeirat W${week}`, decisionId, { kind: 'ONE_OFF_COST', amount: 15_000, labelDe: 'Kundenbeirat: Organisation & Events' });
      state.product.nps = clamp(state.product.nps + 5, -100, 100);
      state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'churnMonthly', factor: 0.92, startWeek: week, endWeek: week + 8, sourceDe: 'Kundenbeirat' });
      state.activeModifiers.push({ id: nextId(state, 'mod'), target: 'expansionMonthly', factor: 1.05, startWeek: week, endWeek: week + 8, sourceDe: 'Kundenbeirat' });
      summary = 'Kundenbeirat eingerichtet — engere Bindung, klareres Produkt';
      analysis.push('Die wichtigsten Kunden am Tisch: Der Beirat schärft die Roadmap (NPS +5), senkt den Churn und öffnet Expansionschancen über die nächsten ~8 Wochen. Kundennähe als Chefsache.');
      break;
    }
    case 'ETHICS_PROGRAM': {
      schedule(state, 0, `Ethik-Programm W${week}`, decisionId, { kind: 'ONE_OFF_COST', amount: 25_000, labelDe: 'Ethik- & Compliance-Programm' });
      const pol = state.politics;
      pol.regulatoryPressure = clamp(pol.regulatoryPressure - 12, 0, 100);
      pol.exposure = clamp(pol.exposure - 10, 0, 100);
      schedule(state, 0, `Integrität W${week}`, decisionId, { kind: 'SATISFACTION_DELTA', dept: 'all', amount: 2 });
      state.reputation.laborMarket = clamp(state.reputation.laborMarket + 2, 0, 100);
      summary = 'Ethik- & Compliance-Programm aufgesetzt — weniger Angriffsfläche';
      analysis.push('Integrität als System: Klare Regeln und Schulungen senken den Regulierungsdruck und das Skandal-Risiko (Lobby-Exposure) — die beste Verteidigung gegen Auflagen und Affären. Zahlt zudem auf die Arbeitgebermarke ein.');
      break;
    }
    case 'BUY_INSURANCE': {
      const spec = INSURANCE_SPECS[action.kind];
      buyInsurance(state, action.kind);
      summary = `Police abgeschlossen: ${spec.labelDe} (${fmt(spec.monthlyPremium)}/Monat)`;
      analysis.push(`${spec.shortDe} Deckung ${(spec.coverage * 100).toFixed(0)} % je Schaden bis ${fmt(spec.capPerClaim)}. Die Prämie läuft als G&A-Kosten — im Schadensfall (v. a. bei aufgedeckten Skandalen/Bußgeldern und behördlichen Auflagen) übernimmt die Police einen Teil.`);
      analysis.push('Versicherung ist gekaufte Ruhe: Du zahlst sicher wenig, um im Ernstfall nicht viel zu verlieren — der Wert zeigt sich erst, wenn es kracht.');
      break;
    }
    case 'CANCEL_INSURANCE': {
      const spec = INSURANCE_SPECS[action.kind];
      cancelInsurance(state, action.kind);
      summary = `Police gekündigt: ${spec.labelDe} — Prämie gespart`;
      analysis.push('Die laufende Prämie entfällt. Ab sofort trägst du Schäden dieser Art wieder voll selbst — kalkuliere das Restrisiko bewusst.');
      break;
    }
    case 'COUNTER_COMPETITOR': {
      const strikeOcc: Occurrence[] = [];
      const attacker = state.rivalry.attackerName;
      const modeLabel = action.mode === 'match' ? 'Mitgehen' : action.mode === 'differentiate' ? 'Differenzieren' : action.mode === 'ignore' ? 'Aushalten' : 'Gegenoffensive';
      respondStrike(state, action.mode, strikeOcc);
      summary = `Wettbewerber-Angriff (${attacker}): ${modeLabel}`;
      analysis.push('Die Wirkung deines Konters hängt an Strategie & Vertrieb des CEO — und beim Differenzieren an der echten Produktstärke (NPS, wenig Tech-Debt).');
      if (state.rivalry.status === 'none') analysis.push('Der Angriff ist abgewehrt — der Druck lässt nach.');
      else analysis.push(`Der Angriff läuft weiter (Intensität ${Math.round(state.rivalry.intensity)}/100). Dranbleiben — ein einzelner Zug beendet ihn selten.`);
      for (const o of strikeOcc) analysis.push(`${o.icon} ${o.textDe}`);
      break;
    }
    case 'CEO_INVEST': {
      const labels = { geldmarkt: 'Geldmarkt', aktienindex: 'Aktienindex', angel: 'Angel-Portfolio' };
      state.ceo.personalNetCash -= action.amount;
      state.ceo.portfolio[action.instrument] += action.amount;
      summary = `Privatanlage: ${fmt(action.amount)} in ${labels[action.instrument]}`;
      analysis.push(action.instrument === 'geldmarkt' ? 'Geldmarkt ist sicher und folgt dem Leitzins — parkt Liquidität, wenn die Zinsen hoch sind.' : action.instrument === 'aktienindex' ? 'Der Aktienindex folgt dem Kapitalmarkt: im Bullenmarkt Rendite, im Bärenmarkt Verluste — mit Schwankung.' : 'Angel-Wetten sind hochriskant: die meisten Beteiligungen bringen wenig, seltene Exits vervielfachen sich, Ausfälle halbieren.');
      analysis.push('Dein Privatvermögen ist getrennt vom Firmenkonto — Anlageerfolg zahlt aufs persönliche Netto ein, nicht in die Firma.');
      break;
    }
    case 'CEO_DIVEST': {
      const labels = { geldmarkt: 'Geldmarkt', aktienindex: 'Aktienindex', angel: 'Angel-Portfolio' };
      state.ceo.portfolio[action.instrument] -= action.amount;
      state.ceo.personalNetCash += action.amount;
      summary = `Ausstieg: ${fmt(action.amount)} aus ${labels[action.instrument]} realisiert`;
      analysis.push('Der aktuelle Marktwert fließt auf dein Netto-Cash zurück — Gewinne (oder Verluste) sind damit realisiert.');
      break;
    }
    case 'TREASURY_ALLOCATE': {
      schedule(state, 0, `Treasury-Anlage W${week}`, decisionId, { kind: 'TREASURY_ALLOCATE', amount: action.amount });
      summary = `Treasury-Anlage: ${fmt(action.amount)} in den Geldmarkt`;
      analysis.push(`Die Firmen-Liquidität wandert zum Wochenschluss in die Geldmarkt-Treasury und verzinst sich mit dem Leitzins (${state.macro.interestRatePct.toFixed(1)} % p. a.). Der Zinsertrag hebt das Ergebnis.`);
      analysis.push('Wichtig: Treasury ist eine eigene Aktiva-Klasse und zählt NICHT als Runway-Puffer — bei Zinsschocks (steigenden Zinsen) steigt der Ertrag, aber die angelegten Mittel fehlen kurzfristig im Cash.');
      break;
    }
    case 'TREASURY_WITHDRAW': {
      schedule(state, 0, `Treasury-Auflösung W${week}`, decisionId, { kind: 'TREASURY_WITHDRAW', amount: action.amount });
      summary = `Treasury-Auflösung: ${fmt(action.amount)} zurück aufs Firmenkonto`;
      analysis.push('Die aufgelöste Anlage fließt zum Wochenschluss zurück in die Kasse und steht wieder als Liquidität/Runway zur Verfügung.');
      break;
    }
    case 'LOBBY': {
      const lobbyOcc: Occurrence[] = [];
      const res = doLobby(state, action.focus, lobbyOcc, decisionId);
      summary = res.summaryDe;
      analysis.push(`Lobbying-Schwerpunkt „${LOBBY_LABELS[action.focus]}". Politisches Kapital wächst mit deiner Governance-Kompetenz und schaltet ab Schwellen echte Vorteile frei — gegen ein steigendes Skandal-Risiko.`);
      for (const n of res.notesDe) analysis.push(n);
      for (const o of lobbyOcc) analysis.push(`${o.icon} ${o.textDe}`);
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
    evaluateAtWeek: action.type === 'CREATE_APPOINTMENT' || action.type === 'STEP_DOWN' || action.type === 'TAKEOVER_RESPOND' || action.type === 'CRISIS_RESPOND' || action.type === 'HOLD_BOARD_MEETING' || action.type === 'CEO_PERSONAL_TIME' || action.type === 'COUNTER_COMPETITOR' || action.type === 'CEO_INVEST' || action.type === 'CEO_DIVEST' || action.type === 'TREASURY_ALLOCATE' || action.type === 'TREASURY_WITHDRAW' || action.type === 'TOWNHALL' || action.type === 'AUSTERITY' || action.type === 'KEY_ACCOUNT_OFFENSIVE' || action.type === 'SPECIAL_BONUS' || action.type === 'STAR_HIRE' || action.type === 'CUSTOMER_ADVISORY_BOARD' || action.type === 'ETHICS_PROGRAM' || action.type === 'BUY_INSURANCE' || action.type === 'CANCEL_INSURANCE' || action.type === 'LOBBY' ? 9_999_999 : week + 4,
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

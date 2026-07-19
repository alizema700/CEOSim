import { CONSULTANT_FEE, MA_DD_FEE, type ActionValidation, type PlayerAction } from '../types/actions.js';
import type { CompanyState } from '../types/company.js';
import type { DecisionRecord, Hypothesis } from '../types/evaluation.js';
import type { EffectPayload } from '../types/effects.js';
import { totalMrr, runwayWeeks } from './derive.js';
import { computeKpis } from './kpis.js';
import { deptDe, nextId, schedule as scheduleFx } from './stateHelpers.js';
import { resolveEventOption } from './eventsDeck.js';
import { executeDelegation } from './comms.js';
import { clampClassification, startProject } from './projects.js';
import { buildRound, generateTermSheets, validateTermSheet, validateVentureDebt, applyVentureDebtTerms } from './funding.js';
import { maTarget } from './ma.js';

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
      const baseFill = { junior: 5, mid: 7, senior: 10, lead: 13 }[action.seniority];
      const repFactor = 1 + (55 - state.reputation.laborMarket) / 100;
      state.people.openRequisitions.push({
        id: nextId(state, 'req'),
        dept: action.dept,
        seniority: action.seniority,
        count: action.count,
        openedWeek: week,
        expectedWeeksToFill: Math.max(2, Math.round(baseFill * repFactor)),
        costPerHire: action.seniority === 'lead' ? 18_000 : action.seniority === 'senior' ? 12_000 : 7_000,
      });
      summary = `${action.count}× ${action.seniority} in ${deptDe(action.dept)} ausgeschrieben`;
      analysis.push(`Time-to-Fill ≈ ${Math.max(2, Math.round(baseFill * repFactor))} Wochen (Arbeitsmarkt-Reputation ${state.reputation.laborMarket}/100 wirkt als Faktor ${repFactor.toFixed(2)}).`);
      analysis.push('Kosten entstehen erst bei Besetzung: Recruiting-Fee einmalig, danach laufende Payroll mit ~6 Wochen Einarbeitung (50 % Produktivität).');
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
  }

  const kpis = computeKpis(state);
  const record: DecisionRecord = {
    id: decisionId,
    week,
    action,
    summaryDe: summary,
    hypothesis,
    immediateAnalysisDe: analysis,
    evaluateAtWeek: week + 4,
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

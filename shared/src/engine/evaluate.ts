import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { DecisionRecord, Evaluation, Grade } from '../types/evaluation.js';
import type { KpiId } from '../types/kpi.js';
import { computeKpis } from './kpis.js';
import { nextId } from './stateHelpers.js';
import { findPrecedents } from './precedents.js';

/**
 * Outcome-Bewertung einer Entscheidung (fällig 4 Wochen nach der Entscheidung).
 *
 * Deterministisch & regelbasiert: Note und Skill-Wirkung kommen aus der
 * Engine. Das LLM darf die Analyse später sprachlich vertiefen
 * (Evaluation.llmAnalysisDe, vom Server separat gehalten), ändert aber weder
 * Note noch Zahlen — Trennung von Wahrheit und Erzählung.
 *
 * Bewertet wird der PROZESS, nicht nur das Ergebnis: Eine saubere
 * Entscheidung mit Pech ist besser als ein Blindflug mit Glück.
 */
export function evaluateDecision(state: CompanyState, decision: DecisionRecord): Evaluation {
  const now = computeKpis(state).values;
  const kpiDiff = (Object.keys(decision.kpiBaseline) as KpiId[]).map((id) => ({
    id,
    before: decision.kpiBaseline[id] ?? 0,
    after: now[id],
  }));

  const causal = buildCausalChain(state, decision, now);
  const grade = gradeProcess(state, decision);
  const hypothesisReview = reviewHypothesis(decision, now);
  const lessonDe = deriveLesson(decision, grade);

  const evaluation: Evaluation = {
    id: nextId(state, 'eval'),
    decisionId: decision.id,
    week: state.meta.week,
    kpiDiff,
    causalChainDe: causal,
    hypothesisReview,
    grade,
    llmAnalysisDe: null,
    precedents: findPrecedents(state, decision, grade.criteria.werteKonsistenz < 50),
    lessonDe,
  };
  state.evaluations.push(evaluation);
  applySkillGains(state, decision, grade);
  return evaluation;
}

/** Alle in dieser Woche fälligen Bewertungen erzeugen. */
export function runDueEvaluations(state: CompanyState): Evaluation[] {
  const due = state.decisionLog.filter(
    (d) => d.evaluateAtWeek <= state.meta.week && !state.evaluations.some((e) => e.decisionId === d.id),
  );
  return due.map((d) => evaluateDecision(state, d));
}

// ────────────────────────────────────────────────────────────────────
function buildCausalChain(state: CompanyState, d: DecisionRecord, now: Record<KpiId, number>): string[] {
  const chain: string[] = [];
  const base = d.kpiBaseline;
  const dMrr = now.mrr - (base.mrr ?? now.mrr);
  const dChurn = now.logoChurnMonthly - (base.logoChurnMonthly ?? now.logoChurnMonthly);
  const dBurn = now.netBurnMonthly - (base.netBurnMonthly ?? now.netBurnMonthly);
  const dSat = now.avgSatisfaction - (base.avgSatisfaction ?? now.avgSatisfaction);

  chain.push(`Seit Woche ${d.week}: MRR ${eur(dMrr)}/Monat, Netto-Burn ${eur(dBurn)}/Monat, Churn ${pp(dChurn)}, Team-Zufriedenheit ${num(dSat)} Punkte.`);

  switch (d.action.type) {
    case 'PRICE_CHANGE':
      chain.push('Mechanik: Neugeschäfts-ARPA = Basis-ARPA × Preisindex; Win-Rate skaliert gegenläufig mit ~0,9 × Preisdelta (Elastizität).');
      if (d.action.applyToExisting) chain.push('Der Bestands-Effekt läuft über Renewal-Repricing (85 % Durchsetzung) plus temporären Churn-Aufschlag — beides mit 4 Wochen Verzögerung gestartet.');
      break;
    case 'LAYOFF':
      chain.push('Mechanik: Abfindungen einmalig zahlungswirksam; Payroll ↓ ab Folgewoche; Moral- und Reputations-Malus lösten eine verzögerte Kündigungswelle-Wahrscheinlichkeit aus.');
      break;
    case 'SET_MARKETING_BUDGET':
      chain.push('Mechanik: Leads/Woche ≈ 25 × √(Budget ÷ 25 k€) × Presse-Faktor — Wirkung auf MRR erst nach Trial-Reifung (3 Wochen) und Win-Rate.');
      break;
    case 'SET_CS_BUDGET':
      chain.push('Mechanik: Churn-Multiplikator greift seit 4 Wochen nach Entscheidung; Kohorten-Churn wirkt zinseszinsartig auf den MRR-Pfad.');
      break;
    case 'SET_RND_ALLOCATION':
      chain.push('Mechanik: Tech-Debt-Δ pro Woche = +0,5 × Feature-Anteil − 0,09 × Velocity × Debt-Anteil; Velocity wiederum leidet unter hohem Debt — eine Rückkopplungsschleife.');
      break;
    case 'RAISE_DEBT':
    case 'REPAY_DEBT':
      chain.push('Mechanik: Cash und Schuldenstand bewegten sich gegenläufig; die Zinslast läuft mit 8 % p. a. wöchentlich durch die GuV.');
      break;
    case 'ACCEPT_TERM_SHEET':
      chain.push('Mechanik: Der Zufluss lief als Finanzierungs-Cashflow (kein Umsatz!); Verwässerung = Betrag ÷ Post-Money, ESOP-Top-up PRE-Money traf nur die Altgesellschafter.');
      chain.push('Langfrist-Hebel: Liquidation Preference und Board-Rechte wirken erst beim Exit bzw. in Krisen — genau dann, wenn du sie nicht mehr verhandeln kannst.');
      break;
    case 'RAISE_VENTURE_DEBT':
      chain.push('Mechanik: Kreditlinie ↑ und Sofort-Draw; der Blended-Zins stieg Richtung 13 % p. a. auf das Neuvolumen — Runway gegen Zinslast getauscht, ohne Anteile abzugeben.');
      break;
    case 'MA_ACQUIRE':
      chain.push('Mechanik: Kaufpreis einmalig durch die GuV (vereinfachtes Modell ohne Goodwill); ab Folgewoche kamen Kohorte, Team und Tech-Debt des Ziels dazu — inklusive der Red Flags, die sich als geplante Folge-Effekte materialisieren.');
      break;
    case 'MA_DUE_DILIGENCE':
      chain.push('Mechanik: 15 k€ Einmalkosten gegen Information — die Red Flags des Ziels sind seitdem sichtbar und der Kaufpreis wurde ggf. nachverhandelt.');
      break;
    case 'IPO_SELECT_BANK':
      chain.push('Mechanik: Prospektkosten sofort, 8 Wochen Vorbereitung, dann 3 Wochen Roadshow. Die Bank-Wahl steuert Fee UND Zeichnungsnachfrage — billig kann teuer werden, wenn das Buch nicht voll wird.');
      break;
    case 'IPO_PRICE':
      chain.push('Mechanik: Zeichnungsquote = f(Preis vs. Spanne, Bank-Platzierungskraft, Investoren-Reputation, Marktnachfrage). Unter 0,9× platzt der IPO; Überzeichnung erzeugt einen Erstnotiz-Pop — schön für Zeichner, entgangener Erlös für dich.');
      break;
    default:
      break;
  }
  return chain;
}

function gradeProcess(state: CompanyState, d: DecisionRecord): Grade {
  const reasons: string[] = [];
  let info = 60, risk = 60, timing = 60, values = 70, comms = 60;
  const base = d.kpiBaseline;
  const runwayAtDecision = base.runwayWeeks ?? 52;
  const churnAtDecision = base.logoChurnMonthly ?? 0.03;

  // Hypothese abgegeben = bewusste Informationsnutzung & Kalibrierungstraining.
  if (d.hypothesis) {
    info += 20;
    reasons.push('Du hast vorab eine Hypothese formuliert — das trainiert kalibriertes Urteilen (+Informationsnutzung).');
  } else {
    info -= 10;
    reasons.push('Keine Hypothese vor der Entscheidung — Wirkung wurde nicht antizipiert (−Informationsnutzung).');
  }

  switch (d.action.type) {
    case 'PRICE_CHANGE': {
      if (d.action.pct > 0 && churnAtDecision > 0.035) {
        risk -= 20; timing -= 20;
        reasons.push('Preiserhöhung mitten in einer Churn-Krise: Das adressiert das Symptom (Umsatz), verschärft aber die Ursache (Kundenunzufriedenheit).');
      }
      if (d.action.pct > 0 && d.action.pct <= 0.1) {
        risk += 10;
        reasons.push('Moderate Anhebung (≤ 10 %) hält das Renewal-Risiko kontrolliert.');
      }
      if (d.action.pct > 0.15 && d.action.applyToExisting) {
        risk -= 15;
        reasons.push('> 15 % auch für den Bestand ist eine aggressive Wette auf die Wechselkosten der Kunden (vgl. reale Fälle: gescheiterte Preis-Doppelschläge).');
      }
      break;
    }
    case 'LAYOFF': {
      if (runwayAtDecision < 26) {
        timing += 15;
        reasons.push('Bei kurzem Runway ist Kostenreduktion legitime Chefaufgabe — Zeitpunkt nachvollziehbar.');
      } else {
        timing -= 10;
        reasons.push('Entlassungen ohne akuten Liquiditätsdruck: Alternativen (Attrition, Budgetkürzung) waren verfügbar.');
      }
      if (d.action.generousSeverance) {
        values += 15; comms += 10;
        reasons.push('Faires Trennungspaket: konsistenter mit den Unternehmenswerten, dämpft Folgeschäden.');
      } else {
        const humane = state.identity.values.some((v) => /mensch|team|respekt|fair/i.test(v));
        if (humane) {
          values -= 30;
          reasons.push(`Harte Trennung widerspricht den selbst gewählten Werten („${state.identity.values.join('", „')}") — Kultur- und Reputationskosten sind eingepreist.`);
        }
      }
      break;
    }
    case 'RAISE_DEBT': {
      if (runwayAtDecision < 20) {
        timing += 20; risk += 10;
        reasons.push('Liquidität sichern, bevor die Not sichtbar wird: richtig — verhandeln kann nur, wer noch Cash hat.');
      } else {
        reasons.push('Kredit ohne akuten Bedarf: Zinskosten gegen Optionswert der Liquidität abwägen.');
      }
      break;
    }
    case 'SET_CS_BUDGET': {
      if (churnAtDecision > 0.03) {
        timing += 20; risk += 10;
        reasons.push('Investition direkt am Kernproblem (Churn) — Ursachenbekämpfung statt Symptompflege.');
      }
      break;
    }
    case 'SET_RND_ALLOCATION': {
      const a = d.action;
      if (a.techDebt >= 0.25 && state.product.techDebt > 55) {
        timing += 15;
        reasons.push('Spürbarer Tech-Debt-Anteil bei hohem Schuldenstand: adressiert die Outage-Zeitbombe.');
      }
      if (a.features > 0.85) {
        risk -= 15;
        reasons.push('> 85 % Feature-Fokus lässt Debt & Bugs ungebremst wachsen — verdeckte Wette.');
      }
      break;
    }
    case 'RESPOND_EVENT': {
      comms += 10;
      reasons.push('Auf das Ereignis wurde aktiv reagiert statt es auszusitzen.');
      break;
    }
    case 'ACCEPT_TERM_SHEET': {
      if (runwayAtDecision > 35) {
        timing += 20; risk += 10;
        reasons.push('Geld aufgenommen, als es noch nicht nötig war: Fundraising aus der Stärke — beste Verhandlungsposition, echte Wahlfreiheit.');
      } else if (runwayAtDecision < 16) {
        timing -= 20;
        reasons.push('Fundraising mit dem Rücken zur Wand: Bei unter 16 Wochen Runway diktiert der Investor die Terms — der Zeitpunkt hat Geld gekostet.');
      }
      if (d.action.offer.liquidationPref === '1x-participating') {
        risk -= 10;
        reasons.push('Participating Preference akzeptiert: Die höhere Schlagzeilen-Bewertung wurde mit einer Exit-Hypothek bezahlt — ein klassischer Anfängertausch.');
      } else {
        risk += 10;
        reasons.push('Saubere 1x non-participating Preference: Beim Exit zählt, was im Vertrag steht, nicht was in der Presse stand.');
      }
      break;
    }
    case 'RAISE_VENTURE_DEBT': {
      if (runwayAtDecision >= 16 && runwayAtDecision <= 45) {
        timing += 15;
        reasons.push('Venture Debt als Brücke im richtigen Fenster: genug Substanz für die Tilgung, echter Bedarf an Puffer.');
      }
      risk += 5;
      reasons.push('Fremdkapital statt Verwässerung gewählt — funktioniert, solange der Plan die Zinslast trägt.');
      break;
    }
    case 'MA_DUE_DILIGENCE': {
      info += 20; risk += 10;
      reasons.push('Erst prüfen, dann kaufen: Due Diligence ist gekaufte Information — die billigste Versicherung im M&A-Geschäft.');
      break;
    }
    case 'IPO_SELECT_BANK': {
      if (runwayAtDecision > 40) {
        timing += 15;
        reasons.push('IPO aus einer Position der Stärke gestartet — kein Notverkauf, echte Wahlfreiheit beim Pricing.');
      } else if (runwayAtDecision < 20) {
        timing -= 20; risk -= 10;
        reasons.push('IPO als Liquiditätsrettung: Der Markt riecht Verzweiflung — und preist sie ein (vgl. WeWork 2019).');
      }
      info += 10;
      reasons.push('Banken-Trade-off (Fee vs. Platzierungskraft) war explizit Teil der Entscheidung.');
      break;
    }
    case 'IPO_PRICE': {
      const ipoNow = state.ipo;
      if (ipoNow.status === 'withdrawn') {
        risk -= 25; timing -= 10;
        reasons.push('Das Buch wurde bei diesem Preis nicht voll — der geplatzte IPO war die teuerste Variante von Gier.');
      } else if (ipoNow.subscriptionRatio !== null) {
        if (ipoNow.subscriptionRatio >= 1.0 && ipoNow.subscriptionRatio <= 1.6) {
          risk += 15;
          reasons.push('Pricing mit gesund gedecktem Buch: Platzierung sicher, Pop moderat — handwerklich sauber.');
        } else if (ipoNow.subscriptionRatio > 1.6) {
          risk += 5; info -= 10;
          reasons.push('Stark überzeichnet: sichere Platzierung, aber deutlich Geld auf dem Tisch gelassen — die Spanne hätte mehr hergegeben.');
        }
      }
      break;
    }
    case 'MA_ACQUIRE': {
      const targetId = d.action.targetId;
      const t = state.market.maTargets.find((x) => x.id === targetId);
      if (t?.ddDone) {
        info += 20; risk += 10;
        reasons.push('Kauf nach Due Diligence: Die Altlasten waren bekannt und im Preis verhandelt — informierte Wette statt Blindflug.');
      } else {
        info -= 25; risk -= 25;
        reasons.push('Kauf OHNE Due Diligence: Jede versteckte Altlast wurde ungeprüft mitgekauft. Selbst wenn es gut geht, war der Prozess fahrlässig (vgl. HP/Autonomy).');
      }
      if (runwayAtDecision < 26) {
        timing -= 15;
        reasons.push('Akquisition bei knappem Runway: Integrationskosten und Kaufpreis konkurrieren direkt mit der eigenen Zahlungsfähigkeit.');
      }
      break;
    }
    default:
      break;
  }

  info = clamp(info, 0, 100); risk = clamp(risk, 0, 100); timing = clamp(timing, 0, 100);
  values = clamp(values, 0, 100); comms = clamp(comms, 0, 100);
  const avg = (info + risk + timing + values + comms) / 5;
  const overall = (avg >= 85 ? 1 : avg >= 70 ? 2 : avg >= 55 ? 3 : avg >= 42 ? 4 : avg >= 30 ? 5 : 6) as Grade['overall'];

  return {
    overall,
    criteria: { informationsnutzung: info, risikoAbwaegung: risk, timing, werteKonsistenz: values, kommunikation: comms },
    reasoningDe: reasons,
  };
}

function reviewHypothesis(d: DecisionRecord, now: Record<KpiId, number>): Evaluation['hypothesisReview'] {
  if (!d.hypothesis) {
    return { hadHypothesis: false, verdict: 'keine', commentDe: 'Ohne Erwartung lässt sich nichts lernen: Beim nächsten Mal erst schätzen, dann schauen.' };
  }
  const h = d.hypothesis;
  if (h.expectedMrrDelta4w === null) {
    return { hadHypothesis: true, verdict: 'teilweise', commentDe: 'Qualitative Hypothese notiert — mit einer Zahlenschätzung wäre der Abgleich schärfer gewesen.' };
  }
  const actual = now.mrr - (d.kpiBaseline.mrr ?? now.mrr);
  const err = Math.abs(actual - h.expectedMrrDelta4w);
  const scale = Math.max(2000, Math.abs(h.expectedMrrDelta4w));
  const verdict = err <= scale * 0.35 ? 'treffend' : err <= scale * 1.0 ? 'teilweise' : 'daneben';
  return {
    hadHypothesis: true,
    verdict,
    commentDe: `Erwartet: ${eur(h.expectedMrrDelta4w)}/Monat MRR-Wirkung, eingetreten: ${eur(actual)}/Monat (Abweichung ${eur(err)}). ${
      verdict === 'treffend' ? 'Stark kalibriert.' : verdict === 'teilweise' ? 'Richtung stimmte, Größenordnung noch nicht.' : 'Deutlich daneben — welche Annahme war falsch?'
    }`,
  };
}

function deriveLesson(d: DecisionRecord, grade: Grade): string {
  const worst = Object.entries(grade.criteria).sort((a, b) => a[1] - b[1])[0];
  const lessons: Record<string, string> = {
    informationsnutzung: 'Erst Lagebild, dann Entscheidung: Hypothese + relevante KPIs VOR dem Klick prüfen.',
    risikoAbwaegung: 'Downside zuerst denken: Was passiert, wenn die Annahme nicht hält — und ist das reversibel?',
    timing: 'Gleiche Entscheidung, anderer Zeitpunkt, anderes Ergebnis: Timing ist ein eigener Hebel.',
    werteKonsistenz: 'Werte sind ein Versprechen: Jeder Bruch kostet doppelt — innen Vertrauen, außen Reputation.',
    kommunikation: 'Entscheidungen wirken über ihre Kommunikation: Wer den Kontext nicht erklärt, überlässt die Deutung anderen.',
  };
  return `${lessons[worst?.[0] ?? 'informationsnutzung']} (Aus: ${d.summaryDe}, Note ${grade.overall})`;
}

function applySkillGains(state: CompanyState, d: DecisionRecord, grade: Grade): void {
  const gain = grade.overall <= 2 ? 1.5 : grade.overall === 3 ? 0.8 : grade.overall === 4 ? 0.3 : 0.1;
  const s = state.ceo.skills;
  switch (d.action.type) {
    case 'RAISE_DEBT': case 'REPAY_DEBT': case 'SET_MARKETING_BUDGET': case 'SET_CS_BUDGET':
      s.finanzen = clamp(s.finanzen + gain, 0, 100); break;
    case 'PRICE_CHANGE': case 'SET_RND_ALLOCATION':
      s.strategie = clamp(s.strategie + gain, 0, 100); break;
    case 'LAYOFF': case 'ADJUST_SALARIES': case 'START_HIRING':
      s.leadership = clamp(s.leadership + gain, 0, 100); break;
    case 'RESPOND_EVENT':
      s.krisenmanagement = clamp(s.krisenmanagement + gain, 0, 100); break;
    case 'DELEGATE_MESSAGE':
      s.leadership = clamp(s.leadership + gain, 0, 100); break;
    case 'START_PROJECT':
      s.strategie = clamp(s.strategie + gain, 0, 100); break;
    case 'ACCEPT_TERM_SHEET': case 'RAISE_VENTURE_DEBT':
      s.finanzen = clamp(s.finanzen + gain, 0, 100);
      s.governance = clamp(s.governance + gain * 0.5, 0, 100); break;
    case 'MA_DUE_DILIGENCE': case 'MA_ACQUIRE':
      s.strategie = clamp(s.strategie + gain, 0, 100); break;
    case 'IPO_SELECT_BANK': case 'IPO_PRICE':
      s.finanzen = clamp(s.finanzen + gain, 0, 100);
      s.governance = clamp(s.governance + gain * 0.7, 0, 100); break;
    default: break;
  }
  // Werte-Konsistenz zahlt auf Governance ein.
  if (grade.criteria.werteKonsistenz >= 70) s.governance = clamp(s.governance + gain * 0.5, 0, 100);
}

function eur(v: number): string {
  const sign = v > 0 ? '+' : '';
  return `${sign}${Math.round(v).toLocaleString('de-DE')} €`;
}
function pp(v: number): string {
  const sign = v > 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(2)} pp`;
}
function num(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

import { z } from 'zod';
import {
  DEPARTMENTS,
  deptDe,
  effectiveMonthlyChurn,
  payrollMonthlyByDept,
  totalMrr,
  type CompanyState,
  type HireConsultantAction,
} from '@boardroom/shared';
import { getDb } from './db.js';
import { llmJson } from './llm.js';
import { stateBriefDe } from './personas.js';

/**
 * KI-Unternehmensberater („McKinsey light“, Phase 4).
 * Liefert Slide-Reports auf Basis ECHTER State-Daten. Bewusst nicht
 * unfehlbar: Der Berater neigt zu Moden — der Report weist darauf hin,
 * dass die Verantwortung beim CEO bleibt.
 */

const zReport = z.object({
  titleDe: z.string().min(5).max(120),
  slides: z.array(z.object({ titleDe: z.string().min(2).max(90), bulletsDe: z.array(z.string().max(300)).min(2).max(6) })).min(3).max(6),
  recommendationsDe: z.array(z.string().max(300)).min(2).max(5),
  caveatDe: z.string().min(10).max(400),
});
export type ConsultantReport = z.infer<typeof zReport> & { topic: string; week: number };

export async function generateConsultantReport(state: CompanyState, topic: HireConsultantAction['topic']): Promise<ConsultantReport> {
  const topicDe = { churn: 'Churn-Kohorten-Deepdive', pricing: 'Pricing-Studie', market: 'Markteintritts-Optionen', costs: 'Kostenstruktur-Analyse' }[topic];
  const system = `Du bist ein Senior-Berater einer Top-Strategieberatung in einem CEO-Trainings-Simulator. Erstelle einen prägnanten Slide-Report (3–6 Slides à 2–6 Bullets) zum Thema „${topicDe}“ — NUR auf Basis des Lagebilds, keine erfundenen Zahlen. Stil: MECE, hypothesengetrieben, mit klaren Handlungsempfehlungen. WICHTIG (Didaktik): Du bist gut, aber nicht unfehlbar — mindestens eine Empfehlung darf einem aktuellen Management-Trend folgen, dessen Passung fraglich ist; das caveatDe-Feld benennt ehrlich die Grenzen der Analyse.`;
  const user = ['=== LAGEBILD ===', stateBriefDe(state), '', `Erstelle den Report als JSON: {"titleDe","slides":[{"titleDe","bulletsDe":[]}],"recommendationsDe":[],"caveatDe"}`].join('\n');
  const res = await llmJson('consultant', system, user, zReport, 1600);
  const report = res ?? fallbackReport(state, topic, topicDe);
  return { ...report, topic, week: state.meta.week };
}

function fallbackReport(state: CompanyState, topic: HireConsultantAction['topic'], topicDe: string): z.infer<typeof zReport> {
  const mrr = totalMrr(state);
  const churn = effectiveMonthlyChurn(state);
  const k = (v: number) => `${Math.round(v / 1000)} k€`;

  if (topic === 'churn') {
    const cohorts = [...state.customers.cohorts].sort((a, b) => b.baseMonthlyChurn - a.baseMonthlyChurn).slice(0, 4);
    return {
      titleDe: `Churn-Kohorten-Deepdive — ${state.identity.companyName}`,
      slides: [
        { titleDe: 'Befund', bulletsDe: [
          `Blended Logo-Churn: ${(churn * 100).toFixed(1)} %/Monat — annualisiert verliert ihr ~${((1 - Math.pow(1 - churn, 12)) * 100).toFixed(0)} % der Kundenbasis.`,
          `Die jüngsten Kohorten churnen am stärksten: ${cohorts.map((c) => `${(c.baseMonthlyChurn * 100).toFixed(1)} %`).join(' / ')} — das Problem entsteht in den ersten 90 Tagen.`,
          `Jahresvertrags-Anteile dämpfen den Effekt nur zeitlich (gebündelte Renewals).`,
        ]},
        { titleDe: 'Ursachen-Hypothesen', bulletsDe: [
          'Onboarding: kein strukturierter Time-to-Value-Pfad in den ersten Wochen.',
          `Produktreibung: Bug-Backlog ${Math.round(state.product.bugBacklog)} und Tech-Debt ${Math.round(state.product.techDebt)}/100 drücken den NPS (${Math.round(state.product.nps)}).`,
          'CS ist reaktiv statt proaktiv aufgestellt (Budget-Indiz).',
        ]},
        { titleDe: 'Benchmark', bulletsDe: [
          'Gesunde B2B-SaaS-Referenz: 1,5–2,5 % Logo-Churn/Monat im SMB, <1 % im Mid-Market.',
          'Onboarding-Programme senken Früh-Churn in dokumentierten Fällen um 20–40 % relativ.',
        ]},
        { titleDe: 'Maßnahmen-Priorisierung', bulletsDe: [
          '1) CS-Budget auf strukturiertes Onboarding fokussieren (Playbook, Health-Scores).',
          '2) Renewal-Frühwarnliste für Accounts mit Health < 60.',
          '3) Bugfix-Anteil in der R&D-Allokation temporär erhöhen.',
        ]},
      ],
      recommendationsDe: [
        'CS-Budget signifikant erhöhen und ausschließlich an Time-to-Value-Metriken koppeln.',
        'Quartalsweise Kohorten-Review als festes Führungsritual etablieren.',
        'Trend-Empfehlung (kritisch prüfen!): „KI-gestützte Churn-Prediction“ einführen — bei eurer Datenbasis vermutlich verfrüht.',
      ],
      caveatDe: 'Analyse basiert auf aggregierten Kohortendaten ohne Einzelkunden-Interviews. Die Trend-Empfehlung Nr. 3 folgt der aktuellen Beratermode — Nutzen bei dieser Unternehmensgröße fraglich. Entscheidung und Verantwortung bleiben beim CEO.',
    };
  }
  if (topic === 'pricing') {
    return {
      titleDe: `Pricing-Studie — ${state.identity.companyName}`,
      slides: [
        { titleDe: 'Ist-Position', bulletsDe: [
          `Eigener Preisindex: ${state.customers.priceIndex.toFixed(2)} (1,00 = Ausgangsniveau).`,
          `Wettbewerb: ${state.market.competitors.map((c) => `${c.name} ${c.priceIndex.toFixed(2)}`).join(' · ')}.`,
          `ARPA-Mix: SMB ~${k(state.customers.segments[0]?.baseArpaMonthly ?? 450)}, Mid-Market ~${k(state.customers.segments[1]?.baseArpaMonthly ?? 1850)}.`,
        ]},
        { titleDe: 'Spielräume', bulletsDe: [
          'Value-based Packaging (Gut/Besser/Am-besten) statt Einheitspreis.',
          'Jahresvorauszahlung mit 10 % Nachlass verbessert Cash & Bindung.',
          `Bei NPS ${Math.round(state.product.nps)} sind moderate Anhebungen (≤10 %) im Neugeschäft tragfähig; Bestand nur beim Renewal anfassen.`,
        ]},
        { titleDe: 'Risiken', bulletsDe: [
          'NordCloud positioniert sich 20 % darunter — aggressive Anhebungen füttern deren Pitch.',
          'Preisänderungen im Bestand koppeln direkt in den Churn (siehe Kohorten-Lage).',
        ]},
      ],
      recommendationsDe: [
        'Neugeschäft +8 % testen, Bestand unangetastet lassen; Wirkung 8 Wochen messen.',
        'Annual-Prepay-Anteil aktiv pushen (Cash-Effekt sofort, Churn-Bündelung beachten).',
        'Trend-Empfehlung (kritisch prüfen!): „Usage-based Pricing“ — im Helpdesk-Markt bislang selten kaufentscheidend.',
      ],
      caveatDe: 'Ohne Conjoint-/Zahlungsbereitschafts-Daten sind dies gerichtete Hypothesen, keine bewiesenen Elastizitäten. Die Usage-based-Empfehlung folgt einer Branchenmode.',
    };
  }
  if (topic === 'market') {
    return {
      titleDe: `Markteintritts-Optionen — ${state.identity.companyName}`,
      slides: [
        { titleDe: 'Marktbild', bulletsDe: [
          `Adressierbarer Markt: ${k(state.market.tamMrr)} MRR, Wachstum ${(state.market.marketGrowthMonthly * 100).toFixed(1)} %/M.`,
          `Euer Anteil: ${((mrr / state.market.tamMrr) * 100).toFixed(1)} % — Platz nach oben in JEDEM Segment.`,
          `Wettbewerbslogik: ${state.market.competitors.map((c) => `${c.name} (${c.strategy})`).join(' · ')}.`,
        ]},
        { titleDe: 'Optionen', bulletsDe: [
          'A) SMB-Verdichtung: Churn fixen, dann günstige Volumen-Akquise skalieren.',
          'B) Mid-Market-Ausbau: höhere ARPA, längere Zyklen — braucht Referenzen & Compliance-Features.',
          'C) Vertikalisierung: eine Branche dominieren statt überall Dritter sein.',
        ]},
        { titleDe: 'Bewertung', bulletsDe: [
          'Kurzfristig zahlt nur Option A auf die Runway-Frage ein.',
          'Option B kollidiert frontal mit Vantiros Enterprise-Move — Zeitfenster prüfen.',
        ]},
      ],
      recommendationsDe: [
        'Erst Retention-Basis stabilisieren (Option A), dann selektiv B pilotieren.',
        'Zwei Leuchtturm-Kunden je Zielvertikale als Referenz aufbauen.',
        'Trend-Empfehlung (kritisch prüfen!): „Community-led Growth“ — hübsch auf Slides, unklarer Payback.',
      ],
      caveatDe: 'Marktgrößen sind Modellwerte des Simulators; reale Eintrittsentscheidungen bräuchten Kundeninterviews je Segment.',
    };
  }
  const payroll = payrollMonthlyByDept(state);
  return {
    titleDe: `Kostenstruktur-Analyse — ${state.identity.companyName}`,
    slides: [
      { titleDe: 'Kostenblöcke (monatlich)', bulletsDe: [
        ...DEPARTMENTS.map((d) => `${deptDe(d)}: ${k(payroll[d])} Payroll`),
        `Sachbudgets: Marketing ${k(state.finance.budgetsMonthly.marketing)}, CS ${k(state.finance.budgetsMonthly.customerSuccess)}, R&D-Tools ${k(state.finance.budgetsMonthly.rndTools)}, G&A ${k(state.finance.budgetsMonthly.gaOther)}.`,
      ]},
      { titleDe: 'Einordnung', bulletsDe: [
        'Personalkostenquote liegt im SaaS-typischen Korridor — der Hebel liegt in Produktivität, nicht im Rasenmäher.',
        `COGS-Quote ${(state.finance.cogsRate * 100).toFixed(0)} % ist solide; Hosting-Optimierung bringt einstellige Prozente.`,
      ]},
      { titleDe: 'Hebel', bulletsDe: [
        'Selektive Nachbesetzungs-Stopps statt Pauschal-Abbau (schützt Schlüsselwissen).',
        'Sachkosten-Screening: Tool-Konsolidierung, Bürofläche je Kopf.',
        'Abfindungs-Rückstellungen VOR harten Schnitten kalkulieren.',
      ]},
    ],
    recommendationsDe: [
      'Kostenziel als Burn-Korridor definieren (z. B. −20 % in 2 Quartalen) statt Einmal-Schock.',
      'Jede Einsparung gegen Churn-/Velocity-Nebenwirkungen rechnen — Bruttoersparnis lügt.',
      'Trend-Empfehlung (kritisch prüfen!): „Zero-based Budgeting“ — mächtig, aber für 30 Köpfe meist Overkill.',
    ],
    caveatDe: 'Regelbasierte Analyse aus dem Lagebild; verdeckte Verträge/Verpflichtungen sieht der Berater nicht. Verantwortung bleibt beim CEO.',
  };
}

export function saveConsultantReport(gameId: string, report: ConsultantReport): void {
  getDb()
    .prepare('INSERT INTO consultant_reports (game_id, week, topic, report_json, at_iso) VALUES (?, ?, ?, ?, ?)')
    .run(gameId, report.week, report.topic, JSON.stringify(report), new Date().toISOString());
}

export function listConsultantReports(gameId: string): ConsultantReport[] {
  const rows = getDb().prepare('SELECT report_json FROM consultant_reports WHERE game_id = ? ORDER BY id DESC').all(gameId) as { report_json: string }[];
  return rows.map((r) => JSON.parse(r.report_json) as ConsultantReport);
}

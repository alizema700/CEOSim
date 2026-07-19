import type { Id, WeekIndex } from './common.js';
import type { KpiId } from './kpi.js';
import type { PlayerAction } from './actions.js';

/**
 * Bewertungs-Pipeline (Kernfeature):
 *   1. Hypothese  — Spieler sagt VOR der Konsequenz, was er erwartet.
 *   2. Resultat   — Engine berechnet, Zahlen-Diff wird gezeigt.
 *   3. Analyse    — Kausalkette (regelbasiert deterministisch; LLM poliert Text).
 *   4. Präzedenz  — passende reale Fälle (Phase 4: Fall-Bibliothek + Embeddings).
 *   5. Note       — Prozessqualität, NICHT nur Outcome.
 *
 * WICHTIG für Determinismus: Die NOTE und alle State-Wirkungen (CEO-Skills)
 * werden regelbasiert von der Engine bestimmt. Das LLM liefert ausschließlich
 * Erzähl-/Erklärtext obendrauf und kann Zahlen nie verändern.
 */
export interface DecisionRecord {
  id: Id;
  week: WeekIndex;
  action: PlayerAction;
  /** Menschenlesbare Zusammenfassung der Entscheidung. */
  summaryDe: string;
  hypothesis: Hypothesis | null;
  /** Sofort-Analyse der Mechanik (welche Effekte wurden ausgelöst). */
  immediateAnalysisDe: string[];
  /** Woche, in der die Outcome-Bewertung fällig ist (i. d. R. +4). */
  evaluateAtWeek: WeekIndex;
  /** KPI-Werte zum Entscheidungszeitpunkt (Basis für den Diff). */
  kpiBaseline: Partial<Record<KpiId, number>>;
}

export interface Hypothesis {
  /** Freitext: „Ich erwarte, dass …" */
  textDe: string;
  /** Optional: geschätzte MRR-Wirkung in 4 Wochen (EUR/Monat, ±). */
  expectedMrrDelta4w: number | null;
  /** Optional: geschätzte Churn-Wirkung (Prozentpunkte monatlich, ±). */
  expectedChurnDeltaPp: number | null;
}

export interface Evaluation {
  id: Id;
  decisionId: Id;
  week: WeekIndex; // Woche der Bewertung
  /** Zahlen-Diff seit Entscheidung für die relevanten KPIs. */
  kpiDiff: { id: KpiId; before: number; after: number }[];
  /** Kausalketten-Erklärung (First Principles, mathematisch nachvollziehbar). */
  causalChainDe: string[];
  /** Hypothesen-Abgleich (Kalibrierungs-Training). */
  hypothesisReview: {
    hadHypothesis: boolean;
    verdict: 'treffend' | 'teilweise' | 'daneben' | 'keine';
    commentDe: string;
  };
  grade: Grade;
  /** Optional: LLM-generierte vertiefte Analyse (reiner Text, keine Zahlenmacht). */
  llmAnalysisDe: string | null;
  /** Präzedenzfälle (Phase 4; Datenmodell schon vorgesehen). */
  precedents: PrecedentRef[];
  /** Kern-Lektion in einem Satz (fürs Lern-Journal). */
  lessonDe: string;
}

/**
 * Note nach PROZESS-Kriterien (gute Entscheidung + Pech ≠ schlechte
 * Entscheidung). Deutsche Schulnoten 1–6.
 */
export interface Grade {
  overall: 1 | 2 | 3 | 4 | 5 | 6;
  criteria: {
    informationsnutzung: number; // 0..100 — Lagebild vor Entscheidung genutzt?
    risikoAbwaegung: number; // 0..100 — Risiko/Reward & Reversibilität
    timing: number; // 0..100 — richtiger Zeitpunkt?
    werteKonsistenz: number; // 0..100 — passt zu Mission/Werten/Motto?
    kommunikation: number; // 0..100 — Begleitkommunikation angemessen?
  };
  reasoningDe: string[];
}

export interface PrecedentRef {
  caseId: string;
  titleDe: string;
  relevanceDe: string;
}

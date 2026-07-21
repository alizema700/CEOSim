import type { WeekIndex } from './common.js';

/**
 * Krisenmanagement & Shitstorm (Phase 15). Aus einem Funken (Datenleck,
 * Social-Media-Empörung, Produktmangel, Führungsskandal, Nachhaltigkeit)
 * entsteht ein öffentlicher Sturm, der über Stufen eskaliert, wenn der CEO
 * nicht rechtzeitig und glaubwürdig reagiert. Deterministisch: Emergence ist
 * seed- & lagegebunden (nur mit öffentlicher Angriffsfläche), die Wirkung der
 * Reaktion hängt an CEO-Marke, Kommunikation und Board-Rückhalt.
 */

export type CrisisKind = 'datenschutz' | 'social' | 'produkt' | 'führung' | 'nachhaltigkeit';
export type CrisisStatus = 'none' | 'active';
export type CrisisResponseMode = 'apologize' | 'defend' | 'silent' | 'investigate';

export interface CrisisState {
  status: CrisisStatus;
  kind: CrisisKind;
  /** Schlagzeile des Sturms (fürs UI/Presse). */
  headlineDe: string;
  /** Der auslösende Funke. */
  sparkDe: string;
  /** 0..100 — treibt Reputations-/Churn-/Vertrauens-Strafen. */
  severity: number;
  /** Eskalationsstufe 1..3 (Aufmerksamkeit → Empörung → Boykott). */
  stage: number;
  startedWeek: WeekIndex;
  /** Reaktionsfenster; verstreicht es ohne glaubwürdige Antwort, eskaliert der Sturm. */
  deadlineWeek: WeekIndex | null;
  /** Genutzte Reaktionen (fürs UI/Historie). */
  responsesUsed: string[];
  /** Dynamik: > 0 wächst der Sturm, < 0 klingt er ab. */
  momentum: number;
  /** Ob in dieser Krise bereits glaubwürdig reagiert wurde (dämpft Eskalation). */
  addressed: boolean;
  lastNudgeWeek: WeekIndex;
}

export function initialCrisisState(): CrisisState {
  return {
    status: 'none',
    kind: 'social',
    headlineDe: '',
    sparkDe: '',
    severity: 0,
    stage: 0,
    startedWeek: 0,
    deadlineWeek: null,
    responsesUsed: [],
    momentum: 0,
    addressed: false,
    lastNudgeWeek: 0,
  };
}

/** Stufen-Labels (fürs UI). */
export const CRISIS_STAGE_LABELS = ['—', 'Aufmerksamkeit', 'Empörung', 'Boykott'] as const;

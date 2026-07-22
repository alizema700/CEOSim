import type { Money, WeekIndex } from './common.js';

/**
 * Fiskus & Prüfungen (Phase 22, FB4). Der CEO wählt eine Steuerstrategie —
 * inklusive der Möglichkeit, es ILLEGAL zu machen. Dem gegenüber steht ein
 * echtes Prüfwesen: Betriebsprüfung, Steuerfahndung, Jahresabschlussprüfung,
 * Sozialversicherungs- und Fördermittel-Prüfung. Wer hinterzieht, kann
 * erwischt werden — bis hin zum Haftbefehl (Spielende).
 *
 * Golden-Master-sicher: Default 'konservativ' ⇒ Steuerfaktor 1 (numerisch
 * identisch), Schwarzbuch 0, Prüfrisiko 0; Prüfungen feuern erst ab Woche 26
 * (der Golden-Lauf endet in Woche 25).
 */

export type TaxStrategy = 'konservativ' | 'aggressiv' | 'illegal';

export type TaxAuditKind = 'betriebspruefung' | 'steuerfahndung' | 'wirtschaftspruefung' | 'sozialversicherung' | 'subventionspruefung';

export interface ActiveTaxAudit {
  kind: TaxAuditKind;
  startWeek: WeekIndex;
  endWeek: WeekIndex;
}

export interface FiskusState {
  strategy: TaxStrategy;
  /** Offene, nicht deklarierte Steuerlast — das Risiko, das eine Prüfung findet. */
  schwarzbuch: Money;
  /** Kumuliert hinterzogen (Lebenszeit) — bestimmt das Strafmaß. */
  hinterzogenTotal: Money;
  /** Prüfrisiko 0..100 — steigt mit riskanter Strategie, sinkt mit sauberen Jahren. */
  auditRisk: number;
  activeAudit: ActiveTaxAudit | null;
  lastAuditWeek: WeekIndex;
  cleanAudits: number;
  finesTotal: Money;
  logDe: string[];
}

export interface TaxStrategySpec {
  labelDe: string;
  hintDe: string;
  /** Anteil der Steuerlast, der tatsächlich deklariert/gezahlt wird. */
  declaredFactor: number;
  /** Anteil der Ersparnis, der bei Prüfung als Nachzahlung droht (ins Schwarzbuch). */
  atRiskShare: number;
}

export const TAX_STRATEGY_SPECS: Record<TaxStrategy, TaxStrategySpec> = {
  konservativ: {
    labelDe: 'Konservativ', declaredFactor: 1, atRiskShare: 0,
    hintDe: 'Alles sauber deklariert. Keine Überraschungen — der Schlaf ist ruhig.',
  },
  aggressiv: {
    labelDe: 'Aggressiv (Graubereich)', declaredFactor: 0.9, atRiskShare: 0.6,
    hintDe: 'Gestaltungsspielräume bis an die Kante: ~10 % weniger Steuerlast — ein Teil davon strittig. Bei Prüfung drohen Nachzahlung + Zinsen.',
  },
  illegal: {
    labelDe: 'Hinterziehung (illegal)', declaredFactor: 0.55, atRiskShare: 1,
    hintDe: 'Verschwiegene Umsätze & Scheinrechnungen (§ 370 AO): ~45 % der Steuerlast „gespart" — strafbar. Bei Entdeckung: Nachzahlung, Strafzuschlag, Reputation. Über 1 Mio € hinterzogen: Haft ohne Bewährung.',
  },
};

export interface TaxAuditSpec {
  labelDe: string;
  /** Amtliches Anschreiben (Inbox-Ton). */
  letterDe: string;
  durationWeeks: number;
  /** Berater-/Prüfungshonorar zu Beginn. */
  fee: Money;
}

export const TAX_AUDIT_SPECS: Record<TaxAuditKind, TaxAuditSpec> = {
  betriebspruefung: {
    labelDe: 'Betriebsprüfung (Finanzamt)', durationWeeks: 4, fee: 12_000,
    letterDe: 'hiermit ordnen wir gemäß § 193 AO eine Außenprüfung an. Prüfungsgegenstand: Körperschaft-, Gewerbe- und Umsatzsteuer der letzten Veranlagungszeiträume. Bitte halten Sie Buchführung und Belege bereit.',
  },
  steuerfahndung: {
    labelDe: 'Steuerfahndung (Durchsuchung)', durationWeeks: 3, fee: 25_000,
    letterDe: 'die Steuerfahndung hat heute Morgen Geschäftsräume und Server durchsucht (§ 208 AO, richterlicher Beschluss). Unterlagen und Datenträger wurden sichergestellt. Wir empfehlen dringend anwaltliche Vertretung.',
  },
  wirtschaftspruefung: {
    labelDe: 'Jahresabschlussprüfung (WP)', durationWeeks: 4, fee: 18_000,
    letterDe: 'im Auftrag der Anteilseigner beginnt die Prüfung des Jahresabschlusses (§ 316 HGB analog). Der Prüfungsschwerpunkt liegt auf Umsatzrealisierung und Rückstellungen.',
  },
  sozialversicherung: {
    labelDe: 'Sozialversicherungsprüfung (DRV)', durationWeeks: 2, fee: 4_000,
    letterDe: 'die Deutsche Rentenversicherung führt die turnusmäßige Betriebsprüfung nach § 28p SGB IV durch. Geprüft werden Beitragsabführung und Statusfragen (Scheinselbstständigkeit).',
  },
  subventionspruefung: {
    labelDe: 'Fördermittel-Verwendungsprüfung', durationWeeks: 3, fee: 6_000,
    letterDe: 'die Bewilligungsstelle prüft die zweckentsprechende Verwendung der gewährten Zuwendungen. Bei zweckwidriger Verwendung droht die Rückforderung nebst Verzinsung.',
  },
};

export function initialFiskusState(): FiskusState {
  return {
    strategy: 'konservativ',
    schwarzbuch: 0,
    hinterzogenTotal: 0,
    auditRisk: 0,
    activeAudit: null,
    lastAuditWeek: -99,
    cleanAudits: 0,
    finesTotal: 0,
    logDe: [],
  };
}

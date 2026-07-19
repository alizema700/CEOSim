import type { Id, WeekIndex } from './common.js';
import type { EffectPayload } from './effects.js';

/**
 * Zufalls- & Krisenereignisse (Event-Deck).
 *
 * Seed-gesteuert, szenariogewichtet, mit Cooldowns. Ein getriggertes Event
 * wird als ActiveRandomEvent in den State gelegt und verlangt eine Reaktion
 * über die Aktion RESPOND_EVENT — oder bewusstes Ignorieren: Nach
 * `autoResolveAfterWeeks` ohne Antwort greift die (meist ungünstige)
 * Default-Option.
 *
 * Phase 1 startet mit einem kleinen Deck (3 Events); Phase 2 erweitert auf
 * 10+ (Security-Breach mit 72h-DSGVO-Frist, Shitstorm, Covenant-Bruch, …).
 */
export interface RandomEventCard {
  id: string; // z. B. 'KEY_ACCOUNT_AT_RISK'
  titleDe: string;
  /** Erzähltext; ${placeholders} werden aus dem State gefüllt (Namen!). */
  bodyTemplateDe: string;
  /** Basisgewicht pro Woche (wird szenario-/schwierigkeitsgewichtet). */
  baseWeeklyWeight: number;
  /** Mindestabstand in Wochen bis dasselbe Event erneut feuern darf. */
  cooldownWeeks: number;
  /** Frühester Auftritt (Schonfrist am Spielanfang). */
  minWeek: WeekIndex;
  options: RandomEventOption[];
  /** Option, die bei Ignorieren automatisch greift. */
  defaultOptionId: string;
  autoResolveAfterWeeks: number;
}

export interface RandomEventOption {
  id: string;
  labelDe: string;
  /** Was passiert mechanisch — sofortige Effekte + geplante Folgeeffekte. */
  immediateEffects: EffectPayload[];
  scheduledEffects: { delayWeeks: number; effect: EffectPayload }[];
  /** Hinweis für die Bewertungs-Pipeline (Prozessqualität der Option). */
  processQualityHint: 'good' | 'defensible' | 'risky' | 'bad';
}

/** Instanz eines getriggerten Events im State. */
export interface ActiveRandomEvent {
  instanceId: Id;
  cardId: string;
  triggeredWeek: WeekIndex;
  /** Aufgelöster Erzähltext (Platzhalter bereits gefüllt). */
  bodyDe: string;
  /** Kontext-Bindung, z. B. betroffener Key-Account/Mitarbeiter. */
  boundEntityId: Id | null;
  status: 'open' | 'resolved' | 'autoResolved';
  resolvedWeek: WeekIndex | null;
  chosenOptionId: string | null;
}

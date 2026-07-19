import type { CompanyState } from '../types/company.js';
import type { EffectPayload } from '../types/effects.js';

export function deptDe(d: string): string {
  return (
    { engineering: 'Engineering', sales: 'Vertrieb', marketing: 'Marketing', cs: 'Customer Success', ga: 'Verwaltung (G&A)' }[d] ?? d
  );
}

/** Deterministische ID-Vergabe über den State-Zähler. */
export function nextId(state: CompanyState, prefix: string): string {
  state.idCounter += 1;
  return `${prefix}_${state.idCounter.toString(36)}`;
}

/** Geplanten Folge-Effekt anlegen (delayWeeks = 0 ⇒ fällig im nächsten Tick). */
export function schedule(
  state: CompanyState,
  delayWeeks: number,
  sourceDe: string,
  sourceId: string | null,
  effect: EffectPayload,
  kind: 'decision' | 'event' | 'system' = 'decision',
): void {
  state.scheduledEffects.push({
    id: nextId(state, 'fx'),
    dueWeek: state.meta.week + delayWeeks,
    sourceDe,
    sourceRef: { kind, id: sourceId },
    effect,
  });
}

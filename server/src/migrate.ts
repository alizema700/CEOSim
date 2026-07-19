import type { CompanyState } from '@boardroom/shared';

/**
 * Sanfte Snapshot-Migration: füllt Felder auf, die neuere Engine-Versionen
 * erwarten, damit ältere Spielstände weiter ladbar bleiben. Die Quelle der
 * Wahrheit bleibt das Event-Log; hier geht es nur um Shape-Kompatibilität.
 */
export function ensureStateShape(state: CompanyState): CompanyState {
  const s = state as CompanyState & Record<string, unknown>;

  if (!s.comms) s.comms = { messages: [], cooldowns: {} };
  if (!s.calendar) s.calendar = { appointments: [] };
  if (!s.people.assistant) {
    s.people.assistant = { id: 'asst_legacy', name: 'Johanna Keller', personalityDe: 'organisiert, loyal, direkt' };
  }
  if (typeof s.finance.consecutiveMinCashBreachWeeks !== 'number') {
    s.finance.consecutiveMinCashBreachWeeks = 0;
  }
  for (const ev of s.openEvents) {
    if (!ev.data) ev.data = {};
  }
  for (const m of s.comms.messages) {
    if (m.templateId === undefined) m.templateId = null;
    if (m.handledWeek === undefined) m.handledWeek = null;
  }
  return state;
}

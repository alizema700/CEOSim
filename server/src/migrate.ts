import { fnv1a, generateMaTargets, initialIpoState, initialLaborState, initialLegalState, personaBits, resolveLocationProfile, stream, type CompanyState } from '@boardroom/shared';

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
  if (!s.projects) s.projects = [];
  if (!s.pressLog) s.pressLog = [];
  // Phase 5: Fundraising, Konkurrenz-Agenten, M&A-Ziele
  if (!s.funding) s.funding = { rounds: [], investorBoardSeat: false, ventureDebtTaken: false };
  if (!s.market.agentCooldowns) s.market.agentCooldowns = {};
  if (!s.market.maTargets) s.market.maTargets = generateMaTargets(s.meta.seed, s);
  // Phase 6: IPO-Prozess
  if (!s.ipo) s.ipo = initialIpoState();
  // Phase 7: Steckbrief-Felder (deterministisch aus der Personal-ID) + Standortprofil
  for (const e of s.people.employees) {
    if (typeof e.age !== 'number') {
      Object.assign(e, personaBits(stream(s.meta.seed, 'persona-migrate', 0, fnv1a(e.id)), e.seniority));
    }
  }
  if (!s.identity.location) {
    s.identity.location = resolveLocationProfile(s.identity.locationId);
  }
  // Phase 8: Arbeitsbeziehungen (Tarif, Gewerkschaft, Betriebsrat, Konfliktniveau).
  if (!s.labor) {
    const loc = s.identity.location ?? resolveLocationProfile(s.identity.locationId);
    s.labor = initialLaborState(loc.regulationDensity, false);
  }
  // Phase 9: Rechtsform & Gesellschaftsrecht (GmbH/AG, Kapital, Organe).
  if (!s.legal) {
    const loc = s.identity.location ?? resolveLocationProfile(s.identity.locationId);
    s.legal = initialLegalState(s.meta.seed, loc);
  }
  return state;
}

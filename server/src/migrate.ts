import { balancedFocus, initialCeoPersonal, initialCeoPortfolio, buildInitialBoard, fnv1a, generateMaTargets, initialCompetitorStrikeState, initialCrisisState, initialPoliticsState, initialInsuranceState, initialCertificationState, initialProductModules, initialMacroState, initialIpoState, initialLaborState, initialLegalState, initialTakeoverState, personaBits, resolveLocationProfile, stream, type CompanyState } from '@boardroom/shared';

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
  // Phase 10: Aufsichtsrat/Board-Roster (ESOP-Grants sind optional → keine Migration).
  if (!s.board) {
    s.board = buildInitialBoard(s.meta.seed, s.playerProfile.ceoName);
  }
  // Phase 12: Der CEO als Mensch (Energie, Fokus, Netto-Vermögen, Coach, Public-Log).
  if (typeof s.ceo.energy !== 'number') {
    s.ceo.energy = 78;
    s.ceo.focus = balancedFocus();
    s.ceo.personalNetCash = 0;
    s.ceo.coach = null;
    s.ceo.publicLog = [];
  }
  // Phase 14: Feindliche Übernahme.
  if (!s.takeover) s.takeover = initialTakeoverState();
  if (!s.crisis) s.crisis = initialCrisisState();
  if (!s.macro) s.macro = initialMacroState();
  if (!s.rivalry) s.rivalry = initialCompetitorStrikeState();
  if (!s.politics) s.politics = initialPoliticsState();
  if (s.politics && (s.politics as { regulatoryPressure?: number }).regulatoryPressure === undefined) { const p = s.politics as { regulatoryPressure: number; activeRegulation: null; lastRegulationWeek: number }; p.regulatoryPressure = 0; p.activeRegulation = null; p.lastRegulationWeek = -99; }
  if (!s.insurance) s.insurance = initialInsuranceState();
  if (!s.certifications) s.certifications = initialCertificationState();
  if (s.product && !(s.product as { modules?: unknown }).modules) { const p = s.product as { modules: ReturnType<typeof initialProductModules>; positioning: string; packaging: string }; p.modules = initialProductModules(); p.positioning = 'balance'; p.packaging = 'single'; }
  if (s.macro && (s.macro as { inflationPct?: number }).inflationPct === undefined) { (s.macro as { inflationPct: number }).inflationPct = 2.0; (s.macro as { capitalIndex: number }).capitalIndex = 100; }
  if (s.macro && (s.macro as { shock?: unknown }).shock === undefined) { (s.macro as { shock: null }).shock = null; (s.macro as { lastShockEpisodeWeek: number }).lastShockEpisodeWeek = -99; }
  if (s.finance && (s.finance as { treasury?: number }).treasury === undefined) { (s.finance as { treasury: number }).treasury = 0; (s.finance as { treasuryYieldTotal: number }).treasuryYieldTotal = 0; }
  if (s.board && s.board.lastMeetingWeek === undefined) { s.board.lastMeetingWeek = -99; s.board.lastMeeting = null; }
  if (s.ceo && !s.ceo.personal) s.ceo.personal = initialCeoPersonal();
  if (s.ceo && !s.ceo.portfolio) s.ceo.portfolio = initialCeoPortfolio();
  return state;
}

import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { BoardMember, BoardState, MemberVote, ResolutionKind, ResolutionRecord } from '../types/board.js';
import { personName } from './names.js';
import { stream } from './rng.js';

/**
 * Governance-Engine (Phase 10): benannte Aufsichtsrats-/Board-Sitze mit
 * Grundhaltung und echte Beschlüsse mit Einzelstimmen. Die Einzel-Zustimmung
 * je Sitz wird deterministisch aus `ceo.boardTrust` + persistentem Bias
 * abgeleitet (+ situative Faktoren), damit die bestehende Vertrauens-Mechanik
 * die Leitgröße bleibt und nichts desynchronisiert.
 */

export function buildInitialBoard(seed: number, ceoName: string): BoardState {
  const rng = stream(seed, 'board-roster', 0);
  const a = personName(rng);
  const b = personName(rng);
  const c = personName(rng);
  const members: BoardMember[] = [
    { id: 'seat_chair', name: `${a.firstName} ${a.lastName}`, seatType: 'chair', affiliationDe: 'Vorsitz des Aufsichtsrats · Lead-Investor Almberg Capital', bias: -4, appointedWeek: 0, capitalShare: 0.33 },
    { id: 'seat_founder', name: `${b.firstName} ${b.lastName}`, seatType: 'founder', affiliationDe: 'Gründervertreter:in', bias: 10, appointedWeek: 0, capitalShare: 0.52 },
    { id: 'seat_ceo', name: ceoName, seatType: 'ceo', affiliationDe: 'CEO (Sie) — bei eigenen Belangen befangen', bias: 14, appointedWeek: 0, capitalShare: 0.05 },
    { id: 'seat_independent', name: `${c.firstName} ${c.lastName}`, seatType: 'independent', affiliationDe: 'Unabhängiges Mitglied', bias: 2, appointedWeek: 0, capitalShare: 0.1 },
  ];
  return { members, resolutions: [] };
}

/** Aktueller Kapitalanteil, den ein Sitz vertritt (aus der LIVE-Cap-Table). */
function seatCapitalShare(state: CompanyState, seatType: BoardMember['seatType']): number {
  const ct = state.capTable;
  const sum = (kinds: string[]) => ct.filter((e) => kinds.includes(e.kind)).reduce((a, e) => a + e.share, 0);
  switch (seatType) {
    case 'chair':
    case 'investor':
      return sum(['investor']);
    case 'founder':
      return sum(['founder']);
    case 'ceo':
      return sum(['ceo']);
    case 'independent':
      return sum(['esop', 'public']);
    default:
      return 0; // Belegschaftsvertreter halten kein Kapital
  }
}

/** Zustimmungswert eines Mitglieds (0..100): Board-Vertrauen + Bias + Situation. */
export function memberSupport(state: CompanyState, m: BoardMember): number {
  let s = state.ceo.boardTrust + m.bias;
  if (m.seatType === 'employee') s -= (state.labor.tension - 30) * 0.4; // reagiert auf Betriebsklima
  if ((m.seatType === 'investor' || m.seatType === 'chair') && state.finance.consecutiveMinCashBreachWeeks > 0) s -= 12;
  return clamp(Math.round(s), 0, 100);
}

const REQUIRED: Record<ResolutionKind, { basis: 'capital' | 'seat'; share: number }> = {
  formwechsel: { basis: 'capital', share: 0.75 }, // Satzungsänderung
  kapitalerhoehung: { basis: 'capital', share: 0.75 },
  dividende: { basis: 'capital', share: 0.5 },
  ma: { basis: 'capital', share: 0.5 },
  'ceo-verguetung': { basis: 'seat', share: 0.5 }, // Aufsichtsrat, CEO befangen
};

function voteFor(support: number): MemberVote['vote'] {
  return support >= 52 ? 'ja' : support >= 42 ? 'enthaltung' : 'nein';
}

/**
 * Beschluss rechnen. Kapital-Basis (Gesellschafter) gewichtet nach LIVE-Anteil;
 * Sitz-Basis (Aufsichtsrat) zählt Köpfe. Bei der CEO-Vergütung ist der CEO
 * befangen und stimmt nicht mit.
 */
export function computeResolution(state: CompanyState, kind: ResolutionKind, titleDe: string): ResolutionRecord {
  const rule = REQUIRED[kind];
  const votes: MemberVote[] = [];
  let forWeight = 0;
  let totalWeight = 0;
  for (const m of state.board.members) {
    const conflicted = kind === 'ceo-verguetung' && m.seatType === 'ceo';
    if (conflicted) continue; // Befangenheit: keine Stimme
    if (rule.basis === 'capital' && m.seatType === 'employee') continue; // kein Gesellschafter
    const support = memberSupport(state, m);
    const vote = voteFor(support);
    votes.push({ memberId: m.id, name: m.name, vote, support });
    const weight = rule.basis === 'capital' ? seatCapitalShare(state, m.seatType) : 1;
    totalWeight += weight;
    if (vote === 'ja') forWeight += weight;
  }
  const forShare = totalWeight > 0 ? forWeight / totalWeight : 0;
  return {
    week: state.meta.week,
    kind,
    titleDe,
    passed: forShare >= rule.share,
    requiredShare: rule.share,
    forShare: Math.round(forShare * 1000) / 1000,
    basis: rule.basis,
    votes,
  };
}

/** Beschluss rechnen UND protokollieren (fürs UI/Historie). */
export function recordResolution(state: CompanyState, kind: ResolutionKind, titleDe: string): ResolutionRecord {
  const r = computeResolution(state, kind, titleDe);
  state.board.resolutions.push(r);
  if (state.board.resolutions.length > 40) state.board.resolutions.splice(0, state.board.resolutions.length - 40);
  return r;
}

/**
 * Governance-Tick: setzt einen Belegschaftssitz ein, sobald Mitbestimmung
 * greift (Drittelbeteiligung/paritätisch), und entfernt ihn wieder, wenn nicht.
 */
export function tickGovernance(state: CompanyState, occ: import('../types/game.js').Occurrence[]): void {
  const hasEmployeeSeat = state.board.members.some((m) => m.seatType === 'employee');
  const shouldHave = state.legal.mitbestimmung !== 'keine';
  if (shouldHave && !hasEmployeeSeat) {
    const rng = stream(state.meta.seed, 'board-employee', state.meta.week);
    const p = personName(rng);
    state.board.members.push({
      id: 'seat_employee',
      name: `${p.firstName} ${p.lastName}`,
      seatType: 'employee',
      affiliationDe: state.legal.mitbestimmung === 'paritaetisch' ? 'Arbeitnehmervertretung (paritätisch)' : 'Arbeitnehmervertretung (Drittelbeteiligung)',
      bias: 0,
      appointedWeek: state.meta.week,
      capitalShare: 0,
    });
    occ.push({ icon: '🪧', textDe: 'Ein Sitz im Aufsichtsrat geht an die Arbeitnehmervertretung (Mitbestimmung).', severity: 'info' });
  } else if (!shouldHave && hasEmployeeSeat) {
    state.board.members = state.board.members.filter((m) => m.seatType !== 'employee');
  }
}

/** Kurzfassung fürs UI/Personas. */
export function boardSummaryDe(state: CompanyState): string {
  const n = state.board.members.length;
  const avg = Math.round(state.board.members.reduce((a, m) => a + memberSupport(state, m), 0) / n);
  return `${n} Sitze · Ø-Rückhalt ${avg}/100`;
}

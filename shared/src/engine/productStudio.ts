import { clamp } from '../types/common.js';
import type { CompanyState } from '../types/company.js';
import type { Occurrence } from '../types/game.js';
import { MODULE_KINDS, MODULE_SPECS, PACKAGING_SPECS, POSITIONING_SPECS, type ProductModuleKind } from '../types/product.js';
import { nextId } from './stateHelpers.js';

/**
 * Produkt-Studio (Phase 22, FB3): echte Produkt-Stellschrauben statt nur
 * R&D-Regler. Module sind ein Build-Prozess über Wochen (Kosten + Pflege),
 * danach dauerhaft wirksam; Positionierung & Packaging sind Konfigurationen
 * mit klaren Tradeoffs.
 *
 * Golden-Master-sicher: Default (keine Module, Balance, Ein Preis) ⇒ keine
 * Pflegekosten, keine Modifikatoren, tickProductStudio ist ein No-op.
 */

const STUDIO_SOURCE = 'Produkt-Studio';

/** Laufende Modul-Pflege (fließt in die R&D-Sachkosten). */
export function moduleMaintenanceMonthly(state: CompanyState): number {
  const mods = state.product.modules;
  if (!mods) return 0;
  let sum = 0;
  for (const kind of MODULE_KINDS) {
    if (mods[kind]?.status === 'live') sum += MODULE_SPECS[kind].maintenanceMonthly;
  }
  return sum;
}

/** Anzahl live geschalteter Module. */
export function liveModuleCount(state: CompanyState): number {
  const mods = state.product.modules;
  if (!mods) return 0;
  return MODULE_KINDS.filter((k) => mods[k].status === 'live').length;
}

// ── Wochentick ──────────────────────────────────────────────────────
export function tickProductStudio(state: CompanyState, occ: Occurrence[]): void {
  const p = state.product;
  if (!p.modules) return;
  const week = state.meta.week;

  // Studio-Modifikatoren der Vorwoche zurücksetzen; unten neu setzen.
  state.activeModifiers = state.activeModifiers.filter((m) => m.sourceDe !== STUDIO_SOURCE);

  const push = (target: 'trialWinRate' | 'churnMonthly' | 'expansionMonthly' | 'leadGen', factor: number): void => {
    if (factor === 1) return;
    state.activeModifiers.push({ id: nextId(state, 'mod'), target, factor, startWeek: week, endWeek: week + 1, sourceDe: STUDIO_SOURCE });
  };

  // Module: Fertigstellung + dauerhafte Wirkung.
  for (const kind of MODULE_KINDS) {
    const mod = p.modules[kind];
    const spec = MODULE_SPECS[kind];
    if (mod.status === 'building' && week >= mod.startedWeek + spec.buildWeeks) {
      mod.status = 'live';
      mod.liveWeek = week;
      p.nps = clamp(p.nps + spec.npsOnLive, -100, 100);
      // Neues Modul = neue Fläche: ein Hauch Tech-Debt gehört zur Wahrheit.
      p.techDebt = clamp(p.techDebt + 2, 0, 100);
      occ.push({ icon: '🚀', textDe: `Modul live: ${spec.labelDe} — ab sofort Teil des Produkts (Pflege ${Math.round(spec.maintenanceMonthly / 100) / 10} k€/M).`, severity: 'good' });
    }
    if (mod.status === 'live') {
      push('trialWinRate', spec.winFactor);
      push('churnMonthly', spec.churnFactor);
      push('expansionMonthly', spec.expansionFactor);
      push('leadGen', spec.leadFactor);
    }
  }

  // Positionierung (nur wenn nicht Balance).
  const pos = POSITIONING_SPECS[p.positioning ?? 'balance'];
  push('trialWinRate', pos.winFactor);
  push('expansionMonthly', pos.expansionFactor);

  // Packaging (nur wenn nicht Ein-Preis).
  const pack = PACKAGING_SPECS[p.packaging ?? 'single'];
  push('trialWinRate', pack.winFactor);
  push('churnMonthly', pack.churnFactor);
  push('expansionMonthly', pack.expansionFactor);
}

/** Kurzstatus fürs UI/Personas. */
export function productStudioSummaryDe(state: CompanyState): string {
  const p = state.product;
  if (!p.modules) return '';
  const live = MODULE_KINDS.filter((k) => p.modules[k].status === 'live').map((k) => MODULE_SPECS[k].labelDe);
  const building = MODULE_KINDS.filter((k) => p.modules[k].status === 'building').map((k) => MODULE_SPECS[k].labelDe);
  const parts: string[] = [];
  if (live.length) parts.push(`Module live: ${live.join(', ')}`);
  if (building.length) parts.push(`im Bau: ${building.join(', ')}`);
  if ((p.positioning ?? 'balance') !== 'balance') parts.push(`Positionierung ${POSITIONING_SPECS[p.positioning].labelDe}`);
  if ((p.packaging ?? 'single') !== 'single') parts.push(`Preismodell ${PACKAGING_SPECS[p.packaging].labelDe}`);
  return parts.join(' · ');
}

export function startModuleBuild(state: CompanyState, kind: ProductModuleKind): void {
  const mod = state.product.modules[kind];
  mod.status = 'building';
  mod.startedWeek = state.meta.week;
}

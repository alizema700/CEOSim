import { describe, expect, it } from 'vitest';
import { newGame, forceCash } from './helpers.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { tickProductStudio, moduleMaintenanceMonthly, liveModuleCount } from '../src/engine/productStudio.js';
import { MODULE_SPECS } from '../src/types/product.js';

/**
 * Phase 22 (FB3): Produkt-Studio — Module (Build-Prozess), Positionierung,
 * Packaging. Golden-Master-sicher: Defaults (keine Module, Balance, Ein Preis)
 * sind komplett inert.
 */

const STUDIO = 'Produkt-Studio';
const mods = (s: ReturnType<typeof newGame>) => s.activeModifiers.filter((m) => m.sourceDe === STUDIO);

describe('Produkt-Studio', () => {
  it('Defaults sind inert: keine Modifikatoren, keine Pflegekosten (Golden-neutral)', () => {
    const s = newGame(31000);
    tickProductStudio(s, []);
    expect(mods(s).length).toBe(0);
    expect(moduleMaintenanceMonthly(s)).toBe(0);
  });

  it('Modul-Bau: building → live nach buildWeeks, NPS-Schub + Modifikatoren + Pflege', () => {
    const s = newGame(31001);
    forceCash(s, 400_000);
    applyAction(s, { type: 'BUILD_MODULE', module: 'api' }, null, 'd');
    expect(s.product.modules.api.status).toBe('building');
    // Doppelstart abgelehnt.
    expect(validateAction(s, { type: 'BUILD_MODULE', module: 'api' }).ok).toBe(false);
    const npsBefore = s.product.nps;
    s.meta.week = s.product.modules.api.startedWeek + MODULE_SPECS.api.buildWeeks;
    const occ: { icon: string; textDe: string; severity: string }[] = [];
    tickProductStudio(s, occ as never);
    expect(s.product.modules.api.status).toBe('live');
    expect(s.product.nps).toBe(npsBefore + MODULE_SPECS.api.npsOnLive);
    expect(occ.some((o) => /Modul live/.test(o.textDe))).toBe(true);
    expect(liveModuleCount(s)).toBe(1);
    expect(moduleMaintenanceMonthly(s)).toBe(MODULE_SPECS.api.maintenanceMonthly);
    const churn = mods(s).find((m) => m.target === 'churnMonthly');
    expect(churn).toBeDefined();
    expect(churn!.factor).toBeLessThan(1); // API = Lock-in
  });

  it('Validierung: Bau braucht Liquidität', () => {
    const s = newGame(31002);
    forceCash(s, 30_000);
    expect(validateAction(s, { type: 'BUILD_MODULE', module: 'kiAssistent' }).ok).toBe(false);
    forceCash(s, 300_000);
    expect(validateAction(s, { type: 'BUILD_MODULE', module: 'kiAssistent' }).ok).toBe(true);
  });

  it('Positionierung Power hebt Expansion und dämpft Abschlussquote', () => {
    const s = newGame(31003);
    applyAction(s, { type: 'SET_POSITIONING', positioning: 'power' }, null, 'd');
    tickProductStudio(s, []);
    const win = mods(s).find((m) => m.target === 'trialWinRate');
    const exp = mods(s).find((m) => m.target === 'expansionMonthly');
    expect(win!.factor).toBeLessThan(1);
    expect(exp!.factor).toBeGreaterThan(1);
    // Gleiche Wahl erneut ⇒ abgelehnt.
    expect(validateAction(s, { type: 'SET_POSITIONING', positioning: 'power' }).ok).toBe(false);
  });

  it('Packaging Usage: Expansion rauf, Churn rauf (Rechnungsschock)', () => {
    const s = newGame(31004);
    applyAction(s, { type: 'SET_PACKAGING', packaging: 'usage' }, null, 'd');
    tickProductStudio(s, []);
    const churn = mods(s).find((m) => m.target === 'churnMonthly');
    const exp = mods(s).find((m) => m.target === 'expansionMonthly');
    expect(churn!.factor).toBeGreaterThan(1);
    expect(exp!.factor).toBeGreaterThan(1);
  });
});

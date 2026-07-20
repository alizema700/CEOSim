import type { LocationId, LocationProfile } from '../../types/identity.js';
import { clamp } from '../../types/common.js';
import { fnv1a } from '../rng.js';

/** Kern-Standort-Profile (Phase 1) — beeinflussen Payroll, Hiring, Steuern, Bürokosten. */
export const LOCATIONS: Record<LocationId, LocationProfile> = {
  muenchen: {
    id: 'muenchen',
    nameDe: 'München',
    country: 'Deutschland',
    payrollIndex: 1.0,
    talentPool: 0.85,
    taxRate: 0.30,
    regulationDensity: 'high',
    officeCostPerEmployeeMonthly: 680,
  },
  berlin: {
    id: 'berlin',
    nameDe: 'Berlin',
    country: 'Deutschland',
    payrollIndex: 0.92,
    talentPool: 0.95,
    taxRate: 0.30,
    regulationDensity: 'high',
    officeCostPerEmployeeMonthly: 520,
  },
  zuerich: {
    id: 'zuerich',
    nameDe: 'Zürich',
    country: 'Schweiz',
    payrollIndex: 1.38,
    talentPool: 0.75,
    taxRate: 0.19,
    regulationDensity: 'medium',
    officeCostPerEmployeeMonthly: 950,
  },
  austin: {
    id: 'austin',
    nameDe: 'Austin (Texas)',
    country: 'USA',
    payrollIndex: 1.18,
    talentPool: 1.0,
    taxRate: 0.21,
    regulationDensity: 'low',
    officeCostPerEmployeeMonthly: 720,
  },
};

/**
 * Städte-Presets für die Standort-Karte (Phase 7). Kuratierte, plausible
 * Profile — die Kern-Presets sind enthalten, damit alles über EINE Liste läuft.
 */
export const CITY_PRESETS: LocationProfile[] = [
  LOCATIONS.muenchen,
  LOCATIONS.berlin,
  { id: 'hamburg', nameDe: 'Hamburg', country: 'Deutschland', payrollIndex: 0.96, talentPool: 0.82, taxRate: 0.3, regulationDensity: 'high', officeCostPerEmployeeMonthly: 600 },
  { id: 'frankfurt', nameDe: 'Frankfurt', country: 'Deutschland', payrollIndex: 1.05, talentPool: 0.8, taxRate: 0.3, regulationDensity: 'high', officeCostPerEmployeeMonthly: 730 },
  { id: 'koeln', nameDe: 'Köln', country: 'Deutschland', payrollIndex: 0.93, talentPool: 0.8, taxRate: 0.3, regulationDensity: 'high', officeCostPerEmployeeMonthly: 560 },
  { id: 'wien', nameDe: 'Wien', country: 'Österreich', payrollIndex: 0.9, talentPool: 0.8, taxRate: 0.24, regulationDensity: 'high', officeCostPerEmployeeMonthly: 540 },
  LOCATIONS.zuerich,
  { id: 'london', nameDe: 'London', country: 'Großbritannien', payrollIndex: 1.25, talentPool: 1.0, taxRate: 0.25, regulationDensity: 'medium', officeCostPerEmployeeMonthly: 980 },
  { id: 'paris', nameDe: 'Paris', country: 'Frankreich', payrollIndex: 1.12, talentPool: 0.9, taxRate: 0.28, regulationDensity: 'high', officeCostPerEmployeeMonthly: 840 },
  { id: 'amsterdam', nameDe: 'Amsterdam', country: 'Niederlande', payrollIndex: 1.08, talentPool: 0.88, taxRate: 0.258, regulationDensity: 'medium', officeCostPerEmployeeMonthly: 760 },
  { id: 'stockholm', nameDe: 'Stockholm', country: 'Schweden', payrollIndex: 1.1, talentPool: 0.85, taxRate: 0.206, regulationDensity: 'medium', officeCostPerEmployeeMonthly: 700 },
  { id: 'lissabon', nameDe: 'Lissabon', country: 'Portugal', payrollIndex: 0.72, talentPool: 0.7, taxRate: 0.21, regulationDensity: 'medium', officeCostPerEmployeeMonthly: 430 },
  { id: 'warschau', nameDe: 'Warschau', country: 'Polen', payrollIndex: 0.58, talentPool: 0.78, taxRate: 0.19, regulationDensity: 'medium', officeCostPerEmployeeMonthly: 380 },
  { id: 'newyork', nameDe: 'New York', country: 'USA', payrollIndex: 1.45, talentPool: 1.0, taxRate: 0.26, regulationDensity: 'medium', officeCostPerEmployeeMonthly: 1150 },
  LOCATIONS.austin,
  { id: 'singapur', nameDe: 'Singapur', country: 'Singapur', payrollIndex: 1.15, talentPool: 0.85, taxRate: 0.17, regulationDensity: 'low', officeCostPerEmployeeMonthly: 900 },
  { id: 'bangalore', nameDe: 'Bangalore', country: 'Indien', payrollIndex: 0.38, talentPool: 0.9, taxRate: 0.25, regulationDensity: 'medium', officeCostPerEmployeeMonthly: 260 },
  { id: 'telaviv', nameDe: 'Tel Aviv', country: 'Israel', payrollIndex: 1.12, talentPool: 0.88, taxRate: 0.23, regulationDensity: 'low', officeCostPerEmployeeMonthly: 820 },
];

/**
 * Deterministische Standort-Schätzung für FREIE Städte (Phase 7): Der
 * „Standort-Analyst" leitet aus dem Städtenamen ein plausibles, aber
 * seed-stabiles Profil ab. Kein LLM nötig — die Engine bleibt Wahrheit;
 * gleiche Stadt ⇒ immer gleiche Bedingungen.
 */
export function profileForCity(cityName: string): LocationProfile {
  const clean = cityName.trim();
  const preset = CITY_PRESETS.find((c) => c.nameDe.toLowerCase() === clean.toLowerCase() || c.id === clean.toLowerCase());
  if (preset) return preset;
  const h = fnv1a('city:' + clean.toLowerCase());
  const payrollIndex = Math.round((0.55 + (h % 90) / 100) * 100) / 100;
  const talentPool = Math.round((0.6 + ((h >>> 3) % 40) / 100) * 100) / 100;
  const taxRate = Math.round((0.17 + ((h >>> 5) % 15) / 100) * 1000) / 1000;
  const regulationDensity = (['low', 'medium', 'high'] as const)[(h >>> 7) % 3]!;
  const officeCostPerEmployeeMonthly = 350 + Math.round((payrollIndex - 0.55) * 900);
  return {
    id: 'city_' + h.toString(36),
    nameDe: clean,
    country: 'geschätzt',
    payrollIndex,
    talentPool,
    taxRate,
    regulationDensity,
    officeCostPerEmployeeMonthly,
  };
}

/** Standortprofil beim Spielstart auflösen: Preset > mitgegebenes Profil (geklemmt) > Schätzung. */
export function resolveLocationProfile(locationId: string, provided?: LocationProfile): LocationProfile {
  const known = (LOCATIONS as Record<string, LocationProfile>)[locationId] ?? CITY_PRESETS.find((c) => c.id === locationId);
  if (known) return known;
  if (provided) {
    return {
      id: provided.id || 'city_custom',
      nameDe: provided.nameDe.slice(0, 40) || locationId,
      country: provided.country.slice(0, 40),
      payrollIndex: clamp(provided.payrollIndex, 0.3, 1.6),
      talentPool: clamp(provided.talentPool, 0.4, 1),
      taxRate: clamp(provided.taxRate, 0.1, 0.4),
      regulationDensity: provided.regulationDensity,
      officeCostPerEmployeeMonthly: clamp(provided.officeCostPerEmployeeMonthly, 150, 2000),
    };
  }
  return profileForCity(locationId);
}

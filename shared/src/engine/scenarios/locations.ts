import type { LocationId, LocationProfile } from '../../types/identity.js';

/** Standort-Profile — beeinflussen Payroll, Hiring, Steuern, Bürokosten. */
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

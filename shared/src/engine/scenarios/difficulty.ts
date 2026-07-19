import type { DifficultyId } from '../../types/common.js';

/** Schwierigkeits-Modifikatoren (multiplikativ auf die Basiswerte). */
export interface DifficultyProfile {
  id: DifficultyId;
  nameDe: string;
  descriptionDe: string;
  /** Startkapital-Multiplikator. */
  startingCashMult: number;
  /** Wahrscheinlichkeits-Multiplikator für Zufallsereignisse. */
  eventWeightMult: number;
  /** Multiplikator auf NEGATIVE Board-Vertrauens-Deltas (Härte des Boards). */
  trustPenaltyMult: number;
  /** Mentor-/Warnhinweise im UI aktiv? */
  mentorHints: boolean;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyProfile> = {
  praktikant: {
    id: 'praktikant',
    nameDe: 'Praktikant:in',
    descriptionDe: 'Mildes Board, wenige Störfeuer, Mentor-Hinweise an. Zum Lernen der Systeme.',
    startingCashMult: 1.25,
    eventWeightMult: 0.5,
    trustPenaltyMult: 0.5,
    mentorHints: true,
  },
  manager: {
    id: 'manager',
    nameDe: 'Manager:in',
    descriptionDe: 'Ausgewogene Simulation — der Standard.',
    startingCashMult: 1.0,
    eventWeightMult: 1.0,
    trustPenaltyMult: 1.0,
    mentorHints: true,
  },
  ceo: {
    id: 'ceo',
    nameDe: 'CEO',
    descriptionDe: 'Ungeduldiges Board, mehr Ereignisse, keine Mentor-Hinweise.',
    startingCashMult: 0.9,
    eventWeightMult: 1.25,
    trustPenaltyMult: 1.3,
    mentorHints: false,
  },
  aktivist: {
    id: 'aktivist',
    nameDe: 'Aktivistischer Investor',
    descriptionDe: 'Hartes Board ohne Verzeihung, häufige Krisen, knappes Kapital.',
    startingCashMult: 0.75,
    eventWeightMult: 1.6,
    trustPenaltyMult: 1.7,
    mentorHints: false,
  },
};

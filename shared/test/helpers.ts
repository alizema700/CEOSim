import type { GameSetup } from '../src/types/game.js';
import { createCompany } from '../src/engine/init.js';
import type { CompanyState } from '../src/types/company.js';

export function testSetup(overrides: Partial<GameSetup> = {}): GameSetup {
  return {
    scenarioId: 'saas-turnaround',
    difficulty: 'manager',
    identity: {
      companyName: 'NimbusDesk GmbH',
      logoColor: '#22d3ee',
      logoEmoji: '☁️',
      productPitch: 'Helpdesk-Software für den Mittelstand',
      mission: 'Support-Teams von Routine befreien',
      vision: 'Der Standard für Mittelstands-Support in DACH',
      values: ['Menschen zuerst', 'Ehrlichkeit', 'Handwerk'],
      motto: 'Menschen zuerst.',
      locationId: 'muenchen',
    },
    playerProfile: {
      ceoName: 'Alex Test',
      strengths: ['produkt'],
      weaknesses: ['finanzen'],
    },
    ...overrides,
  };
}

export function newGame(seed = 42): CompanyState {
  return createCompany(testSetup(), seed, 'game_test', '2026-01-05T09:00:00.000Z');
}

/** Kasse bilanzkonform manipulieren (Gegenbuchung über Retained Earnings). */
export function forceCash(s: CompanyState, amount: number): void {
  const delta = amount - s.finance.cash;
  s.finance.cash = amount;
  s.finance.retainedEarnings += delta;
}

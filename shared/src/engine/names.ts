import { pick, type Rng } from './rng.js';

/**
 * Deterministische Namensgeneratoren — das Spiel soll sich MENSCHLICH
 * anfühlen: Jede Person hat Vor- und Nachnamen, jeder Kunde eine Firma.
 * Alle Namen sind fiktiv; Auswahl ist seed-gesteuert.
 */

const FIRST_NAMES = [
  'Anna', 'Lukas', 'Miriam', 'Jonas', 'Leonie', 'David', 'Sofia', 'Felix',
  'Clara', 'Maximilian', 'Elif', 'Paul', 'Johanna', 'Emre', 'Katharina',
  'Tobias', 'Aylin', 'Sebastian', 'Franziska', 'Niklas', 'Melanie', 'Jan',
  'Ricarda', 'Timo', 'Verena', 'Christoph', 'Nadja', 'Patrick', 'Sandra',
  'Oliver', 'Julia', 'Matthias', 'Lea', 'Daniel', 'Carina', 'Stefan',
  'Petra', 'Adrian', 'Helena', 'Marco',
] as const;

const LAST_NAMES = [
  'Berger', 'Schmitt', 'Weidner', 'Hoffmann', 'Krüger', 'Lindner', 'Vogel',
  'Brandt', 'Steiner', 'Wolf', 'Neumann', 'Yilmaz', 'Fischer', 'Baumann',
  'Keller', 'Richter', 'Öztürk', 'Seidel', 'Lorenz', 'Haas', 'Winkler',
  'Sauer', 'Kowalski', 'Ebert', 'Frank', 'Grimm', 'Albrecht', 'Petrova',
  'Janssen', 'Reuter', 'Moser', 'Wagner', 'Hartmann', 'Kaiser', 'Böhm',
  'Schuster', 'Nguyen', 'Bachmann', 'Roth', 'Ziegler',
] as const;

/** Fiktive Kundenfirmen (B2B). */
const ACCOUNT_NAMES = [
  'TechCorp AG', 'Meridian Logistik GmbH', 'Silberband Medien', 'ProFab Systems',
  'Hansewerk Digital', 'Quantik Solutions', 'Alster Analytics', 'Brandner & Söhne',
  'Cortex Handels GmbH', 'DeltaForm Engineering', 'Immovia Group', 'Kranich Software',
  'Lichtblick Energie Nord', 'Novaris Pharma Services', 'Ostwind Mobility',
] as const;

export function personName(rng: Rng): { firstName: string; lastName: string } {
  return { firstName: pick(rng, FIRST_NAMES), lastName: pick(rng, LAST_NAMES) };
}

export function accountName(rng: Rng, taken: Set<string>): string {
  for (let i = 0; i < 30; i++) {
    const n = pick(rng, ACCOUNT_NAMES);
    if (!taken.has(n)) {
      taken.add(n);
      return n;
    }
  }
  const fallback = `${pick(rng, LAST_NAMES)} & Partner GmbH`;
  taken.add(fallback);
  return fallback;
}

export const ROLE_TITLES: Record<string, Record<string, string>> = {
  engineering: { junior: 'Junior Software Engineer', mid: 'Software Engineer', senior: 'Senior Software Engineer', lead: 'Engineering Lead' },
  sales: { junior: 'Sales Development Rep', mid: 'Account Executive', senior: 'Senior Account Executive', lead: 'Sales Lead' },
  marketing: { junior: 'Marketing Associate', mid: 'Marketing Manager', senior: 'Senior Marketing Manager', lead: 'Marketing Lead' },
  cs: { junior: 'Support Specialist', mid: 'Customer Success Manager', senior: 'Senior CSM', lead: 'CS Lead' },
  ga: { junior: 'Office Assistant', mid: 'Operations Manager', senior: 'Senior Controller', lead: 'Head of Operations' },
};

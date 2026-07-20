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
  engineering: { werkstudent: 'Werkstudent:in Engineering', junior: 'Junior Software Engineer', mid: 'Software Engineer', senior: 'Senior Software Engineer', lead: 'Engineering Lead' },
  sales: { werkstudent: 'Werkstudent:in Sales', junior: 'Sales Development Rep', mid: 'Account Executive', senior: 'Senior Account Executive', lead: 'Sales Lead' },
  marketing: { werkstudent: 'Werkstudent:in Marketing', junior: 'Marketing Associate', mid: 'Marketing Manager', senior: 'Senior Marketing Manager', lead: 'Marketing Lead' },
  cs: { werkstudent: 'Werkstudent:in Support', junior: 'Support Specialist', mid: 'Customer Success Manager', senior: 'Senior CSM', lead: 'CS Lead' },
  ga: { werkstudent: 'Werkstudent:in Operations', junior: 'Office Assistant', mid: 'Operations Manager', senior: 'Senior Controller', lead: 'Head of Operations' },
};

// ── Steckbrief-Bausteine (Phase 7): jede Person bekommt Charakter ─────
const PERSONALITIES = [
  'ruhig und überlegt; redet erst, wenn es etwas zu sagen gibt',
  'quirlig, schnell begeistert, manchmal sprunghaft',
  'trocken-humorvoll, zuverlässig wie ein Uhrwerk',
  'ehrgeizig und direkt — sagt auch dem CEO die Meinung',
  'harmoniebedürftig, kittet Konflikte im Team',
  'skeptisch-analytisch; hinterfragt jede Zahl',
  'pragmatisch: lieber 80 % heute als 100 % nie',
  'introvertiert, aber in Schriftform messerscharf',
  'extrovertiert, kennt nach einer Woche jeden im Haus',
  'perfektionistisch — braucht manchmal eine Deadline von außen',
  'gelassen-stoisch, auch wenn es brennt',
  'neugierig, probiert ständig neue Tools aus',
] as const;

const HOBBIES = [
  'Bouldern', 'Schach (online, heimlich im Standup)', 'Marathonlaufen', 'Sauerteig-Backen',
  'Analog-Fotografie', 'Bienenzucht auf dem Balkon', 'Brettspiele-Abende', 'Chorsingen',
  'Rennrad', 'Töpfern', 'Retro-Konsolen sammeln', 'Wandern mit Hund', 'Jazz-Piano',
  'Urban Gardening', 'Segeln', 'Volleyball im Verein',
] as const;

const STRENGTHS = [
  'behält in Krisen den Überblick', 'erklärt Kompliziertes einfach', 'findet Bugs, die niemand findet',
  'baut schnell Vertrauen zu Kunden auf', 'exzellente Dokumentation', 'gnadenlos gutes Priorisieren',
  'Mentor:in für die Junioren', 'verhandelt hart, aber fair', 'sieht Risiken früh',
  'bringt Energie in jedes Meeting', 'institutionelles Gedächtnis der Firma', 'liefert immer pünktlich',
] as const;

/** Deterministischer Steckbrief-Generator (Alter passend zur Seniorität). */
export function personaBits(rng: Rng, seniority: string): { age: number; personalityDe: string; hobbyDe: string; strengthDe: string } {
  const ageBase: Record<string, [number, number]> = {
    werkstudent: [20, 27], junior: [22, 30], mid: [26, 38], senior: [30, 47], lead: [33, 52],
  };
  const [lo, hi] = ageBase[seniority] ?? [24, 45];
  return {
    age: lo + Math.floor(rng() * (hi - lo + 1)),
    personalityDe: pick(rng, PERSONALITIES),
    hobbyDe: pick(rng, HOBBIES),
    strengthDe: pick(rng, STRENGTHS),
  };
}

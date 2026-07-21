/**
 * i18n-Grundgerüst: Deutsch zuerst; Englisch (Phase 6) übersetzt die
 * Chrome-Labels (Navigation, Top-Bar, Kern-Buttons). Spielinhalte (Mails,
 * Analysen, Events) bleiben vorerst Deutsch — sie kommen aus der Engine.
 */

export type Locale = 'de' | 'en';

const de = {
  nav_dashboard: 'Dashboard',
  nav_decisions: 'Entscheidungen',
  nav_evaluations: 'Bewertungen',
  nav_inbox: 'Inbox',
  nav_chat: 'Chat',
  nav_calendar: 'Kalender',
  nav_team: 'Team',
  nav_customers: 'Kunden',
  nav_product: 'Produkt',
  nav_market: 'Markt',
  nav_finance: 'Finanzen',
  nav_structure: 'Struktur',
  nav_legal: 'Recht',
  nav_press: 'Presse',
  nav_strategy: 'Strategie',
  nav_boerse: 'Börse',
  nav_learn: 'Lernen',
  nav_settings: 'Einstellungen',
  close_week: 'Woche abschließen',
  cash: 'Cash',
  runway: 'Runway',
  board_trust: 'Board',
  my_companies: 'Meine Unternehmen',
  new_company: 'Neues Unternehmen gründen/übernehmen',
  week: 'Woche',
  game_over: 'SPIEL BEENDET',
  language: 'Sprache',
  logo_upload: 'Logo hochladen (PNG/JPG, max. ~300 KB)',
  quarterly_pdf: 'Quartalsbericht als PDF',
} as const;

const en: Record<keyof typeof de, string> = {
  nav_dashboard: 'Dashboard',
  nav_decisions: 'Decisions',
  nav_evaluations: 'Reviews',
  nav_inbox: 'Inbox',
  nav_chat: 'Chat',
  nav_calendar: 'Calendar',
  nav_team: 'Team',
  nav_customers: 'Customers',
  nav_product: 'Product',
  nav_market: 'Market',
  nav_finance: 'Finance',
  nav_structure: 'Structure',
  nav_legal: 'Legal',
  nav_press: 'Press',
  nav_strategy: 'Strategy',
  nav_boerse: 'Stock market',
  nav_learn: 'Learn',
  nav_settings: 'Settings',
  close_week: 'Close week',
  cash: 'Cash',
  runway: 'Runway',
  board_trust: 'Board',
  my_companies: 'My companies',
  new_company: 'Found / take over a new company',
  week: 'Week',
  game_over: 'GAME OVER',
  language: 'Language',
  logo_upload: 'Upload logo (PNG/JPG, max. ~300 KB)',
  quarterly_pdf: 'Quarterly report as PDF',
};

let locale: Locale = (typeof localStorage !== 'undefined' && (localStorage.getItem('boardroom-locale') as Locale)) || 'de';

export function setLocale(l: Locale): void {
  locale = l;
  try {
    localStorage.setItem('boardroom-locale', l);
  } catch {
    /* privat browsing etc. */
  }
}

export function getLocale(): Locale {
  return locale;
}

export function t(key: keyof typeof de): string {
  if (locale === 'en') return en[key];
  return de[key];
}

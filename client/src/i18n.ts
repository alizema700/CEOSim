/**
 * i18n-Grundgerüst: Deutsch zuerst, Englisch als zweite Locale vorbereitet.
 * Phase 1 nutzt durchgehend `de`; `en` wird in Phase 6 befüllt.
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
  nav_legal: 'Recht',
  nav_press: 'Presse',
  nav_strategy: 'Strategie',
  nav_learn: 'Lernen',
  nav_settings: 'Einstellungen',
  close_week: 'Woche abschließen',
  cash: 'Cash',
  runway: 'Runway',
  board_trust: 'Board',
  my_companies: 'Meine Unternehmen',
  new_company: 'Neues Unternehmen gründen/übernehmen',
} as const;

const en: Partial<Record<keyof typeof de, string>> = {
  // Phase 6: englische Übersetzungen
};

let locale: Locale = 'de';

export function setLocale(l: Locale): void {
  locale = l;
}

export function t(key: keyof typeof de): string {
  if (locale === 'en' && en[key]) return en[key]!;
  return de[key];
}

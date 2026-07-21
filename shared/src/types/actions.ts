import type { Department, Fraction, Id, Money, Seniority } from './common.js';

/**
 * Spieler-Aktionen (Phase 1: festes Entscheidungs-Panel).
 *
 * ARCHITEKTURPRINZIP „Trennung von Wahrheit und Erzählung":
 * NUR diese validierten Aktionen (und der Wochentick) verändern Zahlen.
 * Das LLM erzeugt niemals State-Änderungen direkt — es liefert höchstens
 * strukturierte Intents, die in genau diese Aktionstypen übersetzt und von
 * der Engine validiert werden. Ab Phase 3 kommt `FREE_IDEA` hinzu (LLM
 * klassifiziert → Engine setzt als Projekt mit Meilensteinen um).
 */
export type PlayerAction =
  | PriceChangeAction
  | StartHiringAction
  | LayoffAction
  | SetMarketingBudgetAction
  | SetRndAllocationAction
  | SetCsBudgetAction
  | AdjustSalariesAction
  | RaiseDebtAction
  | RepayDebtAction
  | RespondEventAction
  | DelegateMessageAction
  | StartProjectAction
  | HireConsultantAction
  | AcceptTermSheetAction
  | RaiseVentureDebtAction
  | MaDueDiligenceAction
  | MaAcquireAction
  | IpoSelectBankAction
  | IpoPriceAction
  | AdjustEmployeeSalaryAction
  | SetCeoSalaryAction
  | CreateAppointmentAction
  | SetTarifBindingAction
  | NegotiateTarifAction
  | ConvertLegalFormAction
  | CapitalIncreaseAction
  | HoldShareholderMeetingAction
  | DistributeDividendAction
  | GrantOptionsAction
  | SetCeoFocusAction
  | CeoRestAction
  | CeoPublicAppearanceAction
  | HireCoachAction
  | TakeoverRespondAction
  | CrisisRespondAction
  | HoldBoardMeetingAction
  | CeoPersonalTimeAction
  | StepDownAction;

/**
 * Listenpreis ändern (± %). Sofort: Neugeschäfts-ARPA. Verzögert: Bestand wird
 * beim Renewal umgestellt; Churn-Spike nach 4–12 Wochen; Konkurrenz kann
 * kontern. Cooldown: 8 Wochen zwischen Preisänderungen.
 */
export interface PriceChangeAction {
  type: 'PRICE_CHANGE';
  /** −0.30 .. +0.30 (= ±30 %). */
  pct: Fraction;
  /** Bestandskunden beim Renewal ebenfalls umstellen? (sonst nur Neugeschäft) */
  applyToExisting: boolean;
}

/**
 * Stellen ausschreiben. Time-to-Fill hängt an Arbeitsmarkt-Reputation &
 * Talentpool. Phase 7: `specialistRoleDe` erlaubt freie Spezialrollen
 * („Quant", „Kryptographin" …) — Titel + Gehaltsaufschlag, Rest wie Abteilung.
 */
export interface StartHiringAction {
  type: 'START_HIRING';
  dept: Department;
  seniority: Seniority;
  count: number;
  specialistRoleDe?: string;
}

/**
 * Entlassungen. Sofort: Abfindungskosten. Ab Kündigungsfrist: OpEx ↓.
 * Verzögert: Moral ↓, Arbeitsmarkt-Reputation ↓, erhöhte freiwillige
 * Kündigungen (2–8 Wochen), Velocity ↓, evtl. Presse.
 */
export interface LayoffAction {
  type: 'LAYOFF';
  dept: Department;
  count: number;
  /** Großzügige Abfindung: teurer, aber deutlich mildere Folgeeffekte. */
  generousSeverance: boolean;
}

/** Monatliches Marketing-Budget setzen (wirkt auf Lead-Gen mit 2–6 Wochen Lag). */
export interface SetMarketingBudgetAction {
  type: 'SET_MARKETING_BUDGET';
  monthlyAmount: Money;
}

/** R&D-Kapazität verteilen (Summe = 1). */
export interface SetRndAllocationAction {
  type: 'SET_RND_ALLOCATION';
  features: Fraction;
  techDebt: Fraction;
  bugfixes: Fraction;
}

/** Customer-Success-Programmbudget (senkt Churn mit 3–6 Wochen Lag). */
export interface SetCsBudgetAction {
  type: 'SET_CS_BUDGET';
  monthlyAmount: Money;
}

/** Gehaltsrunde für alle (Moral ↑ sofort, OpEx ↑ dauerhaft). */
export interface AdjustSalariesAction {
  type: 'ADJUST_SALARIES';
  /** 0 .. 0.15 (max. +15 % pro Runde). */
  pct: Fraction;
}

/** Kreditlinie ziehen (Covenant-Kapazität wird geprüft). */
export interface RaiseDebtAction {
  type: 'RAISE_DEBT';
  amount: Money;
}

/** Kredit tilgen. */
export interface RepayDebtAction {
  type: 'REPAY_DEBT';
  amount: Money;
}

/** Auf ein aktives Zufalls-/Krisenereignis mit einer der Optionen reagieren. */
export interface RespondEventAction {
  type: 'RESPOND_EVENT';
  eventInstanceId: Id;
  optionId: string;
}

/**
 * Eine delegierbare Nachricht ans Führungsteam geben („kümmer dich drum").
 * Ergebnis hängt deterministisch (seed-gesteuert) von Kompetenz & Auslastung
 * der gewählten Führungskraft ab und kommt nach 1–2 Wochen als Mail zurück.
 */
export interface DelegateMessageAction {
  type: 'DELEGATE_MESSAGE';
  messageId: Id;
  execRole: import('./people.js').ExecutiveRole;
}

/**
 * Freie Idee als Projekt starten (Ideen-System, Phase 3). Die Klassifikation
 * stammt vom LLM (oder Fallback), wurde vom Spieler bestätigt und wandert
 * vollständig ins Event-Log — die Engine klemmt alle Werte zusätzlich.
 */
export interface StartProjectAction {
  type: 'START_PROJECT';
  classification: import('./strategy.js').IdeaClassification;
}

/**
 * KI-Unternehmensberater buchen (Phase 4): kostet 25 k€ pro Engagement,
 * liefert einen Slide-Report. Didaktik: gut, aber nicht unfehlbar —
 * Beratern nicht blind glauben.
 */
export interface HireConsultantAction {
  type: 'HIRE_CONSULTANT';
  topic: 'churn' | 'pricing' | 'market' | 'costs';
}

export const CONSULTANT_FEE = 25_000;

/**
 * Term Sheet annehmen (Phase 5). Das Angebot wird gegen die deterministische
 * Regenerierung validiert — manipulierte Angebote fliegen auf.
 */
export interface AcceptTermSheetAction {
  type: 'ACCEPT_TERM_SHEET';
  offer: import('./funding.js').TermSheetOffer;
}

/** Venture Debt: schneller, teurer Fremdkapital-Puffer (Phase 5). */
export interface RaiseVentureDebtAction {
  type: 'RAISE_VENTURE_DEBT';
  amount: number;
}

/** Due Diligence auf ein Kaufziel (deckt Red Flags auf; kostet Beratung). */
export interface MaDueDiligenceAction {
  type: 'MA_DUE_DILIGENCE';
  targetId: string;
}

/** Kaufziel übernehmen (Integration mit Kulturrisiko & Red-Flag-Folgen). */
export interface MaAcquireAction {
  type: 'MA_ACQUIRE';
  targetId: string;
}

export const MA_DD_FEE = 15_000;

/**
 * IPO (Phase 6): Bank mandatieren — startet die Vorbereitung (Prospekt,
 * Audit, ~120 k€) und nach 8 Wochen die Roadshow.
 */
export interface IpoSelectBankAction {
  type: 'IPO_SELECT_BANK';
  bankId: string;
}

/** IPO-Pricing innerhalb (oder unterhalb) der Bookbuilding-Spanne. */
export interface IpoPriceAction {
  type: 'IPO_PRICE';
  pricePerShare: number;
}

export const IPO_PREP_COST = 120_000;
export const IPO_PREP_WEEKS = 8;
export const IPO_ROADSHOW_WEEKS = 3;

/**
 * Individuelle Gehaltserhöhung (Phase 7): eine konkrete Person, aus dem
 * Steckbrief heraus. Große Sprünge sprechen sich herum (Neid-Effekt).
 */
export interface AdjustEmployeeSalaryAction {
  type: 'ADJUST_EMPLOYEE_SALARY';
  employeeId: Id;
  /** 0.01 .. 0.25 */
  pct: Fraction;
}

/**
 * Eigenes CEO-Gehalt (Phase 7) — geht als Antrag an den AUFSICHTSRAT.
 * Genehmigung hängt deterministisch an Board-Vertrauen, Lage und Höhe des
 * Sprungs; Ablehnung kostet Vertrauen („der denkt an sich statt an die Firma").
 */
export interface SetCeoSalaryAction {
  type: 'SET_CEO_SALARY';
  monthlyAmount: Money;
}

/** Eigenen Termin ansetzen (Phase 7) — erscheint im Kalender, spielbar als Meeting-Szene. */
export interface CreateAppointmentAction {
  type: 'CREATE_APPOINTMENT';
  titleDe: string;
  week: number;
  /** 0 = Montag … 4 = Freitag */
  weekday: number;
  agendaDe: string[];
}

/**
 * Tarifbindung ändern (Phase 8): Flächentarif (Verband) beitreten, eigenen
 * Haustarif abschließen — oder aussteigen (Tarifflucht, mit harten Folgen).
 */
export interface SetTarifBindingAction {
  type: 'SET_TARIF_BINDING';
  status: import('./labor.js').TarifStatus;
}

/**
 * Tarifrunde: Lohnangebot an die Gewerkschaft (Phase 8). Nur möglich, wenn
 * eine Verhandlung läuft. Zu niedrig ⇒ Ablehnung, Konflikt, Warnstreik.
 */
export interface NegotiateTarifAction {
  type: 'NEGOTIATE_TARIF';
  /** Angebotene Lohnerhöhung in Prozent (0 .. 0.15). */
  offerPct: import('./common.js').Fraction;
}

/**
 * Formwechsel der Rechtsform (Phase 9), z. B. GmbH → AG. Voraussetzung fürs
 * IPO (§ 2 AktG). Braucht ausreichendes Nennkapital, Zustimmung des Gremiums
 * und Notar-/Handelsregisterkosten; wird nach der Umwandlungsfrist wirksam.
 */
export interface ConvertLegalFormAction {
  type: 'CONVERT_LEGAL_FORM';
  toForm: import('./legal.js').Rechtsform;
}

/**
 * Kapitalerhöhung aus Gesellschaftsmitteln (Phase 9): mehr gezeichnetes
 * Nennkapital (Haftungskapital) — Voraussetzung z. B. für den AG-Formwechsel.
 */
export interface CapitalIncreaseAction {
  type: 'CAPITAL_INCREASE';
  /** Ziel-Nennkapital (muss über dem aktuellen liegen). */
  targetNennkapital: Money;
}

/**
 * Ordentliche Gesellschafter-/Hauptversammlung (Phase 9): Feststellung des
 * Jahresabschlusses und Entlastung der Geschäftsführung/des Vorstands.
 */
export interface HoldShareholderMeetingAction {
  type: 'HOLD_SHAREHOLDER_MEETING';
}

/**
 * Gewinnausschüttung (Phase 9): Dividende aus der Gewinnrücklage. Cash fließt
 * ab (CFF), Investoren freut es — der Runway sinkt.
 */
export interface DistributeDividendAction {
  type: 'DISTRIBUTE_DIVIDEND';
  amount: Money;
}

/**
 * ESOP-Optionen an eine Person vergeben (Phase 10): Bindung über Vesting
 * (4 Jahre / 1-Jahr-Cliff) statt Cash. Aus dem ESOP-Pool.
 */
export interface GrantOptionsAction {
  type: 'GRANT_OPTIONS';
  employeeId: Id;
  /** Zugesagter Unternehmensanteil (0.0005 .. 0.02). */
  percent: Fraction;
}

/**
 * Wöchentliches CEO-Fokus-Budget setzen (Phase 12): FOCUS_POINTS Punkte auf
 * fünf Bereiche verteilen. Über 1 = Rückenwind, unter 1 = Gegenwind.
 */
export interface SetCeoFocusAction {
  type: 'SET_CEO_FOCUS';
  focus: import('./ceo.js').CeoFocus;
}

/** Auszeit nehmen (Phase 12): stellt Energie wieder her — kostet etwas Momentum. */
export interface CeoRestAction {
  type: 'CEO_REST';
}

/**
 * Öffentlicher Auftritt (Phase 12): Interview, Keynote oder Fachbeitrag baut die
 * CEO-Marke (Reputation) auf — kostet Energie, etwas Geld und trägt ein
 * Fettnäpfchen-Risiko (abhängig von Kommunikation & Energie).
 */
export interface CeoPublicAppearanceAction {
  type: 'CEO_PUBLIC_APPEARANCE';
  kind: 'interview' | 'keynote' | 'thought-leadership';
}

/** Executive-Coaching beauftragen (Phase 12): hebt eine Kompetenz über Wochen. */
export interface HireCoachAction {
  type: 'HIRE_COACH';
  skill: 'finanzen' | 'strategie' | 'leadership' | 'kommunikation' | 'krisenmanagement' | 'governance';
}

/**
 * Antwort auf eine feindliche Übernahme (Phase 14): annehmen (Exit), höher
 * nachverhandeln (Wert), Giftpille zünden (abwehren, entrenchment-Kosten) oder
 * die Aktionäre überzeugen (rally).
 */
export interface TakeoverRespondAction {
  type: 'TAKEOVER_RESPOND';
  mode: 'accept' | 'negotiate' | 'poison_pill' | 'rally';
}

/**
 * Reaktion auf eine öffentliche Krise / einen Shitstorm (Phase 15):
 * entschuldigen, mit Fakten gegenhalten, schweigen oder transparent aufklären.
 */
export interface CrisisRespondAction {
  type: 'CRISIS_RESPOND';
  mode: 'apologize' | 'defend' | 'silent' | 'investigate';
}

/**
 * Vorstandssitzung einberufen (Phase 22): der CEO tritt vor den Aufsichtsrat
 * und wählt einen Ansprache-Stil (Zahlen / Vision / Zuhören). Die Sitze
 * reagieren je nach Passung — das Board-Vertrauen bewegt sich.
 */
export interface HoldBoardMeetingAction {
  type: 'HOLD_BOARD_MEETING';
  approach: 'data' | 'vision' | 'listen';
}

/**
 * Privatzeit des CEO (Phase 23): in Gesundheit (Sport), Beziehungen (Familie)
 * oder das berufliche Netzwerk investieren. Gesundheit & Work-Life bestimmen die
 * Erholung; das Netzwerk öffnet Türen (u. a. einen Mentor).
 */
export interface CeoPersonalTimeAction {
  type: 'CEO_PERSONAL_TIME';
  kind: 'sport' | 'family' | 'network';
}

/**
 * Rücktritt / Amtsende (Phase 13): Der CEO beendet die Amtszeit selbst und
 * schließt sie mit der Legacy-Bilanz ab. Endgültig — das Spiel endet.
 */
export interface StepDownAction {
  type: 'STEP_DOWN';
}

/** Ergebnis der Aktions-Validierung durch die Engine. */
export interface ActionValidation {
  ok: boolean;
  errorsDe: string[];
  warningsDe: string[];
}

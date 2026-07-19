import type { Id, WeekIndex } from './common.js';
import type { PlayerAction } from './actions.js';

/**
 * Kommunikations-Systeme (Phase 2).
 *
 * Determinismus-Regel:
 * - Die ENGINE erzeugt Nachrichten-METADATEN + regelbasierte Texte
 *   deterministisch im Wochentick (Teil des CompanyState, replay-sicher).
 * - Freie DIALOGE (Antworten des Spielers, LLM-Persona-Antworten) sind reine
 *   Erzählung und leben ausschließlich in der Server-DB.
 * - Lese-/Archiv-Status ist UI-Zustand und liegt als DB-Overlay, nicht im
 *   Engine-State.
 * - Wenn ein Gespräch mechanische Folgen haben soll (z. B. Beziehung ±),
 *   liefert das LLM einen begrenzten Intent, der als GameEvent 'INTENT'
 *   protokolliert und von der Engine angewendet wird — Replay braucht kein LLM.
 */
export interface CommsState {
  messages: InboxMessage[];
  /** Cooldown-Buchhaltung für proaktive Nachrichten-Templates: templateId → Woche. */
  cooldowns: Record<string, WeekIndex>;
}

export interface InboxMessage {
  id: Id;
  week: WeekIndex;
  from: MessageSender;
  subjectDe: string;
  bodyDe: string;
  kind: MessageKind;
  /** Prioritäts-Flag der Sekretärin (regelbasiert). */
  priority: 'hoch' | 'normal' | 'niedrig';
  /** Verknüpftes offenes Ereignis (Antwort-Optionen erscheinen in der Mail). */
  eventInstanceId: Id | null;
  /** Kann ans Führungsteam delegiert werden („kümmer dich drum"). */
  delegable: boolean;
  /** Deep-Link auf eine passende Aktion im Entscheidungs-Panel. */
  suggestedActionType: PlayerAction['type'] | null;
  /** Template-Herkunft (für Delegations-Auflösung u. Ä.). */
  templateId: string | null;
  /** Von der Engine gesetzt, wenn mechanisch erledigt (delegiert/Event beantwortet). */
  handledWeek: WeekIndex | null;
}

export type MessageKind =
  | 'briefing' // Wochen-Briefing der Sekretärin
  | 'exec' // Führungsteam meldet sich proaktiv
  | 'employee' // Beschwerde, Lob, Idee, Kündigung
  | 'event' // Zufalls-/Krisenereignis kommt als Mail herein
  | 'external' // Kunden, Partner, Journalisten, andere Firmen
  | 'delegation' // Ergebnis einer delegierten Aufgabe
  | 'system';

export interface MessageSender {
  name: string;
  roleDe: string;
  /** Referenz für Chat-Threads/Personas (execId, employeeId, …), wenn intern. */
  refId: Id | null;
  company: string | null; // extern: Firmenname
}

/**
 * Kalender (Phase 2): deterministisch generierte Termine.
 * Wiederkehrend: Leadership-Sync (wöchentlich), Board-Call (alle 13 Wochen).
 * Ereignisgesteuert: Key-Account-Renewal-Calls, später Anwaltstermine etc.
 */
export interface CalendarState {
  appointments: Appointment[];
}

export interface Appointment {
  id: Id;
  week: WeekIndex;
  /** Wochentag 0 = Montag … 4 = Freitag. */
  weekday: number;
  titleDe: string;
  kind: 'leadershipSync' | 'boardCall' | 'customerCall' | 'legal' | 'custom';
  /** Agenda-Vorschlag der Sekretärin (regelbasiert aus dem State). */
  agendaDe: string[];
  /** Teilnehmer-Namen (Snapshot zum Erstellzeitpunkt). */
  participants: string[];
  linkedEntityId: Id | null;
}

/**
 * Begrenzte Intents aus der Erzählschicht — werden als GameEvent protokolliert
 * und von der Engine validiert, geklemmt & angewendet (nie direkt vom LLM).
 */
export type CommsIntent =
  | { kind: 'EXEC_RELATIONSHIP'; execId: Id; delta: -2 | -1 | 0 | 1 | 2; reasonDe: string }
  /** Anwaltskosten pro Chat-Runde (lehrt: Anwaltszeit gezielt einsetzen). */
  | { kind: 'LEGAL_BILLING'; amount: number; topicDe: string }
  /** Eindruck aus dem Board-Meeting (±3 max pro Meeting-Runde). */
  | { kind: 'BOARD_TRUST'; delta: number; reasonDe: string }
  /** Bewertetes Ergebnis einer Pressemitteilung (alle Werte gedeckelt). */
  | {
      kind: 'PRESS_RELEASE_OUTCOME';
      titleDe: string;
      /** −6 .. +6 auf Presse-Reputation. */
      pressDelta: number;
      /** 1.0 .. 1.15 Lead-Faktor für 6 Wochen. */
      leadFactor: number;
      /** Falls Claims übertrieben waren: Risiko, dass es auffliegt. */
      scandalProb: number; // 0 .. 0.5
      scandalTopicDe: string;
    };

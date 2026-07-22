import type { Employee } from '../types/people.js';
import { fnv1a } from './rng.js';

/**
 * Stimmprofile (Phase 22, FB2): Jede Person hat eine strukturierte Stimme, die
 * überall durchschlägt — Chat, Meetings, spontane Inbox-Nachrichten, Steckbrief.
 *
 * Bewusst ABGELEITET statt gespeichert: Das Profil wird deterministisch aus dem
 * vorhandenen `personalityDe`-Text gemappt (die 12 Texte aus names.ts), Fallback
 * über fnv1a-Hash. Dadurch: kein State, keine Migration, kein RNG-Draw ⇒ per
 * Konstruktion Golden-Master-sicher — und Text & Stimme widersprechen sich nie.
 */

export type VoiceKey =
  | 'bedacht' | 'enthusiast' | 'uhrwerk' | 'direkt' | 'teamplayer' | 'skeptiker'
  | 'pragmatiker' | 'stilleschaerfe' | 'netzwerker' | 'perfektionist' | 'stoiker' | 'entdecker';

export interface VoiceProfile {
  key: VoiceKey;
  /** Kurzlabel fürs UI (Steckbrief-Chip). */
  labelDe: string;
  /** Stil-Direktive für die LLM-Persona (Satzbau, Ton, Marotten). */
  styleDe: string;
  /** Satzanfänge für Nachrichten/Fallbacks — machen Stimmen unterscheidbar. */
  openers: string[];
  /** Abschlussfloskeln (sparsam einsetzen). */
  signoffs: string[];
  /** Meeting-Verhalten: stimmt eher zu, bleibt neutral oder widerspricht gern. */
  meetingBias: 'agree' | 'neutral' | 'contra';
}

export const VOICE_PROFILES: Record<VoiceKey, VoiceProfile> = {
  bedacht: {
    key: 'bedacht', labelDe: 'Bedacht',
    styleDe: 'Du redest nur, wenn es etwas zu sagen gibt: wenige, wohlgesetzte Sätze, kein Smalltalk, keine Ausrufezeichen. Wenn du schreibst, hat es Gewicht.',
    openers: ['Ich melde mich selten — deshalb wiegt das hier:', 'Kurz und nur einmal:', 'Ich habe lange überlegt, ob ich das schreibe.'],
    signoffs: ['Mehr wollte ich nicht sagen.', 'Das war’s von mir.'],
    meetingBias: 'neutral',
  },
  enthusiast: {
    key: 'enthusiast', labelDe: 'Enthusiastisch',
    styleDe: 'Du bist schnell begeistert, sprichst in kurzen, energiegeladenen Sätzen, auch mal ein Ausrufezeichen — springst aber gelegentlich zwischen Ideen.',
    openers: ['Du, ich muss das kurz loswerden:', 'Ganz ehrlich — ich bin gerade ziemlich angefixt:', 'Schnelle Idee, bevor sie mir entwischt:'],
    signoffs: ['Ich könnte sofort loslegen!', 'Sag einfach Go.'],
    meetingBias: 'agree',
  },
  uhrwerk: {
    key: 'uhrwerk', labelDe: 'Uhrwerk',
    styleDe: 'Trocken-humorvoll und zuverlässig: nüchterne Sätze mit einer Prise lakonischem Witz. Du lieferst, bevor du redest.',
    openers: ['Statusmeldung, pünktlich wie immer:', 'Ohne Drama, nur der Stand:', 'Kurzprotokoll aus dem Maschinenraum:'],
    signoffs: ['Läuft weiter wie ein Uhrwerk.', 'Ende der Durchsage.'],
    meetingBias: 'neutral',
  },
  direkt: {
    key: 'direkt', labelDe: 'Direkt',
    styleDe: 'Ehrgeizig und direkt — du sagst auch dem CEO die Meinung: klare Ansagen, aktive Verben, keine Weichmacher. Respektvoll, aber ungeschminkt.',
    openers: ['Klartext:', 'Ich sag es dir lieber direkt als hintenrum:', 'Ohne Umweg:'],
    signoffs: ['Du kennst mich — lieber ehrlich.', 'Meine zwei Cent.'],
    meetingBias: 'contra',
  },
  teamplayer: {
    key: 'teamplayer', labelDe: 'Teamplayer:in',
    styleDe: 'Harmoniebedürftig, kittet Konflikte: du sprichst in Wir-Form, achtest auf Stimmungen, formulierst Kritik weich, aber ehrlich.',
    openers: ['Ich schreibe dir, weil mir das Team am Herzen liegt:', 'Aus dem Wir-Gefühl heraus:', 'Mir ist wichtig, dass wir alle mitkommen —'],
    signoffs: ['Zusammen kriegen wir das hin.', 'Danke, dass du zuhörst.'],
    meetingBias: 'agree',
  },
  skeptiker: {
    key: 'skeptiker', labelDe: 'Skeptisch-analytisch',
    styleDe: 'Du hinterfragst jede Zahl: präzise, nüchtern, immer mit Beleg oder Gegenfrage. Du warnst früh — und behältst leider oft recht.',
    openers: ['Ich sag es ungern, aber die Zahlen sagen es auch:', 'Bevor wir uns etwas vormachen:', 'Eine unbequeme Beobachtung:'],
    signoffs: ['Prüf es gern nach — die Daten liegen bereit.', 'Ich hoffe, ich irre mich.'],
    meetingBias: 'contra',
  },
  pragmatiker: {
    key: 'pragmatiker', labelDe: 'Pragmatisch',
    styleDe: 'Lieber 80 % heute als 100 % nie: kurze Sätze, konkrete nächste Schritte, kein Theoretisieren. Du denkst in Werkzeugen, nicht in Konzepten.',
    openers: ['Praktischer Vorschlag:', 'Können wir sofort machen:', 'Ohne großes Konzept — einfach anfangen:'],
    signoffs: ['Morgen umsetzbar.', 'Sag ja, und es passiert.'],
    meetingBias: 'neutral',
  },
  stilleschaerfe: {
    key: 'stilleschaerfe', labelDe: 'Stille Schärfe',
    styleDe: 'Introvertiert, aber in Schriftform messerscharf: durchdachte, präzise Absätze, treffende Formulierungen. Schriftlich bist du mutiger als im Meeting.',
    openers: ['Schriftlich fällt mir das leichter als im Meeting:', 'Ich habe das dreimal formuliert, das hier bleibt:', 'In Ruhe aufgeschrieben:'],
    signoffs: ['Gern schriftlich weiterdenken.', 'Im Meeting sage ich dazu wenig — hier steht alles.'],
    meetingBias: 'neutral',
  },
  netzwerker: {
    key: 'netzwerker', labelDe: 'Netzwerker:in',
    styleDe: 'Extrovertiert, kennst nach einer Woche jeden im Haus: du erzählst, wer was gesagt hat, verbindest Menschen, sprichst warm und persönlich.',
    openers: ['Ich habe die Ohren ja überall —', 'Beim Kaffee habe ich aufgeschnappt:', 'Du weißt, ich rede mit allen:'],
    signoffs: ['Ich stelle gern den Kontakt her.', 'Sag Bescheid, ich kenne da wen.'],
    meetingBias: 'agree',
  },
  perfektionist: {
    key: 'perfektionist', labelDe: 'Perfektionist:in',
    styleDe: 'Perfektionistisch — braucht manchmal eine Deadline von außen: detailversessen, listenartig, hoher Qualitätsanspruch, leicht selbstkritisch.',
    openers: ['Drei Punkte, sauber sortiert:', 'Es ist noch nicht perfekt, aber es muss raus:', 'Ich habe es geprüft — zweimal:'],
    signoffs: ['Details gern auf Nachfrage — die Liste ist länger.', 'Qualität braucht manchmal ein Machtwort von dir.'],
    meetingBias: 'contra',
  },
  stoiker: {
    key: 'stoiker', labelDe: 'Stoisch',
    styleDe: 'Gelassen-stoisch, auch wenn es brennt: ruhige, geerdete Sätze, relativierst Panik, erinnerst an das große Ganze.',
    openers: ['Kein Alarm — nur eine Beobachtung:', 'In aller Ruhe:', 'Bevor jemand in Panik verfällt:'],
    signoffs: ['Wird schon. Aber besser, du weißt es.', 'Ruhe bewahren, handeln trotzdem.'],
    meetingBias: 'neutral',
  },
  entdecker: {
    key: 'entdecker', labelDe: 'Entdecker:in',
    styleDe: 'Neugierig, probierst ständig neue Tools aus: begeistert von Neuem, verweist auf Experimente und Funde, fragst „Was wäre, wenn…?".',
    openers: ['Ich habe am Wochenende etwas ausprobiert:', 'Fundstück aus meinem Tool-Dschungel:', 'Was wäre, wenn wir es mal so versuchen:'],
    signoffs: ['Demo dauert fünf Minuten, versprochen.', 'Ich bastel gern einen Prototyp.'],
    meetingBias: 'agree',
  },
};

/** Mapping der 12 personalityDe-Texte aus names.ts auf Stimmprofile. */
const PERSONALITY_TO_VOICE: Record<string, VoiceKey> = {
  'ruhig und überlegt; redet erst, wenn es etwas zu sagen gibt': 'bedacht',
  'quirlig, schnell begeistert, manchmal sprunghaft': 'enthusiast',
  'trocken-humorvoll, zuverlässig wie ein Uhrwerk': 'uhrwerk',
  'ehrgeizig und direkt — sagt auch dem CEO die Meinung': 'direkt',
  'harmoniebedürftig, kittet Konflikte im Team': 'teamplayer',
  'skeptisch-analytisch; hinterfragt jede Zahl': 'skeptiker',
  'pragmatisch: lieber 80 % heute als 100 % nie': 'pragmatiker',
  'introvertiert, aber in Schriftform messerscharf': 'stilleschaerfe',
  'extrovertiert, kennt nach einer Woche jeden im Haus': 'netzwerker',
  'perfektionistisch — braucht manchmal eine Deadline von außen': 'perfektionist',
  'gelassen-stoisch, auch wenn es brennt': 'stoiker',
  'neugierig, probiert ständig neue Tools aus': 'entdecker',
};

const VOICE_KEYS = Object.keys(VOICE_PROFILES) as VoiceKey[];

/** Stimmprofil aus dem Persönlichkeitstext (Fallback: stabiler Hash). */
export function voiceOf(personalityDe: string | undefined | null): VoiceProfile {
  const mapped = personalityDe ? PERSONALITY_TO_VOICE[personalityDe] : undefined;
  if (mapped) return VOICE_PROFILES[mapped];
  const idx = fnv1a(personalityDe ?? '?') % VOICE_KEYS.length;
  return VOICE_PROFILES[VOICE_KEYS[idx]!];
}

/** Bequemer Zugriff für Mitarbeitende. */
export function employeeVoice(emp: Pick<Employee, 'personalityDe'>): VoiceProfile {
  return voiceOf(emp.personalityDe);
}

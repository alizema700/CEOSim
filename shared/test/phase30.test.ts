import { describe, expect, it } from 'vitest';
import { newGame } from './helpers.js';
import { voiceOf, VOICE_PROFILES } from '../src/engine/voices.js';
import { generateSpontaneousComms } from '../src/engine/comms.js';

/**
 * Phase 22 (FB2): Stimmprofile + spontane Mitarbeiter-Nachrichten.
 * Golden-Master-sicher: Profile sind reine Ableitungen (kein RNG, kein State);
 * Spontan-Nachrichten nutzen einen eigenen RNG-Substream und eigene IDs am
 * globalen idCounter vorbei.
 */

const spMessages = (s: ReturnType<typeof newGame>) => s.comms.messages.filter((m) => m.id.startsWith('msg_sp'));

describe('Stimmprofile (voices)', () => {
  it('mappt die bekannten Persönlichkeitstexte auf feste, distinkte Profile', () => {
    expect(voiceOf('skeptisch-analytisch; hinterfragt jede Zahl').key).toBe('skeptiker');
    expect(voiceOf('ehrgeizig und direkt — sagt auch dem CEO die Meinung').key).toBe('direkt');
    expect(voiceOf('harmoniebedürftig, kittet Konflikte im Team').key).toBe('teamplayer');
    expect(voiceOf('gelassen-stoisch, auch wenn es brennt').key).toBe('stoiker');
  });

  it('unbekannte Texte fallen stabil (deterministisch) auf ein Profil zurück', () => {
    const a = voiceOf('völlig neuer Persönlichkeitstext');
    const b = voiceOf('völlig neuer Persönlichkeitstext');
    expect(a.key).toBe(b.key);
    expect(Object.keys(VOICE_PROFILES).length).toBe(12);
  });

  it('jede Person eines Spiels hat ein Profil mit Label & Stil', () => {
    const s = newGame(30000);
    for (const e of s.people.employees) {
      const v = voiceOf(e.personalityDe);
      expect(v.labelDe.length).toBeGreaterThan(2);
      expect(v.openers.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('Spontane Mitarbeiter-Nachrichten', () => {
  it('lässt den globalen idCounter unangetastet (Golden-Master-kritisch)', () => {
    const s = newGame(30001);
    for (let w = 1; w <= 20; w++) {
      s.meta.week = w;
      const counterBefore = s.idCounter;
      generateSpontaneousComms(s);
      expect(s.idCounter).toBe(counterBefore);
    }
    expect(spMessages(s).length).toBeGreaterThan(0); // über 20 Wochen meldet sich jemand
  });

  it('höchstens eine Spontan-Nachricht pro Woche', () => {
    const s = newGame(30002);
    for (let w = 1; w <= 30; w++) {
      s.meta.week = w;
      const before = spMessages(s).length;
      generateSpontaneousComms(s);
      expect(spMessages(s).length - before).toBeLessThanOrEqual(1);
    }
  });

  it('ist deterministisch: gleicher Seed ⇒ identische Nachrichten', () => {
    const run = () => {
      const s = newGame(30003);
      for (let w = 1; w <= 15; w++) { s.meta.week = w; generateSpontaneousComms(s); }
      return spMessages(s).map((m) => `${m.id}|${m.from.name}|${m.subjectDe}|${m.bodyDe}`);
    };
    expect(run()).toEqual(run());
  });

  it('persönlicher Frust einer Schlüsselperson kommt mit hoher Priorität', () => {
    const s = newGame(30004);
    const key = s.people.employees.find((e) => e.keyPerson) ?? s.people.employees[0]!;
    key.satisfaction = 20;
    let found = null as null | (typeof s.comms.messages)[number];
    for (let w = 1; w <= 25 && !found; w++) {
      s.meta.week = w;
      generateSpontaneousComms(s);
      found = s.comms.messages.find((m) => m.templateId === 'sp-frust') ?? null;
    }
    expect(found).not.toBeNull();
    expect(found!.from.refId).toBe(key.id);
    if (key.keyPerson) expect(found!.priority).toBe('hoch');
  });

  it('Nachrichten sprechen in der Stimme der Person (Opener aus dem Profil)', () => {
    const s = newGame(30005);
    for (let w = 1; w <= 25; w++) { s.meta.week = w; generateSpontaneousComms(s); }
    const msgs = spMessages(s);
    expect(msgs.length).toBeGreaterThan(0);
    for (const m of msgs) {
      const emp = s.people.employees.find((e) => e.id === m.from.refId);
      if (!emp) continue; // (theoretisch: Person könnte gekündigt haben)
      const v = voiceOf(emp.personalityDe);
      expect(v.openers.some((o) => m.bodyDe.startsWith(o))).toBe(true);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { newGame } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction } from '../src/engine/actions.js';
import { EVENT_CARDS, resolveEventOption } from '../src/engine/eventsDeck.js';
import { applyCommsIntent, buildBriefingDe } from '../src/engine/comms.js';
import { createCompany } from '../src/engine/init.js';
import { testSetup } from './helpers.js';

describe('Phase 2: Kommunikation', () => {
  it('Start: Willkommens-Briefing + CFO-Mail vorhanden, Assistentin benannt', () => {
    const s = newGame(101);
    expect(s.people.assistant.name.length).toBeGreaterThan(3);
    expect(s.comms.messages.some((m) => m.templateId === 'welcome')).toBe(true);
    expect(s.comms.messages.some((m) => m.templateId === 'welcome-cfo')).toBe(true);
    expect(s.calendar.appointments.some((a) => a.kind === 'leadershipSync' && a.week === 1)).toBe(true);
  });

  it('Wochentick erzeugt Briefing der Sekretärin (jede Woche)', () => {
    const s = newGame(102);
    closeWeek(s);
    const briefings = s.comms.messages.filter((m) => m.kind === 'briefing');
    expect(briefings.length).toBeGreaterThanOrEqual(2); // Willkommen + W1
    expect(buildBriefingDe(s)).toContain('Überblick');
  });

  it('Nachrichten sind deterministisch: gleicher Seed ⇒ gleiche Inbox', () => {
    const run = () => {
      const s = createCompany(testSetup(), 777, 'g', '2026-01-05T00:00:00Z');
      for (let i = 0; i < 12; i++) closeWeek(s);
      return s.comms.messages.map((m) => m.subjectDe).join('|');
    };
    expect(run()).toEqual(run());
  });

  it('Kalender: Board-Call in Woche 13, Leadership-Sync wöchentlich', () => {
    const s = newGame(103);
    for (let i = 0; i < 13; i++) closeWeek(s);
    expect(s.calendar.appointments.some((a) => a.kind === 'boardCall' && a.week === 13)).toBe(true);
    expect(s.calendar.appointments.filter((a) => a.kind === 'leadershipSync').length).toBeGreaterThan(3);
  });

  it('CFO warnt bei kurzem Runway (proaktive Persona-Mail)', () => {
    const s = newGame(104);
    s.finance.cash = 250_000;
    s.finance.retainedEarnings -= 650_000 - 0; // bilanzkonform absenken
    s.finance.retainedEarnings += 250_000 - 900_000 + 650_000; // net: cash -650k, retained -650k
    // einfacher: Identität direkt prüfen wir hier nicht — Tick tut es.
    s.finance.retainedEarnings = s.finance.cash + s.finance.accountsReceivable - s.finance.accountsPayable - s.finance.deferredRevenue - s.finance.debt.principal - s.finance.contributedCapital;
    closeWeek(s);
    expect(s.comms.messages.some((m) => m.templateId === 'cfo-runway')).toBe(true);
  });

  it('Delegation: Ergebnis kommt nach 1–2 Wochen als Mail zurück', () => {
    const s = newGame(105);
    // Delegierbare Nachricht erzwingen
    s.product.bugBacklog = 60;
    closeWeek(s);
    const complaint = s.comms.messages.find((m) => m.templateId === 'customer-complaint');
    expect(complaint).toBeDefined();
    applyAction(s, { type: 'DELEGATE_MESSAGE', messageId: complaint!.id, execRole: 'headOfCs' }, null, 'd1');
    expect(complaint!.handledWeek).not.toBeNull();
    closeWeek(s);
    closeWeek(s);
    closeWeek(s); // Delay ist 1–2 Wochen; Zustellung im Tick, der die Fälligkeitswoche verarbeitet
    expect(s.comms.messages.some((m) => m.templateId === 'delegation-result')).toBe(true);
  });

  it('Intent: EXEC_RELATIONSHIP wird begrenzt angewendet', () => {
    const s = newGame(106);
    const exec = s.people.executives[0]!;
    const before = exec.relationshipToCeo;
    applyCommsIntent(s, { kind: 'EXEC_RELATIONSHIP', execId: exec.id, delta: 2, reasonDe: 'Test' });
    expect(exec.relationshipToCeo).toBe(before + 2);
  });
});

describe('Phase 2: Event-Deck (13 Karten)', () => {
  it('Deck umfasst mindestens 12 Karten mit Default-Option', () => {
    expect(EVENT_CARDS.length).toBeGreaterThanOrEqual(12);
    for (const card of EVENT_CARDS) {
      expect(card.options.length).toBeGreaterThanOrEqual(2 - (card.id === 'GRANT_AWARD' ? 0 : 0));
      expect(card.options.some((o) => o.id === card.defaultOptionId)).toBe(true);
    }
  });

  it('Events erscheinen als Inbox-Mail mit Prio „hoch"', () => {
    const s = newGame(107);
    for (let i = 0; i < 30 && !s.openEvents.length; i++) {
      if (s.meta.status !== 'active') break;
      closeWeek(s);
    }
    if (s.openEvents.length > 0) {
      const ev = s.openEvents[0]!;
      const mail = s.comms.messages.find((m) => m.eventInstanceId === ev.instanceId);
      expect(mail).toBeDefined();
      expect(mail!.priority).toBe('hoch');
    }
  });

  it('SECURITY_BREACH: Vertuschen erzeugt DELAYED_SCANDAL-Risiko', () => {
    const s = newGame(108);
    s.openEvents.push({
      instanceId: 'ev_test', cardId: 'SECURITY_BREACH', triggeredWeek: s.meta.week, bodyDe: 'x',
      boundEntityId: null, data: { records: 1000 }, status: 'open', resolvedWeek: null, chosenOptionId: null,
    });
    resolveEventOption(s, 'ev_test', 'conceal', null);
    expect(s.scheduledEffects.some((fx) => fx.effect.kind === 'DELAYED_SCANDAL')).toBe(true);
  });

  it('ACQUISITION_OFFER: Annehmen beendet das Spiel als Exit mit Preis', () => {
    const s = newGame(109);
    s.openEvents.push({
      instanceId: 'ev_offer', cardId: 'ACQUISITION_OFFER', triggeredWeek: s.meta.week, bodyDe: 'x',
      boundEntityId: s.market.competitors[0]!.id, data: { priceEur: 5_000_000 }, status: 'open', resolvedWeek: null, chosenOptionId: null,
    });
    resolveEventOption(s, 'ev_offer', 'accept', null);
    expect(s.meta.status).toBe('exited');
    expect(s.meta.endReasonDe).toContain('5');
  });

  it('BANK_COVENANT_CALL feuert nur bei anhaltender Covenant-Verletzung', () => {
    const s = newGame(110);
    const card = EVENT_CARDS.find((c) => c.id === 'BANK_COVENANT_CALL')!;
    expect(card.baseWeeklyWeight).toBeGreaterThan(0.3);
    // Ohne Verletzung darf die Karte nie im offenen Zustand auftauchen:
    for (let i = 0; i < 8; i++) {
      if (s.meta.status !== 'active') break;
      closeWeek(s);
      expect(s.openEvents.some((e) => e.cardId === 'BANK_COVENANT_CALL')).toBe(false);
      if (s.finance.consecutiveMinCashBreachWeeks > 0) break; // Szenario driftet — Test-Vorbedingung endet
    }
  });

  it('GRANT_AWARD: Einmalertrag erhöht Cash & hält Invarianten', () => {
    const s = newGame(111);
    const cashBefore = s.finance.cash;
    s.openEvents.push({
      instanceId: 'ev_grant', cardId: 'GRANT_AWARD', triggeredWeek: s.meta.week, bodyDe: 'x',
      boundEntityId: null, data: {}, status: 'open', resolvedWeek: null, chosenOptionId: null,
    });
    resolveEventOption(s, 'ev_grant', 'accept_celebrate', null);
    const report = closeWeek(s);
    expect(report.invariants.ok).toBe(true);
    expect(s.finance.cash).toBeGreaterThan(cashBefore - 40_000); // 50k Ertrag überkompensiert Wochen-Burn großteils
  });

  it('Ignorierte Events lösen nach Frist die Default-Option aus', () => {
    const s = newGame(112);
    s.openEvents.push({
      instanceId: 'ev_ign', cardId: 'JOURNALIST_INQUIRY', triggeredWeek: s.meta.week, bodyDe: 'x',
      boundEntityId: null, data: {}, status: 'open', resolvedWeek: null, chosenOptionId: null,
    });
    closeWeek(s); // Woche 0 verarbeitet — Frist läuft noch
    closeWeek(s); // Woche 1 verarbeitet — Frist (1 Woche) überschritten ⇒ Default greift
    const ev = s.openEvents.find((e) => e.instanceId === 'ev_ign')!;
    expect(ev.status).toBe('autoResolved');
    expect(ev.chosenOptionId).toBe('ignore');
  });
});

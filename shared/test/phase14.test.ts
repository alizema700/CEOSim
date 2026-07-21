import { describe, expect, it } from 'vitest';
import { forceCash, newGame } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { acceptanceShare } from '../src/engine/takeover.js';
import { computeValuation } from '../src/engine/kpis.js';
import type { CompanyState } from '../src/types/company.js';

/**
 * Phase 14: Feindliche Übernahme — Emergence-Gating (Golden-Master-sicher),
 * Annahme-Ökonomie, Verteidigung (accept/negotiate/poison_pill/rally).
 */

/** Simuliert einen börsennotierten Cap-Table (verwundbar für Übernahmen). */
function makeListed(s: CompanyState): void {
  s.capTable = [
    { id: 'f', holder: 'Gründer', kind: 'founder', share: 0.3 },
    { id: 'i', holder: 'Investor', kind: 'investor', share: 0.22 },
    { id: 'e', holder: 'ESOP', kind: 'esop', share: 0.08 },
    { id: 'c', holder: 'CEO', kind: 'ceo', share: 0.05 },
    { id: 'p', holder: 'Streubesitz', kind: 'public', share: 0.35 },
  ];
}

/** Legt ein laufendes Übernahmeangebot an. */
function tender(s: CompanyState, premium: number): void {
  s.takeover = {
    status: 'tender', bidderName: 'Nordwind Capital', bidderKind: 'finanzinvestor', bidderPitchDe: 'PE-Haus.',
    toeholdStake: 0.1, premiumPct: premium, offerValue: Math.round(computeValuation(s).value * (1 + premium)),
    startedWeek: s.meta.week - 2, deadlineWeek: s.meta.week + 3, defensesUsed: [], defenseResistance: 0, lastNudgeWeek: s.meta.week,
  };
}

describe('Emergence-Gating', () => {
  it('der Sanierungsfall (nicht attraktiv, kein IPO) löst NIE eine Übernahme aus', () => {
    const s = newGame(14000);
    for (let i = 0; i < 30 && s.meta.status === 'active'; i++) closeWeek(s);
    expect(s.takeover.status).toBe('none');
  });
});

describe('Annahme-Ökonomie', () => {
  it('höhere Prämie ⇒ höhere Annahmequote; Widerstand senkt sie', () => {
    const s = newGame(14001);
    makeListed(s);
    s.takeover.toeholdStake = 0.1;
    const low = acceptanceShare(s, 0.1);
    const high = acceptanceShare(s, 0.6);
    expect(high).toBeGreaterThan(low);
    const withResist = acceptanceShare(s, 0.35, 0.3);
    const without = acceptanceShare(s, 0.35, 0);
    expect(withResist).toBeLessThanOrEqual(without);
  });
});

describe('Verteidigung', () => {
  it('Annehmen ⇒ Exit mit Payout aufs persönliche Konto, Spiel endet', () => {
    const s = newGame(14002);
    makeListed(s);
    tender(s, 0.4);
    const before = s.ceo.personalNetCash;
    applyAction(s, { type: 'TAKEOVER_RESPOND', mode: 'accept' }, null, 'dec_acc');
    expect(s.meta.status).toBe('exited');
    expect(s.ceo.personalNetCash).toBeGreaterThan(before);
    expect(() => closeWeek(s)).toThrow();
  });

  it('Nachverhandeln hebt die Prämie (oder der Bieter springt bei Übertreibung ab)', () => {
    const s = newGame(14003);
    makeListed(s);
    tender(s, 0.35);
    applyAction(s, { type: 'TAKEOVER_RESPOND', mode: 'negotiate' }, null, 'dec_neg');
    // entweder höhere Prämie (noch tender) ODER Bieter weg (defended → none)
    if (s.takeover.status === 'tender') expect(s.takeover.premiumPct).toBeGreaterThan(0.35);
    else expect(s.takeover.status).toBe('none');
  });

  it('Giftpille wehrt ab, kostet aber Investoren-Reputation & Vertrauen (mit Board-Rückhalt)', () => {
    const s = newGame(14004);
    makeListed(s);
    s.ceo.boardTrust = 60;
    forceCash(s, 500_000);
    tender(s, 0.35);
    const repBefore = s.reputation.investors;
    expect(validateAction(s, { type: 'TAKEOVER_RESPOND', mode: 'poison_pill' }).ok).toBe(true);
    applyAction(s, { type: 'TAKEOVER_RESPOND', mode: 'poison_pill' }, null, 'dec_pill');
    expect(s.takeover.status).toBe('none'); // abgewehrt
    expect(s.reputation.investors).toBeLessThan(repBefore);
    // Ohne Board-Rückhalt gesperrt.
    const s2 = newGame(14004); makeListed(s2); forceCash(s2, 500_000); s2.ceo.boardTrust = 30; tender(s2, 0.35);
    expect(validateAction(s2, { type: 'TAKEOVER_RESPOND', mode: 'poison_pill' }).ok).toBe(false);
  });

  it('Rally senkt die Annahmequote über Board-Vertrauen & CEO-Marke', () => {
    const s = newGame(14005);
    makeListed(s);
    s.ceo.boardTrust = 85;
    s.ceo.reputation = 85;
    s.ceo.skills.kommunikation = 80;
    tender(s, 0.3);
    applyAction(s, { type: 'TAKEOVER_RESPOND', mode: 'rally' }, null, 'dec_rally');
    // Starker Rückhalt (Board 85 / Marke 85 / Komm. 80) drückt die Quote unter 50 %
    // ⇒ entweder direkt abgewehrt (none) ODER messbarer Widerstand aufgebaut (noch tender).
    expect(s.takeover.status === 'none' || s.takeover.defenseResistance > 0).toBe(true);
  });

  it('ohne Übernahmesituation ist die Reaktion ungültig', () => {
    const s = newGame(14006);
    expect(validateAction(s, { type: 'TAKEOVER_RESPOND', mode: 'rally' }).ok).toBe(false);
  });
});

describe('Determinismus & Invarianten', () => {
  it('Giftpille läuft bilanzkonform durch den Tick', () => {
    const s = newGame(14007);
    makeListed(s);
    s.ceo.boardTrust = 60;
    forceCash(s, 500_000);
    tender(s, 0.35);
    applyAction(s, { type: 'TAKEOVER_RESPOND', mode: 'poison_pill' }, null, 'dec_pill');
    const r = closeWeek(s);
    expect(r.invariants.ok).toBe(true);
  });
});

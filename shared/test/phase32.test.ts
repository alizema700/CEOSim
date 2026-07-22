import { describe, expect, it } from 'vitest';
import { newGame, forceCash } from './helpers.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { tickFiskus, taxStrategyFactor, bookTaxSavings, fiskusSummaryDe } from '../src/engine/fiskus.js';

/**
 * Phase 22 (FB4): Fiskus & Prüfungen — Steuerstrategie inkl. Hinterziehung,
 * dem gegenüber Betriebsprüfung/Steuerfahndung/WP/DRV/Fördermittel-Prüfung.
 * Golden-Master-sicher: Default konservativ ⇒ Faktor 1, alles inert; Prüfungen
 * feuern erst ab Woche 26.
 */

describe('Fiskus & Prüfungen', () => {
  it('Default konservativ ist komplett inert (Golden-neutral)', () => {
    const s = newGame(32000);
    expect(taxStrategyFactor(s)).toBe(1);
    for (let w = 1; w <= 25; w++) { s.meta.week = w; tickFiskus(s, []); }
    expect(s.fiskus.auditRisk).toBe(0);
    expect(s.fiskus.activeAudit).toBeNull();
    expect(s.fiskus.schwarzbuch).toBe(0);
  });

  it('Illegal: nur 55 % deklariert, Ersparnis wandert ins Schwarzbuch + Lebenszeitkonto', () => {
    const s = newGame(32001);
    applyAction(s, { type: 'SET_TAX_STRATEGY', strategy: 'illegal' }, null, 'd');
    expect(taxStrategyFactor(s)).toBeCloseTo(0.55, 5);
    bookTaxSavings(s, 10_000);
    expect(s.fiskus.schwarzbuch).toBe(10_000);
    expect(s.fiskus.hinterzogenTotal).toBe(10_000);
    // Aggressiv: nur 60 % der Ersparnis strittig, kein Straftatbestand.
    const a = newGame(32001);
    applyAction(a, { type: 'SET_TAX_STRATEGY', strategy: 'aggressiv' }, null, 'd');
    bookTaxSavings(a, 10_000);
    expect(a.fiskus.schwarzbuch).toBeCloseTo(6_000, 5);
    expect(a.fiskus.hinterzogenTotal).toBe(0);
  });

  it('Riskante Strategie treibt das Prüfrisiko; sauber lässt es abklingen', () => {
    const s = newGame(32002);
    s.fiskus.strategy = 'illegal';
    for (let w = 1; w <= 20; w++) { s.meta.week = w; tickFiskus(s, []); }
    expect(s.fiskus.auditRisk).toBeGreaterThan(25);
    applyAction(s, { type: 'SET_TAX_STRATEGY', strategy: 'konservativ' }, null, 'd');
    const riskAfterSwitch = s.fiskus.auditRisk;
    for (let w = 21; w <= 25; w++) { s.meta.week = w; tickFiskus(s, []); }
    expect(s.fiskus.auditRisk).toBeLessThan(riskAfterSwitch); // klingt ab (Schwarzbuch 0)
  });

  it('Hohes Risiko + Schwarzbuch ⇒ Steuerfahndung fliegt auf: Nachzahlung, Strafe, Board-Schaden', () => {
    const s = newGame(32003);
    forceCash(s, 2_000_000);
    s.fiskus.strategy = 'illegal';
    s.fiskus.schwarzbuch = 300_000;
    s.fiskus.hinterzogenTotal = 300_000;
    s.fiskus.auditRisk = 80;
    const trustBefore = s.ceo.boardTrust;
    let caught = false;
    for (let w = 26; w <= 200 && !caught; w++) {
      s.meta.week = w;
      s.fiskus.auditRisk = Math.max(s.fiskus.auditRisk, 80);
      tickFiskus(s, []);
      if (s.fiskus.finesTotal > 0) caught = true;
    }
    expect(caught).toBe(true);
    expect(s.fiskus.schwarzbuch).toBe(0); // abgeräumt
    expect(s.ceo.boardTrust).toBeLessThan(trustBefore);
    // Nachzahlung + Strafe hängen als ONE_OFF_COST im System.
    expect(s.scheduledEffects.some((fx) => fx.effect.kind === 'ONE_OFF_COST' && /nachzahlung/i.test(fx.effect.labelDe))).toBe(true);
    expect(s.meta.status).toBe('active'); // unter 1 Mio ⇒ keine Haft
  });

  it('Über 1 Mio € hinterzogen + Fahndung erwischt ⇒ Haftbefehl (Spielende)', () => {
    const s = newGame(32004);
    forceCash(s, 5_000_000);
    s.fiskus.strategy = 'illegal';
    s.fiskus.schwarzbuch = 1_200_000;
    s.fiskus.hinterzogenTotal = 1_200_000;
    s.fiskus.auditRisk = 90;
    for (let w = 26; w <= 200 && s.meta.status === 'active'; w++) {
      s.meta.week = w;
      s.fiskus.auditRisk = Math.max(s.fiskus.auditRisk, 90);
      tickFiskus(s, []);
    }
    expect(s.meta.status).toBe('convicted');
    expect(s.meta.endReasonDe).toMatch(/Haftbefehl/);
  });

  it('Auch Unschuldige werden geprüft — und kommen sauber raus', () => {
    const s = newGame(32005);
    forceCash(s, 1_000_000);
    let audited = false;
    for (let w = 26; w <= 400; w++) {
      s.meta.week = w;
      const had = s.fiskus.activeAudit !== null;
      tickFiskus(s, []);
      if (had && s.fiskus.activeAudit === null) { audited = true; break; }
    }
    expect(audited).toBe(true);
    expect(s.fiskus.cleanAudits).toBeGreaterThanOrEqual(1);
    expect(s.fiskus.finesTotal).toBe(0);
    expect(s.fiskus.logDe.some((l) => /ohne Beanstandung/.test(l))).toBe(true);
  });

  it('Warnungen: illegal nennt Strafbarkeit & Haftgrenze; Doppelwahl abgelehnt', () => {
    const s = newGame(32006);
    const v = validateAction(s, { type: 'SET_TAX_STRATEGY', strategy: 'illegal' });
    expect(v.ok).toBe(true);
    expect(v.warningsDe.some((w) => /370 AO/.test(w))).toBe(true);
    expect(v.warningsDe.some((w) => /Bewährung|Haft/.test(w))).toBe(true);
    expect(validateAction(s, { type: 'SET_TAX_STRATEGY', strategy: 'konservativ' }).ok).toBe(false);
    expect(fiskusSummaryDe(s)).toContain('Konservativ');
  });
});

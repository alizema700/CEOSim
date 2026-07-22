import { describe, expect, it } from 'vitest';
import { newGame, forceCash } from './helpers.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { fileInsuranceClaim, insurancePremiumMonthly, classifyClaim, buyInsurance } from '../src/engine/insurance.js';
import { INSURANCE_SPECS } from '../src/types/insurance.js';
import { schedule } from '../src/engine/stateHelpers.js';
import { closeWeek } from '../src/engine/tick.js';

/**
 * Phase 22 (V1): Versicherungen — Prämien (G&A) gegen Schadensdeckung.
 * Golden-Master-sicher: ohne aktive Police 0 Prämie und 0 Deckung.
 */

describe('Versicherungen', () => {
  it('Ohne Police: keine Prämie, keine Deckung (Golden-neutral)', () => {
    const s = newGame(28000);
    expect(insurancePremiumMonthly(s)).toBe(0);
    expect(fileInsuranceClaim(s, 'legal', 100_000, 'Test', [])).toBe(0);
  });

  it('Abschluss aktiviert die Police und schlägt als Prämie zu Buche', () => {
    const s = newGame(28001);
    applyAction(s, { type: 'BUY_INSURANCE', kind: 'do' }, null, 'd');
    expect(s.insurance.policies.do.active).toBe(true);
    expect(insurancePremiumMonthly(s)).toBe(INSURANCE_SPECS.do.monthlyPremium);
    // Doppelabschluss wird abgelehnt.
    expect(validateAction(s, { type: 'BUY_INSURANCE', kind: 'do' }).ok).toBe(false);
    applyAction(s, { type: 'CANCEL_INSURANCE', kind: 'do' }, null, 'd');
    expect(s.insurance.policies.do.active).toBe(false);
  });

  it('Deckung zahlt anteilig bis zum Cap und bucht die Claim-Statistik', () => {
    const s = newGame(28002);
    buyInsurance(s, 'cyber');
    const spec = INSURANCE_SPECS.cyber;
    const covered = fileInsuranceClaim(s, 'cyber', 100_000, 'Datenpanne', []);
    expect(covered).toBe(Math.round(100_000 * spec.coverage)); // 75 % = 75.000
    expect(s.insurance.policies.cyber.claimsPaid).toBe(covered);
    expect(s.insurance.claimsPaidTotal).toBe(covered);
    // Cap greift bei großen Schäden.
    const s2 = newGame(28002);
    buyInsurance(s2, 'cyber');
    expect(fileInsuranceClaim(s2, 'cyber', 1_000_000, 'Großschaden', [])).toBe(spec.capPerClaim);
  });

  it('Nur die passende Schadensart wird gedeckt; die beste Police gewinnt', () => {
    const s = newGame(28003);
    buyInsurance(s, 'vertrauensschaden'); // deckt nur fraud
    expect(fileInsuranceClaim(s, 'legal', 50_000, 'Klage', [])).toBe(0);
    expect(fileInsuranceClaim(s, 'fraud', 50_000, 'Betrug', [])).toBeGreaterThan(0);
    // D&O (0,8) deckt legal besser als Haftpflicht (0,5).
    const s2 = newGame(28003);
    buyInsurance(s2, 'haftpflicht');
    buyInsurance(s2, 'do');
    const covered = fileInsuranceClaim(s2, 'legal', 50_000, 'Klage', []);
    expect(covered).toBe(Math.round(50_000 * INSURANCE_SPECS.do.coverage));
  });

  it('classifyClaim erkennt Cyber/Betrug/Recht anhand der Schlagzeile', () => {
    expect(classifyClaim('Vertuschte Datenpanne — Meldepflicht verletzt')).toBe('cyber');
    expect(classifyClaim('Vertuschter Betrugsfall wird publik')).toBe('fraud');
    expect(classifyClaim('Patentstreit in erster Instanz verloren')).toBe('legal');
  });

  it('End-to-End: eine gedeckte Skandalstrafe kostet über closeWeek netto weniger', () => {
    const mk = (insured: boolean) => {
      const s = newGame(28004);
      forceCash(s, 800_000);
      if (insured) buyInsurance(s, 'do'); // deckt legal zu 80 %
      // DELAYED_SCANDAL mit Wahrscheinlichkeit 1, fällig diese Woche.
      schedule(s, 0, 'Test-Skandal', null, { kind: 'DELAYED_SCANDAL', probability: 1, fine: 100_000, topicDe: 'Patentstreit verloren' }, 'system');
      closeWeek(s);
      return s.finance.cash;
    };
    const cashInsured = mk(true);
    const cashUninsured = mk(false);
    // Trotz Prämie hält die versicherte Firma nach der Strafe deutlich mehr Cash.
    expect(cashInsured).toBeGreaterThan(cashUninsured + 50_000);
  });
});

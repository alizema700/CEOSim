import { describe, expect, it } from 'vitest';
import { newGame, testSetup } from './helpers.js';
import { createCompany } from '../src/engine/init.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { profileForCity, resolveLocationProfile } from '../src/engine/scenarios/locations.js';

/**
 * Phase 7: Menschen & Orte — Steckbriefe, HiWis, Spezialisten, individuelle
 * Gehälter, CEO-Vergütung (Aufsichtsrat), eigene Termine, freie Standorte.
 */

describe('Steckbriefe', () => {
  it('jede Person startet mit Alter, Persönlichkeit, Hobby, Stärke — deterministisch', () => {
    const a = newGame(8001);
    const b = newGame(8001);
    expect(a.people.employees.length).toBeGreaterThan(20);
    for (const e of a.people.employees) {
      expect(e.age).toBeGreaterThanOrEqual(20);
      expect(e.age).toBeLessThanOrEqual(60);
      expect(e.personalityDe.length).toBeGreaterThan(5);
      expect(e.hobbyDe.length).toBeGreaterThan(2);
      expect(e.strengthDe.length).toBeGreaterThan(5);
    }
    expect(a.people.employees.map((e) => e.age)).toEqual(b.people.employees.map((e) => e.age));
  });
});

describe('Werkstudent:innen & Spezialrollen', () => {
  it('HiWi kommt günstig an Bord, Spezialist mit Titel + Aufschlag', () => {
    const s = newGame(8002);
    applyAction(s, { type: 'START_HIRING', dept: 'cs', seniority: 'werkstudent', count: 1 }, null, 'dec_hiwi');
    applyAction(s, { type: 'START_HIRING', dept: 'engineering', seniority: 'senior', count: 1, specialistRoleDe: 'Quant' }, null, 'dec_quant');
    const reqQuant = s.people.openRequisitions.find((r) => r.specialistRoleDe === 'Quant');
    expect(reqQuant).toBeTruthy();
    // Bis alle besetzt sind (Spezialist braucht länger):
    for (let i = 0; i < 16 && s.people.openRequisitions.length > 0; i++) closeWeek(s);
    const hiwi = s.people.employees.find((e) => e.seniority === 'werkstudent');
    const quant = s.people.employees.find((e) => e.roleTitleDe === 'Quant');
    expect(hiwi).toBeTruthy();
    expect(hiwi!.salaryMonthly).toBeLessThan(2400); // ~1650 × München-Index
    expect(hiwi!.attritionRiskWeekly).toBeGreaterThan(0.004);
    expect(quant).toBeTruthy();
    expect(quant!.salaryMonthly).toBeGreaterThan(6600); // Senior + ~15 % Aufschlag
  });
});

describe('Individuelle Gehaltserhöhung', () => {
  it('hebt Gehalt & Stimmung der Person; große Sprünge erzeugen Neid', () => {
    const s = newGame(8003);
    const emp = s.people.employees.find((e) => e.dept === 'engineering' && !e.keyPerson)!;
    const coll = s.people.employees.filter((e) => e.dept === 'engineering' && e.id !== emp.id);
    const salBefore = emp.salaryMonthly;
    const satColleagues = coll.map((k) => k.satisfaction);
    applyAction(s, { type: 'ADJUST_EMPLOYEE_SALARY', employeeId: emp.id, pct: 0.2 }, null, 'dec_raise');
    closeWeek(s); // Effekt läuft im Tick
    const after = s.people.employees.find((e) => e.id === emp.id)!;
    expect(after.salaryMonthly).toBeCloseTo(Math.round(salBefore * 1.2), 0);
    // Neid: Kolleg:innen leicht runter (Moral-Drift kann überlagern — daher: mindestens eine Person messbar unter Alt-Wert − 1)
    const collAfter = s.people.employees.filter((e) => e.dept === 'engineering' && e.id !== emp.id);
    const dropped = collAfter.filter((k, i) => satColleagues[i] !== undefined && k.satisfaction < satColleagues[i]!);
    expect(dropped.length).toBeGreaterThan(0);
    // Validierung: unbekannte Person
    expect(validateAction(s, { type: 'ADJUST_EMPLOYEE_SALARY', employeeId: 'emp_nix', pct: 0.05 }).ok).toBe(false);
  });
});

describe('CEO-Gehalt via Aufsichtsrat', () => {
  it('Senkung wird immer angenommen; deutlicher Verzicht gibt Vertrauen', () => {
    const s = newGame(8004);
    const trustBefore = s.ceo.boardTrust;
    applyAction(s, { type: 'SET_CEO_SALARY', monthlyAmount: 9_000 }, null, 'dec_cut'); // von 12k → −25 %
    expect(s.ceo.boardTrust).toBeCloseTo(Math.min(100, trustBefore + 2), 5);
    closeWeek(s);
    expect(s.ceo.salaryMonthly).toBe(9_000);
  });

  it('überzogene Erhöhung bei mittlerem Vertrauen wird abgelehnt (deterministisch)', () => {
    const run = () => {
      const s = newGame(8005); // Board-Trust 58
      const rec = applyAction(s, { type: 'SET_CEO_SALARY', monthlyAmount: 20_000 }, null, 'dec_greed'); // +67 %
      return { s, rec };
    };
    const { s, rec } = run();
    expect(rec.summaryDe).toMatch(/LEHNT AB/);
    closeWeek(s);
    expect(s.ceo.salaryMonthly).toBe(12_000); // unverändert
    const second = run();
    expect(second.rec.summaryDe).toBe(rec.summaryDe); // gleicher Seed ⇒ gleiche Gremien-Entscheidung
  });
});

describe('Eigene Termine', () => {
  it('landen im Kalender und laufen NICHT durch die Bewertungs-Pipeline', () => {
    const s = newGame(8006);
    applyAction(s, { type: 'CREATE_APPOINTMENT', titleDe: 'Strategie-Offsite', week: s.meta.week + 1, weekday: 2, agendaDe: ['Pricing', 'Roadmap'] }, null, 'dec_apt');
    const apt = s.calendar.appointments.find((a) => a.titleDe === 'Strategie-Offsite');
    expect(apt).toBeTruthy();
    expect(apt!.kind).toBe('custom');
    expect(apt!.participants.length).toBeGreaterThan(2); // Führungsteam + Assistenz
    for (let i = 0; i < 6; i++) closeWeek(s);
    expect(s.evaluations.some((e) => e.decisionId === 'dec_apt')).toBe(false); // Sentinel: nie fällig
  });
});

describe('Freie Standorte (Karte)', () => {
  it('profileForCity ist deterministisch und geklemmt', () => {
    const a = profileForCity('Tokio');
    const b = profileForCity('Tokio');
    expect(a).toEqual(b);
    expect(a.payrollIndex).toBeGreaterThanOrEqual(0.55);
    expect(a.payrollIndex).toBeLessThanOrEqual(1.45);
    expect(profileForCity('München').id).toBe('muenchen'); // Preset-Erkennung
  });

  it('Firma in günstiger Stadt zahlt spürbar niedrigere Gehälter', () => {
    const setupW = testSetup();
    setupW.identity = { ...setupW.identity, locationId: 'warschau' };
    const warschau = createCompany(setupW, 8007, 'game_wa', '2026-01-05T09:00:00.000Z');
    const muenchen = newGame(8007);
    expect(warschau.identity.location?.nameDe).toBe('Warschau');
    const avg = (st: typeof warschau) => st.people.employees.reduce((s2, e) => s2 + e.salaryMonthly, 0) / st.people.employees.length;
    expect(avg(warschau)).toBeLessThan(avg(muenchen) * 0.7); // Index 0.58 vs 1.0
    // Bilanz & Tick funktionieren am freien Standort
    const report = closeWeek(warschau);
    expect(report.invariants.ok).toBe(true);
  });

  it('völlig freie Stadt: Profil wird fixiert und ist replay-stabil', () => {
    const setupT = testSetup();
    setupT.identity = { ...setupT.identity, locationId: 'Tokio' };
    const s = createCompany(setupT, 8008, 'game_tk', '2026-01-05T09:00:00.000Z');
    expect(s.identity.location?.nameDe).toBe('Tokio');
    expect(s.identity.location).toEqual(resolveLocationProfile('Tokio'));
    const report = closeWeek(s);
    expect(report.invariants.ok).toBe(true);
  });
});

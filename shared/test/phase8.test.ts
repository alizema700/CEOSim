import { describe, expect, it } from 'vitest';
import { newGame } from './helpers.js';
import { closeWeek } from '../src/engine/tick.js';
import { applyAction, validateAction } from '../src/engine/actions.js';
import { coveredEmployees, openBargaining } from '../src/engine/labor.js';
import type { Occurrence } from '../src/types/game.js';

/**
 * Phase 8: Arbeitsbeziehungen — Tarifbindung, Organisationsgrad, Betriebsrat,
 * Tarifrunden mit Angebot/Streik, Tarifflucht und Mitbestimmung bei Abbau.
 * Alles deterministisch: gleiche Entscheidungen ⇒ exakt gleicher Verlauf.
 */

describe('Initialzustand & Determinismus', () => {
  it('startet ohne Tarif, ohne Betriebsrat, mit standortabhängigem Organisationsgrad', () => {
    const s = newGame(9001); // München = hohe Regulierungsdichte
    expect(s.labor.tarifStatus).toBe('none');
    expect(s.labor.worksCouncil).toBe(false);
    expect(s.labor.negotiation).toBeNull();
    expect(s.labor.unionizationRate).toBeCloseTo(0.28, 2);
  });

  it('Arbeitsbeziehungen sind replay-stabil (gleicher Seed ⇒ gleicher Verlauf)', () => {
    const a = newGame(9002);
    const b = newGame(9002);
    for (let i = 0; i < 20; i++) { closeWeek(a); closeWeek(b); }
    expect(JSON.stringify(a.labor)).toEqual(JSON.stringify(b.labor));
  });
});

describe('Tarifbindung (Beitritt)', () => {
  it('Flächentarif hebt nur die Tarif-Belegschaft (+5 %), nicht die Execs, und beruhigt', () => {
    const s = newGame(9003);
    const execIds = new Set(s.people.executives.map((e) => e.employeeId));
    const covered = coveredEmployees(s);
    const salBefore = new Map(covered.map((e) => [e.id, e.salaryMonthly]));
    const execSalBefore = new Map(s.people.employees.filter((e) => execIds.has(e.id)).map((e) => [e.id, e.salaryMonthly]));
    const tensionBefore = s.labor.tension;
    const laborRepBefore = s.reputation.laborMarket;

    applyAction(s, { type: 'SET_TARIF_BINDING', status: 'verband' }, null, 'dec_tarif');
    expect(s.labor.tarifStatus).toBe('verband');
    expect(s.labor.tension).toBeLessThan(tensionBefore);
    expect(s.reputation.laborMarket).toBeGreaterThan(laborRepBefore);

    const report = closeWeek(s); // TARIF_RAISE (dueWeek 0) wird wirksam
    expect(report.invariants.ok).toBe(true);
    for (const e of s.people.employees) {
      if (execIds.has(e.id)) {
        expect(e.salaryMonthly).toBe(execSalBefore.get(e.id)); // AT/Exec unverändert
      } else if (salBefore.has(e.id)) {
        expect(e.salaryMonthly).toBe(Math.round(salBefore.get(e.id)! * 1.05));
      }
    }
    // Nächste reguläre Tarifrunde ist terminiert.
    expect(s.labor.nextBargainingWeek).not.toBeNull();
  });

  it('kann den bereits aktiven Status nicht erneut setzen', () => {
    const s = newGame(9004);
    applyAction(s, { type: 'SET_TARIF_BINDING', status: 'haustarif' }, null, 'dec_haus');
    expect(validateAction(s, { type: 'SET_TARIF_BINDING', status: 'haustarif' }).ok).toBe(false);
  });
});

describe('Tarifflucht (Austritt)', () => {
  it('erhöht Konflikt, schadet Reputation und senkt die Zufriedenheit der Tarif-Belegschaft', () => {
    const s = newGame(9005);
    // Erst rein, dann wieder raus.
    applyAction(s, { type: 'SET_TARIF_BINDING', status: 'verband' }, null, 'dec_join');
    closeWeek(s);
    const covered = coveredEmployees(s);
    const satBefore = covered.reduce((a, e) => a + e.satisfaction, 0) / covered.length;
    const tensionBefore = s.labor.tension;
    const pressBefore = s.reputation.press;

    const rec = applyAction(s, { type: 'SET_TARIF_BINDING', status: 'none' }, null, 'dec_flucht');
    expect(s.labor.tarifStatus).toBe('none');
    expect(s.labor.tension).toBeGreaterThan(tensionBefore);
    expect(s.reputation.press).toBeLessThan(pressBefore);
    const satAfter = coveredEmployees(s).reduce((a, e) => a + e.satisfaction, 0) / coveredEmployees(s).length;
    expect(satAfter).toBeLessThan(satBefore);
    // Sofort-Occurrence wird in die Analyse gespiegelt.
    expect(rec.immediateAnalysisDe.some((t) => /Tarifausstieg/i.test(t))).toBe(true);
  });

  it('Tarifflucht bei hoher Organisation plant einen Warnstreik ein', () => {
    const s = newGame(9006);
    applyAction(s, { type: 'SET_TARIF_BINDING', status: 'verband' }, null, 'dec_join');
    closeWeek(s);
    s.labor.unionizationRate = 0.6; // stark organisiert
    applyAction(s, { type: 'SET_TARIF_BINDING', status: 'none' }, null, 'dec_flucht');
    expect(s.scheduledEffects.some((fx) => fx.effect.kind === 'WARNING_STRIKE')).toBe(true);
    const report = closeWeek(s);
    expect(report.invariants.ok).toBe(true); // Streik-Effekt bleibt bilanzneutral
  });
});

describe('Organisationsgrad', () => {
  it('driftet über Wochen zu einem standortabhängigen Zielwert', () => {
    const s = newGame(9007);
    s.labor.unionizationRate = 0.05; // künstlich niedrig
    for (let i = 0; i < 15; i++) closeWeek(s);
    // München (hohe Dichte) zieht den Wert wieder nach oben.
    expect(s.labor.unionizationRate).toBeGreaterThan(0.1);
  });
});

describe('Betriebsrat & Mitbestimmung', () => {
  it('bildet sich bei genug Größe & Organisation und aktiviert Mitbestimmung', () => {
    const s = newGame(9008);
    for (let i = 0; i < 13; i++) closeWeek(s); // Woche >= 12
    expect(s.labor.worksCouncil).toBe(false);
    s.labor.unionizationRate = 0.6;
    s.labor.tension = 60;
    closeWeek(s);
    expect(s.labor.worksCouncil).toBe(true);
    expect(s.labor.worksCouncilSinceWeek).not.toBeNull();
    // Es gibt eine Info-Mail zur Betriebsratswahl.
    expect(s.comms.messages.some((m) => m.templateId === 'works-council')).toBe(true);
  });

  it('harter Abbau OHNE faires Paket trotz Betriebsrat eskaliert zum Arbeitskampf', () => {
    const s = newGame(9009);
    s.labor.worksCouncil = true;
    s.labor.worksCouncilSinceWeek = s.meta.week;
    const dept = 'engineering' as const;
    const before = s.people.employees.filter((e) => e.dept === dept).length;
    expect(before).toBeGreaterThan(1);
    applyAction(s, { type: 'LAYOFF', dept, count: 1, generousSeverance: false }, null, 'dec_layoff');
    for (let i = 0; i < 2; i++) closeWeek(s); // EXECUTE_LAYOFF + Streik-Planung greifen
    expect(s.people.employees.filter((e) => e.dept === dept).length).toBe(before - 1);
    // Betriebsrat-Konflikt: Streik wurde geplant/ausgelöst.
    const strikePlanned = s.scheduledEffects.some((fx) => fx.effect.kind === 'WARNING_STRIKE');
    const strikeInPress = s.pressLog.some((p) => /streik/i.test(p.topicDe));
    expect(strikePlanned || strikeInPress).toBe(true);
  });
});

describe('Tarifrunde: Angebot & Streik', () => {
  it('Angebot ≥ Forderung führt zum sofortigen Abschluss (Lohnrunde geplant)', () => {
    const s = newGame(9010);
    applyAction(s, { type: 'SET_TARIF_BINDING', status: 'verband' }, null, 'dec_join');
    closeWeek(s);
    // Tarifrunde manuell eröffnen (deterministisch), statt 26 Wochen zu warten.
    const occ: Occurrence[] = [];
    openBargaining(s, occ);
    const demand = s.labor.negotiation!.demandPct;
    expect(validateAction(s, { type: 'NEGOTIATE_TARIF', offerPct: demand }).ok).toBe(true);

    applyAction(s, { type: 'NEGOTIATE_TARIF', offerPct: demand }, null, 'dec_offer');
    expect(s.labor.negotiation).toBeNull(); // abgeschlossen
    expect(s.labor.rounds.length).toBe(1);
    expect(s.labor.rounds[0]!.viaStrike).toBe(false);
    expect(s.scheduledEffects.some((fx) => fx.effect.kind === 'TARIF_RAISE')).toBe(true);

    const report = closeWeek(s);
    expect(report.invariants.ok).toBe(true);
  });

  it('Angebot unter der Schmerzgrenze wird abgelehnt und eskaliert zum Streik', () => {
    const s = newGame(9011);
    applyAction(s, { type: 'SET_TARIF_BINDING', status: 'verband' }, null, 'dec_join');
    closeWeek(s);
    const occ: Occurrence[] = [];
    openBargaining(s, occ);
    const floor = s.labor.negotiation!.floorPct;
    const lowball = Math.max(0, Math.round((floor - 0.01) * 1000) / 1000);

    // Validierung warnt (aber erlaubt) ein Angebot unter dem Floor.
    const v = validateAction(s, { type: 'NEGOTIATE_TARIF', offerPct: lowball });
    expect(v.ok).toBe(true);
    expect(v.warningsDe.length).toBeGreaterThan(0);

    applyAction(s, { type: 'NEGOTIATE_TARIF', offerPct: lowball }, null, 'dec_lowball');
    expect(s.labor.negotiation).not.toBeNull(); // noch offen
    expect(s.labor.negotiation!.round).toBe(1);
    expect(s.scheduledEffects.some((fx) => fx.effect.kind === 'WARNING_STRIKE')).toBe(true);
  });

  it('NEGOTIATE_TARIF ist ohne laufende Tarifrunde ungültig', () => {
    const s = newGame(9012);
    expect(validateAction(s, { type: 'NEGOTIATE_TARIF', offerPct: 0.04 }).ok).toBe(false);
  });
});

describe('Invarianten über eine lange Laufzeit mit Tarif', () => {
  it('Tarifbindung, Lohnrunde und Streik halten die Bilanz-Identität', () => {
    const s = newGame(9013);
    applyAction(s, { type: 'SET_TARIF_BINDING', status: 'verband' }, null, 'dec_join');
    // Erste reguläre Tarifrunde vorziehen (sonst erst in 26 Wochen — der
    // Sanierungsfall endet u. U. vorher). Der Verhandlungsweg wird so sicher
    // innerhalb der Laufzeit durchgespielt.
    s.labor.nextBargainingWeek = s.meta.week + 3;
    let weeksRun = 0;
    // SaaS-Turnaround ist ein Sanierungsfall — der Lauf kann regulär enden.
    // Getestet wird die INVARIANTEN-Sicherheit, nicht das Überleben.
    for (let w = 0; w < 30 && s.meta.status === 'active'; w++) {
      // Auf jede eröffnete Tarifrunde mit einem fairen Angebot reagieren.
      if (s.labor.negotiation) {
        applyAction(s, { type: 'NEGOTIATE_TARIF', offerPct: s.labor.negotiation.demandPct }, null, `dec_off_${w}`);
      }
      const report = closeWeek(s);
      expect(report.invariants.ok).toBe(true);
      weeksRun++;
    }
    expect(weeksRun).toBeGreaterThanOrEqual(10); // genug Wochen für ≥1 Tarifrunde
    expect(s.labor.rounds.length).toBeGreaterThanOrEqual(1);
  });
});

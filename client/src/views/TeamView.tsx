import { useState } from 'react';
import { DEPARTMENTS, deptDe, EMPLOYER_COST_FACTOR, esopUnallocated, laborSummaryDe, vestedFraction, vestedPercent, type Employee, type TarifStatus } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Bar, Drill, GradeBadge, Modal, Panel, scoreColor } from '../components/ui.js';
import { eur, num, pct } from '../format.js';

/**
 * Team (Phase 7): Führungskreis, DU als CEO (Gehalt via Aufsichtsrat),
 * Abteilungen — und JEDE Person anklickbar mit Steckbrief, individueller
 * Gehaltserhöhung und Direkt-Chat.
 */
export function TeamView() {
  const { state } = useStore();
  const [openEmp, setOpenEmp] = useState<Employee | null>(null);
  if (!state) return null;
  const { employees, executives, openRequisitions, moraleByDept } = state.people;

  const roleDe: Record<string, string> = { cto: 'CTO', headOfSales: 'Head of Sales', headOfCs: 'Head of Customer Success', cfo: 'CFO / Controller' };
  const payrollMonthly = employees.reduce((s, e) => s + e.salaryMonthly, 0) * EMPLOYER_COST_FACTOR;

  return (
    <div className="space-y-8">
      {/* ── Du als CEO ─────────────────────────────────────────────── */}
      <CeoPanel />

      {/* ── Führungsteam ───────────────────────────────────────────── */}
      <section className="rule-top pt-3.5">
        <div className="kicker mb-3">Führungsteam · anklicken für Steckbrief</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {executives.map((ex) => {
            const emp = employees.find((e) => e.id === ex.employeeId);
            return (
              <button key={ex.id} className="panel p-3 text-left transition-colors hover:border-accent" onClick={() => emp && setOpenEmp(emp)}>
                <div className="kicker text-[9.5px] text-accent">{roleDe[ex.role]}</div>
                <div className="serif mt-0.5 text-[18px]">{emp ? `${emp.firstName} ${emp.lastName}` : '— vakant —'}</div>
                {emp ? (
                  <>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-dim">{ex.personalityDe}</p>
                    <p className="mt-1.5 text-[11px] leading-relaxed"><span className="text-warn">Agenda:</span> {ex.agendaDe}</p>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-dim">
                      <span>Beziehung</span>
                      <div className="flex-1"><Bar value={ex.relationshipToCeo} color={scoreColor(ex.relationshipToCeo)} /></div>
                      <span className="num">{ex.relationshipToCeo}</span>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-[11px] text-bad">Führungskraft hat das Unternehmen verlassen — Nachbesetzung nötig.</p>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Arbeitsbeziehungen (Phase 8) ───────────────────────────── */}
      <LaborPanel />

      <section className="rule-top grid gap-6 pt-3.5 lg:grid-cols-3">
        <Panel title="Stimmung je Abteilung">
          {DEPARTMENTS.map((d) => (
            <div key={d} className="mb-2 flex items-center gap-2">
              <span className="w-32 shrink-0 text-xs text-dim">{deptDe(d)}</span>
              <div className="flex-1"><Bar value={moraleByDept[d]} color={scoreColor(moraleByDept[d])} /></div>
              <span className="num w-8 text-right text-xs">{moraleByDept[d]}</span>
            </div>
          ))}
          <p className="mt-2 text-[10px] text-dim">Payroll gesamt: {eur(payrollMonthly)}/Monat (inkl. Arbeitgeberanteile) · {employees.length} Beschäftigte</p>
        </Panel>

        <Panel title="Offene Ausschreibungen">
          {openRequisitions.length === 0 ? (
            <p className="text-xs text-dim">Keine offenen Stellen. Ausschreiben unter Entscheidungen → Einstellen (auch Werkstudent:innen & Spezialrollen wie „Quant").</p>
          ) : (
            openRequisitions.map((r) => (
              <div key={r.id} className="mb-2 text-xs">
                <span className="font-bold">{r.count}× {r.specialistRoleDe ?? r.seniority}</span> in {deptDe(r.dept)}
                <span className="text-dim"> · noch ~{num(r.expectedWeeksToFill)} Wochen · {eur(r.costPerHire)} Fee/Hire</span>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Schlüsselpersonen">
          {employees.filter((e) => e.keyPerson).map((e) => (
            <button key={e.id} className="mb-1.5 flex w-full items-center justify-between text-left text-xs hover:text-accent" onClick={() => setOpenEmp(e)}>
              <span>⭐ {e.firstName} {e.lastName} <span className="text-dim">({e.roleTitleDe})</span></span>
              <span className={`num ${e.satisfaction < 45 ? 'text-bad' : e.satisfaction < 60 ? 'text-warn' : 'text-good'}`}>{Math.round(e.satisfaction)}</span>
            </button>
          ))}
          <p className="mt-2 text-[10px] text-dim">Abgang einer Schlüsselperson kostet Wissen (Velocity-Malus über Wochen). Gezielte Gehaltserhöhung = Bindung.</p>
        </Panel>
      </section>

      <Panel title={`Alle Mitarbeitenden (${employees.length}) · Zeile anklicken für Steckbrief`}>
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel text-left text-[10px] uppercase text-dim">
              <tr>
                <th className="py-1.5 pr-2">Name</th>
                <th className="py-1.5 pr-2">Rolle</th>
                <th className="py-1.5 pr-2">Abteilung</th>
                <th className="num py-1.5 pr-2 text-right">Alter</th>
                <th className="num py-1.5 pr-2 text-right">Gehalt/M</th>
                <th className="num py-1.5 pr-2 text-right">Perf.</th>
                <th className="num py-1.5 text-right">Zufried.</th>
              </tr>
            </thead>
            <tbody>
              {[...employees]
                .sort((a, b) => a.dept.localeCompare(b.dept) || b.salaryMonthly - a.salaryMonthly)
                .map((e) => (
                  <tr key={e.id} className="cursor-pointer border-b border-line/40 last:border-0 hover:bg-panel2" onClick={() => setOpenEmp(e)}>
                    <td className="py-1.5 pr-2">{e.keyPerson && '⭐ '}{e.firstName} {e.lastName}</td>
                    <td className="py-1.5 pr-2 text-dim">{e.roleTitleDe}</td>
                    <td className="py-1.5 pr-2 text-dim">{deptDe(e.dept)}</td>
                    <td className="num py-1.5 pr-2 text-right text-dim">{e.age ?? '—'}</td>
                    <td className="num py-1.5 pr-2 text-right">{eur(e.salaryMonthly, false)}</td>
                    <td className="num py-1.5 pr-2 text-right">{Math.round(e.performance)}</td>
                    <td className={`num py-1.5 text-right ${e.satisfaction < 45 ? 'text-bad' : e.satisfaction < 60 ? 'text-warn' : 'text-good'}`}>
                      {Math.round(e.satisfaction)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {openEmp && <EmployeeModal emp={employees.find((e) => e.id === openEmp.id) ?? openEmp} onClose={() => setOpenEmp(null)} />}
    </div>
  );
}

/** DU als CEO: Vergütung (Antrag an den Aufsichtsrat), Anteil, Skills. */
function CeoPanel() {
  const { state, act, busy } = useStore();
  const [wanted, setWanted] = useState<number | null>(null);
  if (!state) return null;
  const ceo = state.ceo;
  const current = ceo.salaryMonthly;
  const value = wanted ?? current;
  const skills = Object.entries(ceo.skills) as [string, number][];

  return (
    <Panel title={`🎩 Du als CEO · ${state.playerProfile.ceoName}`}>
      <div className="grid gap-6 md:grid-cols-3">
        <div>
          <div className="kicker text-[9.5px]">Deine Vergütung (Beschluss des Aufsichtsrats)</div>
          <div className="num mt-1 text-[22px]">{eur(current)}/M</div>
          <div className="mt-2 flex items-center gap-2">
            <input type="range" min={8000} max={45000} step={500} value={value} onChange={(e) => setWanted(Number(e.target.value))} className="flex-1" />
            <span className="num w-20 text-right text-xs">{eur(value)}</span>
          </div>
          <button
            className="btn mt-2 w-full"
            disabled={busy || value === current || state.meta.status !== 'active'}
            onClick={() => {
              setWanted(null);
              void act({ type: 'SET_CEO_SALARY', monthlyAmount: value }, null);
            }}
          >
            {value > current ? `Erhöhung beim Aufsichtsrat beantragen (+${pct(value / current - 1, 0)})` : value < current ? `Senkung mitteilen (${pct(value / current - 1, 0)})` : 'Unverändert'}
          </button>
          <p className="mt-1.5 text-[10px] text-dim">
            Erhöhungen genehmigt der Vergütungsausschuss nur bei entsprechendem Vertrauen ({num(ceo.boardTrust)}/100) und Lage — eine Ablehnung kostet selbst Vertrauen. Verzicht in der Krise wird honoriert.
          </p>
        </div>
        <div>
          <div className="kicker text-[9.5px]">Beteiligung & Board</div>
          <div className="mt-1 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-dim">Dein Anteil</span><span className="num">{pct(ceo.equityShare, 1)}</span></div>
            <div className="flex justify-between"><span className="text-dim">Board-Vertrauen</span><span className="num">{num(ceo.boardTrust)}/100</span></div>
            <div className="flex justify-between"><span className="text-dim">Jahres-Brutto (rechnerisch)</span><span className="num">{eur(current * 12)}</span></div>
            {state.ipo.status === 'public' && state.ipo.sharePrice !== null && (
              <div className="flex justify-between"><span className="text-dim">Depotwert (Anteil × MCap)</span><span className="num">{eur(ceo.equityShare * state.ipo.sharePrice * state.ipo.sharesOutstanding)}</span></div>
            )}
          </div>
        </div>
        <div>
          <div className="kicker text-[9.5px]">Deine CEO-Skills (wachsen mit guten Prozessen)</div>
          <div className="mt-1 space-y-1">
            {skills.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-[10.5px]">
                <span className="w-28 shrink-0 capitalize text-dim">{k}</span>
                <div className="flex-1"><Bar value={v} /></div>
                <span className="num w-7 text-right">{Math.round(v)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** Konflikt-Farbe: hohe Anspannung ist SCHLECHT (invertiert zu scoreColor). */
function tensionColor(v: number): string {
  return v >= 60 ? 'bg-bad' : v >= 35 ? 'bg-warn' : 'bg-good';
}

const TARIF_LABEL: Record<TarifStatus, string> = {
  none: 'ohne Tarif',
  verband: 'Flächentarif (Verband)',
  haustarif: 'Haustarifvertrag',
};

/**
 * Arbeitsbeziehungen (Phase 8): Tarifbindung, Organisationsgrad, Betriebsrat,
 * Konfliktniveau — plus die aktive Tarifrunde (Forderung vs. dein Angebot).
 * „Tiefe auf Klick": Kennzahlen sind sofort sichtbar, Bindung & Verlauf klappen
 * auf; eine laufende Verhandlung wird prominent gezeigt, weil sie eine Frist hat.
 */
function LaborPanel() {
  const { state, act, busy } = useStore();
  const [tab, setTab] = useState<TarifStatus | null>(null);
  if (!state) return null;
  const l = state.labor;
  const active = state.meta.status === 'active';
  const orgPct = Math.round(l.unionizationRate * 100);
  const neg = l.negotiation;

  return (
    <Panel
      title="🤝 Arbeitsbeziehungen"
      right={<span className="num text-[10.5px] text-dim">{laborSummaryDe(l)}</span>}
    >
      {/* Kennzahlen-Zeile — immer sichtbar */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <div className="kicker text-[9px]">Tarifbindung</div>
          <div className="serif mt-0.5 text-[17px] leading-tight">{TARIF_LABEL[l.tarifStatus]}</div>
          {l.lastRaisePct !== null && <div className="mt-0.5 text-[10px] text-dim">letzte Runde +{(l.lastRaisePct * 100).toFixed(1)} %{l.lastRaiseWeek !== null ? ` (W${l.lastRaiseWeek})` : ''}</div>}
        </div>
        <div>
          <div className="kicker text-[9px]">Organisationsgrad</div>
          <div className="num mt-0.5 text-[17px]">{orgPct} %</div>
          <div className="mt-1"><Bar value={orgPct} color="bg-accent" /></div>
        </div>
        <div>
          <div className="kicker text-[9px]">Betriebsrat</div>
          <div className={`serif mt-0.5 text-[17px] leading-tight ${l.worksCouncil ? 'text-accent' : 'text-dim'}`}>{l.worksCouncil ? 'gewählt' : 'keiner'}</div>
          {l.worksCouncil && l.worksCouncilSinceWeek !== null && <div className="mt-0.5 text-[10px] text-dim">seit Woche {l.worksCouncilSinceWeek} · Mitbestimmung</div>}
        </div>
        <div>
          <div className="kicker text-[9px]">Konfliktniveau</div>
          <div className={`num mt-0.5 text-[17px] ${l.tension >= 60 ? 'text-bad' : l.tension >= 35 ? 'text-warn' : 'text-good'}`}>{Math.round(l.tension)}/100</div>
          <div className="mt-1"><Bar value={l.tension} color={tensionColor(l.tension)} /></div>
        </div>
      </div>

      {/* Aktive Tarifrunde — prominent, weil fristgebunden */}
      {neg && (
        <NegotiationBox demandPct={neg.demandPct} floorPct={neg.floorPct} deadlineWeek={neg.deadlineWeek} round={neg.round} lastOfferPct={neg.lastOfferPct} week={state.meta.week} disabled={busy || !active} onOffer={(p) => void act({ type: 'NEGOTIATE_TARIF', offerPct: p }, null)} />
      )}

      {/* Tarifbindung ändern — hinter Klick (Tarifflucht ist ein harter Schritt) */}
      <Drill id="tarif-binding" title="Tarifbindung ändern" summary={l.tarifStatus === 'none' ? 'derzeit ohne Tarif' : TARIF_LABEL[l.tarifStatus]}>
        <p className="mb-3 text-[11px] leading-relaxed text-dim">
          Tarifbindung hebt die Löhne einmalig aufs Tarifniveau (Verband +5 %, Haustarif +3 %), senkt die Anspannung und stärkt die Arbeitgebermarke — dafür läuft ab dann jährlich eine Tarifrunde. Ein <span className="text-bad">Tarifausstieg</span> spart kurzfristig, kostet aber Vertrauen, Presse und (bei Betriebsrat/hohem Organisationsgrad) provoziert Streik.
        </p>
        <div className="flex flex-wrap gap-2">
          {(['verband', 'haustarif', 'none'] as TarifStatus[]).map((s) => {
            const isCurrent = l.tarifStatus === s;
            const danger = s === 'none';
            const label = s === 'verband' ? 'Flächentarif beitreten' : s === 'haustarif' ? 'Haustarif abschließen' : 'Tarifausstieg (Tarifflucht)';
            return (
              <button
                key={s}
                className={danger ? 'btn border-bad text-bad' : 'btn'}
                disabled={busy || !active || isCurrent}
                onClick={() => { setTab(null); void act({ type: 'SET_TARIF_BINDING', status: s }, null); }}
              >
                {isCurrent ? `✓ ${TARIF_LABEL[s]} (aktuell)` : label}
              </button>
            );
          })}
        </div>
        {tab !== null && <p className="mt-2 text-[10px] text-warn">Wird ausgeführt …</p>}
      </Drill>

      {/* Verlauf der Tarifabschlüsse — hinter Klick */}
      {l.rounds.length > 0 && (
        <Drill id="tarif-history" title="Verlauf der Tarifabschlüsse" summary={`${l.rounds.length} Abschluss/Abschlüsse`}>
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase text-dim">
              <tr><th className="py-1 pr-2">Woche</th><th className="py-1 pr-2">Abschluss</th><th className="py-1">Weg</th></tr>
            </thead>
            <tbody>
              {[...l.rounds].reverse().map((r, i) => (
                <tr key={i} className="border-b border-line/40 last:border-0">
                  <td className="num py-1 pr-2">W{r.week}</td>
                  <td className="num py-1 pr-2">+{(r.agreedPct * 100).toFixed(1)} %</td>
                  <td className={`py-1 ${r.viaStrike ? 'text-bad' : 'text-good'}`}>{r.viaStrike ? '✊ nach Streik' : '🤝 verhandelt'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Drill>
      )}
    </Panel>
  );
}

/** Aktive Tarifrunde: Forderung, Schmerzgrenze und dein Angebot. */
function NegotiationBox({ demandPct, floorPct, deadlineWeek, round, lastOfferPct, week, disabled, onOffer }: {
  demandPct: number; floorPct: number; deadlineWeek: number; round: number; lastOfferPct: number | null; week: number; disabled: boolean; onOffer: (p: number) => void;
}) {
  // Startangebot: knapp über der Schmerzgrenze (fairer Verhandlungsauftakt).
  const [offer, setOffer] = useState(Math.round(floorPct * 1.1 * 1000) / 1000);
  const weeksLeft = deadlineWeek - week;
  const willAccept = offer >= demandPct * 0.97;
  const willCompromise = !willAccept && offer >= floorPct;
  return (
    <div className="mt-4 border-2 border-warn bg-panel2 p-3.5" style={{ borderRadius: 3 }}>
      <div className="flex items-baseline justify-between">
        <span className="kicker text-warn">Laufende Tarifrunde · Runde {round + 1}</span>
        <span className={`num text-[11px] ${weeksLeft <= 1 ? 'text-bad' : 'text-dim'}`}>Frist in {Math.max(0, weeksLeft)} Woche{weeksLeft === 1 ? '' : 'n'}</span>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div className="text-xs">
          <div className="flex justify-between border-b border-line pb-1"><span className="text-dim">Forderung der Gewerkschaft</span><span className="num text-warn">+{(demandPct * 100).toFixed(1)} %</span></div>
          <div className="flex justify-between pt-1"><span className="text-dim">Schmerzgrenze (geschätzt)</span><span className="num">~+{(floorPct * 100).toFixed(1)} %</span></div>
          {lastOfferPct !== null && <div className="flex justify-between pt-1"><span className="text-dim">dein letztes Angebot</span><span className="num">+{(lastOfferPct * 100).toFixed(1)} %</span></div>}
        </div>
        <div>
          <div className="kicker text-[9px]">Dein Angebot</div>
          <div className="mt-1 flex items-center gap-2">
            <input type="range" min={0} max={Math.round(demandPct * 100 * 10) / 10 + 1} step={0.1} value={offer * 100} onChange={(e) => setOffer(Number(e.target.value) / 100)} className="flex-1" disabled={disabled} />
            <span className="num w-16 text-right text-sm">+{(offer * 100).toFixed(1)} %</span>
          </div>
          <p className="mt-1 text-[10px] text-dim">
            {willAccept ? 'Trifft die Forderung — sofortige Annahme, teuer, aber Ruhe.' : willCompromise ? 'Im Korridor — Kompromiss knapp darüber ist wahrscheinlich.' : 'Unter der Schmerzgrenze — Ablehnung und Warnstreik drohen.'}
          </p>
          <button className="btn-primary mt-2 w-full" disabled={disabled} onClick={() => onOffer(offer)}>
            Angebot vorlegen (+{(offer * 100).toFixed(1)} %)
          </button>
        </div>
      </div>
    </div>
  );
}

/** Steckbrief einer Person + Aktionen (Gehalt, Chat). */
function EmployeeModal({ emp, onClose }: { emp: Employee; onClose: () => void }) {
  const { state, act, busy, openChatWith } = useStore();
  const [raise, setRaise] = useState(5);
  const [grantPct, setGrantPct] = useState(0.3);
  if (!state) return null;
  const tenureYears = Math.max(0, (state.meta.week - emp.hiredWeek) / 52);
  const exec = state.people.executives.find((x) => x.employeeId === emp.id);
  const grant = emp.equityGrant;
  const vestedPct = grant ? vestedFraction(grant, state.meta.week) : 0;
  const poolFree = esopUnallocated(state);

  return (
    <Modal title={`Steckbrief · ${deptDe(emp.dept)}`} onClose={onClose} wide>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="serif text-[26px] leading-tight">{emp.keyPerson && '⭐ '}{emp.firstName} {emp.lastName}</h3>
        <GradeBadge grade={emp.performance >= 80 ? 1 : emp.performance >= 68 ? 2 : emp.performance >= 55 ? 3 : 4} />
      </div>
      <div className="kicker mt-1">{emp.roleTitleDe} · {emp.age ?? '—'} Jahre · seit ~{tenureYears.toFixed(1)} Jahren dabei · {emp.seniority}</div>

      <div className="mt-4 grid gap-x-8 gap-y-2 text-xs md:grid-cols-2">
        <div className="flex justify-between border-b border-line pb-1"><span className="text-dim">Gehalt</span><span className="num">{eur(emp.salaryMonthly, false)}/M (AG-Kosten {eur(emp.salaryMonthly * EMPLOYER_COST_FACTOR, false)})</span></div>
        <div className="flex justify-between border-b border-line pb-1"><span className="text-dim">Performance</span><span className="num">{Math.round(emp.performance)}/100</span></div>
        <div className="flex justify-between border-b border-line pb-1"><span className="text-dim">Zufriedenheit</span><span className={`num ${emp.satisfaction < 45 ? 'text-bad' : emp.satisfaction < 60 ? 'text-warn' : 'text-good'}`}>{Math.round(emp.satisfaction)}/100</span></div>
        <div className="flex justify-between border-b border-line pb-1"><span className="text-dim">Kündigungsrisiko</span><span className="num">{pct(emp.attritionRiskWeekly, 2)}/Woche (Basis)</span></div>
      </div>

      <div className="mt-4 space-y-1.5 text-[12.5px] leading-relaxed">
        <p><span className="kicker text-[9px]">Persönlichkeit </span> {emp.personalityDe ?? '—'}</p>
        <p><span className="kicker text-[9px]">Stärke </span> {emp.strengthDe ?? '—'}</p>
        <p><span className="kicker text-[9px]">Hobby </span> {emp.hobbyDe ?? '—'}</p>
        {exec && <p><span className="kicker text-[9px]">Agenda </span> {exec.agendaDe}</p>}
      </div>

      {/* ESOP-Beteiligung (Phase 10) */}
      {grant && (
        <div className="mt-4 border border-line bg-panel2 p-3" style={{ borderRadius: 2 }}>
          <div className="flex items-baseline justify-between">
            <span className="kicker text-[9px] text-accent">ESOP-Beteiligung</span>
            <span className="num text-xs">{pct(grant.percent, 2)} zugesagt · {pct(vestedPercent(grant, state.meta.week), 2)} gevestet</span>
          </div>
          <div className="mt-1.5"><Bar value={vestedPct * 100} color="bg-accent" /></div>
          <p className="mt-1 text-[10px] text-dim">
            {vestedPct === 0
              ? `Noch im 1-Jahr-Cliff — vor Woche ${grant.grantWeek + grant.cliffWeeks} vestet nichts.`
              : vestedPct >= 1
                ? 'Voll gevestet (4 Jahre erreicht).'
                : `${(vestedPct * 100).toFixed(0)} % gevestet, linear bis Woche ${grant.grantWeek + grant.vestWeeks}. Bei Abgang verfällt der Rest.`}
          </p>
        </div>
      )}

      <div className="mt-5 border-t-2 border-ink pt-3">
        <div className="kicker mb-2 text-[10px]">Aktionen</div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" onClick={() => { onClose(); openChatWith('dm:' + (exec ? exec.id : emp.id)); }}>
            💬 Chat öffnen
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-dim">Gehalt +</span>
            <input type="range" min={1} max={25} value={raise} onChange={(e) => setRaise(Number(e.target.value))} className="w-28" />
            <span className="num w-10 text-xs">{raise} %</span>
            <button
              className="btn-primary"
              disabled={busy || state.meta.status !== 'active'}
              onClick={() => {
                onClose();
                void act({ type: 'ADJUST_EMPLOYEE_SALARY', employeeId: emp.id, pct: raise / 100 }, null);
              }}
            >
              Erhöhen ({eur(Math.round(emp.salaryMonthly * (1 + raise / 100)), false)}/M)
            </button>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-dim">Erhöhung wirkt sofort auf Bindung & Stimmung dieser Person; über ~12 % spricht es sich in der Abteilung herum (Neid-Effekt).</p>

        {/* Optionen gewähren (ESOP) */}
        {!grant && poolFree >= 0.0005 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-xs text-dim">ESOP-Optionen</span>
            <input type="range" min={0.05} max={Math.min(2, poolFree * 100)} step={0.05} value={grantPct} onChange={(e) => setGrantPct(Number(e.target.value))} className="w-28" />
            <span className="num w-14 text-xs">{grantPct.toFixed(2)} %</span>
            <button
              className="btn"
              disabled={busy || state.meta.status !== 'active' || grantPct / 100 > poolFree}
              onClick={() => { onClose(); void act({ type: 'GRANT_OPTIONS', employeeId: emp.id, percent: grantPct / 100 }, null); }}
            >
              Optionen gewähren
            </button>
            <span className="w-full text-[10px] text-dim">Bindung über 4 Jahre Vesting (1-Jahr-Cliff) statt Cash. Pool frei: {pct(poolFree, 2)}.</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

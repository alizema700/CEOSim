import { DEPARTMENTS, deptDe, EMPLOYER_COST_FACTOR } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Bar, Panel, scoreColor } from '../components/ui.js';
import { eur, num } from '../format.js';

/** Team: Führungskreis-Personas, Abteilungen, Personalliste, Hiring-Pipeline. */
export function TeamView() {
  const { state } = useStore();
  if (!state) return null;
  const { employees, executives, openRequisitions, moraleByDept } = state.people;

  const roleDe: Record<string, string> = { cto: 'CTO', headOfSales: 'Head of Sales', headOfCs: 'Head of Customer Success', cfo: 'CFO / Controller' };
  const payrollMonthly = employees.reduce((s, e) => s + e.salaryMonthly, 0) * EMPLOYER_COST_FACTOR;

  return (
    <div className="space-y-4">
      {/* Führungsteam — benannte Personas mit Persönlichkeit & Agenda */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {executives.map((ex) => {
          const emp = employees.find((e) => e.id === ex.employeeId);
          return (
            <div key={ex.id} className="panel p-3">
              <div className="text-[10px] uppercase tracking-wider text-accent">{roleDe[ex.role]}</div>
              <div className="mt-0.5 text-sm font-bold">{emp ? `${emp.firstName} ${emp.lastName}` : '— vakant —'}</div>
              {emp ? (
                <>
                  <p className="mt-2 text-[11px] leading-relaxed text-dim">{ex.personalityDe}</p>
                  <p className="mt-1.5 text-[11px] leading-relaxed"><span className="text-warn">Agenda:</span> {ex.agendaDe}</p>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-dim">
                    <span>Beziehung zu dir</span>
                    <div className="flex-1"><Bar value={ex.relationshipToCeo} color={scoreColor(ex.relationshipToCeo)} /></div>
                    <span className="num">{ex.relationshipToCeo}</span>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[11px] text-bad">Diese Führungskraft hat das Unternehmen verlassen — Nachbesetzung nötig.</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
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
            <p className="text-xs text-dim">Keine offenen Stellen.</p>
          ) : (
            openRequisitions.map((r) => (
              <div key={r.id} className="mb-2 text-xs">
                <span className="font-bold">{r.count}× {r.seniority}</span> in {deptDe(r.dept)}
                <span className="text-dim"> · noch ~{num(r.expectedWeeksToFill)} Wochen · {eur(r.costPerHire)} Fee/Hire</span>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Schlüsselpersonen">
          {employees.filter((e) => e.keyPerson).map((e) => (
            <div key={e.id} className="mb-1.5 flex items-center justify-between text-xs">
              <span>⭐ {e.firstName} {e.lastName} <span className="text-dim">({e.roleTitleDe})</span></span>
              <span className={`num ${e.satisfaction < 45 ? 'text-bad' : e.satisfaction < 60 ? 'text-warn' : 'text-good'}`}>{Math.round(e.satisfaction)}</span>
            </div>
          ))}
          <p className="mt-2 text-[10px] text-dim">Abgang einer Schlüsselperson kostet Wissen (Velocity-Malus über Wochen).</p>
        </Panel>
      </div>

      <Panel title={`Alle Mitarbeitenden (${employees.length})`}>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel text-left text-[10px] uppercase text-dim">
              <tr>
                <th className="py-1.5 pr-2">Name</th>
                <th className="py-1.5 pr-2">Rolle</th>
                <th className="py-1.5 pr-2">Abteilung</th>
                <th className="num py-1.5 pr-2 text-right">Gehalt/M</th>
                <th className="num py-1.5 pr-2 text-right">Perf.</th>
                <th className="num py-1.5 text-right">Zufriedenheit</th>
              </tr>
            </thead>
            <tbody>
              {[...employees]
                .sort((a, b) => a.dept.localeCompare(b.dept) || b.salaryMonthly - a.salaryMonthly)
                .map((e) => (
                  <tr key={e.id} className="border-b border-line/40 last:border-0">
                    <td className="py-1 pr-2">{e.keyPerson && '⭐ '}{e.firstName} {e.lastName}</td>
                    <td className="py-1 pr-2 text-dim">{e.roleTitleDe}</td>
                    <td className="py-1 pr-2 text-dim">{deptDe(e.dept)}</td>
                    <td className="num py-1 pr-2 text-right">{eur(e.salaryMonthly, false)}</td>
                    <td className="num py-1 pr-2 text-right">{Math.round(e.performance)}</td>
                    <td className={`num py-1 text-right ${e.satisfaction < 45 ? 'text-bad' : e.satisfaction < 60 ? 'text-warn' : 'text-good'}`}>
                      {Math.round(e.satisfaction)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

import { useStore } from '../store.js';
import { Modal, GradeBadge } from '../components/ui.js';
import { eur, dateDe } from '../format.js';

/** Wochenabschluss-Bericht: was passiert ist, GuV-Kurzfassung, Board, fällige Bewertungen. */
export function WeekReportModal() {
  const { weekReport, dismissWeekReport, evaluations, state, setView } = useStore();
  if (!weekReport || !state) return null;
  const r = weekReport;
  const dueEvals = evaluations.filter((e) => r.evaluationsDue.includes(e.decisionId));

  return (
    <Modal title={`Wochenbericht · Woche ${r.week} · ${dateDe(r.dateISO)}`} onClose={dismissWeekReport} wide>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">Ereignisse der Woche</div>
          {r.occurrences.length === 0 ? (
            <p className="text-xs text-dim">Eine ruhige Woche. Genieß es — das bleibt nicht so.</p>
          ) : (
            <ul className="space-y-1">
              {r.occurrences.map((o, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span>{o.icon}</span>
                  <span className={o.severity === 'bad' ? 'text-bad' : o.severity === 'good' ? 'text-good' : 'text-ink'}>{o.textDe}</span>
                </li>
              ))}
            </ul>
          )}

          {r.triggeredEvents.length > 0 && (
            <div className="mt-3 rounded border border-warn/50 bg-warn/10 p-2 text-xs text-warn">
              🚨 {r.triggeredEvents.length} neue(s) Ereignis(se) wartet(en) auf deine Reaktion — siehe Dashboard.
            </div>
          )}

          <div className="mb-1 mt-4 text-[10px] uppercase tracking-wider text-dim">Board-Vertrauen</div>
          <div className={`num text-sm ${r.boardTrustDelta >= 0 ? 'text-good' : 'text-bad'}`}>
            {r.boardTrustDelta >= 0 ? '+' : ''}
            {r.boardTrustDelta} → {state.ceo.boardTrust}/100
          </div>
          <ul className="mt-1 space-y-0.5">
            {r.trustDrivers.map((d, i) => (
              <li key={i} className="text-[11px] text-dim">
                {d.delta > 0 ? '▲' : d.delta < 0 ? '▼' : '·'} {d.reasonDe}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">Finanzen der Woche</div>
          <table className="w-full text-xs">
            <tbody>
              {(
                [
                  ['Umsatz', r.incomeStatement.revenue],
                  ['EBITDA', r.incomeStatement.ebitda],
                  ['Wochenergebnis', r.incomeStatement.netIncome],
                  ['Cash-Veränderung', r.cashFlow.netChange],
                  ['Kasse Ende', r.cashFlow.cashEnd],
                ] as const
              ).map(([label, v]) => (
                <tr key={label} className="border-b border-line/40 last:border-0">
                  <td className="py-1 text-dim">{label}</td>
                  <td className={`num py-1 text-right ${v < 0 ? 'text-bad' : 'text-ink'}`}>{eur(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-good">✓ Invarianten geprüft (Bilanz-Identität, Cash-Flow-Konsistenz)</p>

          {dueEvals.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">Bewertungen fällig (Entscheidung vor 4 Wochen)</div>
              {dueEvals.map((ev) => {
                const d = state.decisionLog.find((x) => x.id === ev.decisionId);
                return (
                  <div key={ev.id} className="mb-2 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{d?.summaryDe}</span>
                    <GradeBadge grade={ev.grade.overall} />
                  </div>
                );
              })}
              <button
                className="btn mt-1 w-full"
                onClick={() => {
                  dismissWeekReport();
                  setView('evaluations');
                }}
              >
                → Zur vollständigen Bewertung (Hypothese vs. Realität)
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button className="btn-primary" onClick={dismissWeekReport}>
          Weiter
        </button>
      </div>
    </Modal>
  );
}

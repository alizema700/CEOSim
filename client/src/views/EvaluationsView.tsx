import { KPI_DEFINITIONS } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Bar, GradeBadge, Panel, scoreColor } from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { formatByUnit } from '../format.js';

/**
 * Bewertungs-Feed: Hypothese → Resultat (Diff) → Analyse → Note → Lektion.
 * Note & Zahlen kommen deterministisch aus der Engine; die vertiefende
 * Prosa (falls vorhanden) vom LLM — klar getrennt ausgewiesen.
 */
export function EvaluationsView() {
  const { state, evaluations } = useStore();
  if (!state) return null;

  const sorted = [...evaluations].sort((a, b) => b.week - a.week);
  const criteriaDe: Record<string, string> = {
    informationsnutzung: 'Informationsnutzung',
    risikoAbwaegung: 'Risiko-Abwägung',
    timing: 'Timing',
    werteKonsistenz: 'Werte-Konsistenz',
    kommunikation: 'Kommunikation',
  };

  if (sorted.length === 0) {
    return (
      <Panel title="Bewertungen">
        <p className="text-xs text-dim">
          Noch keine Bewertungen. Jede Entscheidung wird 4 Wochen später am Ergebnis gemessen — bewertet wird der PROZESS
          (Informationsnutzung, Risiko, Timing, Werte-Konsistenz), nicht nur der Ausgang. Gute Entscheidung + Pech ≠ schlechte
          Entscheidung.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {/* CEO-Skills */}
      <Panel title="CEO-Score (wächst mit guten Entscheidungen)">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
          {Object.entries(state.ceo.skills).map(([k, v]) => (
            <div key={k}>
              <div className="mb-0.5 flex justify-between text-[11px]">
                <span className="capitalize text-dim">{k}</span>
                <span className="num">{Math.round(v)}</span>
              </div>
              <Bar value={v} color="bg-accent" />
            </div>
          ))}
        </div>
      </Panel>

      {sorted.map((ev) => {
        const decision = state.decisionLog.find((d) => d.id === ev.decisionId);
        return (
          <div key={ev.id} className="panel">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <div>
                <span className="text-xs text-dim">W{decision?.week ?? '?'} → W{ev.week} · </span>
                <span className="text-sm font-bold">{decision?.summaryDe ?? ev.decisionId}</span>
              </div>
              <GradeBadge grade={ev.grade.overall} />
            </div>
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <div className="space-y-3">
                {/* Zahlen-Diff */}
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">Resultat · Zahlen-Diff (4 Wochen)</div>
                  <table className="w-full text-xs">
                    <tbody>
                      {ev.kpiDiff.map((k) => {
                        const def = KPI_DEFINITIONS[k.id];
                        const delta = k.after - k.before;
                        return (
                          <tr key={k.id} className="border-b border-line/40 last:border-0">
                            <td className="py-1 text-dim">{def.labelDe}</td>
                            <td className="num py-1 text-right">{formatByUnit(k.before, def.unit)}</td>
                            <td className="px-1 text-dim">→</td>
                            <td className="num py-1 text-right">{formatByUnit(k.after, def.unit)}</td>
                            <td className={`num py-1 pl-2 text-right ${delta > 0 ? 'text-good' : delta < 0 ? 'text-bad' : 'text-dim'}`}>
                              {delta > 0 ? '▲' : delta < 0 ? '▼' : '–'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Hypothesen-Abgleich */}
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">Hypothesen-Abgleich</div>
                  <div
                    className={`rounded border p-2 text-xs ${
                      ev.hypothesisReview.verdict === 'treffend'
                        ? 'border-good/50 text-good'
                        : ev.hypothesisReview.verdict === 'daneben'
                          ? 'border-bad/50 text-bad'
                          : 'border-line text-ink'
                    }`}
                  >
                    <span className="font-bold uppercase">{ev.hypothesisReview.verdict}</span> — {ev.hypothesisReview.commentDe}
                    {decision?.hypothesis && <div className="mt-1 text-dim">Deine Hypothese: „{decision.hypothesis.textDe}"</div>}
                  </div>
                </div>
                {/* Kriterien */}
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">Prozess-Kriterien</div>
                  {Object.entries(ev.grade.criteria).map(([k, v]) => (
                    <div key={k} className="mb-1 flex items-center gap-2">
                      <span className="w-36 shrink-0 text-[11px] text-dim">{criteriaDe[k] ?? k}</span>
                      <div className="flex-1">
                        <Bar value={v} color={scoreColor(v)} />
                      </div>
                      <span className="num w-8 text-right text-[11px]">{Math.round(v)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">Analyse · Kausalkette (Engine)</div>
                  <ul className="space-y-1 text-xs leading-relaxed">
                    {ev.causalChainDe.map((c, i) => (
                      <li key={i}>→ {c}</li>
                    ))}
                    {ev.grade.reasoningDe.map((r, i) => (
                      <li key={'r' + i} className="text-dim">
                        · {r}
                      </li>
                    ))}
                  </ul>
                </div>
                {ev.llmAnalysisDe && (
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">Vertiefung (KI-Coach)</div>
                    <p className="whitespace-pre-wrap rounded border border-accent/30 bg-accent/5 p-2 text-xs leading-relaxed">{ev.llmAnalysisDe}</p>
                  </div>
                )}
                <div className="rounded border border-warn/40 bg-warn/5 p-2 text-xs">
                  <span className="inline-flex items-center gap-1 font-bold text-warn"><Icon name="pin" size={12} /> Lektion: </span>
                  {ev.lessonDe}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

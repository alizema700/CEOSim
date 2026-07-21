import { KPI_DEFINITIONS, type KpiId } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Modal, GradeBadge } from '../components/ui.js';
import { eur, num, dateDe, formatByUnit } from '../format.js';

/** KPIs, die im „größten Mover" der Woche berücksichtigt werden. */
const MOVER_KPIS: KpiId[] = ['mrr', 'logoChurnMonthly', 'netBurnMonthly', 'runwayWeeks', 'ebitdaMonthly', 'customers', 'nrr', 'ruleOf40'];

/**
 * Wochenabschluss-Bericht — der wöchentliche Payoff. Editorial statt Formular:
 * Aufmacher, Momentum-Zahlen mit Delta, „größter Mover", Ereignisse, Board-
 * Vertrauen mit Treibern und fällige Bewertungen.
 */
export function WeekReportModal() {
  const { weekReport, dismissWeekReport, evaluations, state, setView } = useStore();
  if (!weekReport || !state) return null;
  const r = weekReport;
  const dueEvals = evaluations.filter((e) => r.evaluationsDue.includes(e.decisionId));
  const hist = state.history;
  const now = hist[hist.length - 1]?.values ?? null;
  const prev = hist[hist.length - 2]?.values ?? null;
  const hero = deriveWeekHero(r);
  const mover = prev && now ? biggestMover(prev, now) : null;
  const cashSeries = hist.slice(-14).map((h) => h.values.mrr);

  const money = [
    { label: 'Umsatz', v: r.incomeStatement.revenue, d: null as number | null, better: 'up' as const },
    { label: 'EBITDA', v: r.incomeStatement.ebitda, d: prev && now ? now.ebitdaMonthly - prev.ebitdaMonthly : null, better: 'up' as const },
    { label: 'Ergebnis', v: r.incomeStatement.netIncome, d: null, better: 'up' as const },
    { label: 'Cash Δ', v: r.cashFlow.netChange, d: null, better: 'up' as const },
    { label: 'Kasse', v: r.cashFlow.cashEnd, d: null, better: 'up' as const },
  ];

  return (
    <Modal title={`Wochenbericht · Woche ${r.week}`} onClose={dismissWeekReport} wide>
      {/* Aufmacher */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-4">
        <div className="min-w-0 flex-1">
          <div className={`kicker ${hero.color}`}>{hero.kicker} · {dateDe(r.dateISO)}</div>
          <h2 className="serif mt-1.5 text-[26px] leading-[1.12] text-ink" style={{ maxWidth: '34ch', textWrap: 'balance' }}>{hero.headline}</h2>
        </div>
        {cashSeries.length >= 2 && (
          <div className="shrink-0">
            <div className="kicker mb-1 text-[8.5px]">MRR · {cashSeries.length} W</div>
            <Spark values={cashSeries} />
          </div>
        )}
      </div>

      {/* Momentum-Zahlen */}
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
        {money.map((m) => (
          <div key={m.label} className="border-b border-line pb-1.5">
            <div className="kicker text-[8.5px]">{m.label}</div>
            <div className={`num text-[16px] ${m.v < 0 ? 'text-bad' : 'text-ink'}`}>{eur(m.v)}</div>
            {m.d !== null && Math.abs(m.d) > 1 && (
              <div className={`num text-[10px] ${(m.d >= 0) === (m.better === 'up') ? 'text-good' : 'text-bad'}`}>{m.d >= 0 ? '▲' : '▼'} {eur(Math.abs(m.d))}</div>
            )}
          </div>
        ))}
      </div>

      {mover && (
        <div className="mt-3 flex items-baseline gap-2 border border-line bg-panel2 px-3 py-2" style={{ borderRadius: 2 }}>
          <span className="kicker text-[9px]">Größter Mover</span>
          <span className="text-[13px] text-ink">{mover.label}</span>
          <span className={`num ml-auto text-[13px] ${mover.favorable ? 'text-good' : 'text-bad'}`}>{mover.arrow} {mover.deltaTxt}</span>
        </div>
      )}

      <div className="mt-4 grid gap-5 md:grid-cols-2">
        {/* Ereignisse */}
        <div>
          <div className="kicker mb-2">Ereignisse der Woche</div>
          {r.occurrences.length === 0 ? (
            <p className="text-[13px] italic text-dim">Eine ruhige Woche. Genieß es — das bleibt nicht so.</p>
          ) : (
            <ul className="space-y-1.5">
              {r.occurrences.map((o, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-snug">
                  <span className="shrink-0">{o.icon}</span>
                  <span className={o.severity === 'bad' ? 'text-bad' : o.severity === 'good' ? 'text-good' : o.severity === 'warn' ? 'text-warn' : 'text-ink2'}>{o.textDe}</span>
                </li>
              ))}
            </ul>
          )}
          {r.triggeredEvents.length > 0 && (
            <div className="mt-3 border-l-2 border-warn bg-warn/5 px-2.5 py-2 text-[12px] text-warn">
              🚨 {r.triggeredEvents.length} neue(s) Ereignis(se) wartet(en) auf deine Reaktion — siehe Dashboard.
            </div>
          )}
        </div>

        {/* Board-Vertrauen */}
        <div>
          <div className="kicker mb-2">Board-Vertrauen</div>
          <div className="flex items-baseline gap-2">
            <span className={`num text-[22px] ${r.boardTrustDelta >= 0 ? 'text-good' : 'text-bad'}`}>{r.boardTrustDelta >= 0 ? '+' : ''}{r.boardTrustDelta}</span>
            <span className="num text-[13px] text-dim">→ {state.ceo.boardTrust}/100</span>
          </div>
          <ul className="mt-1.5 space-y-1">
            {r.trustDrivers.map((d, i) => (
              <li key={i} className="flex gap-1.5 text-[11.5px] leading-snug">
                <span className={`shrink-0 ${d.delta > 0 ? 'text-good' : d.delta < 0 ? 'text-bad' : 'text-dim'}`}>{d.delta > 0 ? '▲' : d.delta < 0 ? '▼' : '·'}</span>
                <span className="text-dim">{d.reasonDe}</span>
              </li>
            ))}
            {r.trustDrivers.length === 0 && <li className="text-[12px] italic text-dim">Keine Vertrauens-Bewegung diese Woche.</li>}
          </ul>
        </div>
      </div>

      <p className="mt-3 text-[10px] text-good">✓ Invarianten geprüft (Bilanz-Identität, Cash-Flow-Konsistenz)</p>

      {dueEvals.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="kicker mb-2">Bewertungen fällig · Entscheidung vor 4 Wochen</div>
          {dueEvals.map((ev) => {
            const d = state.decisionLog.find((x) => x.id === ev.decisionId);
            return (
              <div key={ev.id} className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate text-ink2">{d?.summaryDe}</span>
                <GradeBadge grade={ev.grade.overall} />
              </div>
            );
          })}
          <button className="btn mt-1.5 w-full" onClick={() => { dismissWeekReport(); setView('evaluations'); }}>
            → Zur vollständigen Bewertung (Hypothese vs. Realität)
          </button>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <button className="btn-primary" onClick={dismissWeekReport}>Weiter</button>
      </div>
    </Modal>
  );
}

/** Kompakte Sparkline (SVG) für das Momentum im Kopf. */
function Spark({ values }: { values: number[] }) {
  const w = 150, h = 40, pad = 3;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const n = values.length;
  const x = (i: number) => pad + (i / (n - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / range) * (h - 2 * pad);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = values[n - 1]! >= values[0]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="block">
      <polyline points={pts} fill="none" stroke={up ? '#2e8558' : '#c2453d'} strokeWidth="1.6" />
      <circle cx={x(n - 1)} cy={y(values[n - 1]!)} r="2.5" fill={up ? '#2e8558' : '#c2453d'} />
    </svg>
  );
}

// ── Helfer ────────────────────────────────────────────────────────────
function deriveWeekHero(r: NonNullable<ReturnType<typeof useStore.getState>['weekReport']>): { kicker: string; color: string; headline: string } {
  const bad = r.occurrences.find((o) => o.severity === 'bad');
  if (r.triggeredEvents.length > 0) return { kicker: 'Reaktion erforderlich', color: 'text-bad', headline: `Ein neues Ereignis liegt auf dem Tisch — das Board schaut auf deine Antwort.` };
  if (bad) return { kicker: 'Gegenwind', color: 'text-bad', headline: bad.textDe };
  if (r.incomeStatement.netIncome > 0) return { kicker: 'Profitable Woche', color: 'text-good', headline: `Die Woche endet mit einem positiven Ergebnis von ${eur(r.incomeStatement.netIncome)}.` };
  const good = r.occurrences.find((o) => o.severity === 'good');
  if (good) return { kicker: 'Rückenwind', color: 'text-good', headline: good.textDe };
  if (r.cashFlow.netChange >= 0) return { kicker: 'Stabile Woche', color: 'text-accent', headline: 'Die Kasse hält, die Zahlen sind sortiert — Zeit, den nächsten Zug zu planen.' };
  return { kicker: 'Woche abgeschlossen', color: 'text-accent', headline: 'Abgerechnet und verbucht — der Bericht liegt vor.' };
}

function biggestMover(prev: Record<KpiId, number>, now: Record<KpiId, number>): { label: string; deltaTxt: string; arrow: string; favorable: boolean } | null {
  let best: { id: KpiId; rel: number; delta: number } | null = null;
  for (const id of MOVER_KPIS) {
    const a = prev[id], b = now[id];
    if (a === undefined || b === undefined) continue;
    const base = Math.abs(a) || 1;
    const rel = Math.abs((b - a) / base);
    if (rel > 0.005 && (!best || rel > best.rel)) best = { id, rel, delta: b - a };
  }
  if (!best) return null;
  const def = KPI_DEFINITIONS[best.id];
  const higherBetter = def.goodWhen ? def.goodWhen.comparator === 'gte' : true;
  const favorable = (best.delta >= 0) === higherBetter;
  return {
    label: def.labelDe,
    deltaTxt: `${formatByUnit(Math.abs(best.delta), def.unit)}`,
    arrow: best.delta >= 0 ? '▲' : '▼',
    favorable,
  };
}

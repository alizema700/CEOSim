import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  EVENT_CARDS,
  effectiveMonthlyChurn,
  runwayWeeks,
  totalMrr,
  type KpiId,
} from '@boardroom/shared';
import { useState } from 'react';
import { useStore } from '../store.js';
import { eur, num, pct } from '../format.js';
import { KpiCard, Panel } from '../components/ui.js';

const KPI_GRID: KpiId[] = [
  'mrr', 'mrrGrowthMonthly', 'logoChurnMonthly', 'nrr',
  'netBurnMonthly', 'runwayWeeks', 'ebitdaMonthly', 'grossMarginPct',
  'ltv', 'cac', 'ltvCacRatio', 'cacPaybackMonths',
  'ruleOf40', 'magicNumber', 'valuation', 'revenueConcentrationHhi',
];

export function DashboardView() {
  const { state, reports, act, busy } = useStore();
  if (!state) return null;

  const lastReport = reports[reports.length - 1] ?? null;
  const kpis = state.history[state.history.length - 1]?.values ?? null;
  const chartData = state.history.map((h) => ({
    week: h.week,
    mrr: Math.round(h.values.mrr),
    churn: Math.round(h.values.logoChurnMonthly * 10000) / 100,
  }));
  const openEvents = state.openEvents.filter((e) => e.status === 'open');
  const trustLog = [...state.ceo.trustLog].slice(-8).reverse();

  const churn = effectiveMonthlyChurn(state);
  const contextFor = (id: KpiId): string => {
    switch (id) {
      case 'logoChurnMonthly':
        return churn > 0.03
          ? `Bei ${pct(churn)} Monats-Churn verlierst du pro Jahr rund ${pct(1 - Math.pow(1 - churn, 12), 0)} deiner Kunden — DAS ist derzeit dein Kernproblem.`
          : 'Aktuell im gesunden Bereich — halten!';
      case 'runwayWeeks':
        return `Bei aktuellem Burn reicht die Kasse noch ~${num(runwayWeeks(state))} Wochen. Unter 26 Wochen wird das Board unruhig.`;
      case 'mrr':
        return `Dein Umsatzmotor: ${eur(totalMrr(state))}/Monat über alle Kunden. Alles andere leitet sich hiervon ab.`;
      default:
        return '';
    }
  };

  return (
    <div className="space-y-4">
      <TutorialPanel />
      {/* Alerts */}
      {lastReport && lastReport.alerts.length > 0 && (
        <div className="space-y-2">
          {lastReport.alerts.map((a) => (
            <div
              key={a.id}
              className={`panel flex gap-3 px-3 py-2 text-xs ${a.severity === 'critical' ? 'border-bad/60' : 'border-warn/40'}`}
            >
              <span>{a.severity === 'critical' ? '🔴' : '🟡'}</span>
              <div>
                <span className="font-bold">{a.titleDe}</span>
                <span className="ml-2 text-dim">{a.bodyDe}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Offene Ereignisse — verlangen eine Entscheidung */}
      {openEvents.map((ev) => {
        const card = EVENT_CARDS.find((c) => c.id === ev.cardId);
        if (!card) return null;
        return (
          <Panel key={ev.instanceId} title={`🚨 Ereignis · Woche ${ev.triggeredWeek} · Reaktion erforderlich`}>
            <div className="mb-1 text-sm font-bold text-warn">{card.titleDe}</div>
            <p className="mb-3 text-xs leading-relaxed text-ink">{ev.bodyDe}</p>
            <div className="flex flex-wrap gap-2">
              {card.options.map((opt) => (
                <button
                  key={opt.id}
                  className="btn"
                  disabled={busy}
                  onClick={() => void act({ type: 'RESPOND_EVENT', eventInstanceId: ev.instanceId, optionId: opt.id }, null)}
                >
                  {opt.labelDe}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-dim">
              Ignorieren ist auch eine Entscheidung: Nach {card.autoResolveAfterWeeks} Wochen greift automatisch „{card.options.find((o) => o.id === card.defaultOptionId)?.labelDe}".
            </p>
          </Panel>
        );
      })}

      {/* KPI-Grid mit Formel-Tooltips */}
      {kpis && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          {KPI_GRID.map((id) => (
            <KpiCard key={id} id={id} value={kpis[id]} contextDe={contextFor(id)} />
          ))}
        </div>
      )}

      {/* Charts */}
      {chartData.length >= 2 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Chart title="MRR-Verlauf (€/Monat)" data={chartData} dataKey="mrr" color="#38bdf8" />
          <Chart title="Logo-Churn (%/Monat)" data={chartData} dataKey="churn" color="#f87171" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Wochen-Feed */}
        <Panel title={`Diese Woche passiert (W${lastReport ? lastReport.week : state.meta.week})`}>
          {lastReport && lastReport.occurrences.length > 0 ? (
            <ul className="space-y-1.5">
              {lastReport.occurrences.map((o, i) => (
                <li key={i} className={`flex gap-2 text-xs ${o.severity === 'bad' ? 'text-bad' : o.severity === 'good' ? 'text-good' : o.severity === 'warn' ? 'text-warn' : 'text-dim'}`}>
                  <span>{o.icon}</span>
                  <span className="text-ink">{o.textDe}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-dim">Noch keine abgeschlossene Woche. Triff Entscheidungen und klicke „Woche abschließen".</p>
          )}
        </Panel>

        {/* Board-Vertrauen: KEINE Blackbox */}
        <Panel title="Board-Vertrauen · Treiber (transparent)">
          {trustLog.length > 0 ? (
            <ul className="space-y-1.5">
              {trustLog.map((d, i) => (
                <li key={i} className="flex items-baseline gap-2 text-xs">
                  <span className={`num w-12 shrink-0 text-right ${d.delta > 0 ? 'text-good' : d.delta < 0 ? 'text-bad' : 'text-dim'}`}>
                    {d.delta > 0 ? '+' : ''}
                    {d.delta}
                  </span>
                  <span className="text-dim">W{d.week}</span>
                  <span className="text-ink">{d.reasonDe}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-dim">Noch keine Einträge.</p>
          )}
          {state.ceo.probation && (
            <div className="mt-3 rounded border border-bad/50 bg-bad/10 p-2 text-xs text-bad">
              ⚠️ BEWÄHRUNG bis Woche {state.ceo.probation.endsWeek}: {state.ceo.probation.targets.map((t) => t.labelDe).join(' · ')}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Chart({ title, data, dataKey, color }: { title: string; data: Record<string, number>[]; dataKey: string; color: string }) {
  return (
    <Panel title={title}>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <XAxis dataKey="week" stroke="#7d8ba3" fontSize={10} tickLine={false} />
            <YAxis stroke="#7d8ba3" fontSize={10} tickLine={false} width={60} tickFormatter={(v: number) => v.toLocaleString('de-DE')} />
            <Tooltip
              contentStyle={{ background: '#10151f', border: '1px solid #223047', borderRadius: 6, fontSize: 11 }}
              labelFormatter={(w) => `Woche ${w}`}
              formatter={(v: number) => [v.toLocaleString('de-DE'), '']}
            />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

/**
 * Tutorial-Checkliste (Phase 6): führt neue CEOs durch die erste Spielstunde.
 * Haken kommen aus dem echten Spielzustand — kein separater Tutorial-Modus.
 */
function TutorialPanel() {
  const { state, evaluations, messageStatus, setView } = useStore();
  const [, force] = useState(0);
  if (!state) return null;
  const gid = state.meta.gameId;
  const dismissedKey = `br-tut-dismissed-${gid}`;
  if (typeof localStorage !== 'undefined' && localStorage.getItem(dismissedKey)) return null;

  const chatted = typeof localStorage !== 'undefined' && !!localStorage.getItem(`br-tut-chat-${gid}`);
  const steps: { label: string; done: boolean; go?: () => void }[] = [
    { label: 'Briefing der Chief of Staff lesen (Inbox)', done: Object.values(messageStatus).some((s) => s === 'read'), go: () => setView('inbox') },
    { label: 'Mit dem Führungsteam sprechen (Chat)', done: chatted, go: () => setView('chat') },
    { label: 'Erste Entscheidung treffen (Entscheidungen)', done: state.decisionLog.length > 0, go: () => setView('decisions') },
    { label: 'Dabei eine Hypothese formulieren („Was erwarte ich?")', done: state.decisionLog.some((d) => d.hypothesis !== null), go: () => setView('decisions') },
    { label: 'Die Woche abschließen (▶ oben rechts)', done: state.meta.week > 0 },
    { label: 'Nach ~4 Wochen: erste Bewertung ansehen (Bewertungen)', done: evaluations.length > 0 || state.evaluations.length > 0, go: () => setView('evaluations') },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Panel title={`🧭 Erste Schritte als CEO (${doneCount}/${steps.length})`}>
      <div className="grid gap-1 md:grid-cols-2">
        {steps.map((s, i) => (
          <button
            key={i}
            className={`flex items-center gap-2 rounded px-1.5 py-1 text-left text-xs ${s.done ? 'text-good' : 'text-dim hover:text-ink'}`}
            onClick={() => !s.done && s.go?.()}
          >
            <span>{s.done ? '☑' : '☐'}</span>
            <span className={s.done ? 'line-through opacity-70' : ''}>{s.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[10px] text-dim">
          Prinzip des Simulators: Erst Erwartung, dann Entscheidung, dann Abgleich — bewertet wird dein PROZESS, nicht dein Glück.
        </p>
        <button
          className="text-[10px] text-dim underline hover:text-ink"
          onClick={() => {
            localStorage.setItem(dismissedKey, '1');
            force((x) => x + 1);
          }}
        >
          Ausblenden
        </button>
      </div>
    </Panel>
  );
}

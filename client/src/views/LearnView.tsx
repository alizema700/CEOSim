import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { GLOSSARY, KPI_DEFINITIONS, PRECEDENT_CASES } from '@boardroom/shared';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Bar, GradeBadge, Panel } from '../components/ui.js';

/** Lernen: Journal · Skill-Tree & Badges · Was-wäre-wenn-Labor · Glossar · Fallbibliothek. */
export function LearnView() {
  const [tab, setTab] = useState<'journal' | 'skills' | 'lab' | 'glossar' | 'faelle'>('journal');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['journal', '📓 Lern-Journal'],
            ['skills', '🎓 Skill-Tree & Badges'],
            ['lab', '🔬 Was-wäre-wenn-Labor'],
            ['glossar', '📖 Glossar'],
            ['faelle', '🏛 Fall-Bibliothek'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`chip ${tab === id ? 'chip-on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'journal' && <JournalTab />}
      {tab === 'skills' && <SkillsTab />}
      {tab === 'lab' && <LabTab />}
      {tab === 'glossar' && <GlossaryTab />}
      {tab === 'faelle' && <CasesTab />}
    </div>
  );
}

function JournalTab() {
  const { state, evaluations } = useStore();
  if (!state) return null;
  const entries = [...evaluations].sort((a, b) => b.week - a.week);
  return (
    <Panel
      title="Automatisch geführtes Lern-Journal"
      right={
        <a className="btn" href={`/api/games/${state.meta.gameId}/journal.md`} download>
          ⬇ Als Markdown exportieren
        </a>
      }
    >
      {entries.length === 0 ? (
        <p className="text-xs text-dim">Noch keine Lektionen — sie entstehen automatisch aus deinen Bewertungen.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((ev) => {
            const d = state.decisionLog.find((x) => x.id === ev.decisionId);
            return (
              <div key={ev.id} className="border-b border-line/40 pb-2 last:border-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span><span className="text-dim">W{d?.week} → W{ev.week} · </span>{d?.summaryDe}</span>
                  <GradeBadge grade={ev.grade.overall} />
                </div>
                <p className="mt-1 text-xs text-warn">📌 {ev.lessonDe}</p>
                {ev.precedents.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {ev.precedents.map((p) => (
                      <p key={p.caseId} className="text-[11px] text-dim">🏛 <span className="text-ink">{p.titleDe}</span> — {p.relevanceDe}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

interface Badge { id: string; icon: string; nameDe: string; descDe: string; earned: boolean }

function SkillsTab() {
  const { state, evaluations } = useStore();
  if (!state) return null;
  const skillsDe: Record<string, string> = {
    finanzen: 'Finanzen', strategie: 'Strategie', leadership: 'Leadership',
    kommunikation: 'Kommunikation', krisenmanagement: 'Krisenmanagement', governance: 'Governance',
  };
  const good = evaluations.filter((e) => e.grade.overall <= 2).length;
  const hits = evaluations.filter((e) => e.hypothesisReview.verdict === 'treffend').length;
  const crisisGood = evaluations.filter((e) => {
    const d = state.decisionLog.find((x) => x.id === e.decisionId);
    return d?.action.type === 'RESPOND_EVENT' && e.grade.overall <= 2;
  }).length;
  const valuesClean = evaluations.length >= 5 && evaluations.every((e) => e.grade.criteria.werteKonsistenz >= 50);
  const delegations = state.decisionLog.filter((d) => d.action.type === 'DELEGATE_MESSAGE').length;
  const runway = state.history[state.history.length - 1]?.values.runwayWeeks ?? 0;
  const churnNow = state.history[state.history.length - 1]?.values.logoChurnMonthly ?? 1;

  const badges: Badge[] = [
    { id: 'first-week', icon: '🐣', nameDe: 'Erste Woche', descDe: 'Eine Woche abgeschlossen.', earned: state.meta.week >= 1 },
    { id: 'quarter', icon: '📅', nameDe: 'Ein Quartal im Amt', descDe: '13 Wochen überstanden.', earned: state.meta.week >= 13 },
    { id: 'process', icon: '🧠', nameDe: 'Prozess-Purist', descDe: '5 Entscheidungen mit Note ≤ 2.', earned: good >= 5 },
    { id: 'calibrated', icon: '🎯', nameDe: 'Kalibriert', descDe: '2 Hypothesen trafen die Realität.', earned: hits >= 2 },
    { id: 'churn-tamer', icon: '🧲', nameDe: 'Churn-Bändiger', descDe: 'Monats-Churn unter 2,5 % gedrückt.', earned: churnNow < 0.025 },
    { id: 'liquid', icon: '🏦', nameDe: 'Liquiditätsmeister', descDe: 'Runway über 52 Wochen.', earned: runway > 52 },
    { id: 'crisis', icon: '🧯', nameDe: 'Krisenfest', descDe: '2 Ereignisse sauber gelöst (Note ≤ 2).', earned: crisisGood >= 2 },
    { id: 'values', icon: '🧭', nameDe: 'Werte-Treu', descDe: '5+ Bewertungen ohne Werte-Bruch.', earned: valuesClean },
    { id: 'delegator', icon: '🤝', nameDe: 'Delegierer', descDe: '3 Aufgaben ans Team delegiert.', earned: delegations >= 3 },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="CEO-Score je Dimension">
        {Object.entries(state.ceo.skills).map(([k, v]) => (
          <div key={k} className="mb-2.5">
            <div className="mb-0.5 flex justify-between text-xs">
              <span className="text-dim">{skillsDe[k]}</span>
              <span className="num">{Math.round(v)}/100</span>
            </div>
            <Bar value={v} />
          </div>
        ))}
        <p className="mt-2 text-[10px] text-dim">Wächst mit guten Prozess-Noten — nicht mit Glückstreffern.</p>
      </Panel>
      <Panel title={`Badges (${badges.filter((b) => b.earned).length}/${badges.length})`}>
        <div className="grid grid-cols-3 gap-2">
          {badges.map((b) => (
            <div key={b.id} className={`rounded border p-2 text-center ${b.earned ? 'border-accent/50 bg-accent/5' : 'border-line opacity-40'}`} title={b.descDe}>
              <div className="text-xl">{b.icon}</div>
              <div className="mt-0.5 text-[10px] font-bold">{b.nameDe}</div>
              <div className="text-[9px] text-dim">{b.descDe}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function LabTab() {
  const { state, openGame, setError } = useStore();
  const [atWeek, setAtWeek] = useState(0);
  const [forking, setForking] = useState(false);
  const [family, setFamily] = useState<Awaited<ReturnType<typeof api.compareFamily>>['games']>([]);

  useEffect(() => {
    if (!state) return;
    void api.compareFamily(state.meta.gameId).then((r) => setFamily(r.games)).catch(() => setFamily([]));
  }, [state]);

  const chartData = useMemo(() => {
    const byWeek = new Map<number, Record<string, number>>();
    for (const g of family) {
      for (const h of g.history) {
        const row = byWeek.get(h.week) ?? { week: h.week };
        row[g.name] = h.mrr;
        byWeek.set(h.week, row);
      }
    }
    return [...byWeek.values()].sort((a, b) => (a.week ?? 0) - (b.week ?? 0));
  }, [family]);

  if (!state) return null;
  const maxWeek = Math.max(0, state.meta.week - 1);
  const colors = ['#38bdf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c'];

  return (
    <div className="space-y-4">
      <Panel title="Zeitpunkt forken — das mächtigste Lernwerkzeug">
        <p className="mb-3 text-xs leading-relaxed text-dim">
          Erzeuge eine Kopie deines Spielstands zu einem früheren Zeitpunkt (per deterministischem Event-Replay, gleicher
          Seed). Entscheide dort anders — und vergleiche die Verläufe unten. Gleicher Seed heißt: Der Unterschied ist DEINE
          Entscheidung, nicht der Würfel.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-dim">Fork nach Woche</span>
          <input type="range" min={0} max={maxWeek} value={Math.min(atWeek, maxWeek)} onChange={(e) => setAtWeek(Number(e.target.value))} className="flex-1 accent-sky-400" />
          <span className="num w-10 text-right">{Math.min(atWeek, maxWeek)}</span>
          <button
            className="btn-primary"
            disabled={forking || state.meta.week < 1}
            onClick={async () => {
              setForking(true);
              try {
                const r = await api.forkGame(state.meta.gameId, Math.min(atWeek, maxWeek));
                await openGame(r.state.meta.gameId);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setForking(false);
              }
            }}
          >
            {forking ? 'Forke …' : '🔬 Fork erzeugen & öffnen'}
          </button>
        </div>
      </Panel>

      <Panel title={`Verlaufs-Vergleich (MRR) — ${family.length} Zeitlinie(n)`}>
        {chartData.length < 2 ? (
          <p className="text-xs text-dim">Noch nichts zu vergleichen — erst forken, dann in beiden Zeitlinien Wochen abschließen.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <XAxis dataKey="week" stroke="#7d8ba3" fontSize={10} />
                <YAxis stroke="#7d8ba3" fontSize={10} width={64} tickFormatter={(v: number) => v.toLocaleString('de-DE')} />
                <Tooltip contentStyle={{ background: '#10151f', border: '1px solid #223047', borderRadius: 6, fontSize: 11 }} labelFormatter={(w) => `Woche ${w}`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {family.map((g, i) => (
                  <Line key={g.gameId} type="monotone" dataKey={g.name} stroke={colors[i % colors.length]} strokeWidth={1.5} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {family.map((g) => (
            <button key={g.gameId} className="chip" onClick={() => void openGame(g.gameId)}>
              {g.name} {g.forkWeek !== null && `(ab W${g.forkWeek})`} · {g.status}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function GlossaryTab() {
  const [q, setQ] = useState('');
  const entries = useMemo(() => {
    const kpiEntries = Object.values(KPI_DEFINITIONS).map((d) => ({
      id: 'kpi-' + d.id, termDe: d.labelDe, definitionDe: d.definitionDe, formulaDe: d.formulaDe, exampleDe: '', mathDe: undefined as string | undefined,
    }));
    const all = [...GLOSSARY, ...kpiEntries];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((e) => (e.termDe + ' ' + e.definitionDe).toLowerCase().includes(needle)) : all;
  }, [q]);

  return (
    <Panel title={`Glossar & Lexikon (${entries.length} Begriffe)`}>
      <input className="input mb-3" placeholder="Begriff suchen … (z. B. Covenant, Vesting, DSO)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid max-h-[60vh] gap-3 overflow-y-auto md:grid-cols-2">
        {entries.map((e) => (
          <div key={e.id} className="rounded border border-line bg-panel2 p-3">
            <div className="text-xs font-bold text-accent">{e.termDe}</div>
            <p className="mt-1 text-[11px] leading-relaxed">{e.definitionDe}</p>
            {e.formulaDe && <p className="mt-1 rounded bg-bg px-2 py-1 text-[11px] text-warn">{e.formulaDe}</p>}
            {e.exampleDe && <p className="mt-1 text-[11px] text-dim">💡 {e.exampleDe}</p>}
            {e.mathDe && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[10px] text-dim hover:text-ink">Für Mathematiker</summary>
                <p className="mt-1 text-[11px] text-dim">{e.mathDe}</p>
              </details>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CasesTab() {
  const [q, setQ] = useState('');
  const cases = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? PRECEDENT_CASES.filter((c) => (c.titleDe + c.company + c.lessonDe + c.tags.join(' ')).toLowerCase().includes(needle))
      : PRECEDENT_CASES;
  }, [q]);
  return (
    <Panel title={`Präzedenzfall-Bibliothek (${cases.length} reale Fälle)`}>
      <input className="input mb-3" placeholder="Suchen … (z. B. layoffs, pricing, Netflix)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-[62vh] space-y-3 overflow-y-auto">
        {cases.map((c) => (
          <details key={c.id} className="rounded border border-line bg-panel2 p-3">
            <summary className="cursor-pointer text-xs font-bold hover:text-accent">
              {c.titleDe} <span className="ml-1 font-normal text-dim">({c.company}, {c.year})</span>
            </summary>
            <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
              <p><span className="text-dim">Kontext: </span>{c.contextDe}</p>
              <p><span className="text-dim">Entscheidung: </span>{c.decisionDe}</p>
              <p><span className="text-dim">Ausgang: </span>{c.outcomeDe}</p>
              <p className="text-warn">📌 {c.lessonDe}</p>
              <p className="text-[10px] text-dim">Tags: {c.tags.join(' · ')} — Quellenlage: {c.sourceDe}</p>
            </div>
          </details>
        ))}
      </div>
    </Panel>
  );
}

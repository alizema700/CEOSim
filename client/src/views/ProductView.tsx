import { useStore } from '../store.js';
import { Bar, Panel, StatRow } from '../components/ui.js';
import { num, pct } from '../format.js';

/** Produkt: Tech-Debt, Velocity, Bugs, NPS, aktuelle R&D-Allokation. */
export function ProductView() {
  const { state, setView } = useStore();
  if (!state) return null;
  const p = state.product;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Technischer Zustand">
        <div className="mb-2">
          <div className="mb-0.5 flex justify-between text-[11px]">
            <span className="text-dim">Tech-Debt (0 = sauber)</span>
            <span className={`num ${p.techDebt > 70 ? 'text-bad' : p.techDebt > 50 ? 'text-warn' : 'text-good'}`}>{Math.round(p.techDebt)}/100</span>
          </div>
          <Bar value={p.techDebt} color={p.techDebt > 70 ? 'bg-bad' : p.techDebt > 50 ? 'bg-warn' : 'bg-good'} />
          <p className="mt-1 text-[10px] text-dim">Hoher Debt drückt die Velocity und erhöht das Outage-Risiko — nichts passiert … bis es knallt.</p>
        </div>
        <StatRow label="Velocity" value={`${num(p.velocityPointsPerWeek, 1)} Punkte/W`} />
        <StatRow label="Bug-Backlog (gewichtet)" value={num(p.bugBacklog, 0)} />
        <StatRow label="Ausgelieferte Feature-Punkte" value={num(p.featurePointsShipped, 0)} />
      </Panel>

      <Panel title="Nutzung & Zufriedenheit">
        <StatRow label="Produkt-NPS" value={num(p.nps, 0)} />
        <StatRow label="DAU/MAU (Stickiness)" value={pct(p.dauMauRatio, 0)} />
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          NPS speist sich aus Bug-Last und Tech-Debt und treibt Win-Rate & Churn. Der Hebel läuft über die R&D-Allokation —
          Wirkung mit Wochen Verzögerung.
        </p>
      </Panel>

      <Panel title="Aktuelle R&D-Allokation">
        {(
          [
            ['Features', p.rndAllocation.features],
            ['Tech-Debt', p.rndAllocation.techDebt],
            ['Bugfixes', p.rndAllocation.bugfixes],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="mb-2">
            <div className="flex justify-between text-[11px]">
              <span className="text-dim">{label}</span>
              <span className="num">{pct(v, 0)}</span>
            </div>
            <Bar value={v * 100} />
          </div>
        ))}
        <button className="btn mt-2 w-full" onClick={() => setView('decisions')}>
          ⌘ Allokation ändern (Entscheidungen)
        </button>
        <p className="mt-2 text-[10px] text-dim">Roadmap mit RICE-Priorisierung und Launches folgt in einer späteren Phase.</p>
      </Panel>
    </div>
  );
}

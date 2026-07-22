import { MODULE_KINDS, MODULE_SPECS, PACKAGING_SPECS, POSITIONING_SPECS, moduleMaintenanceMonthly, liveModuleCount, type PricingPackaging, type ProductModuleKind, type ProductPositioning } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Bar, KpiTrendDrill, Panel, StatRow } from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { eur, num, pct } from '../format.js';

/** Produkt: Tech-Debt, Velocity, Bugs, NPS, aktuelle R&D-Allokation. */
export function ProductView() {
  const { state, setView } = useStore();
  if (!state) return null;
  const p = state.product;

  return (
    <div className="space-y-4">
      <KpiTrendDrill id="product-trend" title="Produktwirkung auf Bindung & Churn · Verlauf" history={state.history} series={[{ kpi: 'nrr', label: 'NRR', color: '#2e8558' }, { kpi: 'logoChurnMonthly', label: 'Logo-Churn', color: '#c2453d' }]} />
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

      <StudioPanel />
    </div>
  );
}

/**
 * Produkt-Studio (Phase 22, FB3): Module bauen, Positionierung & Preismodell
 * wählen — echte Produkt-Stellschrauben mit klaren Tradeoffs.
 */
function StudioPanel() {
  const { state, act, busy } = useStore();
  if (!state) return null;
  const p = state.product;
  const active = state.meta.status === 'active';
  const cash = state.finance.cash;
  const week = state.meta.week;
  const fx = (f: number) => `${f >= 1 ? '+' : '−'}${Math.abs(Math.round((f - 1) * 100))} %`;

  return (
    <Panel icon="wrench" title="Produkt-Studio" right={<span className="num text-[12px] text-dim">{liveModuleCount(state)}/5 Module live · Pflege {eur(moduleMaintenanceMonthly(state))}/M</span>}>
      <p className="mb-3 max-w-[82ch] text-[11px] leading-relaxed text-dim">
        Hier formst du das Produkt selbst: Module sind Substanz (Bau über Wochen, dann dauerhaft wirksam), Positionierung und Preismodell sind Haltung — jede Wahl mit klarem Tradeoff auf Abschlussquote, Bindung und Expansion.
      </p>

      {/* Module */}
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {MODULE_KINDS.map((kind: ProductModuleKind) => {
          const spec = MODULE_SPECS[kind];
          const mod = p.modules[kind];
          const progress = mod.status === 'building' ? Math.min(100, Math.round(((week - mod.startedWeek) / spec.buildWeeks) * 100)) : mod.status === 'live' ? 100 : 0;
          const effects = [
            spec.winFactor !== 1 ? `Abschluss ${fx(spec.winFactor)}` : null,
            spec.churnFactor !== 1 ? `Churn ${fx(spec.churnFactor)}` : null,
            spec.expansionFactor !== 1 ? `Expansion ${fx(spec.expansionFactor)}` : null,
            spec.leadFactor !== 1 ? `Leads ${fx(spec.leadFactor)}` : null,
          ].filter(Boolean).join(' · ');
          return (
            <div key={kind} className={`border p-2.5 ${mod.status === 'live' ? 'border-good/50 bg-good/5' : mod.status === 'building' ? 'border-accent/40' : 'border-line'}`} style={{ borderRadius: 2 }}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-[12.5px] font-semibold text-ink">{spec.labelDe}</div>
                <span className={`kicker shrink-0 text-[8px] ${mod.status === 'live' ? 'text-good' : mod.status === 'building' ? 'text-accent' : 'text-faint'}`}>
                  {mod.status === 'live' ? '● live' : mod.status === 'building' ? 'im Bau' : 'offen'}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-dim">{spec.shortDe}</div>
              <div className="mt-1 text-[9px] text-dim">{effects} · {eur(spec.maintenanceMonthly)}/M Pflege</div>
              {mod.status === 'none' && (
                <button className="btn mt-2 w-full justify-center py-1 text-[11px]" disabled={busy || !active || cash < spec.buildCost} onClick={() => void act({ type: 'BUILD_MODULE', module: kind }, null)}>
                  Bauen · {eur(spec.buildCost)} · ~{spec.buildWeeks} Wo.
                </button>
              )}
              {mod.status === 'building' && (
                <div className="mt-2">
                  <div className="mb-0.5 flex justify-between text-[9px] text-dim"><span>Entwicklung läuft</span><span className="num">noch ~{Math.max(0, mod.startedWeek + spec.buildWeeks - week)} Wo.</span></div>
                  <Bar value={progress} color="bg-accent" />
                </div>
              )}
              {mod.status === 'live' && <div className="mt-2 text-[10px] text-good">Live seit Woche {mod.liveWeek} — dauerhaft wirksam</div>}
            </div>
          );
        })}
      </div>

      {/* Positionierung + Packaging */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <div className="kicker mb-1.5 text-[8.5px]"><Icon name="compass" size={11} className="mr-1 inline" />Positionierung</div>
          <div className="flex gap-1.5">
            {(Object.keys(POSITIONING_SPECS) as ProductPositioning[]).map((key) => (
              <button key={key} className={`chip flex-1 justify-center ${p.positioning === key ? 'border-accent text-accent' : ''}`} disabled={busy || !active || p.positioning === key} onClick={() => void act({ type: 'SET_POSITIONING', positioning: key }, null)}>
                {POSITIONING_SPECS[key].labelDe}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-tight text-dim">{POSITIONING_SPECS[p.positioning].hintDe}</p>
        </div>
        <div>
          <div className="kicker mb-1.5 text-[8.5px]"><Icon name="tag" size={11} className="mr-1 inline" />Preismodell (Verpackung)</div>
          <div className="flex gap-1.5">
            {(Object.keys(PACKAGING_SPECS) as PricingPackaging[]).map((key) => (
              <button key={key} className={`chip flex-1 justify-center ${p.packaging === key ? 'border-accent text-accent' : ''}`} disabled={busy || !active || p.packaging === key} onClick={() => void act({ type: 'SET_PACKAGING', packaging: key }, null)}>
                {PACKAGING_SPECS[key].labelDe}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-tight text-dim">{PACKAGING_SPECS[p.packaging].hintDe}</p>
        </div>
      </div>
    </Panel>
  );
}

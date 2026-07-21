import { cohortMrr, keyAccountMrr, totalMrr } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Bar, KpiTrendDrill, Panel, StatRow, scoreColor } from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { eur, num, pct } from '../format.js';

/** Kunden: Segmente, Kohorten (Alter/Churn), Key-Accounts (rote Accounts!), Pipeline. */
export function CustomersView() {
  const { state } = useStore();
  if (!state) return null;
  const c = state.customers;
  const week = state.meta.week;
  const mrr = totalMrr(state);

  return (
    <div className="space-y-4">
      <KpiTrendDrill id="customers-trend" title="Kunden, Bindung & Churn · Verlauf" history={state.history} series={[{ kpi: 'customers', label: 'Kunden', color: '#2f7f79' }, { kpi: 'nrr', label: 'NRR', color: '#2e8558' }, { kpi: 'logoChurnMonthly', label: 'Logo-Churn', color: '#c2453d' }]} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Übersicht">
          <StatRow label="MRR gesamt" value={eur(mrr) + '/M'} />
          <StatRow label="davon Kohorten (Long Tail)" value={eur(cohortMrr(state)) + '/M'} />
          <StatRow label="davon Key-Accounts" value={eur(keyAccountMrr(state)) + '/M'} />
          <StatRow label="Preisindex (1,0 = Start)" value={num(c.priceIndex, 2)} />
          <StatRow label="Leads letzte Woche" value={num(c.pipeline.lastWeekLeads)} />
          <StatRow label="Trials aktiv" value={num(c.pipeline.trials.reduce((s, t) => s + t.count, 0))} />
        </Panel>

        <Panel title="Key-Accounts (Klumpenrisiko im Blick behalten)">
          {c.keyAccounts.map((ka) => (
            <div key={ka.id} className="mb-2.5">
              <div className="flex items-baseline justify-between text-xs">
                <span className="inline-flex items-center gap-1">
                  {ka.status === 'churned' ? <Icon name="skull" size={12} className="text-bad" /> : ka.status === 'atRisk' ? <Icon name="dot" size={11} className="text-bad" /> : null}
                  {ka.name}
                </span>
                <span className="num text-dim">
                  {eur(ka.mrr)}/M · Renewal W{ka.renewalWeek}
                </span>
              </div>
              {ka.status !== 'churned' && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1"><Bar value={ka.health} color={scoreColor(ka.health)} /></div>
                  <span className="num w-8 text-right text-[10px] text-dim">{Math.round(ka.health)}</span>
                </div>
              )}
            </div>
          ))}
          <p className="text-[10px] text-dim">Health sinkt bei Outages, Preiserhöhungen, schlechtem Support — unter ~60 droht ein Eskalations-Ereignis.</p>
        </Panel>

        <Panel title="Funnel-Mechanik">
          <StatRow label="Lead → Trial" value={pct(c.pipeline.leadToTrialRate)} />
          <StatRow label="Trial → Kunde (Basis)" value={pct(c.pipeline.trialWinRate)} />
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            Win-Rate wird moduliert durch Produkt-NPS, Preis vs. Markt, Kunden-Reputation und Sales-Kapazität. Trials reifen 3
            Wochen bis zur Entscheidung — Marketing wirkt also nie sofort.
          </p>
        </Panel>
      </div>

      <Panel title={`Kohorten (${c.cohorts.length}) — jede altert und churnt eigenständig`}>
        <table className="w-full text-xs">
          <thead className="text-left text-[10px] uppercase text-dim">
            <tr>
              <th className="py-1.5 pr-2">Segment</th>
              <th className="num py-1.5 pr-2 text-right">Alter (Wochen)</th>
              <th className="num py-1.5 pr-2 text-right">Logos (mtl. Vertrag)</th>
              <th className="num py-1.5 pr-2 text-right">Logos (Jahresvertrag)</th>
              <th className="num py-1.5 pr-2 text-right">ARPA</th>
              <th className="num py-1.5 pr-2 text-right">Basis-Churn/M</th>
              <th className="num py-1.5 text-right">MRR</th>
            </tr>
          </thead>
          <tbody>
            {[...c.cohorts]
              .sort((a, b) => a.startWeek - b.startWeek)
              .map((coh) => {
                const seg = c.segments.find((s) => s.id === coh.segmentId);
                const cohMrr = (coh.logosMonthly + coh.logosAnnual) * coh.arpaMonthly;
                return (
                  <tr key={coh.id} className="border-b border-line/40 last:border-0">
                    <td className="py-1 pr-2">{seg?.nameDe ?? coh.segmentId}</td>
                    <td className="num py-1 pr-2 text-right">{num(week - coh.startWeek)}</td>
                    <td className="num py-1 pr-2 text-right">{num(coh.logosMonthly)}</td>
                    <td className="num py-1 pr-2 text-right">{num(coh.logosAnnual)}</td>
                    <td className="num py-1 pr-2 text-right">{eur(coh.arpaMonthly, false)}</td>
                    <td className={`num py-1 pr-2 text-right ${coh.baseMonthlyChurn > 0.035 ? 'text-bad' : coh.baseMonthlyChurn > 0.02 ? 'text-warn' : 'text-good'}`}>
                      {pct(coh.baseMonthlyChurn)}
                    </td>
                    <td className="num py-1 text-right">{eur(cohMrr)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] text-dim">
          Junge Kohorten churnen am stärksten (Onboarding-Phase!). Jahresverträge kündigen nur zum Renewal — gebündelt.
        </p>
      </Panel>
    </div>
  );
}

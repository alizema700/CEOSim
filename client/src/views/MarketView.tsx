import { macroLeadFactor, macroWinFactor, REGIME_LABELS, REGIME_TONE, totalMrr } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Bar, KpiTrendDrill, Panel, StatRow } from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { eur, num, pct } from '../format.js';

/**
 * Konjunktur-Banner (Phase 16): Regime, Stimmungs-Anzeige (Rezession…Boom),
 * Leitzins und die aktuelle Wirkung auf Nachfrage (Lead-Zufluss & Abschlussquote).
 */
function MacroPanel() {
  const { state } = useStore();
  if (!state) return null;
  const m = state.macro;
  const tone = REGIME_TONE[m.regime];
  const toneCls = tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-dim';
  const barCls = tone === 'good' ? 'bg-good' : tone === 'warn' ? 'bg-warn' : tone === 'bad' ? 'bg-bad' : 'bg-dim';
  const lead = macroLeadFactor(state);
  const win = macroWinFactor(state);
  const gauge = (m.sentiment + 100) / 2; // −100..100 ⇒ 0..100
  const fmtPct = (f: number) => `${f >= 1 ? '+' : ''}${((f - 1) * 100).toFixed(0)} %`;
  return (
    <section className="rule-top pt-3">
      <div className="flex items-baseline justify-between">
        <span className="kicker inline-flex items-center gap-1.5 text-ink"><Icon name="globe" size={13} /> Konjunktur · <span className={toneCls}>{REGIME_LABELS[m.regime]}</span></span>
        <span className={`num text-[12px] ${toneCls}`}>Marktstimmung {Math.round(m.sentiment)}</span>
      </div>
      <div className="mt-2"><Bar value={gauge} color={barCls} /></div>
      <div className="mt-1 flex justify-between text-[9px] uppercase tracking-wider text-faint"><span>Rezession</span><span>Neutral</span><span>Boom</span></div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div><div className="kicker text-[8.5px]">Leitzins</div><div className="num text-[16px]">{m.interestRatePct.toFixed(1)} %</div></div>
        <div><div className="kicker text-[8.5px]">Lead-Zufluss</div><div className={`num text-[16px] ${lead >= 1 ? 'text-good' : 'text-bad'}`}>{fmtPct(lead)}</div></div>
        <div><div className="kicker text-[8.5px]">Abschlussquote</div><div className={`num text-[16px] ${win >= 1 ? 'text-good' : 'text-bad'}`}>{fmtPct(win)}</div></div>
      </div>
      {m.lastHeadlineDe && <p className="mt-2 max-w-[70ch] text-[11.5px] italic leading-relaxed text-dim">„{m.lastHeadlineDe}"</p>}
    </section>
  );
}

/** Markt: Konkurrenz-Dossiers, Marktanteile, Nachfrage. Volle Agenten in Phase 5. */
export function MarketView() {
  const { state } = useStore();
  if (!state) return null;
  const m = state.market;
  const playerShare = totalMrr(state) / m.tamMrr;

  const strategyDe: Record<string, string> = { priceWar: 'Preiskampf', featureRace: 'Feature-Race', enterpriseMove: 'Enterprise-Move' };

  return (
    <div className="space-y-4">
      <MacroPanel />
      <KpiTrendDrill id="market-trend" title="Bewertung, Wachstum & Konzentration · Verlauf" history={state.history} series={[{ kpi: 'valuation', label: 'Bewertung', color: '#2f7f79' }, { kpi: 'mrrGrowthMonthly', label: 'MRR-Wachstum', color: '#b8791f' }, { kpi: 'revenueConcentrationHhi', label: 'Konzentration (HHI)', color: '#5a7d8c' }]} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Markt">
          <StatRow label="Adressierbarer Markt (TAM)" value={eur(m.tamMrr) + ' MRR'} />
          <StatRow label="Marktwachstum" value={pct(m.marketGrowthMonthly) + '/M'} />
          <StatRow label="Makro-Nachfrageindex" value={num(m.demandIndex, 2)} />
          <StatRow label="Dein Marktanteil" value={pct(playerShare)} />
        </Panel>

        <Panel title="Marktanteile">
          <ShareRow name={`${state.identity.logoEmoji} ${state.identity.companyName} (du)`} share={playerShare} highlight />
          {m.competitors.map((c) => (
            <ShareRow key={c.id} name={c.name} share={c.marketShare} />
          ))}
          <p className="mt-2 text-[10px] text-dim">Rest: fragmentierte Kleinanbieter.</p>
        </Panel>

        <Panel title="Reputation (wirkt auf andere Systeme)">
          {(
            [
              ['Kunden', state.reputation.customers, 'Win-Rate & Churn'],
              ['Presse/Öffentlichkeit', state.reputation.press, 'Lead-Generierung'],
              ['Arbeitsmarkt', state.reputation.laborMarket, 'Time-to-Fill & Offer-Annahme'],
              ['Investoren', state.reputation.investors, 'Board-Geduld & künftiges Fundraising'],
            ] as const
          ).map(([label, v, effect]) => (
            <div key={label} className="mb-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-dim">{label}</span>
                <span className="num">{Math.round(v)}</span>
              </div>
              <Bar value={v} color={v >= 60 ? 'bg-good' : v >= 45 ? 'bg-warn' : 'bg-bad'} />
              <div className="text-[9px] text-dim/70">→ {effect}</div>
            </div>
          ))}
        </Panel>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {m.competitors.map((c) => (
          <div key={c.id} className="panel p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold">{c.name}</span>
              <span className="rounded border border-line px-1.5 py-0.5 text-[9px] uppercase text-dim">{strategyDe[c.strategy]}</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-dim">{c.strategyDe}</p>
            <div className="mt-3 space-y-1 text-[11px]">
              <div className="flex justify-between"><span className="text-dim">Preisindex</span><span className={`num ${c.priceIndex < 1 ? 'text-warn' : ''}`}>{num(c.priceIndex, 2)}</span></div>
              <div className="flex justify-between"><span className="text-dim">Produktstärke</span><span className="num">{Math.round(c.featureScore)}/100</span></div>
              <div className="flex justify-between"><span className="text-dim">Marktanteil</span><span className="num">{pct(c.marketShare)}</span></div>
              <div className="flex justify-between"><span className="text-dim">Aggressivität</span><span className="num">{pct(c.aggressiveness, 0)}</span></div>
            </div>
            <p className="mt-2 text-[9px] text-dim/70">Phase 5: agiert eigenständig, kontert Preiszüge, wildert Kunden, macht M&A-Fühler.</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShareRow({ name, share, highlight = false }: { name: string; share: number; highlight?: boolean }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px]">
        <span className={highlight ? 'font-bold text-accent' : 'text-dim'}>{name}</span>
        <span className="num">{pct(share)}</span>
      </div>
      <Bar value={share * 100} max={20} color={highlight ? 'bg-accent' : 'bg-line'} />
    </div>
  );
}

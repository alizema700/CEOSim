import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  EVENT_CARDS,
  effectiveMonthlyChurn,
  runwayWeeks,
  totalMrr,
  type KpiId,
} from '@boardroom/shared';
import { useStore } from '../store.js';
import { eur, num, pct } from '../format.js';
import { KpiCard, Panel } from '../components/ui.js';

const KPI_GRID: KpiId[] = [
  'mrr', 'mrrGrowthMonthly', 'logoChurnMonthly', 'nrr',
  'netBurnMonthly', 'runwayWeeks', 'ebitdaMonthly', 'grossMarginPct',
  'ltv', 'cac', 'ltvCacRatio', 'cacPaybackMonths',
  'ruleOf40', 'magicNumber', 'valuation', 'revenueConcentrationHhi',
];

const WEEKDAY = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

export function DashboardView() {
  const { state, reports, act, busy } = useStore();
  if (!state) return null;

  const lastReport = reports[reports.length - 1] ?? null;
  const kpis = state.history[state.history.length - 1]?.values ?? null;
  const prev = state.history[state.history.length - 2]?.values ?? null;
  const openEvents = state.openEvents.filter((e) => e.status === 'open');
  const trustLog = [...state.ceo.trustLog].slice(-7).reverse();
  const churn = effectiveMonthlyChurn(state);
  const mrr = totalMrr(state);

  // ── Aufmacher herleiten (aus echtem Zustand) ──────────────────────
  const crit = lastReport?.alerts.find((a) => a.severity === 'critical') ?? null;
  const briefing = [...state.comms.messages].reverse().find((m) => m.kind === 'briefing');
  const hero = deriveHero(state, crit, openEvents, churn);

  const contextFor = (id: KpiId): string => {
    switch (id) {
      case 'logoChurnMonthly':
        return churn > 0.03
          ? `Bei ${pct(churn)} Monats-Churn verlierst du pro Jahr rund ${pct(1 - Math.pow(1 - churn, 12), 0)} deiner Kunden — DAS ist derzeit dein Kernproblem.`
          : 'Aktuell im gesunden Bereich — halten!';
      case 'runwayWeeks':
        return `Bei aktuellem Burn reicht die Kasse noch ~${num(runwayWeeks(state))} Wochen. Unter 26 Wochen wird das Board unruhig.`;
      case 'mrr':
        return `Dein Umsatzmotor: ${eur(mrr)}/Monat über alle Kunden. Alles andere leitet sich hiervon ab.`;
      default:
        return '';
    }
  };

  const sparkPts = sparkline(state.history.map((h) => h.values.mrr));
  const todays = state.calendar.appointments.filter((a) => a.week === state.meta.week).sort((a, b) => a.weekday - b.weekday);

  return (
    <div className="space-y-10">
      <TutorialPanel />

      {/* ── Aufmacher: Morgen-Briefing + Zahlen des Tages ─────────────── */}
      <section className="grid grid-cols-1 gap-0 lg:grid-cols-[1.5fr_1px_1fr] lg:gap-x-9">
        <div>
          <div className={`kicker ${hero.color}`}>{hero.kicker}</div>
          <h2 className="serif mt-3 text-[38px] leading-[1.08] tracking-[-0.005em] text-ink" style={{ textWrap: 'balance' }}>
            {hero.headline}
          </h2>
          {briefing && (
            <>
              <div className="kicker mt-4">Von {state.people.assistant.name}, Assistenz · Woche {state.meta.week}</div>
              <p className="mt-3.5 max-w-[58ch] text-[15px] leading-[1.6] text-ink2">{lede(briefing.bodyDe)}</p>
            </>
          )}
          <div className="mt-5 flex flex-wrap gap-4">
            {openEvents.length > 0 && <a className="edlink text-[13.5px]" onClick={() => document.getElementById('offene-ereignisse')?.scrollIntoView({ behavior: 'smooth' })}>Offene Ereignisse ({openEvents.length})</a>}
            <a className="edlink text-[13.5px] text-dim" style={{ borderColor: '#ddd9d0' }} onClick={() => useStore.getState().setView('inbox')}>Zur Inbox</a>
            <a className="edlink text-[13.5px] text-dim" style={{ borderColor: '#ddd9d0' }} onClick={() => useStore.getState().setView('decisions')}>Entscheidungen</a>
          </div>

          {/* MRR-Sparkline */}
          {sparkPts && (
            <div className="mt-8 border-t border-line pt-4">
              <div className="flex items-baseline justify-between">
                <span className="kicker">MRR-Entwicklung · {state.history.length} Wochen · €</span>
                <span className="num text-[11px] text-good">{sparkPts.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(sparkPts.deltaPct).toFixed(1)} % seit Start</span>
              </div>
              <svg viewBox="0 0 560 180" className="mt-3 block w-full">
                <line x1="0" y1="172" x2="560" y2="172" stroke="#171a1c" strokeWidth="1" />
                <line x1="0" y1="96" x2="560" y2="96" stroke="#e7e3da" strokeWidth="1" />
                <line x1="0" y1="24" x2="560" y2="24" stroke="#e7e3da" strokeWidth="1" />
                <polyline points={sparkPts.points} fill="none" stroke="#2f7f79" strokeWidth="2" />
                <circle cx={sparkPts.lastX} cy={sparkPts.lastY} r="3.5" fill="#2f7f79" />
                <text x="556" y="20" textAnchor="end" fill="#a3a8ad" fontSize="10" fontFamily="Spline Sans Mono">{Math.round(sparkPts.max / 1000)}k</text>
                <text x="556" y="168" textAnchor="end" fill="#a3a8ad" fontSize="10" fontFamily="Spline Sans Mono">{Math.round(sparkPts.min / 1000)}k</text>
              </svg>
            </div>
          )}
        </div>

        <div className="hair my-6 h-px w-full lg:my-0 lg:h-full lg:w-px" />

        <div>
          <div className="rule-top pt-2.5 kicker text-ink">Zahlen des Tages</div>
          <BigStat label="Cash" value={eur(state.finance.cash)} delta={lastReport?.cashFlow.netChange ?? null} money warnLow={state.finance.cash < 150_000} />
          <BigStat label="Runway" value={runwayWeeks(state) >= 900 ? '∞' : `${num(runwayWeeks(state))} W`} delta={prev && kpis ? kpis.runwayWeeks - prev.runwayWeeks : null} unit="W" tint={runwayWeeks(state) < 26 ? 'text-warn' : undefined} />
          <BigStat label="MRR" value={eur(mrr)} delta={prev && kpis ? kpis.mrr - prev.mrr : null} money />
          <BigStat label="EBITDA" value={`${eur(kpis?.ebitdaMonthly ?? 0)}/M`} delta={prev && kpis ? kpis.ebitdaMonthly - prev.ebitdaMonthly : null} money tint={(kpis?.ebitdaMonthly ?? 0) < 0 ? 'text-bad' : 'text-good'} />
          <BigStat label="LTV / CAC" value={num(kpis?.ltvCacRatio ?? 0, 1)} delta={prev && kpis ? kpis.ltvCacRatio - prev.ltvCacRatio : null} digits={1} />

          <div className="rule-top mt-6 pt-2.5 kicker text-ink">Heute · Woche {state.meta.week}</div>
          {todays.length > 0 ? (
            todays.map((a) => (
              <button
                key={a.id}
                onClick={() => useStore.getState().setView('calendar')}
                className="flex w-full items-baseline gap-3.5 border-b border-line py-2.5 text-left hover:bg-panel2"
              >
                <span className="num w-8 shrink-0 text-[12px] text-dim">{WEEKDAY[a.weekday] ?? '—'}</span>
                <span className={`text-[14px] ${a.kind === 'boardCall' || a.kind === 'earningsCall' ? 'font-semibold' : ''}`}>{a.titleDe}</span>
                <span
                  className="ml-auto h-2 w-2 shrink-0 self-center rounded-full"
                  style={{ background: a.kind === 'boardCall' ? '#6d5bd0' : a.kind === 'earningsCall' ? '#a8781f' : a.kind === 'customerCall' ? '#2e8558' : '#2f7f79' }}
                />
              </button>
            ))
          ) : (
            <p className="py-3 text-[13px] italic text-dim">Keine Termine — ruhiger Tag für Tiefenarbeit.</p>
          )}
        </div>
      </section>

      {/* ── Nächste Züge (kontextuelle Empfehlungen) ──────────────────── */}
      <NextMovesPanel />

      {/* ── Offene Ereignisse (interaktiv) ────────────────────────────── */}
      {openEvents.length > 0 && (
        <section id="offene-ereignisse" className="rule-top pt-3.5">
          <div className="kicker text-bad">Reaktion erforderlich · {openEvents.length}</div>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            {openEvents.map((ev) => {
              const card = EVENT_CARDS.find((c) => c.id === ev.cardId);
              if (!card) return null;
              return (
                <div key={ev.instanceId} className="border border-line bg-panel p-4" style={{ borderRadius: 2 }}>
                  <div className="kicker text-bad">Ereignis · Woche {ev.triggeredWeek}</div>
                  <h3 className="serif mt-1.5 text-[22px] leading-[1.15] text-ink">{card.titleDe}</h3>
                  <p className="mt-2 text-[13.5px] leading-[1.55] text-ink2">{ev.bodyDe}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {card.options.map((opt) => (
                      <button key={opt.id} className="btn" disabled={busy} onClick={() => void act({ type: 'RESPOND_EVENT', eventInstanceId: ev.instanceId, optionId: opt.id }, null)}>
                        {opt.labelDe}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2.5 text-[10.5px] text-dim">
                    Ignorieren ist auch eine Entscheidung: Nach {card.autoResolveAfterWeeks} Wochen greift „{card.options.find((o) => o.id === card.defaultOptionId)?.labelDe}".
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Meldungen · Verlauf · Organisation ────────────────────────── */}
      <section className="rule-top grid grid-cols-1 gap-0 pt-3.5 lg:grid-cols-[1fr_1px_1fr_1px_1fr] lg:gap-x-9">
        <div>
          <div className="kicker">Meldungen</div>
          <div className="mt-2 flex flex-col">
            {(lastReport?.occurrences ?? []).slice(-5).reverse().map((o, i) => (
              <div key={i} className="border-b border-line py-3 last:border-0">
                <div className={`kicker text-[10px] ${o.severity === 'bad' ? 'text-bad' : o.severity === 'good' ? 'text-good' : o.severity === 'warn' ? 'text-warn' : 'text-dim'}`}>
                  {o.severity === 'bad' ? 'KRITISCH' : o.severity === 'good' ? 'GUT' : o.severity === 'warn' ? 'WARNUNG' : 'NOTIZ'} · W{lastReport?.week}
                </div>
                <div className="mt-1 text-[14px] leading-[1.4] text-ink">{o.textDe}</div>
              </div>
            ))}
            {!lastReport && <p className="py-3 text-[13px] italic text-dim">Noch keine abgeschlossene Woche.</p>}
          </div>
        </div>

        <div className="hair my-6 h-px w-full lg:my-0 lg:h-full lg:w-px" />

        <div>
          <div className="kicker">MRR & Churn · Verlauf</div>
          {state.history.length >= 2 ? (
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={state.history.map((h) => ({ week: h.week, mrr: Math.round(h.values.mrr), churn: Math.round(h.values.logoChurnMonthly * 10000) / 100 }))} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <XAxis dataKey="week" stroke="#a3a8ad" fontSize={10} tickLine={false} axisLine={{ stroke: '#ddd9d0' }} />
                  <YAxis stroke="#a3a8ad" fontSize={10} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                  <Tooltip contentStyle={{ background: '#fffdf8', border: '1px solid #ddd9d0', borderRadius: 2, fontSize: 11, fontFamily: 'Spline Sans Mono' }} labelFormatter={(w) => `Woche ${w}`} formatter={(v: number) => [eur(v), 'MRR']} />
                  <Line type="monotone" dataKey="mrr" stroke="#2f7f79" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-3 text-[13px] italic text-dim">Ab der zweiten Woche zeichnet sich hier der Verlauf ab.</p>
          )}
          <p className="mt-3 text-[12.5px] leading-[1.5] text-dim">
            {churn > 0.03
              ? <>Wachstum trägt — aber <b className="text-ink">Churn</b> frisst am Neugeschäft. Der Hebel liegt in der Kundenbindung, nicht im Marketing-Budget.</>
              : <>Der Churn ist unter Kontrolle. Jetzt darf der Wachstumsmotor lauter drehen.</>}
          </p>
        </div>

        <div className="hair my-6 h-px w-full lg:my-0 lg:h-full lg:w-px" />

        <div>
          <div className="kicker">Organisation</div>
          <div className="mt-2 flex flex-col">
            {(['engineering', 'sales', 'marketing', 'cs', 'ga'] as const).map((d) => {
              const v = state.people.moraleByDept[d];
              const label = { engineering: 'Engineering', sales: 'Sales', marketing: 'Marketing', cs: 'Support', ga: 'G&A' }[d];
              return (
                <div key={d} className="flex items-baseline gap-2.5 border-b border-line py-2.5">
                  <span className="w-[92px] shrink-0 text-[13.5px] text-ink2">{label}</span>
                  <div className="h-[3px] flex-1 self-center bg-panel2">
                    <div className="h-full" style={{ width: `${v}%`, background: v >= 60 ? '#171a1c' : '#a8781f' }} />
                  </div>
                  <span className={`num w-6 text-right text-[12px] ${v < 60 ? 'text-warn' : 'text-ink'}`}>{v}</span>
                </div>
              );
            })}
          </div>
          <div className="kicker mt-5">Kunden-Gesundheit</div>
          <CustomerHealth state={state} />
        </div>
      </section>

      {/* ── Kennzahlen-Raster ─────────────────────────────────────────── */}
      {kpis && (
        <section className="rule-top pt-3.5">
          <div className="kicker mb-3">Die Kennzahlen · anklicken für Formel &amp; Definition</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            {KPI_GRID.map((id) => (
              <KpiCard key={id} id={id} value={kpis[id]} contextDe={contextFor(id)} history={state.history} />
            ))}
          </div>
        </section>
      )}

      {/* ── GuV + Board-Vertrauen ─────────────────────────────────────── */}
      <section className="rule-top grid grid-cols-1 gap-0 pt-3.5 lg:grid-cols-[1fr_1px_1fr] lg:gap-x-9">
        <div>
          <div className="kicker">Board-Vertrauen · Treiber (transparent)</div>
          <div className="mt-2 flex flex-col">
            {trustLog.length > 0 ? trustLog.map((d, i) => (
              <div key={i} className="flex items-baseline gap-2.5 border-b border-line py-2 last:border-0 text-[13px]">
                <span className={`num w-11 shrink-0 text-right ${d.delta > 0 ? 'text-good' : d.delta < 0 ? 'text-bad' : 'text-dim'}`}>{d.delta > 0 ? '+' : ''}{d.delta}</span>
                <span className="num text-dim">W{d.week}</span>
                <span className="text-ink2">{d.reasonDe}</span>
              </div>
            )) : <p className="py-3 text-[13px] italic text-dim">Noch keine Einträge.</p>}
          </div>
          {state.ceo.probation && (
            <div className="mt-3 border-l-2 border-bad bg-bad/5 p-2.5 text-[13px] text-bad">
              ⚠ BEWÄHRUNG bis Woche {state.ceo.probation.endsWeek}: {state.ceo.probation.targets.map((t) => t.labelDe).join(' · ')}
            </div>
          )}
        </div>

        <div className="hair my-6 h-px w-full lg:my-0 lg:h-full lg:w-px" />

        <div>
          {lastReport ? <GuvTable report={lastReport} /> : <p className="text-[13px] italic text-dim">Nach dem ersten Wochenabschluss erscheint hier die GuV.</p>}
        </div>
      </section>

      <footer className="flex justify-between border-t border-line pt-3.5 kicker text-faint">
        <span>Boardroom · Der Führungs-Simulator · Simulierte Inhalte</span>
        <span>Nächste Ausgabe nach Wochenabschluss</span>
      </footer>
    </div>
  );
}

// ── Bausteine ─────────────────────────────────────────────────────────
function BigStat({ label, value, delta, money, unit, digits = 0, tint, warnLow }: { label: string; value: string; delta: number | null; money?: boolean; unit?: string; digits?: number; tint?: string; warnLow?: boolean }) {
  const dTxt = delta === null ? null : money ? eur(Math.abs(delta)) : unit ? `${num(Math.abs(delta), 1)} ${unit}` : num(Math.abs(delta), digits);
  return (
    <div className="flex items-baseline gap-3 border-b border-line py-3.5">
      <span className="w-[92px] shrink-0 text-[13px] text-dim">{label}</span>
      <span className={`num text-[22px] font-medium ${tint ?? (warnLow ? 'text-bad' : 'text-ink')}`}>{value}</span>
      {delta !== null && Math.abs(delta) > 0.001 && (
        <span className={`num ml-auto text-[11.5px] ${delta >= 0 ? 'text-good' : 'text-bad'}`}>{delta >= 0 ? '▲' : '▼'} {dTxt}</span>
      )}
    </div>
  );
}

function CustomerHealth({ state }: { state: NonNullable<ReturnType<typeof useStore.getState>['state']> }) {
  const kas = state.customers.keyAccounts.filter((k) => k.status !== 'churned');
  const total = kas.length || 1;
  const gesund = kas.filter((k) => k.health >= 65).length;
  const beob = kas.filter((k) => k.health >= 45 && k.health < 65).length;
  const gefahr = kas.filter((k) => k.health < 45).length;
  const p = (n: number) => (n / total) * 100;
  const atRisk = [...kas].filter((k) => k.health < 65).sort((a, b) => a.health - b.health).slice(0, 2);
  return (
    <>
      <div className="mt-3 flex h-2 gap-0.5">
        <div style={{ width: `${p(gesund)}%`, background: '#2e8558' }} />
        <div style={{ width: `${p(beob)}%`, background: '#a8781f' }} />
        <div style={{ width: `${p(gefahr)}%`, background: '#c2453d' }} />
      </div>
      <div className="num mt-2 text-[11px] text-dim">{Math.round(p(gesund))}% GESUND · {Math.round(p(beob))}% BEOBACHTEN · {Math.round(p(gefahr))}% GEFÄHRDET</div>
      <div className="mt-2 flex flex-col">
        {atRisk.map((k) => (
          <div key={k.id} className="flex items-baseline gap-2.5 border-b border-line py-2 last:border-0">
            <span className="h-2 w-2 shrink-0 self-center rounded-full" style={{ background: k.health < 45 ? '#c2453d' : '#a8781f' }} />
            <span className="text-[13.5px] text-ink">{k.name}</span>
            <span className={`num ml-auto text-[11.5px] ${k.health < 45 ? 'text-bad' : 'text-warn'}`}>{eur(k.mrr)} MRR</span>
          </div>
        ))}
        {atRisk.length === 0 && <p className="py-2 text-[12px] italic text-dim">Alle Key Accounts stabil.</p>}
      </div>
    </>
  );
}

function GuvTable({ report }: { report: NonNullable<ReturnType<typeof useStore.getState>['reports']>[number] }) {
  const inc = report.incomeStatement;
  const rev = inc.revenue || 1;
  const opexP = inc.opex.salesMarketing.payroll + inc.opex.rnd.payroll + inc.opex.customerSuccess.payroll + inc.opex.ga.payroll;
  const opexO = inc.opexTotal - opexP;
  const rows: { label: string; val: number; indent?: boolean; strong?: boolean; sign?: boolean }[] = [
    { label: 'Umsatzerlöse', val: inc.revenue, strong: true },
    { label: 'Herstellkosten', val: -inc.cogs, indent: true },
    { label: 'Rohertrag', val: inc.grossProfit, strong: true },
    { label: 'Personal (OpEx)', val: -opexP, indent: true },
    { label: 'Sonstige OpEx', val: -opexO, indent: true },
    { label: 'Einmaleffekte', val: -inc.oneOffs, indent: true },
    { label: 'Zinsen', val: -inc.interest, indent: true },
  ];
  return (
    <div>
      <div className="kicker">Der Bericht · GuV Woche {report.week}</div>
      <div className="num mt-3 text-[13px]">
        <div className="grid grid-cols-[1fr_110px_64px] gap-2 border-b-2 border-ink py-2 text-[10px] tracking-[0.1em] text-dim">
          <span>POSITION</span><span className="text-right">€ / WOCHE</span><span className="text-right">% UMS.</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className={`grid grid-cols-[1fr_110px_64px] gap-2 border-b border-line py-2 ${r.strong ? 'font-semibold text-ink' : 'text-dim'}`}>
            <span className={r.indent ? 'pl-4' : ''} style={{ fontFamily: 'var(--font-sans)' }}>{r.label}</span>
            <span className={`text-right ${r.val < 0 ? '' : ''}`}>{r.val < 0 ? '−' : ''}{num(Math.abs(r.val))}</span>
            <span className="text-right text-dim">{((Math.abs(r.val) / rev) * 100).toFixed(1)}</span>
          </div>
        ))}
        <div className={`grid grid-cols-[1fr_110px_64px] gap-2 border-b-2 border-ink py-2.5 font-semibold ${inc.netIncome < 0 ? 'text-bad' : 'text-good'}`}>
          <span className="text-ink" style={{ fontFamily: 'var(--font-sans)' }}>Periodenergebnis</span>
          <span className="text-right">{inc.netIncome < 0 ? '−' : ''}{num(Math.abs(inc.netIncome))}</span>
          <span className="text-right">{((inc.netIncome / rev) * 100).toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Helfer ────────────────────────────────────────────────────────────
function lede(body: string): string {
  const cleaned = body.replace(/\n+/g, ' ').trim();
  const cut = cleaned.slice(0, 260);
  const lastDot = cut.lastIndexOf('. ');
  return lastDot > 120 ? cut.slice(0, lastDot + 1) : cut + (cleaned.length > 260 ? ' …' : '');
}

function deriveHero(
  state: NonNullable<ReturnType<typeof useStore.getState>['state']>,
  crit: { titleDe: string; bodyDe: string } | null,
  openEvents: { cardId: string }[],
  churn: number,
): { kicker: string; color: string; headline: string } {
  if (state.ceo.probation) {
    const rem = Math.max(0, state.ceo.probation.endsWeek - state.meta.week);
    return { kicker: 'Bewährung · Board', color: 'text-bad', headline: `Das Board hat dich abgemahnt — ${rem} Wochen, um die Ziele zu erreichen.` };
  }
  if (crit) {
    return { kicker: `Dringend · ${crit.titleDe}`, color: 'text-bad', headline: crit.bodyDe.replace(/\n+/g, ' ').slice(0, 130) };
  }
  if (openEvents.length > 0) {
    const card = EVENT_CARDS.find((c) => c.id === openEvents[0]!.cardId);
    return { kicker: 'Dringend · Morgen-Briefing', color: 'text-bad', headline: `${card?.titleDe ?? 'Ein Ereignis'} — und das Board schaut auf deine Reaktion.` };
  }
  if (churn > 0.045) {
    return { kicker: 'Lagebild · Morgen-Briefing', color: 'text-warn', headline: 'Der Churn frisst schneller, als der Vertrieb nachfüllt. Zeit, die Kundenbindung zur Chefsache zu machen.' };
  }
  if (runwayWeeks(state) < 26) {
    return { kicker: 'Lagebild · Morgen-Briefing', color: 'text-warn', headline: 'Die Kasse wird knapper. Jede Entscheidung dieser Woche ist auch eine Liquiditätsentscheidung.' };
  }
  return { kicker: 'Lagebild · Morgen-Briefing', color: 'text-accent', headline: 'Ruhige Lage — die beste Zeit, den nächsten Zug zu planen, bevor das Ereignis ihn erzwingt.' };
}

function sparkline(values: number[]): { points: string; lastX: number; lastY: number; min: number; max: number; deltaPct: number } | null {
  if (values.length < 2) return null;
  const w = 560, h = 180, pad = 8;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const n = values.length;
  const x = (i: number) => pad + (i / (n - 1)) * (w - 2 * pad);
  const y = (v: number) => 172 - ((v - min) / range) * (172 - 24);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return { points, lastX: x(n - 1), lastY: y(values[n - 1]!), min, max, deltaPct: values[0]! > 0 ? (values[n - 1]! / values[0]! - 1) * 100 : 0 };
}

interface Move { prio: number; icon: string; textDe: string; cta: string; go: () => void; tone: 'bad' | 'warn' | 'accent' | 'good' }

/**
 * „Nächste Züge": priorisierte Handlungsempfehlungen aus dem echten Zustand.
 * Reduziert die „Was mache ich jetzt?"-Reibung, ohne dem Spieler die
 * Entscheidung abzunehmen — jede Karte führt nur zur passenden Ansicht.
 */
function NextMovesPanel() {
  const { state, setView } = useStore();
  if (!state) return null;
  const moves: Move[] = [];
  const runway = runwayWeeks(state);
  const churn = effectiveMonthlyChurn(state);
  const push = (m: Move) => moves.push(m);

  if (state.ceo.probation) push({ prio: 100, icon: '⚠️', tone: 'bad', textDe: `Bewährung bis Woche ${state.ceo.probation.endsWeek} — die Board-Ziele haben Vorrang vor allem anderen.`, cta: 'Ziele ansehen', go: () => setView('evaluations') });
  if (state.finance.consecutiveMinCashBreachWeeks > 0) push({ prio: 95, icon: '🏦', tone: 'bad', textDe: `Covenant verletzt (${state.finance.consecutiveMinCashBreachWeeks}. Woche) — die Bank wird nervös. Liquidität sichern.`, cta: 'Finanzen', go: () => setView('finance') });
  if (runway < 20) push({ prio: 90, icon: '⏳', tone: 'bad', textDe: `Runway nur ~${num(runway)} Wochen. Jetzt handeln: Fundraising, Kredit oder Kostenschnitt.`, cta: 'Entscheidungen', go: () => setView('decisions') });
  else if (runway < 30) push({ prio: 60, icon: '⏳', tone: 'warn', textDe: `Runway unter 30 Wochen — aus der Stärke verhandeln, bevor es eng wird.`, cta: 'Fundraising', go: () => setView('strategy') });
  if (churn > 0.035) push({ prio: 80, icon: '💧', tone: 'warn', textDe: `Logo-Churn bei ${pct(churn)}/Monat — das frisst am Neugeschäft. Der Hebel ist Kundenbindung (CS), nicht Marketing.`, cta: 'Entscheidungen', go: () => setView('decisions') });
  if (state.labor.negotiation) push({ prio: 78, icon: '🤝', tone: 'warn', textDe: `Laufende Tarifrunde: Forderung +${(state.labor.negotiation.demandPct * 100).toFixed(1)} %. Ein Angebot ist fristgebunden.`, cta: 'Arbeitsbeziehungen', go: () => setView('team') });
  if (state.ipo.status === 'eligible') push({ prio: 70, icon: '🔔', tone: 'good', textDe: 'Die Firma ist IPO-reif und börsenfähig — die Banken warten auf ein Mandat.', cta: 'Börse', go: () => setView('boerse') });
  const needsAg = state.comms.messages.some((m) => m.templateId === 'ipo-needs-ag' && m.handledWeek === null) && state.legal.pendingConversion === null;
  if (needsAg) push({ prio: 66, icon: '⚖️', tone: 'accent', textDe: 'IPO-reife Zahlen — aber die Rechtsform ist nicht börsenfähig. Der Formwechsel ist der nächste Schritt.', cta: 'Struktur', go: () => setView('structure') });
  const unhappyKey = state.people.employees.find((e) => e.keyPerson && e.satisfaction < 50 && !e.equityGrant);
  if (unhappyKey) push({ prio: 55, icon: '⭐', tone: 'warn', textDe: `${unhappyKey.firstName} ${unhappyKey.lastName} (Schlüsselperson) ist unzufrieden — Bindung über Optionen oder Gehalt lohnt sich, bevor sie geht.`, cta: 'Team', go: () => setView('team') });
  if (state.product.techDebt > 62) push({ prio: 50, icon: '🧱', tone: 'warn', textDe: `Tech-Debt bei ${Math.round(state.product.techDebt)}/100 — Ausfallrisiko steigt. R&D-Allokation nachjustieren.`, cta: 'Produkt', go: () => setView('product') });
  if (state.ceo.energy < 30) push({ prio: 63, icon: '🪫', tone: 'warn', textDe: `Deine Energie ist bei ${Math.round(state.ceo.energy)}/100 — Dauerlast kostet Urteilskraft. Auszeit oder mehr Delegation wäre klug.`, cta: 'CEO', go: () => setView('ceo') });

  moves.sort((a, b) => b.prio - a.prio);
  const top = moves.slice(0, 3);
  const toneCls = { bad: 'border-bad text-bad', warn: 'border-warn text-warn', accent: 'border-accent text-accent', good: 'border-good text-good' };

  if (top.length === 0) {
    return (
      <section className="rule-top pt-3.5">
        <div className="kicker text-accent">Nächste Züge</div>
        <p className="mt-2 max-w-[70ch] text-[14px] leading-[1.55] text-ink2">Ruhige Lage — keine Baustelle drängt. Die beste Zeit, offensiv zu werden: Wachstum forcieren, ein Projekt starten oder den nächsten strategischen Schritt vorbereiten, bevor das nächste Ereignis ihn erzwingt.</p>
      </section>
    );
  }

  return (
    <section className="rule-top pt-3.5">
      <div className="kicker text-ink">Nächste Züge · nach Dringlichkeit</div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {top.map((m, i) => (
          <button key={i} onClick={m.go} className={`flex flex-col border-l-2 bg-panel p-3 text-left transition-colors hover:bg-panel2 ${toneCls[m.tone]}`} style={{ borderTopRightRadius: 2, borderBottomRightRadius: 2 }}>
            <div className="flex items-baseline gap-2">
              <span>{m.icon}</span>
              <span className={`kicker text-[9px] ${toneCls[m.tone]}`}>{m.tone === 'bad' ? 'Dringend' : m.tone === 'warn' ? 'Bald' : 'Chance'}</span>
            </div>
            <p className="mt-1.5 flex-1 text-[13px] leading-[1.45] text-ink2">{m.textDe}</p>
            <span className="edlink mt-2 self-start text-[12px]">{m.cta} →</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Tutorial-Checkliste: führt neue CEOs durch die erste Spielstunde.
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
    { label: 'Briefing der Assistenz lesen (Inbox)', done: Object.values(messageStatus).some((s) => s === 'read'), go: () => setView('inbox') },
    { label: 'Mit dem Führungsteam sprechen (Chat)', done: chatted, go: () => setView('chat') },
    { label: 'Erste Entscheidung treffen', done: state.decisionLog.length > 0, go: () => setView('decisions') },
    { label: 'Dabei eine Hypothese formulieren', done: state.decisionLog.some((d) => d.hypothesis !== null), go: () => setView('decisions') },
    { label: 'Die Woche abschließen (oben rechts)', done: state.meta.week > 0 },
    { label: 'Erste Bewertung ansehen', done: evaluations.length > 0 || state.evaluations.length > 0, go: () => setView('evaluations') },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <div className="border border-line bg-panel2 px-4 py-3" style={{ borderRadius: 2 }}>
      <div className="flex items-baseline justify-between">
        <span className="kicker text-ink">Erste Schritte als CEO · {doneCount}/{steps.length}</span>
        <button className="text-[10px] text-dim underline hover:text-ink" onClick={() => { localStorage.setItem(dismissedKey, '1'); force((x) => x + 1); }}>
          Ausblenden
        </button>
      </div>
      <div className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
        {steps.map((s, i) => (
          <button key={i} className={`flex items-center gap-2 py-0.5 text-left text-[13px] ${s.done ? 'text-good' : 'text-dim hover:text-ink'}`} onClick={() => !s.done && s.go?.()}>
            <span>{s.done ? '☑' : '☐'}</span>
            <span className={s.done ? 'line-through opacity-70' : ''}>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

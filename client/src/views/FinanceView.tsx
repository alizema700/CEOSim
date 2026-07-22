import { useState } from 'react';
import { totalMrr, INSURANCE_KINDS, INSURANCE_SPECS, insurancePremiumMonthly } from '@boardroom/shared';
import type { InsuranceKind } from '@boardroom/shared';
import { useStore } from '../store.js';
import { KpiTrendDrill, Panel, StatRow } from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { eur, pct } from '../format.js';

/** Finanzen: GuV, Cash-Flow, Bilanz (letzte Woche), Cap Table, Covenants. */
export function FinanceView() {
  const { state, reports } = useStore();
  if (!state) return null;
  const r = reports[reports.length - 1] ?? null;
  const f = state.finance;

  return (
    <div className="space-y-4">
      <KpiTrendDrill id="finance-trend" title="Finanz-Dynamik · Verlauf" history={state.history} series={[{ kpi: 'mrr', label: 'MRR', color: '#2f7f79' }, { kpi: 'valuation', label: 'Bewertung', color: '#b8791f' }, { kpi: 'runwayWeeks', label: 'Runway', color: '#5a7d8c' }]} />
      <div className="grid gap-4 lg:grid-cols-3">
      <Panel title={r ? `GuV · Woche ${r.week}` : 'GuV (noch keine Woche abgeschlossen)'}>
        {r ? (
          <>
            <StatRow label="Umsatz" value={eur(r.incomeStatement.revenue)} />
            <StatRow label="− COGS" value={eur(-r.incomeStatement.cogs)} />
            <StatRow label="= Bruttogewinn" value={eur(r.incomeStatement.grossProfit)} />
            <StatRow label="− OpEx S&M" value={eur(-(r.incomeStatement.opex.salesMarketing.payroll + r.incomeStatement.opex.salesMarketing.other))} />
            <StatRow label="− OpEx R&D" value={eur(-(r.incomeStatement.opex.rnd.payroll + r.incomeStatement.opex.rnd.other))} />
            <StatRow label="− OpEx CS" value={eur(-(r.incomeStatement.opex.customerSuccess.payroll + r.incomeStatement.opex.customerSuccess.other))} />
            <StatRow label="− OpEx G&A" value={eur(-(r.incomeStatement.opex.ga.payroll + r.incomeStatement.opex.ga.other))} />
            <StatRow label="= EBITDA" value={<b className={r.incomeStatement.ebitda >= 0 ? 'text-good' : 'text-bad'}>{eur(r.incomeStatement.ebitda)}</b>} />
            <StatRow label="− Einmaleffekte" value={eur(-r.incomeStatement.oneOffs)} />
            <StatRow label="− Zinsen" value={eur(-r.incomeStatement.interest)} />
            <StatRow label="− Steuern" value={eur(-r.incomeStatement.tax)} />
            <StatRow label="= Wochenergebnis" value={<b className={r.incomeStatement.netIncome >= 0 ? 'text-good' : 'text-bad'}>{eur(r.incomeStatement.netIncome)}</b>} />
          </>
        ) : (
          <p className="text-xs text-dim">Schließe die erste Woche ab.</p>
        )}
      </Panel>

      <Panel title={r ? `Cash-Flow · Woche ${r.week}` : 'Cash-Flow'}>
        {r ? (
          <>
            <StatRow label="Kasse Anfang" value={eur(r.cashFlow.cashStart)} />
            <StatRow label="+ Zahlungseingänge" value={eur(r.cashFlow.operations.collections)} />
            <StatRow label="− Payroll" value={eur(r.cashFlow.operations.payroll)} />
            <StatRow label="− Lieferanten" value={eur(r.cashFlow.operations.suppliers)} />
            <StatRow label="− Zins/Steuer/Einmalig" value={eur(r.cashFlow.operations.interest + r.cashFlow.operations.tax + r.cashFlow.operations.oneOffs)} />
            <StatRow label="= CF operativ" value={<b>{eur(r.cashFlow.operations.net)}</b>} />
            {r.cashFlow.investing.net !== 0 && <StatRow label="CF Investition (Treasury)" value={eur(r.cashFlow.investing.net)} hint="Treasury-Zu-/Abflüsse + Zinsertrag" />}
            <StatRow label="CF Finanzierung" value={eur(r.cashFlow.financing.net)} />
            <StatRow label="Kasse Ende" value={<b>{eur(r.cashFlow.cashEnd)}</b>} />
            <p className="mt-2 text-[10px] text-good">✓ Invarianten geprüft: Bilanz-Identität & CF-Konsistenz</p>
          </>
        ) : (
          <p className="text-xs text-dim">—</p>
        )}
      </Panel>

      <Panel title="Bilanz (aktuell)">
        <div className="mb-1 text-[10px] uppercase text-dim">Aktiva</div>
        <StatRow label="Cash" value={eur(f.cash)} />
        <StatRow label="Forderungen (DSO ~ Zahlungsziel)" value={eur(f.accountsReceivable)} hint={`DSO: ${f.dsoDays} Tage`} />
        {f.treasury > 0 && <StatRow label="Treasury (Geldmarkt)" value={eur(f.treasury)} hint="Angelegte Liquidität — verzinst, aber kein Runway-Puffer" />}
        <div className="mb-1 mt-3 text-[10px] uppercase text-dim">Passiva</div>
        <StatRow label="Verbindlichkeiten" value={eur(f.accountsPayable)} hint={`DPO: ${f.dpoDays} Tage`} />
        <StatRow label="Deferred Revenue" value={eur(f.deferredRevenue)} hint="Vorausbezahlte Jahresverträge — Leistung noch zu erbringen" />
        <StatRow label="Debt" value={eur(f.debt.principal)} hint={`${pct(f.debt.annualRate)} p. a., Linie ${eur(f.debt.creditLine)}`} />
        <StatRow label="Eigenkapital (Einlagen)" value={eur(f.contributedCapital)} />
        <StatRow label="Eigenkapital (kumul. Ergebnis)" value={eur(f.retainedEarnings)} />
      </Panel>

      <Panel title="Covenants (Kreditauflagen)">
        {f.debt.covenants.map((c) => {
          const arr = totalMrr(state) * 12;
          const ok = c.type === 'minCash' ? f.cash >= c.value : arr > 0 && f.debt.principal / arr <= c.value;
          return (
            <div key={c.labelDe} className={`mb-2 flex items-center gap-2 text-xs ${ok ? 'text-good' : 'text-bad'}`}>
              <span>{ok ? '✓' : '✗'}</span>
              <span>{c.labelDe}</span>
            </div>
          );
        })}
        <p className="text-[10px] text-dim">Verletzung ⇒ Bank meldet sich, Board-Vertrauen leidet; anhaltend ⇒ Linie kann fällig gestellt werden.</p>
      </Panel>

      <Panel title="Cap Table">
        {state.capTable.map((c) => (
          <StatRow key={c.id} label={c.holder} value={pct(c.share, 1)} />
        ))}
      </Panel>

      <Panel title="Laufende Budgets (ändern unter „Entscheidungen“)">
        <StatRow label="Marketing" value={`${eur(f.budgetsMonthly.marketing)}/M`} />
        <StatRow label="Customer-Success-Programme" value={`${eur(f.budgetsMonthly.customerSuccess)}/M`} />
        <StatRow label="R&D-Tools" value={`${eur(f.budgetsMonthly.rndTools)}/M`} />
        <StatRow label="G&A-Sachkosten" value={`${eur(f.budgetsMonthly.gaOther)}/M`} />
        <StatRow label="COGS-Quote" value={pct(f.cogsRate)} />
      </Panel>

      <TreasuryPanel />
      </div>

      <InsurancePanel />
    </div>
  );
}

/**
 * Versicherungen (Phase 22, V1): Policen abschließen/kündigen. Prämien laufen als
 * G&A-Kosten; im Schadensfall (Skandale/Bußgelder, behördliche Auflagen) deckt die
 * passende Police einen Teil — der Wert zeigt sich erst, wenn es kracht.
 */
function InsurancePanel() {
  const { state, act, busy } = useStore();
  if (!state) return null;
  const ins = state.insurance;
  const active = state.meta.status === 'active';
  const premiumM = insurancePremiumMonthly(state);
  const claimKindLabel: Record<string, string> = { cyber: 'Cyber', legal: 'Recht/Haftung', fraud: 'Betrug', regulation: 'Aufsicht' };

  return (
    <Panel icon="shield" title="Versicherungen · Risikomanagement" right={<span className="num text-[12px] text-dim">Prämien {eur(premiumM)}/M · Deckung bisher {eur(ins.claimsPaidTotal)}</span>}>
      <p className="mb-3 max-w-[80ch] text-[11px] leading-relaxed text-dim">
        Alles, was ein Unternehmen absichern kann: laufende Prämie (G&A) gegen Deckung im Ernstfall. Schäden entstehen im Spiel vor allem durch aufgedeckte Skandale/Bußgelder (Datenpanne, Betrug, Klagen, Patentstreit, M&A-Altlasten) und behördliche Auflagen — genau dort greifen die Policen.
      </p>
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {INSURANCE_KINDS.map((kind: InsuranceKind) => {
          const spec = INSURANCE_SPECS[kind];
          const pol = ins.policies[kind];
          return (
            <div key={kind} className={`border p-2.5 ${pol.active ? 'border-good/50 bg-good/5' : 'border-line'}`} style={{ borderRadius: 2 }}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-[12.5px] font-semibold text-ink">{spec.labelDe}</div>
                <span className={`kicker shrink-0 text-[8px] ${pol.active ? 'text-good' : 'text-faint'}`}>{pol.active ? '● aktiv' : '○ inaktiv'}</span>
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-dim">{spec.shortDe}</div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-dim">
                <span className="num text-ink">{eur(spec.monthlyPremium)}/M</span>
                <span>Deckung {(spec.coverage * 100).toFixed(0)} % · bis {eur(spec.capPerClaim)}</span>
              </div>
              <div className="mt-1 text-[9px] text-faint">deckt: {spec.covers.map((c) => claimKindLabel[c] ?? c).join(', ')}</div>
              {pol.claimsPaid > 0 && <div className="mt-1 text-[9.5px] text-good">bereits erstattet: {eur(pol.claimsPaid)}</div>}
              <button
                className={`btn mt-2 w-full justify-center py-1 text-[11px] ${pol.active ? 'border-bad/60 text-bad' : ''}`}
                disabled={busy || !active}
                onClick={() => void act(pol.active ? { type: 'CANCEL_INSURANCE', kind } : { type: 'BUY_INSURANCE', kind }, null)}
              >
                {pol.active ? 'Kündigen' : 'Abschließen'}
              </button>
            </div>
          );
        })}
      </div>
      {ins.logDe.length > 0 && (
        <div className="mt-3 border-t border-line/40 pt-2">
          <div className="kicker mb-1 text-[8px]">Chronik</div>
          <ul className="grid gap-x-4 gap-y-0.5 text-[9.5px] leading-tight text-dim sm:grid-cols-2">
            {ins.logDe.slice(0, 6).map((l, i) => <li key={i}>· {l}</li>)}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/**
 * Firmen-Treasury (Phase 22, M6): freie Firmen-Liquidität in den Geldmarkt anlegen.
 * Verzinst sich mit dem Leitzins, ist aber kein Runway-Puffer — der Reiz liegt im
 * Trade-off zwischen Zinsertrag und liquider Reserve (v. a. bei Zinsschocks).
 */
function TreasuryPanel() {
  const { state, act, busy } = useStore();
  const [amount, setAmount] = useState(100_000);
  if (!state) return null;
  const f = state.finance;
  const active = state.meta.status === 'active';
  const rate = state.macro.interestRatePct;
  const weeklYield = Math.round(f.treasury * (rate / 100) * (7 / 365));
  const minCash = f.debt.covenants.find((c) => c.type === 'minCash')?.value ?? 0;
  const wouldBreach = f.cash - amount < minCash;

  return (
    <Panel icon="bank" title="Treasury · Geldmarkt-Anlage">
      <p className="mb-2 max-w-[46ch] text-[10.5px] leading-relaxed text-dim">
        Lege freie Firmen-Liquidität in den Geldmarkt an — verzinst mit dem Leitzins ({rate.toFixed(1)} % p. a.). Achtung: die Treasury zählt <b>nicht</b> als Runway-Puffer.
      </p>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="border border-line/60 py-1.5" style={{ borderRadius: 2 }}>
          <div className="kicker text-[8px]">Angelegt</div>
          <div className="num text-[15px] text-ink">{f.treasury > 0 ? eur(f.treasury) : '—'}</div>
        </div>
        <div className="border border-line/60 py-1.5" style={{ borderRadius: 2 }}>
          <div className="kicker text-[8px]">Zins p. a.</div>
          <div className="num text-[15px] text-good">{rate.toFixed(1)} %</div>
        </div>
        <div className="border border-line/60 py-1.5" style={{ borderRadius: 2 }}>
          <div className="kicker text-[8px]">Ertrag/Woche</div>
          <div className="num text-[15px] text-ink">{weeklYield > 0 ? eur(weeklYield) : '—'}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="kicker text-[9px]">Betrag</span>
        <input type="number" className="input w-32 py-1 text-[13px]" value={amount} min={0} step={25_000} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} />
        {[50_000, 100_000, 250_000].map((q) => (
          <button key={q} className="chip" onClick={() => setAmount(q)}>{eur(q, false)}</button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <button className="btn flex-1 justify-center py-1.5 text-[12px]" disabled={busy || !active || amount <= 0 || amount > f.cash} onClick={() => void act({ type: 'TREASURY_ALLOCATE', amount }, null)}>
          <Icon name="bank" size={13} className="mr-1" /> Anlegen
        </button>
        <button className="btn flex-1 justify-center py-1.5 text-[12px]" disabled={busy || !active || f.treasury <= 0} onClick={() => void act({ type: 'TREASURY_WITHDRAW', amount: Math.min(amount, f.treasury) }, null)}>
          Auflösen
        </button>
      </div>
      {wouldBreach && amount > 0 && amount <= f.cash && (
        <p className="mt-2 text-[10px] leading-tight text-warn">Achtung: Nach der Anlage unterschreitet die Kasse die Mindestliquidität ({eur(minCash)}) — Covenant-Risiko.</p>
      )}
      {f.treasuryYieldTotal > 0 && <p className="mt-2 text-[10px] text-dim">Kumulierter Zinsertrag bisher: <span className="num text-good">{eur(f.treasuryYieldTotal)}</span>.</p>}
    </Panel>
  );
}

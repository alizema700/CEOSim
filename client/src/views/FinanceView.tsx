import { totalMrr } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Panel, StatRow } from '../components/ui.js';
import { eur, pct } from '../format.js';

/** Finanzen: GuV, Cash-Flow, Bilanz (letzte Woche), Cap Table, Covenants. */
export function FinanceView() {
  const { state, reports } = useStore();
  if (!state) return null;
  const r = reports[reports.length - 1] ?? null;
  const f = state.finance;

  return (
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
    </div>
  );
}

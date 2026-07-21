import { EVENT_CARDS } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Panel } from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { ThreadPane } from './ChatView.js';

/**
 * Recht: frei chatbare Anwaltskanzlei (jede Runde kostet Honorar!) +
 * laufende Fälle & schwebende Risiken. Permanenter Ausbildungs-Disclaimer.
 */
export function LegalView() {
  const { state } = useStore();
  if (!state) return null;

  const legalCards = new Set(['CEASE_DESIST', 'SECURITY_BREACH', 'ACCOUNTING_FRAUD', 'BANK_COVENANT_CALL']);
  const cases = state.openEvents.filter((e) => legalCards.has(e.cardId));
  const pendingRisks = state.scheduledEffects.filter((fx) => fx.effect.kind === 'DELAYED_SCANDAL');

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded border border-warn/60 bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-warn">
        <Icon name="scale" size={13} className="mr-1 inline" /><b>Dauerhafter Hinweis:</b> Alle Inhalte der simulierten Kanzlei „Brandt &amp; Kollegen“ sind fiktive
        Ausbildungs-Inhalte dieses Simulators und <b>keine echte Rechtsberatung</b>. Für reale Fälle: echte Kanzlei.
        <span className="ml-2 text-dim">Honorar: 450 € pro Chat-Runde (simuliert) — Anwaltszeit gezielt einsetzen!</span>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-h-0 flex-1 flex-col">
          <ThreadPane threadKey="legal" />
        </div>

        <div className="w-80 shrink-0 space-y-3 overflow-y-auto">
          <Panel title="Laufende Fälle & Vorgänge">
            {cases.length === 0 ? (
              <p className="text-xs text-dim">Keine rechtlich relevanten Vorgänge. Genieße die Ruhe.</p>
            ) : (
              cases.map((c) => {
                const card = EVENT_CARDS.find((x) => x.id === c.cardId);
                return (
                  <div key={c.instanceId} className="mb-2 border-b border-line/40 pb-2 text-xs last:border-0">
                    <div className="font-bold">{card?.titleDe ?? c.cardId}</div>
                    <div className="text-[10px] text-dim">
                      Woche {c.triggeredWeek} · {c.status === 'open' ? <><Icon name="dot" size={11} className="text-bad" /> offen — Reaktion nötig (Inbox)</> : `abgeschlossen: ${card?.options.find((o) => o.id === c.chosenOptionId)?.labelDe ?? c.chosenOptionId}`}
                    </div>
                  </div>
                );
              })
            )}
          </Panel>

          <Panel title="Schwebende Risiken">
            {pendingRisks.length === 0 ? (
              <p className="text-xs text-dim">Keine schwebenden Verfahren oder Aufdeckungsrisiken.</p>
            ) : (
              pendingRisks.map((r) => (
                <div key={r.id} className="mb-2 text-xs">
                  ⏳ <span className="text-warn">{r.effect.kind === 'DELAYED_SCANDAL' ? r.effect.topicDe : ''}</span>
                  <div className="text-[10px] text-dim">aus: {r.sourceDe} · schwebt bis ~Woche {r.dueWeek}</div>
                </div>
              ))
            )}
            <p className="mt-2 text-[9px] text-dim/70">Ob ein Risiko eintritt, entscheidet der Verlauf — die Kanzlei kann einordnen, was auf dem Spiel steht.</p>
          </Panel>

          <Panel title="Wofür die Kanzlei da ist">
            <ul className="space-y-1 text-[11px] text-dim">
              <li>· Arbeitsrecht (Kündigungen, Abmahnungen)</li>
              <li>· Vertragsrecht (AGB, SLAs, Kundenverträge)</li>
              <li>· Gesellschaftsrecht (Beschlüsse, Satzung)</li>
              <li>· DSGVO & Meldepflichten</li>
              <li>· M&A-Due-Diligence, später IPO-Prospekt</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

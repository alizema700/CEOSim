import { EVENT_CARDS, LOBBY_COST, LOBBY_LABELS } from '@boardroom/shared';
import type { LobbyFocus } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Panel, Bar } from '../components/ui.js';
import { Icon, type IconName } from '../components/Icon.js';
import { eur } from '../format.js';
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
          <LobbyPanel />

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

/**
 * Politik & Lobbyismus (Phase 22): politisches Kapital aufbauen, um
 * Steuererleichterung / Fördermittel / Zugang freizuschalten — gegen ein
 * wachsendes Skandal-Risiko. Der Erfolg hängt an deiner Governance-Kompetenz.
 */
function LobbyPanel() {
  const { state, act, busy } = useStore();
  if (!state) return null;
  const pol = state.politics;
  const active = state.meta.status === 'active';
  const cash = state.finance.cash;
  const cap = Math.round(pol.politicalCapital);
  const exp = Math.round(pol.exposure);

  const foci: { key: LobbyFocus; icon: IconName; hintDe: string; thresholdDe: string }[] = [
    { key: 'steuern', icon: 'scale', hintDe: 'Senkt ab genug Einfluss den effektiven Steuersatz dauerhaft um 3 Pp.', thresholdDe: 'ab Kapital 55' },
    { key: 'subvention', icon: 'bank', hintDe: 'Erwirkt ab genug Einfluss einen einmaligen Fördermittel-Zuschuss.', thresholdDe: 'ab Kapital 45' },
    { key: 'zugang', icon: 'users', hintDe: 'Beziehungspflege: Kapital rauf, Angriffsfläche runter — die Basis.', thresholdDe: 'diskret' },
  ];

  return (
    <Panel icon="scale" title="Politik & Lobbyismus">
      <p className="mb-2 max-w-[42ch] text-[10.5px] leading-relaxed text-dim">
        Baue politisches Kapital auf — es schaltet ab Schwellen Steuererleichterung, Fördermittel und Zugang frei. Aggressives Lobbying erhöht aber das Skandal-Risiko.
      </p>

      <div className="mb-1 flex items-center justify-between text-[10px]">
        <span className="kicker text-[8px]">Politisches Kapital</span>
        <span className="num text-ink">{cap}/100</span>
      </div>
      <Bar value={cap} color="bg-purple" />

      <div className="mb-1 mt-2 flex items-center justify-between text-[10px]">
        <span className="kicker text-[8px]">Skandal-Risiko</span>
        <span className={`num ${exp >= 55 ? 'text-bad' : 'text-ink'}`}>{exp}/100</span>
      </div>
      <Bar value={exp} color={exp >= 55 ? 'bg-bad' : 'bg-warn'} />

      <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
        <div className="overflow-hidden border border-line/60 px-0.5 py-1" style={{ borderRadius: 2 }}>
          <div className="kicker text-[7px] tracking-tight">Steuer</div>
          <div className="num text-[12px] text-ink">{pol.taxReliefPct > 0 ? `−${(pol.taxReliefPct * 100).toFixed(0)} Pp.` : '—'}</div>
        </div>
        <div className="overflow-hidden border border-line/60 px-0.5 py-1" style={{ borderRadius: 2 }}>
          <div className="kicker text-[7px] tracking-tight">Förder</div>
          <div className="num text-[12px] text-ink">{pol.subsidiesWon > 0 ? eur(pol.subsidiesWon) : '—'}</div>
        </div>
        <div className="overflow-hidden border border-line/60 px-0.5 py-1" style={{ borderRadius: 2 }}>
          <div className="kicker text-[7px] tracking-tight">Budget</div>
          <div className="num text-[12px] text-ink">{pol.lobbyingSpendTotal > 0 ? eur(pol.lobbyingSpendTotal) : '—'}</div>
        </div>
      </div>

      <div className="mt-2.5 space-y-1.5">
        {foci.map((f) => {
          const c = LOBBY_COST[f.key];
          return (
            <button
              key={f.key}
              className="btn w-full flex-col items-start gap-0.5 py-1.5 text-left"
              disabled={busy || !active || cash < c}
              onClick={() => void act({ type: 'LOBBY', focus: f.key }, null)}
            >
              <span className="flex w-full items-center justify-between text-[11.5px] font-semibold">
                <span className="inline-flex items-center gap-1.5"><Icon name={f.icon} size={13} /> {LOBBY_LABELS[f.key]}</span>
                <span className="num text-dim">{eur(c)}</span>
              </span>
              <span className="text-[9.5px] font-normal leading-tight text-dim">{f.hintDe} <span className="text-purple">· {f.thresholdDe}</span></span>
            </button>
          );
        })}
      </div>

      {pol.logDe.length > 0 && (
        <div className="mt-2.5 border-t border-line/40 pt-2">
          <div className="kicker mb-1 text-[8px]">Chronik</div>
          <ul className="space-y-0.5 text-[9.5px] leading-tight text-dim">
            {pol.logDe.slice(0, 4).map((l, i) => (
              <li key={i}>· {l}</li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

import { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Panel, StatRow } from '../components/ui.js';
import { num } from '../format.js';

/** Einstellungen: Token-Kosten-Dashboard, Didaktik-Schalter, Export, Danger Zone. */
export function SettingsView() {
  const { state, hypothesisMode, setHypothesisMode, deleteGame, leaveGame } = useStore();
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof api.llmUsage>> | null>(null);

  useEffect(() => {
    api.llmUsage().then(setUsage).catch(() => setUsage(null));
  }, []);

  if (!state) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Token-Kosten-Dashboard (LLM-Erzählschicht)">
        {usage ? (
          <>
            <StatRow label="Status" value={usage.available ? `✓ aktiv (${usage.model})` : '○ kein API-Key — regelbasierter Modus'} />
            <StatRow label="API-Aufrufe gesamt" value={num(usage.totalCalls)} />
            <StatRow label="davon aus Cache (gratis)" value={num(usage.cachedCalls)} />
            <StatRow label="Input-Tokens" value={num(usage.inputTokens)} />
            <StatRow label="Output-Tokens" value={num(usage.outputTokens)} />
            <StatRow label="Kosten gesamt" value={<b>{usage.costUsd.toLocaleString('de-DE', { minimumFractionDigits: 4 })} $</b>} />
            {usage.byTask.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[10px] uppercase text-dim">Nach Aufgabe</div>
                {usage.byTask.map((t) => (
                  <StatRow key={t.task} label={t.task} value={`${num(t.calls)} Calls · ${t.costUsd.toLocaleString('de-DE', { minimumFractionDigits: 4 })} $`} />
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] leading-relaxed text-dim">
              Die Simulation selbst ist deterministischer Code und kostet nichts. Das LLM liefert nur Erzähl- und Analysetexte;
              identische Anfragen kommen aus dem Cache. Für den späteren SaaS-Betrieb ist diese Zahl deine variable Marge.
            </p>
          </>
        ) : (
          <p className="text-xs text-dim">Lade …</p>
        )}
      </Panel>

      <div className="space-y-4">
        <Panel title="Didaktik">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={hypothesisMode} onChange={(e) => setHypothesisMode(e.target.checked)} className="accent-sky-400" />
            Hypothese vor jeder Entscheidung abfragen (empfohlen — trainiert kalibriertes Urteilen)
          </label>
        </Panel>

        <Panel title="Spielstand">
          <div className="flex flex-wrap gap-2">
            <a className="btn" href={`/api/games/${state.meta.gameId}/export`} download>
              ⬇ Als JSON exportieren (Event-Log + Snapshot)
            </a>
          </div>
          <p className="mt-2 text-[10px] text-dim">
            Der Export enthält das vollständige append-only Event-Log. Beim Import wird es deterministisch REPLAYT — gleicher
            Seed + gleiche Entscheidungen ⇒ identischer Zustand. Grundlage für das Was-wäre-wenn-Labor (Phase 4).
          </p>
        </Panel>

        <Panel title="Danger Zone">
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm(`„${state.identity.companyName}" wirklich unwiderruflich löschen?`)) {
                void deleteGame(state.meta.gameId).then(leaveGame);
              }
            }}
          >
            🗑 Diesen Spielstand löschen
          </button>
        </Panel>
      </div>
    </div>
  );
}

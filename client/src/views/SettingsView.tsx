import { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Panel, StatRow } from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { num } from '../format.js';
import { t } from '../i18n.js';

/** Einstellungen: Token-Kosten, Didaktik, Sprache, Logo, PDF, Export, Danger Zone. */
export function SettingsView() {
  const { state, hypothesisMode, setHypothesisMode, deleteGame, leaveGame, lang, setLang, logoDataUrl, setLogoDataUrl, setError } = useStore();
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof api.llmUsage>> | null>(null);

  useEffect(() => {
    api.llmUsage().then(setUsage).catch(() => setUsage(null));
  }, []);

  if (!state) return null;

  function onLogoFile(file: File | undefined) {
    if (!file || !state) return;
    if (file.size > 280_000) {
      setError('Logo zu groß — bitte max. ~280 KB (PNG/JPG).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      void api
        .uploadLogo(state.meta.gameId, dataUrl)
        .then(() => setLogoDataUrl(dataUrl))
        .catch((e) => setError((e as Error).message));
    };
    reader.readAsDataURL(file);
  }

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

        <Panel icon="globe" title={`${t('language')} (Phase 6: Chrome-Labels)`}>
          <div className="flex gap-1.5">
            <button className={`chip ${lang === 'de' ? 'chip-on' : ''}`} onClick={() => setLang('de')}>Deutsch</button>
            <button className={`chip ${lang === 'en' ? 'chip-on' : ''}`} onClick={() => setLang('en')}>English</button>
          </div>
          <p className="mt-2 text-[10px] text-dim">
            Übersetzt Navigation & Top-Bar. Spielinhalte (Mails, Analysen, Events) kommen aus der Engine und bleiben vorerst Deutsch —
            die volle EN-Lokalisierung ist im i18n-Gerüst vorbereitet.
          </p>
        </Panel>

        <Panel icon="image" title="Firmenlogo">
          <div className="flex items-center gap-3">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt="Logo" className="h-12 w-12 rounded border border-line object-cover" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded border border-line text-xl" style={{ background: state.identity.logoColor + '33' }}>
                {state.identity.logoEmoji}
              </span>
            )}
            <label className="btn cursor-pointer">
              {t('logo_upload')}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onLogoFile(e.target.files?.[0])} />
            </label>
          </div>
          <p className="mt-2 text-[10px] text-dim">Erscheint in der Seitenleiste und auf dem PDF-Quartalsbericht.</p>
        </Panel>

        <Panel title="Spielstand & Berichte">
          <div className="flex flex-wrap gap-2">
            <a className="btn" href={`/api/games/${state.meta.gameId}/export`} download>
              ⬇ Als JSON exportieren (Event-Log + Snapshot)
            </a>
            <a className="btn" href={`/api/games/${state.meta.gameId}/report.pdf`} download>
              <Icon name="file" size={13} /> {t('quarterly_pdf')}
            </a>
          </div>
          <p className="mt-2 text-[10px] text-dim">
            Der Export enthält das vollständige append-only Event-Log. Beim Import wird es deterministisch REPLAYT — gleicher
            Seed + gleiche Entscheidungen ⇒ identischer Zustand. Der PDF-Bericht fasst die letzten 13 Wochen zusammen
            (Kennzahlen, GuV, Entscheidungen mit Noten, Lektionen).
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
            <Icon name="trash" size={13} /> Diesen Spielstand löschen
          </button>
        </Panel>
      </div>
    </div>
  );
}

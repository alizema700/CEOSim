import { useEffect, useRef } from 'react';
import type { GameEvent } from '@boardroom/shared';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Icon } from '../components/Icon.js';
import { t } from '../i18n.js';
import { eur, dateDe, num } from '../format.js';

/**
 * Spielstand-Manager „Meine Unternehmen" im Zeitungs-Titelkopf-Stil: Jedes
 * Unternehmen ist ein eigener Spielstand mit eigener Ausgangslage.
 */
export function SavesView() {
  const { games, loadGames, openGame, deleteGame, setView, busy, error, setError } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadGames();
  }, [loadGames]);

  const statusDe: Record<string, string> = { active: '● aktiv', insolvent: 'insolvent', fired: 'abgewählt', exited: 'Exit', retired: 'Amtsende', convicted: 'verhaftet' };

  return (
    <div className="min-h-full bg-bg">
      {/* Titelkopf */}
      <header className="border-b border-line px-6 pt-10">
        <div className="mx-auto max-w-4xl">
          <div className="kicker text-center tracking-[0.18em]">Der Führungs-Simulator · Ausgabe für {new Date().toLocaleDateString('de-DE', { year: 'numeric' })}</div>
          <h1 className="serif mt-2 text-center text-[72px] leading-none tracking-[0.01em]">BOARDROOM</h1>
          <div className="rule-top mt-4 flex items-center justify-center gap-3 border-b border-line py-2.5 kicker">
            <span>Unternehmensführung risikofrei trainieren</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10">
        {error && (
          <div className="mb-4 flex items-center justify-between border-l-2 border-bad bg-bad/5 px-3 py-2 text-xs text-bad">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Schließen"><Icon name="x" size={12} /></button>
          </div>
        )}

        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="kicker text-ink">{t('my_companies')}</h2>
          <div className="flex gap-2">
            <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Import (JSON)</button>
            <button className="btn-primary" onClick={() => setView('wizard')}>+ {t('new_company')}</button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const data = JSON.parse(await file.text()) as { events: GameEvent[] };
              const { state } = await api.importGame(data.events);
              await openGame(state.meta.gameId);
            } catch (err) {
              setError('Import fehlgeschlagen: ' + (err as Error).message);
            } finally {
              e.target.value = '';
            }
          }}
        />

        {games.length === 0 ? (
          <div className="border border-line bg-panel p-10 text-center" style={{ borderRadius: 2 }}>
            <p className="serif text-[22px] text-ink">Ein leerer Redaktionsschluss.</p>
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-dim">
              Noch keine Unternehmen. Gründe oder übernimm dein erstes — der Wizard führt dich durch Szenario, Identität, Werte und Standort.
            </p>
            <button className="btn-primary mt-5" onClick={() => setView('wizard')}>+ {t('new_company')}</button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {games.map((g) => (
              <div key={g.gameId} className="group flex flex-col border border-line bg-panel p-4 transition-colors hover:border-accent" style={{ borderRadius: 2 }}>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center text-xl" style={{ background: g.logoColor + '22', border: `1px solid ${g.logoColor}`, borderRadius: 2 }}>
                    {g.logoEmoji}
                  </span>
                  <button className="min-w-0 flex-1 text-left" onClick={() => void openGame(g.gameId)} disabled={busy}>
                    <div className="serif truncate text-[20px] leading-tight text-ink group-hover:text-accent">{g.companyName}</div>
                    <div className="kicker mt-0.5">CEO {g.ceoName} · Woche {g.week} · <span className={g.status === 'active' ? 'text-good' : 'text-bad'}>{statusDe[g.status] ?? g.status}</span></div>
                  </button>
                  <button
                    className="btn-danger shrink-0"
                    onClick={() => { if (confirm(`„${g.companyName}" löschen?`)) void deleteGame(g.gameId); }}
                    aria-label="Löschen"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
                <button className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-left" onClick={() => void openGame(g.gameId)} disabled={busy}>
                  <Stat label="MRR" value={`${eur(g.mrr)}/M`} />
                  <Stat label="Cash" value={eur(g.cash)} />
                  <Stat label="Board" value={`${num(g.boardTrust)}/100`} />
                </button>
                <div className="mt-1 kicker text-faint">{dateDe(g.dateISO)} · {g.difficulty}</div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-10 border-t border-line pt-4 text-center kicker text-faint">
          Sechs Phasen · Engine · Kennzahlen · Inbox &amp; Personas · Anwalt &amp; Board · Fundraising, M&amp;A &amp; IPO · Alles simuliert
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="kicker text-[9px]">{label}</div>
      <div className="num mt-0.5 text-[13px] text-ink">{value}</div>
    </div>
  );
}

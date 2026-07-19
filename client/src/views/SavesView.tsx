import { useEffect, useRef } from 'react';
import type { GameEvent } from '@boardroom/shared';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { eur, dateDe, num } from '../format.js';

/**
 * Spielstand-Manager „Meine Unternehmen": Jedes Unternehmen ist ein eigener
 * Spielstand mit eigener Situation — Unternehmen 1, Unternehmen 2, …
 */
export function SavesView() {
  const { games, loadGames, openGame, deleteGame, setView, busy, error, setError } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadGames();
  }, [loadGames]);

  const statusDe: Record<string, string> = { active: '● aktiv', insolvent: '💀 insolvent', fired: '⚖ abgewählt', exited: '🏆 Exit' };

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center p-8">
      <div className="mb-1 text-3xl font-bold tracking-tight">
        BOARD<span className="text-accent">ROOM</span>
      </div>
      <p className="mb-8 text-xs text-dim">Der CEO-Simulator · Unternehmensführung risikofrei trainieren</p>

      {error && (
        <div className="panel mb-4 flex items-center justify-between border-bad/60 px-3 py-2 text-xs text-bad">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] uppercase tracking-widest text-dim">{t('my_companies')}</h2>
        <div className="flex gap-2">
          <button className="btn" onClick={() => fileRef.current?.click()}>
            ⬆ Import (JSON)
          </button>
          <button className="btn-primary" onClick={() => setView('wizard')}>
            + {t('new_company')}
          </button>
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
        <div className="panel p-8 text-center text-xs text-dim">
          Noch keine Unternehmen. Gründe oder übernimm dein erstes — der Wizard führt dich durch Szenario, Identität, Werte und
          Standort.
        </div>
      ) : (
        <div className="space-y-2">
          {games.map((g) => (
            <div key={g.gameId} className="panel flex items-center gap-4 px-4 py-3 transition-colors hover:border-accent">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-xl"
                style={{ background: g.logoColor + '22', border: `1px solid ${g.logoColor}` }}
              >
                {g.logoEmoji}
              </span>
              <button className="min-w-0 flex-1 text-left" onClick={() => void openGame(g.gameId)} disabled={busy}>
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-bold">{g.companyName}</span>
                  <span className={`text-[10px] ${g.status === 'active' ? 'text-good' : 'text-bad'}`}>{statusDe[g.status] ?? g.status}</span>
                </div>
                <div className="num mt-0.5 text-[11px] text-dim">
                  CEO {g.ceoName} · Woche {g.week} ({dateDe(g.dateISO)}) · MRR {eur(g.mrr)}/M · Cash {eur(g.cash)} · Board {num(g.boardTrust)}/100 · {g.difficulty}
                </div>
              </button>
              <button
                className="btn-danger shrink-0"
                onClick={() => {
                  if (confirm(`„${g.companyName}" löschen?`)) void deleteGame(g.gameId);
                }}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-8 text-center text-[10px] text-dim/60">
        Phase 1 (MVP): SaaS-Turnaround · Engine, KPIs, Entscheidungen, Bewertungs-Pipeline · Weitere Szenarien, Inbox, Personas,
        Anwalt & Board-Meetings folgen in Phase 2–6.
      </p>
    </div>
  );
}

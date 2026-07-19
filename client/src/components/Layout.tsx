import type { ReactNode } from 'react';
import { runwayWeeks, weekToDateISO } from '@boardroom/shared';
import { useStore, type View } from '../store.js';
import { t } from '../i18n.js';
import { eur, num, dateDe } from '../format.js';

/** Linke Navigation + Top-Bar (Cash · Runway · Board · Datum · Woche abschließen). */

const NAV: { view: View | null; label: string; icon: string; phase?: number; badge?: 'unread' }[] = [
  { view: 'dashboard', label: t('nav_dashboard'), icon: '▤' },
  { view: 'inbox', label: t('nav_inbox'), icon: '✉', badge: 'unread' },
  { view: 'chat', label: t('nav_chat'), icon: '💬' },
  { view: 'calendar', label: t('nav_calendar'), icon: '📅' },
  { view: 'decisions', label: t('nav_decisions'), icon: '⌘' },
  { view: 'evaluations', label: t('nav_evaluations'), icon: '✎' },
  { view: 'team', label: t('nav_team'), icon: '👥' },
  { view: 'customers', label: t('nav_customers'), icon: '◎' },
  { view: 'product', label: t('nav_product'), icon: '⚙' },
  { view: 'market', label: t('nav_market'), icon: '⚔' },
  { view: 'finance', label: t('nav_finance'), icon: '€' },
  { view: null, label: t('nav_legal'), icon: '§', phase: 3 },
  { view: null, label: t('nav_press'), icon: '🗞', phase: 3 },
  { view: null, label: t('nav_strategy'), icon: '♟', phase: 3 },
  { view: null, label: t('nav_learn'), icon: '🎓', phase: 4 },
  { view: 'settings', label: t('nav_settings'), icon: '⚒' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { state, view, setView, closeWeek, busy, leaveGame, messageStatus } = useStore();
  if (!state) return <>{children}</>;

  const unread = state.comms.messages.filter((m) => messageStatus[m.id] === undefined).length;

  const runway = runwayWeeks(state);
  const dateISO = weekToDateISO(state.meta.startDateISO, state.meta.week);
  const gameOver = state.meta.status !== 'active';
  const trustColor = state.ceo.boardTrust >= 60 ? 'text-good' : state.ceo.boardTrust >= 40 ? 'text-warn' : 'text-bad';
  const runwayColor = runway >= 40 ? 'text-good' : runway >= 20 ? 'text-warn' : 'text-bad';

  return (
    <div className="flex h-full">
      <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-panel">
        <button className="flex items-center gap-2 border-b border-line px-3 py-3 text-left" onClick={leaveGame} title="Zur Spielstand-Übersicht">
          <span className="flex h-7 w-7 items-center justify-center rounded text-base" style={{ background: state.identity.logoColor + '33', border: `1px solid ${state.identity.logoColor}` }}>
            {state.identity.logoEmoji}
          </span>
          <span className="truncate text-xs font-bold">{state.identity.companyName}</span>
        </button>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map((item) => (
            <button
              key={item.label}
              disabled={item.view === null}
              onClick={() => item.view && setView(item.view)}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors ${
                item.view === view ? 'bg-accent/10 text-accent' : item.view ? 'text-dim hover:text-ink' : 'cursor-not-allowed text-dim/40'
              }`}
            >
              <span className="w-4 text-center">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge === 'unread' && unread > 0 && (
                <span className="num rounded-full bg-accent/20 px-1.5 text-[9px] text-accent">{unread}</span>
              )}
              {item.phase && <span className="rounded border border-line px-1 text-[9px] text-dim/60">P{item.phase}</span>}
            </button>
          ))}
        </nav>
        <div className="border-t border-line px-3 py-2 text-[10px] text-dim">
          CEO: {state.playerProfile.ceoName}
          <br />
          Seed {state.meta.seed} · {state.meta.difficulty}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-5 border-b border-line bg-panel px-4 py-2">
          <div className="num">
            <span className="text-[10px] uppercase text-dim">{t('cash')} </span>
            <span className={state.finance.cash < 150_000 ? 'text-bad' : 'text-ink'}>{eur(state.finance.cash)}</span>
          </div>
          <div className="num">
            <span className="text-[10px] uppercase text-dim">{t('runway')} </span>
            <span className={runwayColor}>{runway >= 900 ? '∞' : `${num(runway)} W`}</span>
          </div>
          <div className="num">
            <span className="text-[10px] uppercase text-dim">{t('board_trust')} </span>
            <span className={trustColor}>{num(state.ceo.boardTrust)}/100</span>
          </div>
          <div className="flex-1" />
          <div className="num text-xs text-dim">
            Woche {state.meta.week} · {dateDe(dateISO)}
          </div>
          <button className="btn-primary" onClick={() => void closeWeek()} disabled={busy || gameOver}>
            {busy ? '…' : `▶ ${t('close_week')}`}
          </button>
        </header>
        {gameOver && (
          <div className="border-b border-bad/50 bg-bad/10 px-4 py-2 text-xs text-bad">
            ☠ SPIEL BEENDET — {state.meta.endReasonDe}
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto p-4">{children}</main>
      </div>
    </div>
  );
}

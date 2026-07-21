import type { ReactNode } from 'react';
import { runwayWeeks, totalMrr, weekToDateISO } from '@boardroom/shared';
import { useStore, type View } from '../store.js';
import { t } from '../i18n.js';
import { eur, num } from '../format.js';

/**
 * Redaktions-Chrome („Die Morgenlage"): Laufband oben (Cash · Runway · MRR ·
 * Board), Serifen-Zeitungskopf mit BOARDROOM-Titel, darunter die Rubriken-
 * Navigation als Mono-Zeile. Inhalt in einer zentrierten Papierspalte.
 */

export function Layout({ children }: { children: ReactNode }) {
  const { state, view, setView, closeWeek, busy, leaveGame, messageStatus, logoDataUrl } = useStore();
  useStore((s) => s.lang); // Re-Render bei Sprachwechsel
  if (!state) return <>{children}</>;

  const unread = state.comms.messages.filter((m) => messageStatus[m.id] === undefined).length;
  const runway = runwayWeeks(state);
  const dateISO = weekToDateISO(state.meta.startDateISO, state.meta.week);
  const gameOver = state.meta.status !== 'active';
  const mrr = totalMrr(state);
  const growth = state.history[state.history.length - 1]?.values.mrrGrowthMonthly ?? 0;
  const trust = state.ceo.boardTrust;

  const scenarioDe = state.meta.scenarioId === 'distressed' ? 'Sanierungsfall' : 'SaaS-Turnaround';
  const dateLong = new Date(dateISO + 'T00:00:00')
    .toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();

  const NAV: { view: View; label: string; unread?: boolean; locked?: boolean }[] = [
    { view: 'dashboard', label: t('nav_dashboard') },
    { view: 'inbox', label: t('nav_inbox'), unread: true },
    { view: 'chat', label: t('nav_chat') },
    { view: 'calendar', label: t('nav_calendar') },
    { view: 'decisions', label: t('nav_decisions') },
    { view: 'evaluations', label: t('nav_evaluations') },
    { view: 'ceo', label: t('nav_ceo') },
    { view: 'team', label: t('nav_team') },
    { view: 'customers', label: t('nav_customers') },
    { view: 'product', label: t('nav_product') },
    { view: 'market', label: t('nav_market') },
    { view: 'finance', label: t('nav_finance') },
    { view: 'structure', label: t('nav_structure') },
    { view: 'legal', label: t('nav_legal') },
    { view: 'press', label: t('nav_press') },
    { view: 'strategy', label: t('nav_strategy') },
    { view: 'boerse', label: t('nav_boerse'), locked: state.ipo.status === 'locked' },
    { view: 'learn', label: t('nav_learn') },
    { view: 'settings', label: t('nav_settings') },
  ];

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* ── Laufband ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 flex h-[34px] shrink-0 items-center gap-0 border-b border-line bg-bg px-5 text-[11px] tracking-wide" style={{ fontFamily: 'var(--font-mono)' }}>
        <svg width="46" height="18" viewBox="0 0 52 20" className="shrink-0">
          <polyline points="0,10 16,10 20,4 24,16 28,2 32,10 52,10" fill="none" stroke={gameOver ? '#c2453d' : '#2f7f79'} strokeWidth="1.5" pathLength={100} className="ekg-line" />
        </svg>
        <TickerItem label="CASH" value={<span className={state.finance.cash < 150_000 ? 'text-bad' : 'text-ink'}>{eur(state.finance.cash)}</span>} first />
        <TickerItem label="RUNWAY" value={<span className={runway >= 40 ? 'text-good' : runway >= 20 ? 'text-warn' : 'text-bad'}>{runway >= 900 ? '∞' : `${num(runway)} W`}</span>} />
        <TickerItem
          label="MRR"
          value={
            <>
              <span className="text-ink">{eur(mrr)}</span>{' '}
              <span className={growth >= 0 ? 'text-good' : 'text-bad'}>{growth >= 0 ? '▲' : '▼'}{Math.abs(growth * 100).toFixed(1)} %</span>
            </>
          }
        />
        {state.ipo.status === 'public' && state.ipo.sharePrice !== null && (
          <TickerItem label="AKTIE" value={<span className="text-accent">{state.ipo.sharePrice.toFixed(2)} €</span>} />
        )}
        <TickerItem label="BOARD" value={<span className={trust >= 60 ? 'text-ink' : trust >= 40 ? 'text-warn' : 'text-bad'}>{num(trust)} %</span>} />
        <span className="ml-auto text-dim">{dateLong} · {t('week').toUpperCase()} {state.meta.week}</span>
      </div>

      {/* ── Krisen-Aufmacher ─────────────────────────────────────────── */}
      {gameOver && (
        <div className="flex items-baseline gap-4 border-b-2 border-bad bg-bad/5 px-5 py-2.5">
          <span className="kicker text-bad">SPIELENDE</span>
          <span className="serif text-[19px] text-ink">{state.meta.endReasonDe}</span>
          <button className="edlink ml-auto text-[13px]" style={{ color: '#c2453d', borderColor: '#c2453d' }} onClick={leaveGame}>
            Zur Übersicht
          </button>
        </div>
      )}

      {/* ── Zeitungskopf ─────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-line bg-bg px-5 pt-4">
        <div className="mx-auto grid max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-5">
          <button className="group flex items-center gap-2.5 text-left" onClick={leaveGame} title="Zur Spielstand-Übersicht">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt="" className="h-8 w-8 shrink-0 rounded-sm object-cover" style={{ border: `1px solid ${state.identity.logoColor}` }} />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-base" style={{ background: state.identity.logoColor + '22', border: `1px solid ${state.identity.logoColor}` }}>
                {state.identity.logoEmoji}
              </span>
            )}
            <span className="kicker leading-[1.5] group-hover:text-accent">
              {state.identity.companyName}
              <br />
              {scenarioDe.toUpperCase()} · {state.meta.difficulty.toUpperCase()}
            </span>
          </button>

          <h1 className="serif m-0 text-center text-[46px] leading-none tracking-[0.01em]">BOARDROOM</h1>

          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => void closeWeek()} disabled={busy || gameOver}>
              {busy ? '…' : `${t('close_week')} →`}
            </button>
          </div>
        </div>
        <div className="mt-1.5 text-center">
          <span className="kicker tracking-[0.18em]">Die Morgenlage · Ausgabe Nº {state.meta.week}</span>
        </div>

        {/* Rubriken-Navigation */}
        <nav className="rule-top mx-auto mt-3 flex max-w-[1280px] flex-wrap items-center justify-center gap-x-5 gap-y-1.5 border-b border-line py-2.5" style={{ fontFamily: 'var(--font-mono)' }}>
          {NAV.map((item) => {
            const active = item.view === view;
            return (
              <button
                key={item.view}
                onClick={() => setView(item.view)}
                className={`text-[11px] uppercase tracking-[0.1em] transition-colors ${active ? 'text-ink' : 'text-dim hover:text-accent'}`}
                style={active ? { borderBottom: '1px solid #171a1c', paddingBottom: 2 } : undefined}
              >
                {item.label}
                {item.unread && unread > 0 && <span className="text-accent">·{unread}</span>}
                {item.locked && <span className="text-faint"> 🔒</span>}
                {item.view === 'boerse' && state.ipo.status === 'public' && state.ipo.sharePrice !== null && (
                  <span className="text-accent"> {state.ipo.sharePrice.toFixed(0)}€</span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* ── Papierspalte ─────────────────────────────────────────────── */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1280px] px-5 py-7">{children}</div>
      </main>
    </div>
  );
}

function TickerItem({ label, value, first }: { label: string; value: ReactNode; first?: boolean }) {
  return (
    <>
      {!first && <span className="mx-3.5 text-line">/</span>}
      <span className="text-dim">
        {label} {value}
      </span>
    </>
  );
}

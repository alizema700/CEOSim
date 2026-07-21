import { useEffect, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { IPO_PREP_COST, PRE_IPO_SHARES, type IpoBank } from '@boardroom/shared';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Panel } from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { eur, pct } from '../format.js';
import { ThreadPane } from './ChatView.js';

/**
 * Börse (Phase 6): Freischaltung → Bank-Mandat → Roadshow (Q&A + Pricing) →
 * Notierung (Kurs, Earnings-Calls, Guidance, Ad-hoc-Hinweise).
 */
export function BoerseView() {
  const { state } = useStore();
  if (!state) return null;
  const ipo = state.ipo;

  return (
    <div className="space-y-4">
      {ipo.status === 'locked' && <EligibilityPanel />}
      {(ipo.status === 'eligible' || ipo.status === 'withdrawn') && (
        <>
          {ipo.status === 'withdrawn' && (
            <div className="rounded border border-warn/50 bg-warn/10 p-3 text-xs text-warn">
              Der letzte IPO-Anlauf wurde verschoben/abgesagt. Die Banken reden wieder mit euch — aber der Markt hat ein Gedächtnis.
            </div>
          )}
          <BankSelection />
          <EligibilityPanel />
        </>
      )}
      {ipo.status === 'preparing' && <PreparingPanel />}
      {ipo.status === 'roadshow' && <RoadshowPanel />}
      {ipo.status === 'public' && <PublicPanel />}
    </div>
  );
}

function EligibilityPanel() {
  const { state } = useStore();
  const [criteria, setCriteria] = useState<{ labelDe: string; ok: boolean }[]>([]);
  useEffect(() => {
    if (!state) return;
    void api.ipoStatus(state.meta.gameId).then((r) => setCriteria(r.eligibility.criteria)).catch(() => setCriteria([]));
  }, [state]);
  if (!state) return null;
  const locked = state.ipo.status === 'locked';
  return (
    <Panel icon={locked ? 'lock' : undefined} title={locked ? 'IPO — Freischaltung ab Kennzahlen' : 'IPO-Kriterien (laufend geprüft)'}>
      {locked && (
        <p className="mb-2 text-[11px] leading-relaxed text-dim">
          Ein Börsengang ist kein Knopf, sondern ein Reifegrad. Sobald alle Kriterien stehen, melden sich die Banken von selbst
          (Inbox + dieser Tab).
        </p>
      )}
      <div className="space-y-1">
        {criteria.map((c, i) => (
          <div key={i} className={`text-xs ${c.ok ? 'text-good' : 'text-dim'}`}>
            {c.ok ? '✓' : '○'} {c.labelDe}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BankSelection() {
  const { state, act, busy } = useStore();
  const [banks, setBanks] = useState<IpoBank[]>([]);
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!state) return;
    void api.ipoStatus(state.meta.gameId).then((r) => setBanks(r.banks)).catch(() => setBanks([]));
  }, [state?.meta.gameId]);
  if (!state) return null;
  return (
    <Panel icon="institution" title={`Banken-Auswahl — Mandat startet die Vorbereitung (~8 Wochen, ${eur(IPO_PREP_COST)})`}>
      <div className="grid gap-3 md:grid-cols-3">
        {banks.map((b) => (
          <div key={b.id} className="flex flex-col rounded border border-line bg-panel2 p-3">
            <div className="text-sm font-bold">{b.name}</div>
            <p className="mt-1 flex-1 text-[10px] leading-relaxed text-dim">{b.styleDe}</p>
            <div className="my-2 flex gap-2 text-[10px]">
              <span className="chip">Fee {(b.feePct * 100).toFixed(1)} %</span>
              <span className="chip">Nachfrage ×{b.demandBoost.toFixed(2)}</span>
            </div>
            <p className="mb-2 text-[10px] leading-relaxed text-warn">{b.tradeoffDe}</p>
            <button
              className={armed === b.id ? 'btn-danger' : 'btn-primary'}
              disabled={busy || state.meta.status !== 'active'}
              onClick={() => {
                if (armed !== b.id) {
                  setArmed(b.id);
                  return;
                }
                setArmed(null);
                void act({ type: 'IPO_SELECT_BANK', bankId: b.id }, null);
              }}
            >
              {armed === b.id ? 'Sicher? Mandat erteilen!' : 'Mandatieren'}
            </button>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-dim">
        Didaktik: Fee vs. Platzierungskraft ist der eigentliche Trade-off. Die billigste Bank ist teuer, wenn das Buch nicht voll wird —
        die teuerste ist es, wenn du sie nicht gebraucht hättest.
      </p>
    </Panel>
  );
}

function PreparingPanel() {
  const { state } = useStore();
  if (!state) return null;
  const started = state.ipo.preparationStartWeek ?? state.meta.week;
  const done = state.meta.week - started;
  return (
    <Panel icon="clipboard" title="IPO-Vorbereitung läuft">
      <p className="text-xs leading-relaxed text-dim">
        Prospekt, Audit, Legal — Woche {done}/8. Die Roadshow startet automatisch; danach hast du 3 Wochen für das Pricing.
        Nutze die Zeit: Jede KPI-Verbesserung fließt in die Bookbuilding-Spanne ein.
      </p>
    </Panel>
  );
}

function RoadshowPanel() {
  const { state, act, busy } = useStore();
  const ipo = state?.ipo;
  const lo = ipo?.bookLow ?? 1;
  const hi = ipo?.bookHigh ?? 2;
  const [price, setPrice] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const [armed, setArmed] = useState(false);
  const effPrice = price || Math.round(((lo + hi) / 2) * 100) / 100;

  useEffect(() => {
    if (!state) return;
    const h = setTimeout(() => {
      void api.ipoStatus(state.meta.gameId, effPrice).then((r) => setPreview(r.subscriptionPreview)).catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(h);
  }, [state, effPrice]);

  if (!state || !ipo) return null;
  const grossNew = Math.round((PRE_IPO_SHARES * 0.18) / 0.82) * effPrice;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel icon="send" title={`Roadshow — Pricing bis Woche ${ipo.roadshowEndsWeek}`}>
        <div className="mb-2 text-xs">
          Bookbuilding-Spanne: <span className="num font-bold">{lo.toFixed(2)} – {hi.toFixed(2)} €</span> je Aktie
        </div>
        <div className="mb-1 flex items-center gap-2">
          <input
            type="range"
            min={Math.round(lo * 0.75 * 100)}
            max={Math.round(hi * 1.08 * 100)}
            step={1}
            value={Math.round(effPrice * 100)}
            onChange={(e) => setPrice(Number(e.target.value) / 100)}
            className="flex-1"
          />
          <span className="num w-20 text-right text-sm font-bold">{effPrice.toFixed(2)} €</span>
        </div>
        <div className="mb-2 text-[11px]">
          Zeichnungsquote (live):{' '}
          <span className={`num font-bold ${preview !== null && preview < 1 ? 'text-bad' : preview !== null && preview > 1.6 ? 'text-warn' : 'text-good'}`}>
            {preview !== null ? `${preview.toFixed(2)}×` : '…'}
          </span>
          {preview !== null && preview < 0.9 && <span className="ml-2 text-bad">— bei diesem Preis platzt der IPO!</span>}
          {preview !== null && preview > 1.6 && <span className="ml-2 text-warn">— stark überzeichnet: Geld auf dem Tisch.</span>}
        </div>
        <div className="mb-3 text-[11px] text-dim">
          Bruttoerlös bei diesem Preis: <span className="num">{eur(grossNew)}</span> (neue Aktien, vor Bank-Fee)
        </div>
        <button
          className={armed ? 'btn-danger w-full' : 'btn-primary w-full'}
          disabled={busy || state.meta.status !== 'active'}
          onClick={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            setArmed(false);
            void act({ type: 'IPO_PRICE', pricePerShare: effPrice }, null);
          }}
        >
          {armed ? `Sicher? ${effPrice.toFixed(2)} € festsetzen!` : 'Preis festsetzen (unwiderruflich)'}
        </button>
        <p className="mt-2 text-[10px] text-dim">
          Das Listing läuft mit dem nächsten Wochenabschluss. Unter 0,9× Zeichnungsquote zieht die Bank den Deal — öffentlich.
        </p>
      </Panel>
      <Panel icon="mic" title="Roadshow-Q&A — institutionelle Investoren">
        <ThreadPane threadKey="roadshow" />
      </Panel>
    </div>
  );
}

function PublicPanel() {
  const { state } = useStore();
  if (!state) return null;
  const ipo = state.ipo;
  const data = ipo.priceHistory.map((p) => ({ week: p.week, kurs: p.price }));
  const first = ipo.offerPrice ?? 1;
  const cur = ipo.sharePrice ?? first;
  const perf = (cur / first - 1) * 100;
  const mcap = cur * ipo.sharesOutstanding;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Panel icon="trending-up" title="Aktienkurs">
          <div className="mb-2 flex items-baseline gap-4">
            <span className="num text-2xl font-bold">{cur.toFixed(2)} €</span>
            <span className={`num text-sm ${perf >= 0 ? 'text-good' : 'text-bad'}`}>
              {perf >= 0 ? '+' : ''}{perf.toFixed(1)} % seit Ausgabe ({first.toFixed(2)} €)
            </span>
          </div>
          <div className="mb-2 text-[11px] text-dim">
            Marktkapitalisierung: <span className="num">{eur(mcap)}</span> · {ipo.sharesOutstanding.toLocaleString('de-DE')} Aktien ·
            Zeichnungsquote damals {ipo.subscriptionRatio?.toFixed(2)}×
          </div>
          <div className="h-44">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <XAxis dataKey="week" tick={{ fontSize: 10 }} stroke="#556" />
                <YAxis tick={{ fontSize: 10 }} stroke="#556" domain={['auto', 'auto']} width={44} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 11 }} formatter={(v) => [`${Number(v).toFixed(2)} €`, 'Kurs']} labelFormatter={(w) => `Woche ${w}`} />
                <Line type="monotone" dataKey="kurs" stroke="#38bdf8" dot={false} strokeWidth={1.6} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Guidance & Pflichten">
          <div className="space-y-1.5 text-xs">
            <div>
              <span className="text-dim">Aktuelle Guidance: </span>
              <span className="num">{((ipo.guidanceGrowthMonthly ?? 0) * 100).toFixed(1)} %/M MRR-Wachstum</span>
            </div>
            <div>
              <span className="text-dim">Nächster Earnings-Call: </span>
              <span className="num">Woche {ipo.nextEarningsWeek ?? '—'}</span> <span className="text-dim">(Termin im Kalender — dort als Q&A spielbar)</span>
            </div>
            {ipo.pendingAdhocTopicDe && (
              <div className="rounded border border-bad/50 bg-bad/10 p-2 text-bad">
                ⚠ Ad-hoc-Pflicht offen: „{ipo.pendingAdhocTopicDe}" — Entscheidung liegt als Ereignis in der Inbox.
              </div>
            )}
          </div>
          <p className="mt-2 text-[10px] text-dim">
            Börsen-Regeln in diesem Simulator: Quartals-Calls gegen Guidance (beat/met/missed bewegt den Kurs), Ad-hoc-Pflicht bei
            kursrelevanten Ereignissen (Art. 17 MAR), Kurs folgt wöchentlich dem fairen Wert aus der Bewertungs-Logik plus Nachrichten.
          </p>
        </Panel>
      </div>
      <div className="space-y-4">
        <Panel title={`Earnings-Historie (${ipo.earningsHistory.length})`}>
          {ipo.earningsHistory.length === 0 ? (
            <p className="text-xs text-dim">Noch kein Call — der erste steht in Woche {ipo.nextEarningsWeek} an.</p>
          ) : (
            ipo.earningsHistory.slice().reverse().map((e, i) => (
              <div key={i} className="mb-2 flex items-baseline justify-between rounded border border-line bg-panel2 p-2 text-xs">
                <span>
                  W{e.week} ·{' '}
                  <span className={e.verdict === 'beat' ? 'text-good' : e.verdict === 'missed' ? 'text-bad' : 'text-ink'}>
                    {e.verdict === 'beat' ? 'ÜBERTROFFEN' : e.verdict === 'missed' ? 'VERFEHLT' : 'getroffen'}
                  </span>{' '}
                  <span className="text-dim">({pct(e.growthActual, 1)} vs. {pct(e.growthExpected, 1)}/M)</span>
                </span>
                <span className={`num ${e.priceReaction >= 0 ? 'text-good' : 'text-bad'}`}>
                  {e.priceReaction >= 0 ? '+' : ''}{(e.priceReaction * 100).toFixed(0)} %
                </span>
              </div>
            ))
          )}
        </Panel>
        <Panel icon="mic" title="Investor-Relations-Q&A">
          <ThreadPane threadKey="roadshow" />
        </Panel>
      </div>
    </div>
  );
}

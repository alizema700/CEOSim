import { useEffect, useState } from 'react';
import type { IdeaClassification, MaTarget, TermSheetOffer } from '@boardroom/shared';
import { CONSULTANT_FEE, MA_DD_FEE } from '@boardroom/shared';
import { useStore } from '../store.js';
import { api, type ConsultantReport } from '../api.js';
import { Bar, Modal, Panel } from '../components/ui.js';
import { eur, pct } from '../format.js';

/**
 * Strategie: Ideologie (bewertungsrelevant!), Ideen-System („Nichts ist nicht
 * vorgesehen"), Projekte — und ab Phase 5 Fundraising & M&A.
 */
export function StrategyView() {
  const { state } = useStore();
  const [tab, setTab] = useState<'ideen' | 'funding' | 'ma'>('ideen');
  if (!state) return null;
  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {(
          [
            ['ideen', '💡 Ideen & Projekte'],
            ['funding', '💎 Fundraising'],
            ['ma', '🤝 M&A-Zukäufe'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`chip ${tab === id ? 'chip-on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'ideen' && <IdeasTab />}
      {tab === 'funding' && <FundingTab />}
      {tab === 'ma' && <MaTab />}
    </div>
  );
}

function IdeasTab() {
  const { state, act, busy, setError } = useStore();
  const [ideaText, setIdeaText] = useState('');
  const [classifying, setClassifying] = useState(false);
  const [preview, setPreview] = useState<IdeaClassification | null>(null);

  if (!state) return null;
  const running = state.projects.filter((p) => p.status === 'running');
  const done = state.projects.filter((p) => p.status !== 'running');

  async function classify() {
    if (!state || ideaText.trim().length < 5) return;
    setClassifying(true);
    setError(null);
    try {
      const r = await api.classifyIdea(state.meta.gameId, ideaText.trim());
      setPreview(r.classification);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setClassifying(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Panel title="Ideologie — dein Versprechen (bewertungsrelevant)">
          <div className="space-y-1.5 text-xs">
            <div><span className="text-dim">Mission: </span>{state.identity.mission || '—'}</div>
            <div><span className="text-dim">Vision: </span>{state.identity.vision || '—'}</div>
            <div><span className="text-dim">Werte: </span>{state.identity.values.join(' · ')}</div>
            <div><span className="text-dim">Motto: </span>„{state.identity.motto}“</div>
          </div>
          <p className="mt-2 text-[10px] text-warn">
            Jede Entscheidung wird auf Konsistenz mit diesen Sätzen geprüft. Werte, die du brichst, kosten doppelt: innen Moral, außen Reputation.
          </p>
        </Panel>

        <Panel title="💡 Ideen-System — bring JEDE Idee ein">
          <textarea
            className="input mb-2 h-24 resize-none"
            placeholder={'„Wir starten einen Podcast" · „Wir bieten Schulungen an" · „4-Tage-Woche testen" · …\n\nDie KI klassifiziert Kosten, Dauer, Risiko und Erfolgswahrscheinlichkeit — du entscheidest, ob es ein Projekt wird.'}
            value={ideaText}
            onChange={(e) => setIdeaText(e.target.value)}
            maxLength={2000}
          />
          <button className="btn-primary w-full" disabled={classifying || ideaText.trim().length < 5} onClick={() => void classify()}>
            {classifying ? 'Klassifiziere …' : '→ Idee prüfen lassen'}
          </button>
        </Panel>

        {done.length > 0 && (
          <Panel title="Abgeschlossene Projekte">
            {done.slice(-8).reverse().map((p) => (
              <div key={p.id} className="mb-1.5 flex items-baseline justify-between text-xs">
                <span>{p.status === 'succeeded' ? '🎉' : '🪦'} {p.titleDe}</span>
                <span className="text-[10px] text-dim">W{p.startWeek}–{p.resolvedWeek}</span>
              </div>
            ))}
          </Panel>
        )}

        <ConsultantPanel />
      </div>

      <Panel title={`Laufende Projekte (${running.length}/5)`}>
        {running.length === 0 ? (
          <p className="text-xs text-dim">Keine laufenden Projekte. Ideen-Pipeline links füttern.</p>
        ) : (
          running.map((p) => (
            <div key={p.id} className="mb-3 border-b border-line/40 pb-2 last:border-0">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-bold">{p.titleDe}</span>
                <span className="num text-dim">{eur(p.costMonthly)}/M</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1"><Bar value={p.progress * 100} /></div>
                <span className="num text-[10px] text-dim">{Math.round(p.progress * 100)} %</span>
              </div>
              <div className="mt-0.5 text-[10px] text-dim">
                {p.categoryDe} · Auflösung Woche {p.startWeek + p.durationWeeks} · Erfolgschance {pct(p.successProb, 0)}
              </div>
            </div>
          ))
        )}
      </Panel>

      <div className="lg:col-span-2">
        <ReportsList />
      </div>

      {preview && (
        <Modal title="Klassifikation deiner Idee — die Entscheidung liegt bei dir" onClose={() => setPreview(null)} wide>
          <div className="mb-1 text-sm font-bold">{preview.titleDe}</div>
          <div className="mb-3 text-[10px] uppercase tracking-wider text-dim">{preview.categoryDe}</div>
          <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs md:grid-cols-4">
            <div><span className="text-dim">Einmalig</span><div className="num">{eur(preview.costOneOff)}</div></div>
            <div><span className="text-dim">Laufend</span><div className="num">{eur(preview.costMonthly)}/M</div></div>
            <div><span className="text-dim">Dauer</span><div className="num">{preview.durationWeeks} Wochen</div></div>
            <div><span className="text-dim">Erfolgschance</span><div className="num">{pct(preview.successProb, 0)}</div></div>
          </div>
          <p className="mb-2 text-xs leading-relaxed"><span className="text-dim">Begründung: </span>{preview.rationaleDe}</p>
          <p className="mb-2 text-xs leading-relaxed text-warn"><span className="text-dim">Risiko: </span>{preview.riskDe}</p>
          {preview.comparablesDe.length > 0 && (
            <div className="mb-3 rounded border border-line bg-panel2 p-2 text-[11px] leading-relaxed">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">Vergleichsfälle</div>
              {preview.comparablesDe.map((c, i) => (
                <p key={i}>· {c}</p>
              ))}
            </div>
          )}
          <div className="mb-3 text-[11px] text-dim">
            Wirkung bei Erfolg:{' '}
            {[
              preview.effects.leadGenFactor && `Leads ×${preview.effects.leadGenFactor.toFixed(2)}`,
              preview.effects.churnFactor && `Churn ×${preview.effects.churnFactor.toFixed(2)}`,
              preview.effects.moraleDelta && `Moral ${preview.effects.moraleDelta > 0 ? '+' : ''}${preview.effects.moraleDelta}`,
              preview.effects.pressDelta && `Presse ${preview.effects.pressDelta > 0 ? '+' : ''}${preview.effects.pressDelta}`,
              preview.effects.npsDelta && `NPS ${preview.effects.npsDelta > 0 ? '+' : ''}${preview.effects.npsDelta}`,
            ]
              .filter(Boolean)
              .join(' · ') || 'keine (reines Experiment)'}
            {' '}· jeweils gedeckelt & von der Engine geklemmt
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setPreview(null)}>Verwerfen</button>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => {
                const c = preview;
                setPreview(null);
                setIdeaText('');
                void act({ type: 'START_PROJECT', classification: c }, null);
              }}
            >
              ✅ Als Projekt starten
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function fmtM(v: number): string {
  return `${(v / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} M€`;
}

/** Fundraising: deterministische Term Sheets mit echten Trade-offs + Live-Verwässerungsmathe. */
function FundingTab() {
  const { state, act, busy } = useStore();
  const [offers, setOffers] = useState<TermSheetOffer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [vdAmount, setVdAmount] = useState(250_000);
  const week = state?.meta.week ?? 0;

  useEffect(() => {
    if (!state) return;
    setLoaded(false);
    void api
      .fundingOffers(state.meta.gameId)
      .then((r) => setOffers(r.offers))
      .catch(() => setOffers([]))
      .finally(() => setLoaded(true));
  }, [state?.meta.gameId, week]);

  if (!state) return null;
  const ceoNow = state.ceo.equityShare;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 lg:col-span-2">
        <Panel title="💎 Aktuelle Term Sheets — Angebote verfallen wöchentlich">
          {!loaded ? (
            <p className="text-xs text-dim">Lade Angebote …</p>
          ) : offers.length === 0 ? (
            <p className="text-xs text-dim">
              {week < 6
                ? `Noch keine Angebote — Investoren wollen erst ein paar Wochen Zahlen sehen (ab Woche 6).`
                : state.funding.rounds.length > 0
                  ? 'Keine Angebote: Nach einer Runde braucht der Markt ~ ein halbes Jahr, bis neue Term Sheets kommen.'
                  : 'Diese Woche liegen keine Angebote vor.'}
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {offers.map((o) => {
                const share = o.amount / (o.preMoney + o.amount);
                const ceoAfter = ceoNow * (1 - o.esopTopUp) * (1 - share);
                return (
                  <div key={o.id} className="rounded border border-line bg-panel2 p-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-bold">{o.investorName}</span>
                      <span className="num text-xs text-accent">{eur(o.amount)}</span>
                    </div>
                    <p className="mb-2 mt-0.5 text-[10px] text-dim">{o.investorStyleDe}</p>
                    <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div><span className="text-dim">Pre-Money</span><div className="num">{fmtM(o.preMoney)}</div></div>
                      <div><span className="text-dim">Post-Money</span><div className="num">{fmtM(o.preMoney + o.amount)}</div></div>
                      <div><span className="text-dim">Neue Anteile Investor</span><div className="num">{pct(share, 1)}</div></div>
                      <div>
                        <span className="text-dim">Dein Anteil</span>
                        <div className="num">
                          {pct(ceoNow, 1)} → <span className={ceoAfter < ceoNow * 0.8 ? 'text-warn' : ''}>{pct(ceoAfter, 1)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1">
                      <span className={`chip ${o.liquidationPref === '1x-participating' ? 'text-warn' : ''}`}>
                        {o.liquidationPref === '1x-participating' ? '⚠ 1x participating' : '✓ 1x non-participating'}
                      </span>
                      {o.boardSeat && <span className="chip text-warn">⚠ Board-Seat</span>}
                      {o.esopTopUp > 0 && <span className="chip text-warn">⚠ ESOP +{pct(o.esopTopUp, 0)} pre-money</span>}
                    </div>
                    <p className="mb-2 text-[10px] leading-relaxed text-dim">{o.noteDe}</p>
                    <button
                      className={armed === o.id ? 'btn-danger w-full' : 'btn-primary w-full'}
                      disabled={busy || state.meta.status !== 'active'}
                      onClick={() => {
                        if (armed !== o.id) {
                          setArmed(o.id);
                          return;
                        }
                        setArmed(null);
                        void act({ type: 'ACCEPT_TERM_SHEET', offer: o }, null);
                      }}
                    >
                      {armed === o.id ? 'Sicher? Klick bestätigt die Runde!' : 'Term Sheet annehmen'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-[10px] text-dim">
            Didaktik: Die Bewertung ist nur EINE Stellschraube. <b>Liquidation Preference</b>, <b>Board-Rechte</b> und{' '}
            <b>ESOP-Top-up</b> entscheiden oft über mehr Geld — nur eben erst beim Exit. Begriffe anklicken? Lernen → Glossar.
          </p>
        </Panel>
      </div>

      <Panel title="🏦 Venture Debt — Fremdkapital ohne Verwässerung">
        <p className="mb-2 text-[11px] leading-relaxed text-dim">
          Schneller Puffer für wachstumsstarke Firmen: teurer Zins (~13 % aufs Neuvolumen), aber keine Anteile. Bedingungen: ≥ 1,5 M€
          ARR, max. 25 % vom ARR, Runway ≥ 8 Wochen, nur einmal verfügbar.
        </p>
        <div className="mb-2 flex items-center gap-2">
          <input
            type="range"
            min={100_000}
            max={800_000}
            step={25_000}
            value={vdAmount}
            onChange={(e) => setVdAmount(Number(e.target.value))}
            className="flex-1"
          />
          <span className="num w-24 text-right text-xs">{eur(vdAmount)}</span>
        </div>
        <button
          className="btn w-full"
          disabled={busy || state.funding.ventureDebtTaken || state.meta.status !== 'active'}
          onClick={() => void act({ type: 'RAISE_VENTURE_DEBT', amount: vdAmount }, null)}
        >
          {state.funding.ventureDebtTaken ? 'Bereits gezogen' : `Venture Debt aufnehmen (${eur(vdAmount)})`}
        </button>
      </Panel>

      <Panel title="Runden-Historie">
        {state.funding.rounds.length === 0 ? (
          <p className="text-xs text-dim">Noch keine Finanzierungsrunde. Der Cap Table lebt im Finanzen-Tab.</p>
        ) : (
          state.funding.rounds.map((r, i) => (
            <div key={i} className="mb-2 rounded border border-line bg-panel2 p-2 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="font-bold">{r.investorName}</span>
                <span className="num">{eur(r.amount)}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-dim">
                Woche {r.week} · {fmtM(r.preMoney)} pre → {fmtM(r.postMoney)} post · {pct(r.newInvestorShare, 1)} ·{' '}
                {r.liquidationPref === '1x-participating' ? '1x participating' : '1x non-part.'}
                {r.boardSeat ? ' · Board-Seat' : ''}
              </div>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}

/** M&A: Kaufziele mit versteckten Red Flags — Due Diligence ist gekaufte Information. */
function MaTab() {
  const { state, act, busy } = useStore();
  const [armed, setArmed] = useState<string | null>(null);
  if (!state) return null;
  const targets = state.market.maTargets;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {targets.map((t) => (
        <MaCard key={t.id} t={t} armed={armed} setArmed={setArmed} busy={busy} act={act} cash={state.finance.cash} active={state.meta.status === 'active'} />
      ))}
      <div className="lg:col-span-2">
        <Panel title="Merkzettel M&A">
          <ul className="space-y-1 text-[11px] leading-relaxed text-dim">
            <li>· Kaufpreis ist Cash und sofort weg — Integration kostet zusätzlich Aufmerksamkeit, Moral und manchmal Kunden.</li>
            <li>· <b>Due Diligence</b> ({eur(MA_DD_FEE)}) deckt versteckte Risiken auf und drückt bei Befunden den Preis. Kauf ohne DD = alle Altlasten ungeprüft mitgekauft.</li>
            <li>· Der beworbene Churn ist eine Verkäufer-Zahl. Die echte steht im DD-Bericht — oder in deiner GuV, wenn es zu spät ist.</li>
            <li>· Vergleichsfälle in der Fall-Bibliothek: Daimler-Chrysler, HP/Autonomy, Amazon/AWS (Lernen → Fälle).</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function MaCard({
  t,
  armed,
  setArmed,
  busy,
  act,
  cash,
  active,
}: {
  t: MaTarget;
  armed: string | null;
  setArmed: (v: string | null) => void;
  busy: boolean;
  act: (a: import('@boardroom/shared').PlayerAction, h: null) => Promise<unknown>;
  cash: number;
  active: boolean;
}) {
  const multiple = t.askPrice / (t.mrr * 12);
  const affordable = t.askPrice <= cash * 0.85;
  return (
    <Panel title={`${t.name} ${t.status === 'acquired' ? '· ✅ übernommen' : t.status === 'withdrawn' ? '· zurückgezogen' : ''}`}>
      <p className="mb-2 text-[11px] leading-relaxed text-dim">{t.pitchDe}</p>
      <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-3">
        <div><span className="text-dim">Kaufpreis</span><div className="num">{eur(t.askPrice)}</div></div>
        <div><span className="text-dim">MRR</span><div className="num">{eur(t.mrr)}</div></div>
        <div><span className="text-dim">Multiple</span><div className="num">{multiple.toFixed(1)}× ARR</div></div>
        <div><span className="text-dim">Churn (laut Verkäufer)</span><div className="num">{pct(t.claimedMonthlyChurn, 1)}/M</div></div>
        <div><span className="text-dim">Team</span><div className="num">{t.employees} Personen</div></div>
        <div><span className="text-dim">Tech-Debt</span><div className="num">{t.techDebt}/100</div></div>
      </div>

      {t.ddDone || t.status !== 'available' ? (
        t.redFlags.length > 0 ? (
          <div className="mb-2 rounded border border-warn/40 bg-warn/5 p-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-warn">
              {t.ddDone ? 'DD-Befunde' : 'Eingekaufte Altlasten'} ({t.redFlags.length})
            </div>
            {t.redFlags.map((f) => (
              <p key={f.id} className="text-[11px] leading-relaxed">
                {'⚠'.repeat(f.severity)} {f.labelDe}
              </p>
            ))}
          </div>
        ) : (
          <p className="mb-2 text-[11px] text-good">✓ DD unauffällig — saubere Bücher.</p>
        )
      ) : (
        <p className="mb-2 rounded border border-line bg-panel2 p-2 text-[11px] text-dim">
          ❓ Versteckte Risiken unbekannt. Eine Due Diligence ({eur(MA_DD_FEE)}) deckt sie auf — und liefert Verhandlungshebel.
        </p>
      )}

      {t.status === 'available' && (
        <div className="flex gap-2">
          {!t.ddDone && (
            <button className="btn flex-1" disabled={busy || !active} onClick={() => void act({ type: 'MA_DUE_DILIGENCE', targetId: t.id }, null)}>
              🔍 Due Diligence ({eur(MA_DD_FEE)})
            </button>
          )}
          <button
            className={armed === t.id ? 'btn-danger flex-1' : 'btn-primary flex-1'}
            disabled={busy || !active || !affordable}
            title={affordable ? '' : 'Kaufpreis übersteigt 85 % der Kasse'}
            onClick={() => {
              if (armed !== t.id) {
                setArmed(t.id);
                return;
              }
              setArmed(null);
              void act({ type: 'MA_ACQUIRE', targetId: t.id }, null);
            }}
          >
            {armed === t.id ? 'Sicher? Klick kauft!' : affordable ? `Übernehmen (${eur(t.askPrice)})` : 'Kasse reicht nicht'}
          </button>
        </div>
      )}
    </Panel>
  );
}

/** KI-Unternehmensberater: buchbar pro Engagement — kostet echtes (Spiel-)Geld. */
function ConsultantPanel() {
  const { state, act, busy } = useStore();
  const [topic, setTopic] = useState<'churn' | 'pricing' | 'market' | 'costs'>('churn');
  if (!state) return null;
  const topics = [
    ['churn', 'Churn-Kohorten-Deepdive'],
    ['pricing', 'Pricing-Studie'],
    ['market', 'Markteintritts-Optionen'],
    ['costs', 'Kostenstruktur-Analyse'],
  ] as const;
  return (
    <Panel title={`🎩 Berater buchen (${eur(CONSULTANT_FEE)} pro Engagement)`}>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {topics.map(([id, label]) => (
          <button key={id} className={`chip ${topic === id ? 'chip-on' : ''}`} onClick={() => setTopic(id)}>
            {label}
          </button>
        ))}
      </div>
      <button className="btn w-full" disabled={busy} onClick={() => void act({ type: 'HIRE_CONSULTANT', topic }, null)}>
        Engagement beauftragen
      </button>
      <p className="mt-2 text-[10px] text-dim">
        Gute Struktur, echte Zahlen — aber nicht unfehlbar: Der Berater läuft auch mal Moden nach. Blind übernehmen ist keine
        Strategie; challengen schon.
      </p>
    </Panel>
  );
}

function ReportsList() {
  const { state } = useStore();
  const [reports, setReports] = useState<ConsultantReport[]>([]);
  useEffect(() => {
    if (!state) return;
    void api.listConsultant(state.meta.gameId).then((r) => setReports(r.reports)).catch(() => setReports([]));
  }, [state]);
  if (!state || reports.length === 0) return null;
  return (
    <Panel title={`Berater-Reports (${reports.length})`}>
      <div className="space-y-3">
        {reports.map((r, i) => (
          <details key={i} className="rounded border border-line bg-panel2 p-3" open={i === 0}>
            <summary className="cursor-pointer text-xs font-bold hover:text-accent">
              {r.titleDe} <span className="ml-1 font-normal text-dim">(W{r.week})</span>
            </summary>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {r.slides.map((s, j) => (
                <div key={j} className="rounded border border-line bg-bg p-2">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-accent">{s.titleDe}</div>
                  <ul className="space-y-0.5 text-[11px] leading-relaxed">
                    {s.bulletsDe.map((b, k) => (
                      <li key={k}>· {b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-2 rounded border border-good/40 bg-good/5 p-2 text-[11px]">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-good">Empfehlungen</div>
              {r.recommendationsDe.map((rec, k) => (
                <p key={k}>→ {rec}</p>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-warn">⚠ {r.caveatDe}</p>
          </details>
        ))}
      </div>
    </Panel>
  );
}

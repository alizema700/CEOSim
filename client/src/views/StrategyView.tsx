import { useEffect, useState } from 'react';
import type { IdeaClassification } from '@boardroom/shared';
import { CONSULTANT_FEE } from '@boardroom/shared';
import { useStore } from '../store.js';
import { api, type ConsultantReport } from '../api.js';
import { Bar, Modal, Panel } from '../components/ui.js';
import { eur, pct } from '../format.js';

/**
 * Strategie: Ideologie (bewertungsrelevant!), Ideen-System („Nichts ist nicht
 * vorgesehen") und laufende Projekte mit Fortschritt.
 */
export function StrategyView() {
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
        <p className="mt-2 text-[10px] text-dim">
          OKRs, M&A-Pipeline und Fundraising ziehen in späteren Phasen hier ein.
        </p>
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

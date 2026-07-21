import { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Panel } from '../components/ui.js';
import { Icon } from '../components/Icon.js';

/**
 * Presse: PM-Editor + Medienspiegel. Jede Veröffentlichung wird vom
 * Medien-Modul bewertet — inkl. Wahrheitsgehalt gegen den echten State.
 * Übertriebene Claims fliegen später auf.
 */
export function PressView() {
  const { state, setError } = useStore();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [releases, setReleases] = useState<Awaited<ReturnType<typeof api.listPress>>['releases']>([]);
  const [lastOutcome, setLastOutcome] = useState<{ articleDe: string; verdictDe: string; pressDelta: number; scandalProb: number } | null>(null);

  useEffect(() => {
    if (!state) return;
    void api.listPress(state.meta.gameId).then((r) => setReleases(r.releases)).catch(() => undefined);
  }, [state]);

  if (!state) return null;
  const gameOver = state.meta.status !== 'active';

  async function publish() {
    if (!state) return;
    setPublishing(true);
    setError(null);
    try {
      const r = await api.publishPress(state.meta.gameId, title.trim(), body.trim());
      setLastOutcome(r.outcome);
      setTitle('');
      setBody('');
      const list = await api.listPress(state.meta.gameId);
      setReleases(list.releases);
      useStore.setState({ state: r.state });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Panel title="Pressemitteilung verfassen">
          <input className="input mb-2" placeholder="Überschrift" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
          <textarea
            className="input mb-2 h-48 resize-none"
            placeholder={'Text der Mitteilung …\n\nTipp: Konkret und ehrlich schlägt „revolutionär". Das Medien-Modul prüft deine Claims gegen die echten Zahlen — Übertreibungen können Wochen später auffliegen.'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
          />
          <button className="btn-primary w-full" disabled={publishing || gameOver || title.trim().length < 3 || body.trim().length < 20} onClick={() => void publish()}>
            {publishing ? 'Die Redaktionen lesen …' : <><Icon name="send" size={13} /> Veröffentlichen</>}
          </button>
        </Panel>

        {lastOutcome && (
          <Panel title={`Medienecho (Presse ${lastOutcome.pressDelta >= 0 ? '+' : ''}${lastOutcome.pressDelta})`}>
            <p className="mb-2 whitespace-pre-wrap rounded border border-line bg-panel2 p-2 text-xs leading-relaxed">{lastOutcome.articleDe}</p>
            <p className="text-[11px] text-dim">Einordnung: {lastOutcome.verdictDe}</p>
            {lastOutcome.scandalProb > 0.05 && (
              <p className="mt-1 text-[11px] text-warn">⚠ Deine Claims stehen unter Beobachtung — es besteht ein Risiko, dass sie später widerlegt werden.</p>
            )}
          </Panel>
        )}
      </div>

      <div className="space-y-4">
        <Panel title="Medienspiegel">
          {state.pressLog.length === 0 && releases.length === 0 ? (
            <p className="text-xs text-dim">Noch keine Berichterstattung. Ruhe ist auch eine Nachricht.</p>
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {[...state.pressLog].reverse().map((p, i) => (
                <div key={i} className="flex items-baseline gap-2 text-xs">
                  <Icon name="dot" size={11} className={`shrink-0 ${p.tone === 'positive' ? 'text-good' : p.tone === 'negative' ? 'text-bad' : 'text-faint'}`} />
                  <span className="text-ink">{p.topicDe}</span>
                  <span className="ml-auto shrink-0 text-[9px] text-dim">W{p.week}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Deine Pressemitteilungen">
          {releases.length === 0 ? (
            <p className="text-xs text-dim">Noch keine PM veröffentlicht.</p>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {releases.map((r, i) => (
                <div key={i} className="border-b border-line/40 pb-2 last:border-0">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-bold">{r.title}</span>
                    <span className={`num ${r.pressDelta >= 0 ? 'text-good' : 'text-bad'}`}>{r.pressDelta >= 0 ? '+' : ''}{r.pressDelta} · W{r.week}</span>
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[10px] text-dim hover:text-ink">Artikel & Einordnung</summary>
                    <p className="mt-1 whitespace-pre-wrap rounded bg-panel2 p-2 text-[11px] leading-relaxed">{r.article}</p>
                    <p className="mt-1 text-[10px] text-dim">{r.verdict}</p>
                  </details>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

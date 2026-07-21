import { computeLegacy } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Bar, GradeBadge, Modal, PullQuote, scoreColor } from '../components/ui.js';
import { eur } from '../format.js';

/**
 * Amtszeit-Bilanz (Phase 13): bewertet die gesamte Amtszeit über sechs
 * Dimensionen. Erscheint automatisch bei Spielende und ist als Vorschau
 * jederzeit aus der CEO-Ansicht abrufbar.
 */
export function LegacyModal() {
  const { state, legacyOpen, setLegacyOpen, leaveGame } = useStore();
  if (!state || !legacyOpen) return null;
  const r = computeLegacy(state);
  const final = state.meta.status !== 'active';

  return (
    <Modal title={final ? 'Amtszeit-Bilanz' : 'Amtszeit-Bilanz · Vorschau'} onClose={() => setLegacyOpen(false)} wide>
      {/* Aufmacher */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-4">
        <div className="min-w-0 flex-1">
          <div className="kicker text-dim">{final ? 'Amtsende' : `Zwischenstand · Woche ${r.weeks}`}</div>
          <h2 className="serif text-[30px] leading-[1.1] text-ink" style={{ maxWidth: '22ch', textWrap: 'balance' }}>{r.titleDe}</h2>
          {r.endingDe && <p className="mt-1.5 max-w-[54ch] text-[12.5px] leading-relaxed text-dim">{r.endingDe}</p>}
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-[42px] leading-none text-accent">{r.overall}<span className="text-[15px] text-dim">/100</span></div>
          <div className="mt-1.5 flex justify-end"><GradeBadge grade={r.grade} /></div>
        </div>
      </div>

      {/* Dimensionen */}
      <div className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
        {r.dimensions.map((d) => (
          <div key={d.key}>
            <div className="flex items-baseline justify-between text-[12px]"><span className="text-ink">{d.labelDe}</span><span className="num">{d.score}</span></div>
            <div className="mt-1"><Bar value={d.score} color={scoreColor(d.score)} /></div>
            <div className="mt-0.5 text-[10.5px] leading-tight text-dim">{d.noteDe}</div>
          </div>
        ))}
      </div>

      {/* Urteil — die erste Zeile als herausgehobenes Zitat */}
      {r.verdictDe.length > 0 && (
        <div className="mt-4">
          <PullQuote>{r.verdictDe[0]}</PullQuote>
          {r.verdictDe.slice(1).map((v, i) => (
            <p key={i} className="mt-1.5 text-[12.5px] leading-relaxed text-ink2">{v}</p>
          ))}
        </div>
      )}

      {/* Arc + Meilensteine */}
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <div className="kicker mb-1.5">Von Amtsantritt bis heute</div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-wider text-dim">
                <th className="py-1 text-left">Kennzahl</th><th className="py-1 text-right">Start</th><th className="py-1 text-right">Ende</th>
              </tr>
            </thead>
            <tbody>
              {r.arc.map((a, i) => (
                <tr key={i} className="border-b border-line/40 last:border-0">
                  <td className="py-1 text-dim">{a.labelDe}</td>
                  <td className="num py-1 text-right text-dim">{a.startDe}</td>
                  <td className={`num py-1 text-right ${a.better ? 'text-good' : 'text-bad'}`}>{a.endDe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="kicker mb-1.5">Meilensteine der Amtszeit</div>
          {r.milestones.length === 0 ? (
            <p className="text-[11px] italic text-dim">Keine großen Meilensteine — eine ruhige Amtszeit.</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1 text-[11px]">
              {r.milestones.map((m, i) => (
                <div key={i} className="flex gap-2 border-b border-line/30 py-0.5 last:border-0">
                  <span className="num w-8 shrink-0 text-dim">W{m.week}</span>
                  <span className="text-ink2">{m.labelDe}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Persönliches Ergebnis */}
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-center">
        <div><div className="kicker text-[8.5px]">Persönliches Vermögen</div><div className="num text-[17px] text-accent">{eur(r.personal.netWorth)}</div></div>
        <div><div className="kicker text-[8.5px]">CEO-Marke</div><div className="num text-[17px]">{Math.round(r.personal.brand)}/100</div></div>
        <div><div className="kicker text-[8.5px]">Energie</div><div className="num text-[17px]">{Math.round(r.personal.energy)}/100</div></div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        {final && <button className="btn" onClick={() => { setLegacyOpen(false); leaveGame(); }}>Zur Übersicht</button>}
        <button className="btn-primary" onClick={() => setLegacyOpen(false)}>{final ? 'Bilanz schließen' : 'Weiter regieren'}</button>
      </div>
    </Modal>
  );
}

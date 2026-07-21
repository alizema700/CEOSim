import { STRIKE_KIND_LABELS, type CounterCompetitorAction } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Bar, Modal } from '../components/ui.js';
import { Icon, type IconName } from '../components/Icon.js';

type Mode = CounterCompetitorAction['mode'];

/**
 * Wettbewerber-Angriff (Phase 21): das Konter-Cockpit. Angreifer-Dossier,
 * Intensität & Frist und vier Reaktionen (matchen / differenzieren / aushalten /
 * Gegenoffensive).
 */
export function RivalryModal() {
  const { state, rivalryOpen, setRivalryOpen, act, busy } = useStore();
  if (!state || !rivalryOpen || state.rivalry.status !== 'active') return null;
  const r = state.rivalry;
  const active = state.meta.status === 'active';
  const weeksLeft = r.deadlineWeek !== null ? r.deadlineWeek - state.meta.week : null;
  const hot = r.intensity > 55;

  const respond = (mode: Mode) => {
    void act({ type: 'COUNTER_COMPETITOR', mode }, null);
    setRivalryOpen(false);
  };

  const options: { mode: Mode; icon: IconName; label: string; desc: string; tone: string }[] = [
    { mode: 'match', icon: 'shield', label: 'Mitgehen (matchen)', desc: 'Den Zug spiegeln — Rabatt/Gegenkampagne. Neutralisiert die Kampagne schnell, kostet aber Marge/Cash (~35 k€).', tone: 'text-ink' },
    { mode: 'differentiate', icon: 'target', label: 'Differenzieren', desc: 'Auf die eigenen Stärken setzen statt mitzubieten. Günstig — trägt aber nur bei wirklich starkem Produkt (NPS, wenig Tech-Debt).', tone: 'text-accent' },
    { mode: 'ignore', icon: 'clock', label: 'Aushalten', desc: 'Kurs halten, Ressourcen sparen. Ohne Antwort kann sich der Angriff aber verschärfen.', tone: 'text-warn' },
    { mode: 'counter', icon: 'bolt', label: 'Gegenoffensive', desc: 'Zurückschlagen: aggressives Marketing/Abwerben. Drückt die Intensität und knabbert am Anteil des Rivalen (~25 k€).', tone: 'text-ink' },
  ];

  return (
    <Modal title="Wettbewerber-Angriff" onClose={() => setRivalryOpen(false)} wide>
      <div className="border-b-2 border-bad pb-3">
        <div className="kicker text-bad">
          {STRIKE_KIND_LABELS[r.kind]}{weeksLeft !== null ? ` · Frist ${Math.max(0, weeksLeft)} Wo.` : ''}
        </div>
        <h2 className="serif text-[26px] leading-tight text-ink">{r.headlineDe}</h2>
        <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-ink2">{r.detailDe}</p>
      </div>

      <div className="mt-3 border border-line bg-panel2 p-3" style={{ borderRadius: 2 }}>
        <div className="flex items-baseline justify-between">
          <span className="kicker text-[9px]">Intensität des Angriffs</span>
          <span className={`num text-[15px] ${hot ? 'text-bad' : 'text-warn'}`}>{Math.round(r.intensity)}/100</span>
        </div>
        <div className="mt-1.5"><Bar value={r.intensity} color={hot ? 'bg-bad' : 'bg-warn'} /></div>
        <p className="mt-1 text-[10px] leading-relaxed text-dim">
          Die Intensität steuert den Druck auf Nachfrage, Abschlüsse oder Fluktuation (je nach Angriffsart). Verstreicht die
          Frist ohne Antwort, legt der Rivale nach. Die Wirkung deines Konters hängt an Strategie & Leadership des CEO.
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.mode}
            className="flex flex-col items-start border border-line p-2.5 text-left transition-colors hover:border-accent disabled:opacity-50"
            style={{ borderRadius: 2 }}
            disabled={busy || !active}
            onClick={() => respond(o.mode)}
          >
            <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${o.tone}`}><Icon name={o.icon} size={15} /> {o.label}</span>
            <span className="mt-0.5 text-[10.5px] leading-tight text-dim">{o.desc}</span>
          </button>
        ))}
      </div>
      {r.responsesUsed.length > 0 && <p className="mt-2 text-[10px] text-dim">Bisher gekontert: {r.responsesUsed.length}×</p>}
    </Modal>
  );
}

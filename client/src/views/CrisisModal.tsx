import { CRISIS_STAGE_LABELS, type CrisisRespondAction } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Bar, Modal } from '../components/ui.js';
import { Icon, type IconName } from '../components/Icon.js';

type Mode = CrisisRespondAction['mode'];

const KIND_LABEL: Record<string, string> = {
  datenschutz: 'Datenschutz-Krise',
  social: 'Social-Media-Shitstorm',
  produkt: 'Produkt-Krise',
  führung: 'Führungs-Krise',
  nachhaltigkeit: 'Nachhaltigkeits-Krise',
};

/**
 * Krisenmanagement (Phase 15): das Reaktions-Cockpit. Sturm-Dossier, Schwere &
 * Eskalationsstufe, Reaktionsfenster und vier Reaktionen (entschuldigen,
 * gegenhalten, schweigen, transparent aufklären).
 */
export function CrisisModal() {
  const { state, crisisOpen, setCrisisOpen, act, busy } = useStore();
  if (!state || !crisisOpen || state.crisis.status !== 'active') return null;
  const c = state.crisis;
  const active = state.meta.status === 'active';
  const weeksLeft = c.deadlineWeek !== null ? c.deadlineWeek - state.meta.week : null;
  const sevBad = c.severity > 50;

  const respond = (mode: Mode) => {
    void act({ type: 'CRISIS_RESPOND', mode }, null);
    setCrisisOpen(false);
  };

  const responses: { mode: Mode; icon: IconName; label: string; desc: string; tone: string }[] = [
    { mode: 'apologize', icon: 'megaphone', label: 'Öffentlich entschuldigen', desc: 'Fehler einräumen, Betroffene adressieren. Nimmt der Empörung schnell die Spitze — wirkt aber angreifbar (Investoren sehen Schwäche).', tone: 'text-ink' },
    { mode: 'defend', icon: 'shield', label: 'Mit Fakten gegenhalten', desc: 'Die eigene Position klar vertreten. Trägt bei haltbarer Lage — bei starker Empörung Öl ins Feuer.', tone: 'text-ink' },
    { mode: 'silent', icon: 'clock', label: 'Kein Kommentar', desc: 'Abwarten, dass der Sturm verebbt. Kein Sofort-Preis — aber ohne Gegenstimme kann er sich hochschaukeln.', tone: 'text-warn' },
    { mode: 'investigate', icon: 'search', label: 'Transparent aufklären', desc: 'Externe Aufklärung/Audit (~80 k€). Der glaubwürdigste, nachhaltigste Weg — kostet Geld und etwas Zeit.', tone: 'text-accent' },
  ];

  return (
    <Modal title="Öffentliche Krise" onClose={() => setCrisisOpen(false)} wide>
      <div className="border-b-2 border-bad pb-3">
        <div className="kicker text-bad">
          {KIND_LABEL[c.kind]} · Stufe {c.stage} ({CRISIS_STAGE_LABELS[c.stage] ?? '—'})
          {weeksLeft !== null ? ` · Frist ${Math.max(0, weeksLeft)} Wo.` : ''}
        </div>
        <h2 className="serif text-[26px] leading-tight text-ink">{c.headlineDe}</h2>
        <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-ink2">{c.sparkDe}</p>
      </div>

      <div className="mt-3 border border-line bg-panel2 p-3" style={{ borderRadius: 2 }}>
        <div className="flex items-baseline justify-between">
          <span className="kicker text-[9px]">Schwere des Sturms</span>
          <span className={`num text-[15px] ${sevBad ? 'text-bad' : 'text-warn'}`}>{Math.round(c.severity)}/100</span>
        </div>
        <div className="mt-1.5"><Bar value={c.severity} color={sevBad ? 'bg-bad' : 'bg-warn'} /></div>
        <p className="mt-1 text-[10px] leading-relaxed text-dim">
          Je höher die Schwere, desto stärker leiden Presse-Reputation, Kundenbindung und (ab Stufe 2) das Board-Vertrauen.
          Verstreicht die Frist ohne glaubwürdige Reaktion, eskaliert der Sturm eine Stufe. Deine Wirkung hängt an CEO-Marke,
          Kommunikation und Board-Rückhalt.
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {responses.map((r) => (
          <button
            key={r.mode}
            className="flex flex-col items-start border border-line p-2.5 text-left transition-colors hover:border-accent disabled:opacity-50"
            style={{ borderRadius: 2 }}
            disabled={busy || !active}
            onClick={() => respond(r.mode)}
          >
            <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${r.tone}`}><Icon name={r.icon} size={15} /> {r.label}</span>
            <span className="mt-0.5 text-[10.5px] leading-tight text-dim">{r.desc}</span>
          </button>
        ))}
      </div>
      {c.responsesUsed.length > 0 && <p className="mt-2 text-[10px] text-dim">Bisher reagiert: {c.responsesUsed.length}× · zuletzt {c.responsesUsed[c.responsesUsed.length - 1]}</p>}
    </Modal>
  );
}

import { acceptanceShare, type TakeoverRespondAction } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Bar, Modal } from '../components/ui.js';
import { Icon, type IconName } from '../components/Icon.js';
import { eur, pct } from '../format.js';

type Mode = TakeoverRespondAction['mode'];

const KIND_LABEL: Record<string, string> = {
  stratege: 'Strategischer Wettbewerber',
  finanzinvestor: 'Private-Equity-Haus',
  aktivist: 'Aktivistischer Investor',
};

/**
 * Feindliche Übernahme (Phase 14): das Verteidigungs-Cockpit. Bieter-Dossier,
 * Angebot & Prämie, kapitalgewichtete Aktionärslage und vier Reaktionen.
 */
export function TakeoverModal() {
  const { state, takeoverOpen, setTakeoverOpen, act, busy } = useStore();
  if (!state || !takeoverOpen || state.takeover.status === 'none') return null;
  const t = state.takeover;
  const active = state.meta.status === 'active';
  const isTender = t.status === 'tender';
  const acc = acceptanceShare(state, t.premiumPct, t.defenseResistance);
  const weeksLeft = t.deadlineWeek !== null ? t.deadlineWeek - state.meta.week : null;

  const respond = (mode: Mode) => {
    void act({ type: 'TAKEOVER_RESPOND', mode }, null);
    if (mode === 'accept' || mode === 'poison_pill') setTakeoverOpen(false);
  };

  const defenses: { mode: Mode; icon: IconName; label: string; desc: string; tone: string; show: boolean }[] = [
    { mode: 'rally', icon: 'megaphone', label: 'Aktionäre überzeugen', desc: 'Die Standalone-Story verkaufen — wirkt über Board-Vertrauen, CEO-Marke & Kommunikation. Senkt die Annahmequote.', tone: 'text-ink', show: true },
    { mode: 'negotiate', icon: 'trending-up', label: 'Höher nachverhandeln', desc: 'Die Prämie hochtreiben — mehr Wert für alle beim Exit. Zu gierig, und der Bieter springt ab.', tone: 'text-ink', show: isTender },
    { mode: 'poison_pill', icon: 'skull', label: 'Giftpille zünden', desc: 'Verwässert den Angreifer und sichert die Unabhängigkeit — aber Investoren strafen die Entrenchment (~120 k€, −Reputation, −Vertrauen).', tone: 'text-warn', show: true },
    { mode: 'accept', icon: 'handshake', label: 'Angebot annehmen (Exit)', desc: 'Zum Höchstpreis verkaufen. Deine Amtszeit endet — die Prämie ist dafür sicher auf deinem Konto.', tone: 'text-accent', show: isTender },
  ];

  return (
    <Modal title="Feindliche Übernahme" onClose={() => setTakeoverOpen(false)} wide>
      <div className="border-b-2 border-bad pb-3">
        <div className="kicker text-bad">{isTender ? 'Übernahmeangebot liegt vor' : 'Ein Bieter sammelt Anteile'}{weeksLeft !== null ? ` · Frist ${Math.max(0, weeksLeft)} Wo.` : ''}</div>
        <h2 className="serif text-[26px] leading-tight text-ink">{t.bidderName}</h2>
        <div className="kicker mt-0.5 text-dim">{KIND_LABEL[t.bidderKind]}</div>
        <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-ink2">{t.bidderPitchDe}</p>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <div><div className="kicker text-[8.5px]">Beteiligung des Bieters</div><div className="num text-[18px]">{pct(t.toeholdStake, 1)}</div></div>
        {isTender && <div><div className="kicker text-[8.5px]">Angebot</div><div className="num text-[18px] text-accent">{eur(t.offerValue ?? 0)}</div><div className="text-[10px] text-dim">+{(t.premiumPct * 100).toFixed(0)} % Prämie</div></div>}
        <div><div className="kicker text-[8.5px]">Dein Anteil wert (netto)</div><div className="num text-[18px]">{eur((t.offerValue ?? 0) * state.ceo.equityShare * 0.72)}</div><div className="text-[10px] text-dim">nach ~28 % KapESt</div></div>
      </div>

      <div className="mt-3 border border-line bg-panel2 p-3" style={{ borderRadius: 2 }}>
        <div className="flex items-baseline justify-between">
          <span className="kicker text-[9px]">Anteile, die das Angebot annehmen würden</span>
          <span className={`num text-[15px] ${acc > 0.5 ? 'text-bad' : 'text-good'}`}>{pct(acc, 0)}</span>
        </div>
        <div className="mt-1.5"><Bar value={acc * 100} color={acc > 0.5 ? 'bg-bad' : 'bg-good'} /></div>
        <p className="mt-1 text-[10px] leading-relaxed text-dim">
          Über 50 % = die Übernahme kommt durch. Verstreicht die Frist ohne Reaktion, entscheiden die Aktionäre selbst.
          {t.defenseResistance > 0 ? ` Deine Verteidigung senkt die Quote bereits (Widerstand +${(t.defenseResistance * 100).toFixed(0)} pp).` : ''}
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {defenses.filter((d) => d.show).map((d) => (
          <button key={d.mode} className="flex flex-col items-start border border-line p-2.5 text-left transition-colors hover:border-accent disabled:opacity-50" style={{ borderRadius: 2 }} disabled={busy || !active} onClick={() => respond(d.mode)}>
            <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${d.tone}`}><Icon name={d.icon} size={15} /> {d.label}</span>
            <span className="mt-0.5 text-[10.5px] leading-tight text-dim">{d.desc}</span>
          </button>
        ))}
      </div>
      {t.defensesUsed.length > 0 && <p className="mt-2 text-[10px] text-dim">Bisher unternommen: {t.defensesUsed.join(' · ')}</p>}
    </Modal>
  );
}

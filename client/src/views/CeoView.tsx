import { useState } from 'react';
import { balancedFocus, ceoNetWorth, FOCUS_POINTS, type CeoFocus } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Bar, Drill, Panel } from '../components/ui.js';
import { Icon, type IconName } from '../components/Icon.js';
import { eur, num, pct } from '../format.js';

/**
 * CEO (Phase 12): der Mensch hinter dem Amt — persönliches Vermögen, Energie/
 * Gesundheit, wöchentlicher Fokus, öffentliche Marke und Coaching. Macht die
 * Rolle greifbar und die Equity-/Dividenden-/IPO-Entscheidungen persönlich.
 */

const FOCUS_META: { key: keyof CeoFocus; label: string; hint: string }[] = [
  { key: 'produkt', label: 'Produkt', hint: 'Velocity ↑' },
  { key: 'vertrieb', label: 'Vertrieb', hint: 'Leads & Win-Rate ↑' },
  { key: 'team', label: 'Team', hint: 'Bindung ↑, Fluktuation ↓' },
  { key: 'investoren', label: 'Investoren', hint: 'Board-Vertrauen ↑' },
  { key: 'aussenwirkung', label: 'Außenwirkung', hint: 'Presse & Arbeitgebermarke ↑' },
];

function energyColor(e: number): string {
  return e >= 60 ? 'bg-good' : e >= 30 ? 'bg-warn' : 'bg-bad';
}
function energyLabel(e: number): string {
  return e >= 75 ? 'ausgeruht & präsent' : e >= 50 ? 'stabil, aber gefordert' : e >= 30 ? 'ausgelaugt — aufpassen' : 'Burnout-Gefahr';
}

export function CeoView() {
  const { state } = useStore();
  if (!state) return null;
  const ceo = state.ceo;
  const nw = ceoNetWorth(state);

  return (
    <div className="space-y-8">
      {/* Kopf */}
      <section>
        <div className="kicker">Du als CEO</div>
        <h2 className="serif inline-flex items-center gap-2 text-[34px] leading-tight"><Icon name="crown" size={26} /> {state.playerProfile.ceoName}</h2>
        <div className="kicker mt-1 text-dim">
          {state.legal.rechtsform === 'AG' ? 'Vorstandsvorsitz' : 'Geschäftsführung'} · {eur(ceo.salaryMonthly)}/M · Anteil {pct(ceo.equityShare, 1)} · CEO-Marke {Math.round(ceo.reputation)}/100
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {/* Persönliches Vermögen */}
        <Panel title="Persönliches Vermögen">
          <div className="flex items-baseline justify-between">
            <span className="kicker text-[9px]">Netto-Vermögen (geschätzt)</span>
            <span className="num text-[26px] text-accent">{eur(nw.total)}</span>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            <VwRow label="Anteilswert (Equity)" v={nw.equityValue} total={nw.total} color="#2f7f79" hint={nw.sharePrice !== null ? `${pct(ceo.equityShare, 1)} × Börsenwert (Kurs ${eur(nw.sharePrice, false)})` : `${pct(ceo.equityShare, 1)} × Unternehmensbewertung`} />
            <VwRow label="Angespartes Netto (Gehalt + Dividenden)" v={nw.netCash} total={nw.total} color="#b8791f" hint="kumuliert, nach ~42 % persönlicher Steuer" />
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-dim">
            Der Löwenanteil deines Vermögens steckt im Anteil — er lebt und stirbt mit der Bewertung. Deshalb wirken Fundraising (Verwässerung), Dividende (Auszahlung) und IPO (Liquidität) direkt auf dein privates Konto.
          </p>
        </Panel>

        {/* Energie / Gesundheit */}
        <EnergyPanel />
      </section>

      {/* Wochenfokus */}
      <FocusPanel />

      {/* Öffentliche Rolle */}
      <PublicPanel />

      {/* Kompetenzen & Coaching */}
      <CoachPanel />

      {/* Amtszeit-Bilanz & Rücktritt */}
      <TenurePanel />
    </div>
  );
}

function TenurePanel() {
  const { state, act, busy, setLegacyOpen } = useStore();
  const [confirming, setConfirming] = useState(false);
  if (!state) return null;
  const active = state.meta.status === 'active';
  return (
    <section className="rule-top flex flex-wrap items-center justify-between gap-3 pt-3.5">
      <div>
        <div className="kicker text-ink">Amtszeit</div>
        <p className="mt-0.5 max-w-[52ch] text-[11px] leading-relaxed text-dim">
          Deine Amtszeit-Bilanz bewertet die ganze Zeit an der Spitze über sechs Dimensionen. Jederzeit als Vorschau — oder du schließt sie mit einem Rücktritt bewusst ab.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => setLegacyOpen(true)}>Amtszeit-Bilanz (Vorschau)</button>
        {active && !confirming && <button className="btn border-bad text-bad" onClick={() => setConfirming(true)}>Zurücktreten …</button>}
        {active && confirming && (
          <>
            <button className="btn" onClick={() => setConfirming(false)}>Abbrechen</button>
            <button className="btn-primary" style={{ background: '#c2453d' }} disabled={busy} onClick={() => { setConfirming(false); void act({ type: 'STEP_DOWN' }, null); }}>
              Rücktritt bestätigen (endgültig)
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function VwRow({ label, v, total, color, hint }: { label: string; v: number; total: number; color: string; hint: string }) {
  const p = total > 0 ? Math.max(0, (v / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2" style={{ background: color, borderRadius: 1 }} />{label}</span>
        <span className="num">{eur(v)}</span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-panel2" style={{ borderRadius: 1 }}><div className="h-full" style={{ width: `${p}%`, background: color }} /></div>
      <div className="mt-0.5 text-[10px] text-dim">{hint}</div>
    </div>
  );
}

function EnergyPanel() {
  const { state, act, busy } = useStore();
  if (!state) return null;
  const e = state.ceo.energy;
  const active = state.meta.status === 'active';
  return (
    <Panel title="Energie & Gesundheit">
      <div className="flex items-baseline justify-between">
        <span className="kicker text-[9px]">Energie-Level</span>
        <span className={`num text-[26px] ${e >= 60 ? 'text-good' : e >= 30 ? 'text-warn' : 'text-bad'}`}>{Math.round(e)}/100</span>
      </div>
      <div className="mt-2"><Bar value={e} color={energyColor(e)} /></div>
      <div className="mt-1 text-[11px] text-dim">{energyLabel(e)}</div>
      <button className="btn mt-4 w-full" disabled={busy || !active} onClick={() => void act({ type: 'CEO_REST' }, null)}>
        <Icon name="leaf" size={14} /> Auszeit nehmen (+Energie)
      </button>
      <p className="mt-2 text-[10px] leading-relaxed text-dim">
        Krisen, Bewährung und ein stark zugespitzter Fokus zehren an der Energie; Erholung und Coaching bauen sie auf. Niedrige Energie schwächt die Wirkung deines Fokus — Selbstführung ist Teil der Chefaufgabe.
      </p>
    </Panel>
  );
}

function FocusPanel() {
  const { state, act, busy } = useStore();
  const [f, setF] = useState<CeoFocus | null>(null);
  if (!state) return null;
  const cur = f ?? state.ceo.focus;
  const total = FOCUS_META.reduce((s, m) => s + cur[m.key], 0);
  const remaining = FOCUS_POINTS - total;
  const active = state.meta.status === 'active';
  const changed = FOCUS_META.some((m) => cur[m.key] !== state.ceo.focus[m.key]);
  const set = (key: keyof CeoFocus, d: number) => {
    const next = { ...cur, [key]: Math.max(0, Math.min(FOCUS_POINTS, cur[key] + d)) };
    if (FOCUS_META.reduce((s, m) => s + next[m.key], 0) <= FOCUS_POINTS || d < 0) setF(next);
  };

  return (
    <Panel title={`Wochenfokus · ${FOCUS_POINTS} Punkte verteilen`}>
      <div className="grid gap-2.5 sm:grid-cols-5">
        {FOCUS_META.map((m) => (
          <div key={m.key} className="border border-line p-2 text-center" style={{ borderRadius: 2 }}>
            <div className="kicker text-[8.5px]">{m.label}</div>
            <div className="mt-1 flex items-center justify-center gap-2">
              <button className="num h-5 w-5 border border-line text-[13px] leading-none hover:border-accent disabled:opacity-30" disabled={!active || cur[m.key] <= 0} onClick={() => set(m.key, -1)}>−</button>
              <span className={`num w-4 text-[16px] ${cur[m.key] > 1 ? 'text-accent' : cur[m.key] === 0 ? 'text-dim' : 'text-ink'}`}>{cur[m.key]}</span>
              <button className="num h-5 w-5 border border-line text-[13px] leading-none hover:border-accent disabled:opacity-30" disabled={!active || remaining <= 0} onClick={() => set(m.key, +1)}>+</button>
            </div>
            <div className="mt-1 text-[9px] leading-tight text-dim">{m.hint}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className={`num text-[11px] ${remaining === 0 ? 'text-good' : 'text-warn'}`}>{remaining === 0 ? '✓ alle Punkte verteilt' : `${remaining} Punkt(e) übrig`}</span>
        <div className="flex gap-2">
          <button className="btn" disabled={!active || !changed} onClick={() => setF(balancedFocus())}>Ausgeglichen</button>
          <button className="btn-primary" disabled={busy || !active || remaining !== 0 || !changed} onClick={() => { void act({ type: 'SET_CEO_FOCUS', focus: cur }, null); setF(null); }}>Fokus setzen</button>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-dim">
        Über 1 Punkt = Rückenwind im Bereich, 0 = spürbarer Gegenwind. Man kann sich nicht um alles gleichzeitig kümmern — die Kunst ist, den Fokus auf das größte Problem der Woche zu legen. Ausgeglichen ist neutral & nachhaltig.
      </p>
    </Panel>
  );
}

function PublicPanel() {
  const { state, act, busy } = useStore();
  if (!state) return null;
  const active = state.meta.status === 'active';
  const rep = state.reputation;
  const appearances: { kind: 'interview' | 'keynote' | 'thought-leadership'; icon: IconName; label: string; cost: string }[] = [
    { kind: 'interview', icon: 'mic', label: 'Medien-Interview', cost: '3 k€ · −8 Energie' },
    { kind: 'keynote', icon: 'megaphone', label: 'Konferenz-Keynote', cost: '9 k€ · −14 Energie' },
    { kind: 'thought-leadership', icon: 'pen', label: 'Fachbeitrag', cost: '1,5 k€ · −6 Energie' },
  ];
  return (
    <Panel title="Öffentliche Rolle · die CEO-Marke">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <RepRow label="CEO-Marke" v={state.ceo.reputation} />
            <RepRow label="Presse" v={rep.press} />
            <RepRow label="Arbeitgebermarke" v={rep.laborMarket} />
            <RepRow label="Investoren" v={rep.investors} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {appearances.map((a) => (
              <button key={a.kind} className="btn text-left" disabled={busy || !active || state.ceo.energy < 12} onClick={() => void act({ type: 'CEO_PUBLIC_APPEARANCE', kind: a.kind }, null)}>
                <span className="flex items-center gap-1.5"><Icon name={a.icon} size={13} /> {a.label}</span>
                <span className="block text-[9px] text-dim">{a.cost}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-dim">
            Sichtbarkeit zieht Talent an, macht die Presse wohlwollender und die Investoren aufmerksam. Aber Vorsicht: Bei schwacher Kommunikationskompetenz kann ein Auftritt zum Fettnäpfchen werden.
          </p>
        </div>
        <div>
          <div className="kicker mb-1 text-[9px]">Auftritts-Historie</div>
          {state.ceo.publicLog.length === 0 ? (
            <p className="text-[11px] text-dim">Noch keine öffentlichen Auftritte. Zeit, sich zu zeigen?</p>
          ) : (
            <div className="space-y-1 text-[11px]">
              {[...state.ceo.publicLog].reverse().slice(0, 8).map((p, i) => (
                <div key={i} className="flex items-baseline justify-between border-b border-line/40 py-1 last:border-0">
                  <span>W{p.week} · {p.kindDe}</span>
                  <span className={`num ${p.reputationDelta >= 0 ? 'text-good' : 'text-bad'}`}>{p.outcomeDe} {p.reputationDelta >= 0 ? '+' : ''}{p.reputationDelta}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function RepRow({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between"><span className="text-dim">{label}</span><span className="num">{Math.round(v)}</span></div>
      <div className="mt-0.5"><Bar value={v} color={v >= 60 ? 'bg-good' : v >= 40 ? 'bg-warn' : 'bg-bad'} /></div>
    </div>
  );
}

function CoachPanel() {
  const { state, act, busy } = useStore();
  const [pick, setPick] = useState<string>('');
  if (!state) return null;
  const active = state.meta.status === 'active';
  const skills = Object.entries(state.ceo.skills) as [string, number][];
  const coach = state.ceo.coach;
  const SKILL_LABEL: Record<string, string> = { finanzen: 'Finanzen', strategie: 'Strategie', leadership: 'Leadership', kommunikation: 'Kommunikation', krisenmanagement: 'Krisenmanagement', governance: 'Governance' };
  const weakest = [...skills].sort((a, b) => a[1] - b[1])[0]?.[0];
  const target = pick || weakest || 'kommunikation';

  return (
    <section className="rule-top pt-2.5">
      <Drill id="ceo-coaching" title="Kompetenzen & Executive-Coaching" summary={coach ? `Coaching: ${SKILL_LABEL[coach.skill]}` : 'kein Coaching'} defaultOpen>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="kicker mb-2 text-[9px]">CEO-Kompetenzen (wachsen mit guten Prozessen)</div>
            <div className="space-y-1.5">
              {skills.map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-[11px]">
                  <span className="w-28 shrink-0 text-dim">{SKILL_LABEL[k]}{coach?.skill === k && <span className="text-accent"> ·Coaching</span>}</span>
                  <div className="flex-1"><Bar value={v} color={coach?.skill === k ? 'bg-accent' : 'bg-ink'} /></div>
                  <span className="num w-7 text-right">{Math.round(v)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="kicker mb-2 text-[9px]">Executive-Coaching (~6 k€/M, G&A)</div>
            {coach ? (
              <p className="text-xs text-ink2">Aktuell in Arbeit: <b>{SKILL_LABEL[coach.skill]}</b> (seit Woche {coach.sinceWeek}). Der Coach hebt diese Kompetenz Woche für Woche und stärkt deine Energie-Resilienz.</p>
            ) : (
              <p className="text-xs text-dim">Ein Coach schließt gezielt einen blinden Fleck — hebt eine Kompetenz über Wochen und macht dich widerstandsfähiger.</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select className="border border-line bg-panel px-2 py-1 text-xs" value={target} onChange={(e) => setPick(e.target.value)}>
                {skills.map(([k]) => <option key={k} value={k}>{SKILL_LABEL[k]}</option>)}
              </select>
              <button className="btn-primary" disabled={busy || !active || coach?.skill === target} onClick={() => void act({ type: 'HIRE_COACH', skill: target as 'finanzen' }, null)}>
                {coach ? 'Schwerpunkt wechseln' : 'Coach beauftragen'}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-dim">Vorschlag: dein aktuell schwächster Wert ({SKILL_LABEL[weakest ?? 'kommunikation']}).</p>
          </div>
        </div>
      </Drill>
    </section>
  );
}

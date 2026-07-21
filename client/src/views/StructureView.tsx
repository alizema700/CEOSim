import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import {
  MIN_KAPITAL,
  displayRechtsform,
  effectiveCorporateTaxRate,
  esopAllocated,
  esopPool,
  isPublicCapable,
  legalFamily,
  memberSupport,
  organNames,
  taxBreakdown,
  type BoardMember,
  type CapTableEntry,
} from '@boardroom/shared';
import { useStore } from '../store.js';
import { Bar, Drill, Panel, scoreColor } from '../components/ui.js';
import { eur, num, pct } from '../format.js';

/**
 * Struktur (Phase 9): Rechtsform, Organe, Beteiligungen & Compliance auf einen
 * Blick — plus die gesellschaftsrechtlichen Aktionen (Formwechsel, Kapital-
 * erhöhung, Versammlung, Dividende). Macht „CEO + Kapitalgesellschaft" greifbar.
 */

const CAP_COLORS: Record<CapTableEntry['kind'], string> = {
  founder: '#2f7f79',
  investor: '#b8791f',
  esop: '#8a8a76',
  ceo: '#c2683c',
  public: '#5a7d8c',
};
const CAP_LABEL: Record<CapTableEntry['kind'], string> = {
  founder: 'Gründer',
  investor: 'Investor',
  esop: 'ESOP',
  ceo: 'CEO',
  public: 'Streubesitz',
};

export function StructureView() {
  const { state } = useStore();
  if (!state) return null;
  const l = state.legal;
  const o = organNames(l.rechtsform);
  const loc = state.identity.location;
  const country = loc?.country ?? 'Deutschland';
  const fallback = loc?.taxRate ?? 0.3;
  const effRate = effectiveCorporateTaxRate(l, country, fallback);
  const taxRows = taxBreakdown(l, country, fallback, 100); // rate-Anteile

  return (
    <div className="space-y-8">
      {/* ── Rechtsform-Kopf ─────────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="kicker">Rechtsform · Handelsregister</div>
            <h2 className="serif text-[34px] leading-tight">
              {state.identity.companyName}
              <span className="ml-2 text-accent">{displayRechtsform(l.rechtsform)}</span>
            </h2>
            <div className="kicker mt-1 text-dim">
              {l.handelsregister.number} · {l.handelsregister.courtDe}
              {l.rechtsform === 'AG' && <span className="ml-2 text-good">· börsenfähig (§ 2 AktG)</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="kicker text-[9px]">gezeichnetes {l.rechtsform === 'AG' ? 'Grund' : 'Stamm'}kapital</div>
            <div className="num text-[22px]">{eur(l.nennkapital, false)}</div>
          </div>
        </div>
      </section>

      {/* ── Formwechsel / IPO-Reife ─────────────────────────────────── */}
      <FormwechselPanel />

      <section className="grid gap-6 lg:grid-cols-2">
        {/* ── Organigramm ───────────────────────────────────────────── */}
        <Panel title="Organe der Gesellschaft">
          <OrganChart />
          <p className="mt-3 text-[10.5px] leading-relaxed text-dim">
            {organNames(l.rechtsform).aufsicht === 'Board of Directors'
              ? 'Einstufige Governance: Ein Board of Directors bestellt und überwacht die Officers (CEO/CFO); die Anteilseigner entscheiden auf der Hauptversammlung über Grundlagen.'
              : l.rechtsform === 'AG'
                ? 'Bei der AG leitet der Vorstand eigenverantwortlich, der Aufsichtsrat überwacht und bestellt ihn, die Hauptversammlung entscheidet über Grundlagen (Satzung, Gewinn, Entlastung).'
                : 'Bei der GmbH führt die Geschäftsführung; die Gesellschafterversammlung ist das oberste Organ und kann der Geschäftsführung Weisungen erteilen.'}
          </p>
        </Panel>

        {/* ── Cap Table ─────────────────────────────────────────────── */}
        <Panel title={`Beteiligungen · ${o.anteilseigner}`}>
          <CapTableDonut />
        </Panel>
      </section>

      {/* ── Aufsichtsrat / Board ────────────────────────────────────── */}
      <BoardPanel />

      {/* ── Steuern (echte dt. Sätze) ───────────────────────────────── */}
      <Panel title="Ertragsteuer">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs text-dim">Effektiver Satz auf das zu versteuernde Ergebnis</span>
          <span className="num text-[20px] text-accent">{pct(effRate, 1)}</span>
        </div>
        <div className="mt-2 space-y-1">
          {taxRows.map((r) => (
            <div key={r.labelDe} className="flex items-center gap-2 text-xs">
              <span className="w-64 shrink-0 text-dim">{r.labelDe}</span>
              <div className="flex-1"><Bar value={r.rate * 100} max={effRate * 100} color="bg-accent" /></div>
              <span className="num w-14 text-right">{pct(r.rate, r.rate < 0.02 ? 2 : 1)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-dim">
          {country === 'Deutschland'
            ? `Deutsche Kapitalgesellschaft: Körperschaftsteuer + Solidaritätszuschlag + Gewerbesteuer (Hebesatz ${l.hebesatz} % am Standort ${loc?.nameDe}). Steuer fällt nur auf positives Ergebnis an.`
            : `Ausländischer Standort (${loc?.nameDe}): pauschaler Ertragsteuersatz des Sitzlandes.`}
        </p>
      </Panel>

      {/* ── Aktionen ────────────────────────────────────────────────── */}
      <CapitalActions />

      {/* ── Compliance & Historie ───────────────────────────────────── */}
      <CompliancePanel />
    </div>
  );
}

/** Formwechsel-Checkliste bzw. Fortschritt bzw. AG-Status. */
function FormwechselPanel() {
  const { state, act, busy } = useStore();
  if (!state) return null;
  const l = state.legal;
  const active = state.meta.status === 'active';

  const target = legalFamily(state.identity.location?.country ?? 'Deutschland').ipoTarget;

  if (isPublicCapable(l.rechtsform)) {
    const o = organNames(l.rechtsform);
    return (
      <div className="border-2 border-good/50 bg-panel2 p-3.5" style={{ borderRadius: 3 }}>
        <div className="kicker text-good">{displayRechtsform(l.rechtsform)} · börsenfähig</div>
        <p className="mt-1 text-xs text-dim">Der Weg an die Börse steht offen (Tab „Börse", sobald die Kennzahlen passen). {o.leitung}, {o.aufsicht} und {o.versammlung} sind die Organe.</p>
      </div>
    );
  }

  if (l.pendingConversion) {
    const weeksLeft = l.pendingConversion.effectiveWeek - state.meta.week;
    return (
      <div className="border-2 border-warn bg-panel2 p-3.5" style={{ borderRadius: 3 }}>
        <div className="kicker text-warn">Formwechsel zur {l.pendingConversion.toForm} läuft</div>
        <p className="mt-1 text-xs text-dim">Beurkundung, Umwandlungsbericht und Registeranmeldung sind unterwegs. Wirksam mit Eintragung ins Register — in ~{Math.max(0, weeksLeft)} Woche{weeksLeft === 1 ? '' : 'n'}.</p>
      </div>
    );
  }

  // Nicht börsenfähig: Checkliste zum Ziel-Formwechsel (z. B. GmbH→AG, Ltd→PLC).
  const capOk = l.nennkapital >= MIN_KAPITAL[target];
  const trustOk = state.ceo.boardTrust >= 54; // Satzungsänderung braucht klaren Rückhalt
  const cashOk = state.finance.cash >= 42_000;
  const canConvert = capOk && trustOk && cashOk && active;
  const Item = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <li className="flex items-start gap-2 text-xs">
      <span className={ok ? 'text-good' : 'text-bad'}>{ok ? '✓' : '○'}</span>
      <span className={ok ? '' : 'text-dim'}>{children}</span>
    </li>
  );

  return (
    <div className="border border-line bg-panel2 p-3.5" style={{ borderRadius: 3 }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="kicker text-ink">Formwechsel zur {target}</div>
        <span className="text-[10px] text-dim">nur eine börsenfähige Rechtsform kann an die Börse</span>
      </div>
      <ul className="mt-2 space-y-1">
        <Item ok={capOk}>Grundkapital ≥ {eur(MIN_KAPITAL[target], false)} (aktuell {eur(l.nennkapital, false)}{!capOk && ' — erst Kapitalerhöhung'})</Item>
        <Item ok={trustOk}>75 % Gesellschafter-Zustimmung (Board-Rückhalt, aktuell {num(state.ceo.boardTrust)}/100)</Item>
        <Item ok={cashOk}>Liquidität für Beurkundung/Umwandlung ≥ {eur(42_000, false)}</Item>
      </ul>
      <button
        className="btn-primary mt-3"
        disabled={!canConvert || busy}
        onClick={() => void act({ type: 'CONVERT_LEGAL_FORM', toForm: target }, null)}
      >
        Formwechsel zur {target} einleiten (~4 Wochen, {eur(42_000, false)})
      </button>
      {!capOk && <p className="mt-1.5 text-[10px] text-warn">Tipp: Unten unter „Kapitalmaßnahmen" das Nennkapital auf {eur(MIN_KAPITAL[target], false)} erhöhen.</p>}
    </div>
  );
}

/** Vertikales Organigramm der Gesellschaftsorgane. */
function OrganChart() {
  const { state } = useStore();
  if (!state) return null;
  const l = state.legal;
  const o = organNames(l.rechtsform);
  const mb = l.mitbestimmung === 'paritaetisch' ? ' · paritätisch mitbestimmt' : l.mitbestimmung === 'drittelbeteiligung' ? ' · Drittelbeteiligung' : '';
  const Box = ({ label, sub, accent }: { label: string; sub?: string; accent?: boolean }) => (
    <div className={`w-full border px-3 py-2 text-center ${accent ? 'border-accent bg-panel2' : 'border-line'}`} style={{ borderRadius: 2 }}>
      <div className={`serif text-[15px] leading-tight ${accent ? 'text-accent' : ''}`}>{label}</div>
      {sub && <div className="kicker mt-0.5 text-[9px] text-dim">{sub}</div>}
    </div>
  );
  const Connector = () => <div className="mx-auto h-3 w-px bg-line" />;
  return (
    <div className="mx-auto max-w-[280px]">
      <Box label={o.versammlung} sub="oberstes Organ" />
      <Connector />
      <Box label={o.aufsicht} sub={`Überwachung${mb}`} />
      <Connector />
      <Box label={o.leitung} accent />
      <Connector />
      <Box label={`${state.playerProfile.ceoName} (CEO)`} sub={o.aufsicht === 'Board of Directors' ? 'Chief Executive Officer' : l.rechtsform === 'AG' ? 'Vorstandsvorsitz' : 'Geschäftsführer:in'} />
    </div>
  );
}

/** Cap-Table als Donut (recharts) + Legende. */
function CapTableDonut() {
  const { state } = useStore();
  if (!state) return null;
  const data = [...state.capTable]
    .filter((e) => e.share > 0.0001)
    .sort((a, b) => b.share - a.share)
    .map((e) => ({ ...e, value: Math.round(e.share * 1000) / 10 }));

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div style={{ width: 150, height: 150 }} className="shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="holder" innerRadius={44} outerRadius={70} paddingAngle={1} stroke="none" isAnimationActive={false}>
              {data.map((e) => (
                <Cell key={e.id} fill={CAP_COLORS[e.kind]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="w-full space-y-1.5">
        {data.map((e) => (
          <div key={e.id} className="flex items-center gap-2 text-xs">
            <span className="inline-block h-2.5 w-2.5 shrink-0" style={{ background: CAP_COLORS[e.kind], borderRadius: 1 }} />
            <span className="min-w-0 flex-1 truncate" title={e.holder}>{e.holder}</span>
            <span className="kicker shrink-0 text-[8.5px] text-dim">{CAP_LABEL[e.kind]}</span>
            <span className="num w-12 shrink-0 text-right">{pct(e.share, 1)}</span>
          </div>
        ))}
        <div className="mt-1 border-t border-line pt-1.5 text-[10px] text-dim">
          ESOP-Pool: {pct(esopAllocated(state), 1)} an Mitarbeitende vergeben von {pct(esopPool(state), 0)} (Vesting im Team-Steckbrief).
        </div>
      </div>
    </div>
  );
}

const SEAT_LABEL: Record<BoardMember['seatType'], string> = {
  chair: 'Vorsitz',
  investor: 'Investor',
  founder: 'Gründer',
  independent: 'Unabhängig',
  employee: 'Belegschaft',
  ceo: 'CEO',
};
const VOTE_STYLE: Record<string, string> = { ja: 'text-good', nein: 'text-bad', enthaltung: 'text-dim' };

/** Aufsichtsrat/Board: benannte Sitze mit Rückhalt + letzte Beschlüsse. */
function BoardPanel() {
  const { state } = useStore();
  if (!state) return null;
  const members = state.board.members;
  const o = organNames(state.legal.rechtsform);
  const recent = [...state.board.resolutions].reverse().slice(0, 4);

  return (
    <Panel title={o.aufsicht === 'Board of Directors' ? 'Board of Directors' : 'Aufsichtsrat'}>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2.5">
          {members.map((m) => {
            const sup = memberSupport(state, m);
            return (
              <div key={m.id} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate">{m.name} <span className="kicker text-[8.5px] text-dim">{SEAT_LABEL[m.seatType]}</span></span>
                  <span className="num shrink-0">{sup}</span>
                </div>
                <div className="mt-0.5"><Bar value={sup} color={scoreColor(sup)} /></div>
                <div className="mt-0.5 text-[10px] leading-tight text-dim">{m.affiliationDe}</div>
              </div>
            );
          })}
        </div>
        <div>
          <div className="kicker mb-1 text-[9px]">Letzte Beschlüsse</div>
          {recent.length === 0 ? (
            <p className="text-[11px] text-dim">Noch keine förmlichen Beschlüsse. Formwechsel und Ausschüttungen laufen über den Aufsichtsrat.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((r, i) => (
                <div key={i} className="border-b border-line/40 pb-1.5 text-[11px] last:border-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{r.titleDe}</span>
                    <span className={`kicker shrink-0 text-[9px] ${r.passed ? 'text-good' : 'text-bad'}`}>{r.passed ? 'angenommen' : 'abgelehnt'}</span>
                  </div>
                  <div className="mt-0.5 text-dim">
                    W{r.week} · {(r.forShare * 100).toFixed(0)} % Zustimmung ({(r.requiredShare * 100).toFixed(0)} % nötig) ·{' '}
                    {r.votes.map((v, j) => (
                      <span key={j} className={VOTE_STYLE[v.vote]}>{v.name.split(' ')[0]}{j < r.votes.length - 1 ? ', ' : ''}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

/** Kapitalerhöhung · Versammlung · Dividende (hinter Klick). */
function CapitalActions() {
  const { state, act, busy } = useStore();
  const l = state?.legal;
  const [target, setTarget] = useState<number | null>(null);
  const [divPct, setDivPct] = useState(20);
  if (!state || !l) return null;
  const active = state.meta.status === 'active';
  const o = organNames(l.rechtsform);
  const maxCap = Math.min(Math.round(state.finance.contributedCapital), 500_000);
  const capTarget = target ?? Math.max(l.nennkapital, Math.min(50_000, maxCap));
  const retained = Math.max(0, state.finance.retainedEarnings);
  const divAmount = Math.round((retained * divPct) / 100);

  return (
    <section className="rule-top pt-2.5">
      <Drill id="kapitalmassnahmen" title="Kapitalmaßnahmen & Governance" summary={`Nennkapital ${eur(l.nennkapital, false)} · Rücklage ${eur(retained)}`}>
        <div className="grid gap-6 md:grid-cols-3">
          {/* Kapitalerhöhung */}
          <div>
            <div className="kicker text-[9.5px]">Kapitalerhöhung (aus Gesellschaftsmitteln)</div>
            <div className="num mt-1 text-[16px]">{eur(l.nennkapital, false)} → {eur(capTarget, false)}</div>
            <input type="range" min={l.nennkapital} max={Math.max(l.nennkapital + 1000, maxCap)} step={1000} value={capTarget} onChange={(e) => setTarget(Number(e.target.value))} className="mt-2 w-full" disabled={!active} />
            <button
              className="btn mt-2 w-full"
              disabled={busy || !active || capTarget <= l.nennkapital}
              onClick={() => { setTarget(null); void act({ type: 'CAPITAL_INCREASE', targetNennkapital: capTarget }, null); }}
            >
              Nennkapital erhöhen
            </button>
            <p className="mt-1.5 text-[10px] text-dim">Bindet Kapital als Haftungsmasse (nicht ausschüttbar). Voraussetzung für die AG (≥ {eur(MIN_KAPITAL.AG, false)}).</p>
          </div>

          {/* Versammlung */}
          <div>
            <div className="kicker text-[9.5px]">Ordentliche {o.versammlung}</div>
            <div className="mt-1 text-xs text-dim">
              {l.lastMeetingWeek === null ? 'noch keine abgehalten' : `zuletzt Woche ${l.lastMeetingWeek}`} · nächste fällig ~W{l.nextMeetingWeek}
            </div>
            <button
              className="btn mt-2 w-full"
              disabled={busy || !active}
              onClick={() => void act({ type: 'HOLD_SHAREHOLDER_MEETING' }, null)}
            >
              Versammlung einberufen
            </button>
            <p className="mt-1.5 text-[10px] text-dim">Feststellung des Jahresabschlusses und Entlastung {l.rechtsform === 'AG' ? 'des Vorstands' : 'der Geschäftsführung'} — bei solider Lage Rückendeckung.</p>
          </div>

          {/* Dividende */}
          <div>
            <div className="kicker text-[9.5px]">Gewinnausschüttung</div>
            <div className="num mt-1 text-[16px]">{eur(divAmount)}</div>
            <div className="mt-2 flex items-center gap-2">
              <input type="range" min={0} max={80} step={5} value={divPct} onChange={(e) => setDivPct(Number(e.target.value))} className="flex-1" disabled={!active || retained < 1000} />
              <span className="num w-10 text-right text-xs">{divPct} %</span>
            </div>
            <button
              className="btn mt-2 w-full"
              disabled={busy || !active || divAmount < 1000}
              onClick={() => void act({ type: 'DISTRIBUTE_DIVIDEND', amount: divAmount }, null)}
            >
              Dividende ausschütten
            </button>
            <p className="mt-1.5 text-[10px] text-dim">Aus der Gewinnrücklage ({eur(retained)}). Dein Anteil: ~{eur(divAmount * state.ceo.equityShare)}. Senkt den Runway.</p>
          </div>
        </div>
      </Drill>
    </section>
  );
}

/** Compliance-Status, Ausschüttungs- & Formwechsel-Historie. */
function CompliancePanel() {
  const { state } = useStore();
  if (!state) return null;
  const l = state.legal;
  const klasseLabel = l.groessenklasse === 'gross' ? 'groß' : l.groessenklasse === 'mittelgross' ? 'mittelgroß' : 'klein';
  const mbLabel = l.mitbestimmung === 'paritaetisch' ? 'paritätisch' : l.mitbestimmung === 'drittelbeteiligung' ? 'Drittelbeteiligung' : 'keine';

  return (
    <section className="rule-top pt-2.5">
      <Drill id="compliance" title="Compliance & Historie" summary={`${klasseLabel}${l.pruefungspflicht ? ' · prüfungspflichtig' : ''}`}>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between border-b border-line pb-1"><span className="text-dim">Größenklasse (§ 267 HGB)</span><span>{klasseLabel}</span></div>
            <div className="flex justify-between border-b border-line pb-1"><span className="text-dim">Prüfungspflicht (§ 316 HGB)</span><span className={l.pruefungspflicht ? 'text-warn' : 'text-good'}>{l.pruefungspflicht ? 'ja (Wirtschaftsprüfer)' : 'nein (befreit)'}</span></div>
            <div className="flex justify-between border-b border-line pb-1"><span className="text-dim">Mitbestimmung Aufsichtsrat</span><span>{mbLabel}</span></div>
            <div className="flex justify-between pb-1"><span className="text-dim">Gewerbesteuer-Hebesatz</span><span className="num">{l.hebesatz} %</span></div>
          </div>
          <div>
            <div className="kicker mb-1 text-[9px]">Historie</div>
            {l.formHistory.length === 0 && l.dividends.length === 0 ? (
              <p className="text-[11px] text-dim">Noch keine Formwechsel oder Ausschüttungen.</p>
            ) : (
              <div className="space-y-1 text-[11px]">
                {l.formHistory.map((h, i) => (
                  <div key={`f${i}`} className="flex justify-between"><span className="text-dim">W{h.week} Formwechsel</span><span>{h.from} → {h.to}</span></div>
                ))}
                {[...l.dividends].reverse().slice(0, 6).map((d, i) => (
                  <div key={`d${i}`} className="flex justify-between"><span className="text-dim">W{d.week} Dividende</span><span className="num">{eur(d.amount)}</span></div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Drill>
    </section>
  );
}

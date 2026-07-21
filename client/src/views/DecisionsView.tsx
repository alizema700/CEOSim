import { useState } from 'react';
import type { Hypothesis, PlayerAction, Department, Seniority } from '@boardroom/shared';
import { deptDe } from '@boardroom/shared';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Modal, Panel } from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { eur } from '../format.js';

/**
 * Entscheidungs-Panel (Phase 1: fest definierte Aktionen).
 * Ablauf pro Entscheidung = Bewertungs-Pipeline Schritt 1:
 *   Formular → (optional) Hypothese erfassen → Engine-Validierung mit
 *   Warnungen → anwenden → Sofort-Analyse der Mechanik anzeigen.
 */

const DEPTS: Department[] = ['engineering', 'sales', 'marketing', 'cs', 'ga'];
const SENIORITIES: Seniority[] = ['werkstudent', 'junior', 'mid', 'senior', 'lead'];

export function DecisionsView() {
  const { state, act, busy, hypothesisMode, lastDecision } = useStore();
  const [pending, setPending] = useState<PlayerAction | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  if (!state) return null;
  const gameOver = state.meta.status !== 'active';

  async function submit(action: PlayerAction) {
    setErrors([]);
    setWarnings([]);
    if (!state) return;
    const { validation } = await api.validateAction(state.meta.gameId, action);
    if (!validation.ok) {
      setErrors(validation.errorsDe);
      return;
    }
    setWarnings(validation.warningsDe);
    if (hypothesisMode) {
      setPending(action); // Hypothese-Modal öffnen
    } else {
      await act(action, null);
    }
  }

  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <div className="panel border-bad/60 px-3 py-2 text-xs text-bad">{errors.map((e, i) => <div key={i}>✗ {e}</div>)}</div>
      )}
      {warnings.length > 0 && (
        <div className="panel border-warn/50 px-3 py-2 text-xs text-warn">{warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}</div>
      )}

      {lastDecision && (
        <Panel title={`Sofort-Analyse · ${lastDecision.summaryDe}`}>
          <ul className="space-y-1 text-xs leading-relaxed">
            {lastDecision.immediateAnalysisDe.map((a, i) => (
              <li key={i}>→ {a}</li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-dim">
            Outcome-Bewertung folgt in Woche {lastDecision.evaluateAtWeek} (4 Wochen nach Entscheidung) unter „Bewertungen".
          </p>
        </Panel>
      )}

      <div className={`grid gap-4 md:grid-cols-2 xl:grid-cols-3 ${gameOver ? 'pointer-events-none opacity-40' : ''}`}>
        <PricingCard onSubmit={submit} busy={busy} />
        <HiringCard onSubmit={submit} busy={busy} />
        <LayoffCard onSubmit={submit} busy={busy} />
        <BudgetCard
          title="Marketing-Budget"
          hint={`Aktuell: ${eur(state.finance.budgetsMonthly.marketing)}/Monat. Leads folgen mit 2–6 Wochen Lag, abnehmender Grenznutzen.`}
          current={state.finance.budgetsMonthly.marketing}
          onSubmit={(v) => submit({ type: 'SET_MARKETING_BUDGET', monthlyAmount: v })}
          busy={busy}
        />
        <BudgetCard
          title="Customer-Success-Programme"
          hint={`Aktuell: ${eur(state.finance.budgetsMonthly.customerSuccess)}/Monat. Senkt Churn mit ~4 Wochen Anlauf — wirkt direkt am Kernproblem.`}
          current={state.finance.budgetsMonthly.customerSuccess}
          onSubmit={(v) => submit({ type: 'SET_CS_BUDGET', monthlyAmount: v })}
          busy={busy}
        />
        <RndCard onSubmit={submit} busy={busy} current={state.product.rndAllocation} />
        <SalaryCard onSubmit={submit} busy={busy} />
        <DebtCard
          onSubmit={submit}
          busy={busy}
          principal={state.finance.debt.principal}
          creditLine={state.finance.debt.creditLine}
        />
      </div>

      {pending && (
        <HypothesisModal
          action={pending}
          onCancel={() => setPending(null)}
          onConfirm={async (h) => {
            setPending(null);
            await act(pending, h);
          }}
        />
      )}
    </div>
  );
}

/** Schritt „Vorher — Hypothese": trainiert kalibriertes Urteilen. */
function HypothesisModal({ action, onCancel, onConfirm }: { action: PlayerAction; onCancel: () => void; onConfirm: (h: Hypothesis | null) => void }) {
  const [text, setText] = useState('');
  const [mrrDelta, setMrrDelta] = useState('');
  return (
    <Modal title="Was erwartest du? (Hypothese vor der Konsequenz)" onClose={onCancel}>
      <p className="mb-3 text-xs text-dim">
        Bevor die Simulation rechnet: Notiere deine Erwartung. In 4 Wochen vergleicht die Bewertung dein Bauchgefühl mit der
        Realität — so trainierst du kalibriertes Urteilen. ({action.type})
      </p>
      <label className="mb-1 block text-[10px] uppercase text-dim">Erwartung (Freitext)</label>
      <textarea className="input mb-3 h-20 resize-none" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ich erwarte, dass …" />
      <label className="mb-1 block text-[10px] uppercase text-dim">Geschätzte MRR-Wirkung in 4 Wochen (€/Monat, ± , optional)</label>
      <input className="input mb-4" type="number" value={mrrDelta} onChange={(e) => setMrrDelta(e.target.value)} placeholder="z. B. -2000 oder 5000" />
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={() => onConfirm(null)}>
          Ohne Hypothese fortfahren
        </button>
        <button
          className="btn-primary"
          disabled={text.trim().length < 3}
          onClick={() => onConfirm({ textDe: text.trim(), expectedMrrDelta4w: mrrDelta === '' ? null : Number(mrrDelta), expectedChurnDeltaPp: null })}
        >
          Hypothese speichern & entscheiden
        </button>
      </div>
    </Modal>
  );
}

// ── Aktions-Karten ────────────────────────────────────────────────────
type SubmitFn = (a: PlayerAction) => Promise<void> | void;

function PricingCard({ onSubmit, busy }: { onSubmit: SubmitFn; busy: boolean }) {
  const [pctVal, setPctVal] = useState(10);
  const [existing, setExisting] = useState(false);
  return (
    <Panel icon="tag" title="Preis ändern">
      <p className="mb-2 text-[11px] text-dim">Neugeschäft sofort; Bestand optional beim Renewal (Churn-Spike-Risiko nach 4–12 Wochen). Cooldown 8 Wochen.</p>
      <div className="mb-2 flex items-center gap-2">
        <input type="range" min={-30} max={30} step={1} value={pctVal} onChange={(e) => setPctVal(Number(e.target.value))} className="flex-1 accent-sky-400" />
        <span className={`num w-14 text-right ${pctVal >= 0 ? 'text-good' : 'text-bad'}`}>{pctVal > 0 ? '+' : ''}{pctVal} %</span>
      </div>
      <label className="mb-3 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={existing} onChange={(e) => setExisting(e.target.checked)} className="accent-sky-400" />
        Auch Bestandskunden (beim Renewal)
      </label>
      <button className="btn w-full" disabled={busy || pctVal === 0} onClick={() => void onSubmit({ type: 'PRICE_CHANGE', pct: pctVal / 100, applyToExisting: existing })}>
        Preisänderung beschließen
      </button>
    </Panel>
  );
}

function HiringCard({ onSubmit, busy }: { onSubmit: SubmitFn; busy: boolean }) {
  const [dept, setDept] = useState<Department>('engineering');
  const [seniority, setSeniority] = useState<Seniority>('mid');
  const [count, setCount] = useState(1);
  const [specialist, setSpecialist] = useState('');
  return (
    <Panel icon="users" title="Einstellen">
      <p className="mb-2 text-[11px] text-dim">Time-to-Fill hängt an Arbeitsmarkt-Reputation & Standort-Talentpool. Kosten erst ab Besetzung.</p>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <select className="input" value={dept} onChange={(e) => setDept(e.target.value as Department)}>
          {DEPTS.map((d) => <option key={d} value={d}>{deptDe(d)}</option>)}
        </select>
        <select className="input" value={seniority} onChange={(e) => setSeniority(e.target.value as Seniority)}>
          {SENIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs text-dim">Anzahl</span>
        <input className="input w-20" type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} />
      </div>
      <input
        className="input mb-1"
        placeholder="Spezialrolle (optional): „Quant“, „ML-Ingenieurin“, „Kryptograph“ …"
        value={specialist}
        maxLength={40}
        onChange={(e) => setSpecialist(e.target.value)}
      />
      <p className="mb-3 text-[10px] text-dim">Spezialrollen: ~+15 % Gehalt, +2 Wochen Suche — dafür Profil-Titel & etwas stärkere Performance. Werkstudent:innen: günstig, aber höhere Fluktuation.</p>
      <button
        className="btn w-full"
        disabled={busy}
        onClick={() => void onSubmit({ type: 'START_HIRING', dept, seniority, count, ...(specialist.trim().length >= 3 ? { specialistRoleDe: specialist.trim() } : {}) })}
      >
        Stelle(n) ausschreiben
      </button>
    </Panel>
  );
}

function LayoffCard({ onSubmit, busy }: { onSubmit: SubmitFn; busy: boolean }) {
  const [dept, setDept] = useState<Department>('ga');
  const [count, setCount] = useState(1);
  const [generous, setGenerous] = useState(true);
  return (
    <Panel icon="scissors" title="Stellen abbauen">
      <p className="mb-2 text-[11px] text-dim">Abfindung sofort zahlungswirksam, Payroll ↓ ab Folgewoche. Folgekosten: Moral, Arbeitsmarkt-Reputation, Kündigungswelle.</p>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <select className="input" value={dept} onChange={(e) => setDept(e.target.value as Department)}>
          {DEPTS.map((d) => <option key={d} value={d}>{deptDe(d)}</option>)}
        </select>
        <input className="input" type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} />
      </div>
      <label className="mb-3 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={generous} onChange={(e) => setGenerous(e.target.checked)} className="accent-sky-400" />
        Faires Trennungspaket (teurer, mildere Folgen)
      </label>
      <button className="btn-danger w-full" disabled={busy} onClick={() => void onSubmit({ type: 'LAYOFF', dept, count, generousSeverance: generous })}>
        Abbau beschließen
      </button>
    </Panel>
  );
}

function BudgetCard({ title, hint, current, onSubmit, busy }: { title: string; hint: string; current: number; onSubmit: (v: number) => void; busy: boolean }) {
  const [value, setValue] = useState(Math.round(current));
  return (
    <Panel icon="coins" title={title}>
      <p className="mb-2 text-[11px] text-dim">{hint}</p>
      <div className="mb-3 flex items-center gap-2">
        <input className="input" type="number" min={0} step={1000} value={value} onChange={(e) => setValue(Number(e.target.value))} />
        <span className="text-xs text-dim">€/M</span>
      </div>
      <button className="btn w-full" disabled={busy || value === Math.round(current)} onClick={() => onSubmit(value)}>
        Budget setzen
      </button>
    </Panel>
  );
}

function RndCard({ onSubmit, busy, current }: { onSubmit: SubmitFn; busy: boolean; current: { features: number; techDebt: number; bugfixes: number } }) {
  const [features, setFeatures] = useState(Math.round(current.features * 100));
  const [debt, setDebt] = useState(Math.round(current.techDebt * 100));
  const bugs = 100 - features - debt;
  return (
    <Panel icon="sliders" title="R&D-Allokation">
      <p className="mb-2 text-[11px] text-dim">Features treiben Wettbewerb & Bugs; Tech-Debt-Arbeit schützt Velocity & senkt Outage-Risiko.</p>
      <Slider label="Features" value={features} onChange={(v) => setFeatures(Math.min(v, 100 - debt))} />
      <Slider label="Tech-Debt" value={debt} onChange={(v) => setDebt(Math.min(v, 100 - features))} />
      <div className="mb-3 flex justify-between text-xs">
        <span className="text-dim">Bugfixes</span>
        <span className={`num ${bugs < 0 ? 'text-bad' : ''}`}>{bugs} %</span>
      </div>
      <button
        className="btn w-full"
        disabled={busy || bugs < 0}
        onClick={() => void onSubmit({ type: 'SET_RND_ALLOCATION', features: features / 100, techDebt: debt / 100, bugfixes: bugs / 100 })}
      >
        Allokation setzen
      </button>
    </Panel>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="w-20 text-xs text-dim">{label}</span>
      <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-sky-400" />
      <span className="num w-10 text-right text-xs">{value} %</span>
    </div>
  );
}

function SalaryCard({ onSubmit, busy }: { onSubmit: SubmitFn; busy: boolean }) {
  const [pctVal, setPctVal] = useState(4);
  return (
    <Panel icon="coins" title="Gehaltsrunde">
      <p className="mb-2 text-[11px] text-dim">Zufriedenheit & Bindung ↑ sofort — Payroll ↑ dauerhaft. Einmal beschlossen, nicht rückholbar.</p>
      <div className="mb-3 flex items-center gap-2">
        <input type="range" min={1} max={15} value={pctVal} onChange={(e) => setPctVal(Number(e.target.value))} className="flex-1 accent-sky-400" />
        <span className="num w-12 text-right">+{pctVal} %</span>
      </div>
      <button className="btn w-full" disabled={busy} onClick={() => void onSubmit({ type: 'ADJUST_SALARIES', pct: pctVal / 100 })}>
        Gehaltsrunde beschließen
      </button>
    </Panel>
  );
}

function DebtCard({ onSubmit, busy, principal, creditLine }: { onSubmit: SubmitFn; busy: boolean; principal: number; creditLine: number }) {
  const [amount, setAmount] = useState(100_000);
  return (
    <Panel icon="bank" title="Kreditlinie">
      <p className="mb-2 text-[11px] text-dim">
        Gezogen: {eur(principal)} von {eur(creditLine)} · 8 % p. a. · Covenants beachten (Finanzen-Tab).
      </p>
      <div className="mb-3 flex items-center gap-2">
        <input className="input" type="number" min={10_000} step={10_000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        <span className="text-xs text-dim">€</span>
      </div>
      <div className="flex gap-2">
        <button className="btn flex-1" disabled={busy} onClick={() => void onSubmit({ type: 'RAISE_DEBT', amount })}>
          Ziehen
        </button>
        <button className="btn flex-1" disabled={busy || principal <= 0} onClick={() => void onSubmit({ type: 'REPAY_DEBT', amount: Math.min(amount, principal) })}>
          Tilgen
        </button>
      </div>
    </Panel>
  );
}

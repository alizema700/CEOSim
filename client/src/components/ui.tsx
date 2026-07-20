import { useState, type ReactNode } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { KPI_DEFINITIONS, type KpiId, type KpiSnapshot } from '@boardroom/shared';
import { formatByUnit, healthColor } from '../format.js';

/** Redaktionelle UI-Bausteine: Modal, Rubrik-Karte, KPI-Karte mit Formel. */

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(23,26,28,.35)' }} onClick={onClose}>
      <div
        className={`max-h-[85vh] w-full overflow-y-auto bg-panel ${wide ? 'max-w-3xl' : 'max-w-xl'}`}
        style={{ border: '1px solid #171a1c', boxShadow: '12px 12px 0 rgba(23,26,28,.10)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="kicker">{title}</div>
          <button className="text-dim hover:text-ink" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-title flex items-center justify-between">
        <span>{title}</span>
        {right}
      </div>
      <div className="p-3.5">{children}</div>
    </div>
  );
}

/**
 * KPI-Karte mit Formel-Tooltip (Didaktik-Kernstück): Klick ⇒ Popover mit
 * Definition, Formel und Einordnung — jeder Fachbegriff ist erklärbar.
 */
export function KpiCard({ id, value, contextDe }: { id: KpiId; value: number; contextDe?: string }) {
  const [open, setOpen] = useState(false);
  const def = KPI_DEFINITIONS[id];
  return (
    <div className="relative">
      <button
        className="w-full cursor-help border border-line bg-panel px-3 py-2.5 text-left transition-colors hover:border-accent"
        style={{ borderRadius: 2 }}
        onClick={() => setOpen((o) => !o)}
      >
        <div className="kicker text-[9.5px]">{def.labelDe}</div>
        <div className={`num mt-1 text-[19px] ${healthColor(value, def)}`}>{formatByUnit(value, def.unit)}</div>
      </button>
      {open && (
        <div className="panel absolute left-0 top-full z-30 mt-1 w-72 p-3 shadow-xl" onMouseLeave={() => setOpen(false)}>
          <div className="serif mb-1 text-[17px] text-ink">{def.labelDe}</div>
          <p className="mb-2 text-xs leading-relaxed text-ink2">{def.definitionDe}</p>
          <div className="num mb-2 border border-line bg-panel2 p-2 text-[11px] text-accent">{def.formulaDe}</div>
          {contextDe && <p className="text-[11px] leading-relaxed text-dim">→ {contextDe}</p>}
        </div>
      )}
    </div>
  );
}

export function StatRow({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line py-1.5 last:border-0">
      <span className="text-xs text-dim" title={hint}>
        {label}
      </span>
      <span className="num text-xs text-ink">{value}</span>
    </div>
  );
}

export function Bar({ value, max = 100, color = 'bg-accent' }: { value: number; max?: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden bg-panel2" style={{ borderRadius: 1 }}>
      <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

export function scoreColor(v: number): string {
  return v >= 65 ? 'bg-good' : v >= 45 ? 'bg-warn' : 'bg-bad';
}

export function GradeBadge({ grade }: { grade: number }) {
  const color = grade <= 2 ? 'text-good border-good/50' : grade <= 4 ? 'text-warn border-warn/50' : 'text-bad border-bad/50';
  return <span className={`num inline-block border px-2 py-0.5 text-sm font-bold ${color}`} style={{ borderRadius: 2 }}>Note {grade}</span>;
}

/**
 * Drill (Phase 8): aufklappbare Rubrik — „Tiefe auf Klick". Standardmäßig
 * ZU: nur Rubriken-Zeile + Einzeiler-Zusammenfassung. Der Auf/Zu-Zustand
 * wird pro Schlüssel gemerkt (localStorage), damit sich das UI der
 * Arbeitsweise anpasst statt umgekehrt.
 */
export function Drill({ id, title, summary, defaultOpen = false, children }: {
  id: string;
  title: string;
  /** Einzeiler rechts im Kopf — das Wichtigste, ohne aufzuklappen. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const key = 'br-drill-' + id;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? defaultOpen : saved === '1';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(key, o ? '0' : '1');
      } catch { /* egal */ }
      return !o;
    });
  };
  return (
    <section className="rule-top pt-2.5">
      <button className="group flex w-full items-baseline gap-3 py-1 text-left" onClick={toggle} aria-expanded={open}>
        <span className={`num text-[11px] ${open ? 'text-accent' : 'text-dim'}`}>{open ? '▾' : '▸'}</span>
        <span className="kicker text-ink group-hover:text-accent">{title}</span>
        {!open && summary !== undefined && <span className="num min-w-0 flex-1 truncate text-right text-[11px] text-dim">{summary}</span>}
      </button>
      {open && <div className="pb-2 pt-2">{children}</div>}
    </section>
  );
}

/** Verlaufs-Chart für EINE Kennzahl über alle Spielwochen (aus der History). */
export function KpiHistoryModal({ id, history, onClose }: { id: KpiId; history: KpiSnapshot[]; onClose: () => void }) {
  const def = KPI_DEFINITIONS[id];
  const data = history.map((h) => ({ week: h.week, v: h.values[id] }));
  const last = data[data.length - 1]?.v ?? 0;
  const first = data[0]?.v ?? 0;
  return (
    <Modal title={`Verlauf · ${def.labelDe}`} onClose={onClose} wide>
      <div className="flex items-baseline justify-between">
        <span className={`num text-[24px] ${healthColor(last, def)}`}>{formatByUnit(last, def.unit)}</span>
        <span className="num text-[11px] text-dim">
          Start {formatByUnit(first, def.unit)} · {data.length} Wochen
        </span>
      </div>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="week" stroke="#a3a8ad" fontSize={10} tickLine={false} axisLine={{ stroke: '#ddd9d0' }} />
            <YAxis stroke="#a3a8ad" fontSize={10} tickLine={false} axisLine={false} width={64} domain={['auto', 'auto']} tickFormatter={(v: number) => formatByUnit(v, def.unit)} />
            <ChartTooltip
              contentStyle={{ background: '#fffdf8', border: '1px solid #ddd9d0', borderRadius: 2, fontSize: 11, fontFamily: 'Spline Sans Mono' }}
              labelFormatter={(w) => `Woche ${w}`}
              formatter={(v: number) => [formatByUnit(v, def.unit), def.labelDe]}
            />
            <Line type="monotone" dataKey="v" stroke="#2f7f79" strokeWidth={1.8} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 border-t border-line pt-2 text-[11px] leading-relaxed text-dim">
        <b className="text-ink">{def.formulaDe}</b> — {def.definitionDe}
      </p>
    </Modal>
  );
}

/** Mehrserien-Verlaufs-Chart für Drills (z. B. Headcount + Zufriedenheit). */
export function MultiLineChart({ data, series, height = 224, labelFormatter }: {
  data: Record<string, number>[];
  series: { key: string; label: string; color: string; formatter?: (v: number) => string }[];
  height?: number;
  labelFormatter?: (v: number | string) => string;
}) {
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="week" stroke="#a3a8ad" fontSize={10} tickLine={false} axisLine={{ stroke: '#ddd9d0' }} />
          <YAxis stroke="#a3a8ad" fontSize={10} tickLine={false} axisLine={false} width={56} domain={['auto', 'auto']} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} />
          <ChartTooltip
            contentStyle={{ background: '#fffdf8', border: '1px solid #ddd9d0', borderRadius: 2, fontSize: 11, fontFamily: 'Spline Sans Mono' }}
            labelFormatter={(w) => (labelFormatter ? labelFormatter(w as number) : `Woche ${w}`)}
            formatter={(v: number, name: string) => {
              const s = series.find((x) => x.label === name);
              return [s?.formatter ? s.formatter(v) : v.toLocaleString('de-DE'), name];
            }}
          />
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={1.6} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
        {series.map((s) => (
          <span key={s.key} className="num text-[10px]" style={{ color: s.color }}>— {s.label}</span>
        ))}
      </div>
    </div>
  );
}

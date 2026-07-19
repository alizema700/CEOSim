import { useState, type ReactNode } from 'react';
import { KPI_DEFINITIONS, type KpiId } from '@boardroom/shared';
import { formatByUnit, healthColor } from '../format.js';

/** Kleine UI-Bausteine: Modal, Panel, KPI-Karte mit Formel-Tooltip. */

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className={`panel max-h-[85vh] w-full overflow-y-auto ${wide ? 'max-w-3xl' : 'max-w-xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="text-[11px] uppercase tracking-widest text-dim">{title}</div>
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
      <div className="p-3">{children}</div>
    </div>
  );
}

/**
 * KPI-Karte mit Formel-Tooltip (Didaktik-Kernstück):
 * Klick auf die Karte ⇒ Popover mit Definition, Formel und kontextueller
 * Einordnung — jeder Fachbegriff ist erklärbar, nichts ist Blackbox.
 */
export function KpiCard({ id, value, contextDe }: { id: KpiId; value: number; contextDe?: string }) {
  const [open, setOpen] = useState(false);
  const def = KPI_DEFINITIONS[id];
  return (
    <div className="relative">
      <button
        className="panel w-full cursor-help px-3 py-2 text-left transition-colors hover:border-accent"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="text-[10px] uppercase tracking-wider text-dim">{def.labelDe}</div>
        <div className={`num mt-0.5 text-lg ${healthColor(value, def)}`}>{formatByUnit(value, def.unit)}</div>
      </button>
      {open && (
        <div className="panel absolute left-0 top-full z-30 mt-1 w-72 p-3 shadow-xl" onMouseLeave={() => setOpen(false)}>
          <div className="mb-1 text-xs font-bold text-accent">{def.labelDe}</div>
          <p className="mb-2 text-xs leading-relaxed text-ink">{def.definitionDe}</p>
          <div className="mb-2 rounded bg-panel2 p-2 text-[11px] text-warn">{def.formulaDe}</div>
          {contextDe && <p className="text-[11px] leading-relaxed text-dim">💡 {contextDe}</p>}
        </div>
      )}
    </div>
  );
}

export function StatRow({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line/50 py-1 last:border-0">
      <span className="text-xs text-dim" title={hint}>
        {label}
      </span>
      <span className="num text-xs">{value}</span>
    </div>
  );
}

export function Bar({ value, max = 100, color = 'bg-accent' }: { value: number; max?: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-panel2">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

export function scoreColor(v: number): string {
  return v >= 65 ? 'bg-good' : v >= 45 ? 'bg-warn' : 'bg-bad';
}

export function GradeBadge({ grade }: { grade: number }) {
  const color = grade <= 2 ? 'text-good border-good/50' : grade <= 4 ? 'text-warn border-warn/50' : 'text-bad border-bad/50';
  return <span className={`num inline-block rounded border px-2 py-0.5 text-sm font-bold ${color}`}>Note {grade}</span>;
}

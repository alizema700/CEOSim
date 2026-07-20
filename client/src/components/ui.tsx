import { useState, type ReactNode } from 'react';
import { KPI_DEFINITIONS, type KpiId } from '@boardroom/shared';
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

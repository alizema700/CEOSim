import type { KpiDefinition } from '@boardroom/shared';

/** Zahlformatierung de-DE — Zahlen im UI immer über diese Helfer. */

export function eur(v: number, compact = true): string {
  if (!Number.isFinite(v)) return '—';
  if (compact && Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} M€`;
  if (compact && Math.abs(v) >= 10_000) return `${Math.round(v / 1000).toLocaleString('de-DE')} k€`;
  return `${Math.round(v).toLocaleString('de-DE')} €`;
}

export function pct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  return `${(v * 100).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

export function num(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('de-DE', { maximumFractionDigits: digits });
}

export function formatByUnit(v: number, unit: KpiDefinition['unit']): string {
  switch (unit) {
    case 'eur':
      return eur(v);
    case 'eurPerMonth':
      return `${eur(v)}/M`;
    case 'pct':
      return pct(v);
    case 'ratio':
      return num(v, 2) + '×';
    case 'weeks':
      return v >= 900 ? '∞' : `${num(v)} W`;
    case 'months':
      return `${num(v, 1)} M`;
    case 'days':
      return `${num(v)} T`;
    case 'count':
      return num(v);
    case 'score':
      return num(v, 0);
    case 'index':
      return num(v, 0);
  }
}

/** Ampel-Farbe einer Kennzahl anhand der Definition. */
export function healthColor(v: number, def: KpiDefinition): string {
  const test = (c: { comparator: 'gte' | 'lte'; value: number }) =>
    c.comparator === 'gte' ? v >= c.value : v <= c.value;
  if (def.badWhen && test(def.badWhen)) return 'text-bad';
  if (def.goodWhen && test(def.goodWhen)) return 'text-good';
  return 'text-ink';
}

export function dateDe(iso: string): string {
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

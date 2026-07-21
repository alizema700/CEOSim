import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Hochzählende Zahl (Design-Spektakel D5). Animiert weich vom vorherigen zum
 * neuen Wert — z. B. wenn nach dem Wochenabschluss die Kennzahlen springen.
 * Respektiert prefers-reduced-motion (dann sofortiger Wert). Der Formatter
 * bestimmt die Darstellung (eur, num, pct …).
 */
export function CountUp({
  value,
  format,
  durationMs = 750,
  className,
  style,
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || from === to || durationMs <= 0) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out-cubic
      setDisplay(from + (to - from) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, durationMs]);

  return <span className={className} style={style}>{format(display)}</span>;
}

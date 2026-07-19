/**
 * Deterministischer Zufall.
 *
 * Jede Spielsitzung hat EINEN Seed. Für jeden Verwendungszweck wird ein
 * unabhängiger Substream abgeleitet: rng = stream(seed, 'attrition', week).
 * Dadurch verschiebt eine zusätzliche Ziehung in Subsystem A nicht die
 * Ergebnisse von Subsystem B — Replays bleiben stabil, auch wenn innerhalb
 * einer Woche Code hinzukommt, der einen NEUEN Stream nutzt.
 */

/** FNV-1a-Hash für Stream-Namen. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Rng = () => number;

/** mulberry32 — schnell, gut genug für Spielsimulationen. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unabhängiger Substream für (seed, zweck, woche[, salt]). */
export function stream(seed: number, purpose: string, week: number, salt = 0): Rng {
  return mulberry32((seed ^ fnv1a(`${purpose}:${week}:${salt}`)) >>> 0);
}

/** Gleichverteilte Ganzzahl in [0, n). */
export function pickIndex(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  const v = arr[pickIndex(rng, arr.length)];
  if (v === undefined) throw new Error('pick from empty array');
  return v;
}

/** Normalverteilt (Box-Muller), gekappt auf ±3σ. */
export function gaussian(rng: Rng, mean: number, stdDev: number): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + stdDev * Math.max(-3, Math.min(3, z));
}

/** Zufällige Ganzzahl in [lo, hi] (inklusive). */
export function intBetween(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

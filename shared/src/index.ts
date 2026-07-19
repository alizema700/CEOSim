/**
 * @boardroom/shared — Datenmodell + deterministische Simulations-Engine.
 *
 * Architektur: „Trennung von Wahrheit und Erzählung"
 * - Dieses Paket ist die WAHRHEIT: deterministischer TypeScript-Code, der als
 *   Einziger Zahlen verändert. Läuft identisch in Tests, Server und Replays.
 * - Die ERZÄHLUNG (LLM-Personas, Analysen-Prosa) lebt im Server und darf den
 *   State niemals mutieren.
 */

// ── Datenmodell ──────────────────────────────────────────────────────
export * from './types/common.js';
export * from './types/identity.js';
export * from './types/finance.js';
export * from './types/people.js';
export * from './types/customers.js';
export * from './types/product.js';
export * from './types/market.js';
export * from './types/ceo.js';
export * from './types/effects.js';
export * from './types/actions.js';
export * from './types/randomEvents.js';
export * from './types/kpi.js';
export * from './types/evaluation.js';
export * from './types/company.js';
export * from './types/game.js';

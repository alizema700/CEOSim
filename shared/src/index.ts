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
export * from './types/comms.js';
export * from './types/strategy.js';
export * from './types/funding.js';
export * from './types/ipo.js';
export * from './types/labor.js';
export * from './types/legal.js';
export * from './types/board.js';
export * from './types/takeover.js';
export * from './types/crisis.js';
export * from './types/macro.js';
export * from './types/rivalry.js';
export * from './types/politics.js';
export * from './types/company.js';
export * from './types/game.js';

// ── Engine (deterministisch — die „Wahrheit") ────────────────────────
export * from './engine/rng.js';
export * from './engine/names.js';
export * from './engine/scenarios/locations.js';
export * from './engine/scenarios/difficulty.js';
export * from './engine/init.js';
export * from './engine/derive.js';
export * from './engine/kpis.js';
export * from './engine/stateHelpers.js';
export * from './engine/comms.js';
export * from './engine/projects.js';
export * from './engine/actions.js';
export * from './engine/eventsDeck.js';
export * from './engine/board.js';
export * from './engine/tick.js';
export * from './engine/invariants.js';
export * from './engine/evaluate.js';
export * from './engine/replay.js';
export * from './engine/precedents.js';
export * from './engine/funding.js';
export * from './engine/ma.js';
export * from './engine/competitors.js';
export * from './engine/ipo.js';
export * from './engine/labor.js';
export * from './engine/legal.js';
export * from './engine/governance.js';
export * from './engine/equity.js';
export * from './engine/ceo.js';
export * from './engine/takeover.js';
export * from './engine/crisis.js';
export * from './engine/macro.js';
export * from './engine/macroShocks.js';
export * from './engine/outlook.js';
export * from './engine/rivalry.js';
export * from './engine/politics.js';
export * from './engine/regulation.js';
export * from './types/insurance.js';
export * from './engine/insurance.js';
export * from './types/certifications.js';
export * from './engine/certifications.js';
export * from './engine/voices.js';
export * from './engine/productStudio.js';
export * from './types/fiskus.js';
export * from './engine/fiskus.js';
export * from './engine/legacy.js';

// ── Kuratierte Daten (Phase 4) ───────────────────────────────────────
// BEWUSST explizite Re-Exporte statt `export *`: Diese Module sind Blätter,
// die sonst niemand direkt importiert (nur die Views). Bei `export *` kann
// Vites Dep-Optimizer die Re-Exporte je nach Plattform/Timing verschlucken —
// Symptom im Browser: „does not provide an export named 'GLOSSARY'". Benannte
// Re-Exporte sind für esbuild/Vite immer statisch auflösbar.
export { PRECEDENT_CASES } from './data/precedents.js';
export type { PrecedentTag, PrecedentCase } from './data/precedents.js';
export { GLOSSARY } from './data/glossary.js';
export type { GlossaryEntry } from './data/glossary.js';

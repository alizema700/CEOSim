import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@boardroom/shared': path.resolve(here, '../shared/src/index.ts'),
    },
  },
  // @boardroom/shared ist ROHER Quellcode (Monorepo, kein Build). Vite darf
  // ihn NICHT per esbuild vorbündeln: Der Dep-Optimizer verschluckt sonst
  // je nach Plattform/Timing die `export *`-Re-Exports von Blatt-Modulen,
  // die kein anderes Modul direkt importiert (z. B. GLOSSARY aus data/
  // glossary.ts) — Symptom: „does not provide an export named 'GLOSSARY'".
  // Ausschluss ⇒ Vite serviert das Paket als Quell-ESM, wo `export *`
  // nativ & zuverlässig funktioniert.
  optimizeDeps: {
    exclude: ['@boardroom/shared'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});

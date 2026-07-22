import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRouter, errorHandler } from './routes.js';
import { getDb } from './db.js';
import { llmAvailable, llmModel } from './llm.js';

const PORT = Number(process.env.PORT ?? 3001);
const here = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use('/api', buildRouter());

// Deployment: liegt ein gebautes Frontend vor (client/dist), liefert der
// Server es direkt mit aus — eine URL für App + API, kein zweiter Dienst.
// Im lokalen Dev übernimmt weiterhin Vite (Port 5173) mit /api-Proxy.
const clientDist = process.env.BOARDROOM_CLIENT_DIST ?? path.resolve(here, '..', '..', 'client', 'dist');
const hasFrontend = existsSync(path.join(clientDist, 'index.html'));
if (hasFrontend) {
  app.use(express.static(clientDist));
  // SPA-Fallback: alle GET-Routen außerhalb von /api landen auf index.html.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

getDb(); // Migrationen beim Start

app.listen(PORT, () => {
  console.log(`▙ Boardroom-Server läuft auf http://localhost:${PORT}`);
  if (hasFrontend) console.log(`▙ Frontend wird mit ausgeliefert (${clientDist})`);
  console.log(
    llmAvailable()
      ? `▙ LLM-Erzählschicht aktiv (${llmModel()})`
      : '▙ Kein API-Key (OPENAI_API_KEY oder ANTHROPIC_API_KEY in server/.env) — Simulation läuft vollständig regelbasiert (das ist ok).',
  );
});

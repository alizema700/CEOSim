import 'dotenv/config';
import express from 'express';
import { buildRouter, errorHandler } from './routes.js';
import { getDb } from './db.js';
import { llmAvailable, llmModel } from './llm.js';

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
app.use('/api', buildRouter());
app.use(errorHandler);

getDb(); // Migrationen beim Start

app.listen(PORT, () => {
  console.log(`▙ Boardroom-Server läuft auf http://localhost:${PORT}`);
  console.log(
    llmAvailable()
      ? `▙ LLM-Erzählschicht aktiv (${llmModel()})`
      : '▙ Kein ANTHROPIC_API_KEY — Simulation läuft vollständig regelbasiert (das ist ok).',
  );
});

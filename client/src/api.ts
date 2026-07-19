import type {
  ActionValidation,
  CompanyState,
  DecisionRecord,
  Evaluation,
  GameEvent,
  GameSetup,
  GameSummary,
  Hypothesis,
  PlayerAction,
  WeekReport,
} from '@boardroom/shared';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* Rohtext ignorieren */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listGames: () => http<{ games: GameSummary[] }>('/games'),
  createGame: (setup: GameSetup) => http<{ state: CompanyState }>('/games', { method: 'POST', body: JSON.stringify(setup) }),
  getGame: (id: string) => http<{ state: CompanyState; evaluations: Evaluation[] }>(`/games/${id}`),
  deleteGame: (id: string) => http<void>(`/games/${id}`, { method: 'DELETE' }),
  getReports: (id: string, from = 0) => http<{ reports: WeekReport[] }>(`/games/${id}/reports?from=${from}`),
  validateAction: (id: string, action: PlayerAction) =>
    http<{ validation: ActionValidation }>(`/games/${id}/actions/validate`, { method: 'POST', body: JSON.stringify({ action }) }),
  act: (id: string, action: PlayerAction, hypothesis: Hypothesis | null) =>
    http<{ record: DecisionRecord; state: CompanyState }>(`/games/${id}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action, hypothesis }),
    }),
  closeWeek: (id: string) =>
    http<{ report: WeekReport; evaluations: Evaluation[]; state: CompanyState }>(`/games/${id}/close-week`, { method: 'POST' }),
  llmUsage: () =>
    http<{
      totalCalls: number;
      cachedCalls: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      byTask: { task: string; calls: number; costUsd: number }[];
      available: boolean;
      model: string;
    }>('/settings/llm'),
  importGame: (events: GameEvent[]) => http<{ state: CompanyState }>('/games/import', { method: 'POST', body: JSON.stringify({ events }) }),
};

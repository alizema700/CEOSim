import { create } from 'zustand';
import type {
  CompanyState,
  Evaluation,
  GameSetup,
  GameSummary,
  Hypothesis,
  PlayerAction,
  WeekReport,
  DecisionRecord,
} from '@boardroom/shared';
import { api } from './api.js';

export type View =
  | 'saves'
  | 'wizard'
  | 'dashboard'
  | 'decisions'
  | 'evaluations'
  | 'finance'
  | 'team'
  | 'customers'
  | 'market'
  | 'settings';

interface BoardroomStore {
  view: View;
  games: GameSummary[];
  state: CompanyState | null;
  evaluations: Evaluation[];
  reports: WeekReport[];
  /** Bericht der zuletzt abgeschlossenen Woche (Modal). */
  weekReport: WeekReport | null;
  /** Zuletzt getroffene Entscheidung (Sofort-Analyse-Panel). */
  lastDecision: DecisionRecord | null;
  busy: boolean;
  error: string | null;
  hypothesisMode: boolean; // Hypothese-Abfrage an/aus (didaktisch)

  setView: (v: View) => void;
  setError: (e: string | null) => void;
  setHypothesisMode: (on: boolean) => void;
  dismissWeekReport: () => void;
  loadGames: () => Promise<void>;
  openGame: (id: string) => Promise<void>;
  createGame: (setup: GameSetup) => Promise<void>;
  deleteGame: (id: string) => Promise<void>;
  act: (action: PlayerAction, hypothesis: Hypothesis | null) => Promise<DecisionRecord | null>;
  closeWeek: () => Promise<void>;
  leaveGame: () => void;
}

export const useStore = create<BoardroomStore>((set, get) => ({
  view: 'saves',
  games: [],
  state: null,
  evaluations: [],
  reports: [],
  weekReport: null,
  lastDecision: null,
  busy: false,
  error: null,
  hypothesisMode: true,

  setView: (view) => set({ view }),
  setError: (error) => set({ error }),
  setHypothesisMode: (hypothesisMode) => set({ hypothesisMode }),
  dismissWeekReport: () => set({ weekReport: null }),

  loadGames: async () => {
    try {
      const { games } = await api.listGames();
      set({ games });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  openGame: async (id) => {
    set({ busy: true, error: null });
    try {
      const [{ state, evaluations }, { reports }] = await Promise.all([api.getGame(id), api.getReports(id)]);
      set({ state, evaluations, reports, view: 'dashboard', lastDecision: null });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ busy: false });
    }
  },

  createGame: async (setup) => {
    set({ busy: true, error: null });
    try {
      const { state } = await api.createGame(setup);
      set({ state, evaluations: [], reports: [], view: 'dashboard', lastDecision: null });
      void get().loadGames();
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ busy: false });
    }
  },

  deleteGame: async (id) => {
    await api.deleteGame(id);
    await get().loadGames();
  },

  act: async (action, hypothesis) => {
    const s = get().state;
    if (!s) return null;
    set({ busy: true, error: null });
    try {
      const { record, state } = await api.act(s.meta.gameId, action, hypothesis);
      set({ state, lastDecision: record });
      return record;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    } finally {
      set({ busy: false });
    }
  },

  closeWeek: async () => {
    const s = get().state;
    if (!s) return;
    set({ busy: true, error: null });
    try {
      const { report, evaluations, state } = await api.closeWeek(s.meta.gameId);
      set((prev) => ({
        state,
        weekReport: report,
        reports: [...prev.reports, report],
        evaluations: [...prev.evaluations, ...evaluations],
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ busy: false });
    }
  },

  leaveGame: () => {
    set({ state: null, evaluations: [], reports: [], view: 'saves', weekReport: null, lastDecision: null });
    void get().loadGames();
  },
}));

// Tab routing (hash based) and hand-off of games between pages.
import { create } from 'zustand';

export type Tab = 'analysis' | 'coach' | 'review';

export interface GameHandoff {
  startFen: string;
  moves: string[];
  ply?: number;
  headers?: Record<string, string>;
}

interface NavState {
  tab: Tab;
  toAnalysis: GameHandoff | null;
  toReview: GameHandoff | null;
  setTab: (t: Tab) => void;
  openInAnalysis: (g: GameHandoff) => void;
  openInReview: (g: GameHandoff) => void;
  consumeAnalysis: () => GameHandoff | null;
  consumeReview: () => GameHandoff | null;
}

const fromHash = (): Tab => {
  const h = typeof location !== 'undefined' ? location.hash.replace(/^#\/?/, '') : '';
  return h === 'coach' || h === 'review' ? h : 'analysis';
};

export const useNav = create<NavState>((set, get) => ({
  tab: fromHash(),
  toAnalysis: null,
  toReview: null,
  setTab: (tab) => {
    if (location.hash !== `#/${tab}`) history.replaceState(null, '', `#/${tab}`);
    set({ tab });
  },
  openInAnalysis: (g) => {
    set({ toAnalysis: g });
    get().setTab('analysis');
  },
  openInReview: (g) => {
    set({ toReview: g });
    get().setTab('review');
  },
  consumeAnalysis: () => {
    const g = get().toAnalysis;
    if (g) set({ toAnalysis: null });
    return g;
  },
  consumeReview: () => {
    const g = get().toReview;
    if (g) set({ toReview: null });
    return g;
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => useNav.setState({ tab: fromHash() }));
}

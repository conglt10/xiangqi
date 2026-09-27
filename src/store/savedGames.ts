// Games finished in Coach mode, kept in localStorage for Review.
import type { Color } from '../xiangqi/types';

export interface SavedGame {
  id: string;
  date: number;
  startFen: string;
  moves: string[];
  playerColor: Color;
  level: number;
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
}

const KEY = 'xq_games_v1';
const MAX = 30;

export function listGames(): SavedGame[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveGame(g: SavedGame) {
  const all = [g, ...listGames().filter((x) => x.id !== g.id)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* quota: ignore */
  }
}

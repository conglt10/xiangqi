// Move classification from win-probability loss (WhyBlunder's table, adapted).

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export const CLASS_ORDER: Classification[] = ['brilliant', 'great', 'best', 'book', 'good', 'inaccuracy', 'mistake', 'blunder'];

export const CLASS_SYMBOL: Record<Classification, string> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  good: '✓',
  book: 'B',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

export const CLASS_COLOR: Record<Classification, string> = {
  brilliant: 'var(--c-brilliant)',
  great: 'var(--c-great)',
  best: 'var(--c-best)',
  good: 'var(--c-good)',
  book: 'var(--c-book)',
  inaccuracy: 'var(--c-inaccuracy)',
  mistake: 'var(--c-mistake)',
  blunder: 'var(--c-blunder)',
};

export interface ClassifyInput {
  /** Mover's expected score if the best move is played. */
  bestWp: number;
  /** Mover's expected score after the played move. */
  playedWp: number;
  /** Mover's expected score for the engine's 2nd choice (if known). */
  secondWp?: number;
  isEngineBest: boolean;
  /** Played move gives up material (SEE < 0) — for Brilliant detection. */
  isSacrifice?: boolean;
  isBook?: boolean;
}

export interface ClassifyOutput {
  classification: Classification;
  delta: number;
  missedWin: boolean;
}

export function classifyMove(i: ClassifyInput): ClassifyOutput {
  const delta = Math.max(0, i.bestWp - i.playedWp);
  const missedWin = i.bestWp >= 0.85 && i.playedWp < 0.55;

  if (i.isBook && delta < 0.04) return { classification: 'book', delta, missedWin: false };

  if (i.isEngineBest || delta <= 0.01) {
    const second = i.secondWp;
    if (
      i.isEngineBest &&
      i.isSacrifice &&
      i.playedWp >= 0.6 &&
      (second === undefined || (second <= 0.9 && i.playedWp - second >= 0.05))
    ) {
      return { classification: 'brilliant', delta, missedWin: false };
    }
    const onlyMove = i.isEngineBest && second !== undefined && i.bestWp - second >= 0.15 && i.bestWp < 0.97;
    return { classification: onlyMove ? 'great' : 'best', delta, missedWin: false };
  }

  let c: Classification;
  if (delta >= 0.22 || missedWin) c = 'blunder';
  else if (delta >= 0.1) c = 'mistake';
  else if (delta >= 0.04) c = 'inaccuracy';
  else c = 'good';

  // Safeguards: simplifying while still clearly winning is not a blunder/mistake.
  if (c === 'blunder' && !missedWin && i.bestWp >= 0.95 && delta < 0.15) c = 'inaccuracy';
  if (c === 'mistake' && i.bestWp > 0.9 && i.playedWp > 0.8) c = 'inaccuracy';

  return { classification: c, delta, missedWin };
}

/** Per-move accuracy (lichess-style) from the win-probability drop. */
export function moveAccuracy(delta: number): number {
  const acc = 103.1668 * Math.exp(-0.04354 * (delta * 100)) - 3.1669;
  return Math.max(0, Math.min(100, acc));
}

export function averageAccuracy(deltas: number[]): number {
  if (!deltas.length) return 100;
  return deltas.reduce((s, d) => s + moveAccuracy(d), 0) / deltas.length;
}

// Full-game review: every position is searched once (MultiPV 3); the search of
// the position after a move doubles as that move's refutation search.
import { engine, type EngineLine } from '../engine/EngineClient';
import { averageAccuracy, classifyMove, type Classification } from '../analysis/classify';
import { explainMove, type Explanation } from '../analysis/explain';
import { isSacrifice } from '../analysis/recognizer';
import { isBookSequence } from '../analysis/book';
import { lineCp, lineWp } from '../analysis/winprob';
import { cacheGet, cachePut, fingerprint } from '../analysis/cache';
import { gameStatus, makeMove, parseFen, toFen, toWxf, uciToMove } from '../xiangqi';
import { START_FEN, type Color, type Position } from '../xiangqi/types';

export interface PlyReview {
  ply: number; // 1-based
  uci: string;
  wxf: string;
  color: Color;
  bestUci: string | null;
  bestWxf: string;
  /** Mover's expected score with the best move / with the played move. */
  bestWp: number;
  playedWp: number;
  /** Red's expected score and centipawns after the move (for the graph). */
  redWpAfter: number;
  redCpAfter: number;
  classification: Classification;
  delta: number;
  missedWin: boolean;
  topLines: EngineLine[]; // pre-move lines, mover POV
  explanation: Explanation;
}

export interface GameReview {
  startFen: string;
  moves: string[];
  depth: number;
  redWpStart: number;
  plies: PlyReview[];
  accuracy: Record<Color, number>;
  counts: Record<Color, Partial<Record<Classification, number>>>;
}

export interface ReviewOptions {
  depth?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: { cancelled: boolean };
}

interface PosEval {
  lines: EngineLine[];
  /** Expected score for the side to move. */
  wp: number;
  cp: number;
  terminal: boolean;
}

async function evaluate(pos: Position, depth: number, signal?: { cancelled: boolean }): Promise<PosEval> {
  const st = gameStatus(pos);
  if (st.over) return { lines: [], wp: st.winner === pos.turn ? 1 : 0, cp: st.winner === pos.turn ? 10000 : -10000, terminal: true };
  const handle = engine.analyze({ fen: toFen(pos), multipv: 3, depth, priority: 'review', timeout: 20000 });
  const poll = setInterval(() => signal?.cancelled && handle.cancel(), 200);
  const res = await handle.promise.finally(() => clearInterval(poll));
  const top = res.lines[0];
  return { lines: res.lines, wp: top ? lineWp(top) : 0.5, cp: top ? lineCp(top) : 0, terminal: false };
}

export async function reviewGame(startFen: string, moves: string[], opts: ReviewOptions = {}): Promise<GameReview | null> {
  const depth = opts.depth ?? 14;
  const key = fingerprint(startFen, moves) + ':' + depth;
  const cached = cacheGet<GameReview>(key);
  if (cached) return cached;

  const positions: Position[] = [parseFen(startFen)];
  for (const u of moves) {
    const m = uciToMove(positions[positions.length - 1], u);
    if (!m) break;
    positions.push(makeMove(positions[positions.length - 1], m));
  }
  const n = positions.length - 1;
  const evals: PosEval[] = [];
  for (let i = 0; i <= n; i++) {
    if (opts.signal?.cancelled) return null;
    evals.push(await evaluate(positions[i], depth, opts.signal));
    opts.onProgress?.(i + 1, n + 1);
  }
  if (opts.signal?.cancelled) return null;

  const standardStart = startFen.split(' ')[0] === START_FEN.split(' ')[0];
  const plies: PlyReview[] = [];
  for (let i = 1; i <= n; i++) {
    const before = positions[i - 1];
    const uci = moves[i - 1];
    const played = uciToMove(before, uci)!;
    const pre = evals[i - 1];
    const post = evals[i];
    const color = before.turn;
    const top = pre.lines[0];
    const bestUci = top?.pv[0] ?? null;
    const bestWp = pre.wp;
    const inLines = pre.lines.find((l) => l.pv[0] === uci);
    const playedWp = inLines ? lineWp(inLines) : 1 - post.wp;
    const second = pre.lines[1];
    const res = classifyMove({
      bestWp,
      playedWp,
      secondWp: second ? lineWp(second) : undefined,
      isEngineBest: bestUci === uci,
      isSacrifice: bestUci === uci && isSacrifice(before, played),
      isBook: standardStart && isBookSequence(moves.slice(0, i)),
    });
    const redWpAfter = color === 'r' ? 1 - post.wp : post.wp;
    const redCpAfter = post.terminal ? (redWpAfter > 0.5 ? 10000 : -10000) : toRedCp(post.cp, positions[i].turn);
    const bestMove = bestUci ? uciToMove(before, bestUci) : null;
    const explanation = explainMove({
      before,
      played,
      classification: res.classification,
      delta: res.delta,
      bestPv: top?.pv,
      bestMate: top?.mate,
      refutationPv: post.lines[0]?.pv,
      refutationMate: post.lines[0]?.mate,
    });
    plies.push({
      ply: i,
      uci,
      wxf: toWxf(before, played),
      color,
      bestUci,
      bestWxf: bestMove ? toWxf(before, bestMove) : '',
      bestWp,
      playedWp,
      redWpAfter,
      redCpAfter,
      classification: res.classification,
      delta: res.delta,
      missedWin: res.missedWin,
      topLines: pre.lines,
      explanation,
    });
  }

  const accuracy = { r: 0, b: 0 } as Record<Color, number>;
  const counts: GameReview['counts'] = { r: {}, b: {} };
  for (const c of ['r', 'b'] as Color[]) {
    const mine = plies.filter((p) => p.color === c);
    accuracy[c] = averageAccuracy(mine.map((p) => p.delta));
    for (const p of mine) counts[c][p.classification] = (counts[c][p.classification] ?? 0) + 1;
  }
  const redWpStart = positions[0].turn === 'r' ? evals[0].wp : 1 - evals[0].wp;
  const review: GameReview = { startFen, moves: moves.slice(0, n), depth, redWpStart, plies, accuracy, counts };
  cachePut(key, review);
  return review;
}

/** Converts a side-to-move cp score into Red's POV. */
function toRedCp(cp: number, stm: Color): number {
  return stm === 'r' ? cp : -cp;
}

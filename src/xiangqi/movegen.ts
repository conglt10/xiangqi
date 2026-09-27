// Public move generation / game-state API.
import { boardToFen, parseSquare, squareName } from './board';
import {
  attackersCore,
  coreFromPosition,
  genLegal,
  genLegalFrom,
  inCheckCore,
  kingAttacked,
  perftCore,
  sideOf,
} from './core';
import { type Color, type GameStatus, type Move, type Position, type Square, opposite } from './types';

function toMove(pos: Position, m: number): Move {
  const from = (m / 128) | 0, to = m & 127;
  const mv: Move = { from, to, piece: pos.board[from]! };
  const cap = pos.board[to];
  if (cap) mv.captured = cap;
  return mv;
}

function movesFromCodes(pos: Position, codes: number[]): Move[] {
  return codes.map((m) => toMove(pos, m));
}

/** All legal moves for the side to move. */
export function legalMoves(pos: Position): Move[] {
  const c = coreFromPosition(pos);
  const out: number[] = [];
  genLegal(c, out);
  return movesFromCodes(pos, out);
}

/** Legal moves of the piece on `sq` (empty if not the side to move's piece). */
export function legalMovesFrom(pos: Position, s: Square): Move[] {
  const c = coreFromPosition(pos);
  const out: number[] = [];
  genLegalFrom(c, s, out);
  return movesFromCodes(pos, out);
}

/** Is `color`'s king in check (including flying-general exposure)? */
export function isInCheck(pos: Position, color: Color): boolean {
  const c = coreFromPosition(pos);
  return inCheckCore(c, sideOf(color));
}

/** Can any piece of `byColor` pseudo-legally capture on `sq`? */
export function isAttacked(pos: Position, s: Square, byColor: Color): boolean {
  const c = coreFromPosition(pos);
  return attackersCore(c.b, s, sideOf(byColor)).length > 0;
}

/**
 * Returns a new position with `move` played (no legality check). Halfmove clock
 * resets on capture, fullmove increments after Black moves.
 */
export function makeMove(pos: Position, move: Move): Position {
  const board = pos.board.slice();
  const piece = board[move.from] ?? move.piece;
  const captured = board[move.to];
  board[move.to] = piece;
  board[move.from] = null;
  return {
    board,
    turn: opposite(pos.turn),
    halfmove: captured ? 0 : pos.halfmove + 1,
    fullmove: pos.turn === 'b' ? pos.fullmove + 1 : pos.fullmove,
  };
}

/** Board + side-to-move part of the FEN, e.g. `rnbakabnr/... w`. */
export function positionKey(pos: Position): string {
  return `${boardToFen(pos.board)} ${pos.turn === 'r' ? 'w' : 'b'}`;
}

function normalizeKey(k: string): string {
  const parts = k.trim().split(/\s+/);
  const side = (parts[1] ?? 'w').toLowerCase() === 'b' ? 'b' : 'w';
  return `${parts[0]} ${side}`;
}

/**
 * Game status. No legal moves = loss for the side to move ('checkmate' if in
 * check, otherwise 'stalemate'). If `history` (position keys or full FENs) is
 * given and the current position occurs 3+ times (counting the current position
 * once even if it is not the last history entry) → draw by 'repetition'.
 */
export function gameStatus(pos: Position, history?: string[]): GameStatus {
  const c = coreFromPosition(pos);
  const out: number[] = [];
  genLegal(c, out);
  if (out.length === 0) {
    return {
      over: true,
      winner: opposite(pos.turn),
      reason: inCheckCore(c, c.side) ? 'checkmate' : 'stalemate',
    };
  }
  if (history && history.length) {
    const key = positionKey(pos);
    const keys = history.map(normalizeKey);
    let count = keys.filter((k) => k === key).length;
    if (keys[keys.length - 1] !== key) count++;
    if (count >= 3) return { over: true, reason: 'repetition' };
  }
  return { over: false };
}

export function moveToUci(m: Pick<Move, 'from' | 'to'>): string {
  return squareName(m.from) + squareName(m.to);
}

/** Parses a UCI move (e.g. `h2e2`); returns null unless it is legal in `pos`. */
export function uciToMove(pos: Position, uci: string): Move | null {
  const t = uci.trim();
  if (t.length !== 4) return null;
  const from = parseSquare(t.slice(0, 2));
  const to = parseSquare(t.slice(2, 4));
  if (from < 0 || to < 0) return null;
  return legalMovesFrom(pos, from).find((m) => m.to === to) ?? null;
}

/** Is the given move legal in `pos`? */
export function isLegalMove(pos: Position, move: Pick<Move, 'from' | 'to'>): boolean {
  return legalMovesFrom(pos, move.from).some((m) => m.to === move.to);
}

/** Perft node count (for testing / benchmarking). */
export function perft(pos: Position, depth: number): number {
  return perftCore(coreFromPosition(pos), depth);
}

/** Would the side to move's king be in check if it stood on `s`? (utility) */
export function isSquareCheckedFor(pos: Position, s: Square, color: Color): boolean {
  const c = coreFromPosition(pos);
  return kingAttacked(c.b, s, -sideOf(color));
}

// Tactical helpers: piece values, attackers, static exchange evaluation.
import { CODE_TYPE, attackersCore, coreFromPosition, sideOf, kingAttacked, K } from './core';
import { type Color, type Move, type Piece, type PieceType, type Position, type Square, opposite, rankOf } from './types';

export const PIECE_VALUES: Record<PieceType, number> = { k: 1000, r: 9, c: 4.5, n: 4, b: 2, a: 2, p: 1 };

/** Value in pawn units; a pawn that has crossed the river is worth 2. */
export function pieceValue(piece: Piece, s: Square): number {
  if (piece.type === 'p') {
    const r = rankOf(s);
    const crossed = piece.color === 'r' ? r >= 5 : r <= 4;
    return crossed ? 2 : 1;
  }
  return PIECE_VALUES[piece.type];
}

function codeValue(code: number, s: number): number {
  const t = CODE_TYPE[Math.abs(code)];
  if (t === 'p') {
    const r = (s / 9) | 0;
    return (code > 0 ? r >= 5 : r <= 4) ? 2 : 1;
  }
  return PIECE_VALUES[t];
}

/**
 * Squares of all pieces of `color` that could pseudo-legally capture on `sq`
 * (whatever occupies it), honouring cannon screens, horse legs, elephant eyes and
 * the river, and palace limits. Kings count only when palace-adjacent.
 */
export function attackersOf(pos: Position, s: Square, color: Color): Square[] {
  const c = coreFromPosition(pos);
  return attackersCore(c.b, s, sideOf(color));
}

/** Pieces of `color` defending `sq` (same semantics as attackersOf). */
export function defendersOf(pos: Position, s: Square, color: Color): Square[] {
  return attackersOf(pos, s, color);
}

/**
 * Gain for `side` from optimally continuing captures on `s` (it may stop at 0).
 * Board is mutated during recursion and restored.
 */
function seeSquare(b: Int8Array, s: number, side: number, depth: number): number {
  if (depth > 32) return 0;
  const atk = attackersCore(b, s, side);
  if (atk.length === 0) return 0;
  // Least valuable attacker first.
  let best = -1, bestVal = Infinity;
  for (const a of atk) {
    const v = codeValue(b[a], a);
    if (v < bestVal) {
      bestVal = v;
      best = a;
    }
  }
  const target = b[s];
  const gain = codeValue(target, s);
  const mover = b[best];
  b[s] = mover;
  b[best] = 0;
  let result: number;
  if (Math.abs(mover) === K && kingAttacked(b, s, -side)) {
    result = 0; // king may not capture into a defended square
  } else if (Math.abs(target) === K) {
    result = gain;
  } else {
    result = Math.max(0, gain - seeSquare(b, s, -side, depth + 1));
  }
  b[best] = mover;
  b[s] = target;
  return result;
}

/**
 * Static exchange evaluation of `move` in pawn units from the mover's point of view:
 * material won minus material lost assuming both sides recapture on the target
 * square with their least valuable attacker and may stop at any time.
 * Attackers are recomputed after each capture (cannon screens change).
 */
export function see(pos: Position, move: Pick<Move, 'from' | 'to'>): number {
  const c = coreFromPosition(pos);
  const b = c.b;
  const mover = b[move.from];
  if (mover === 0) return 0;
  const side = mover > 0 ? 1 : -1;
  const target = b[move.to];
  const gain = target !== 0 ? codeValue(target, move.to) : 0;
  if (Math.abs(target) === K) return gain;
  b[move.to] = mover;
  b[move.from] = 0;
  // A king capturing into a defended square is illegal: treat as losing the king.
  if (Math.abs(mover) === K && kingAttacked(b, move.to, -side)) return gain - PIECE_VALUES.k;
  return gain - seeSquare(b, move.to, -side, 0);
}

/** Can the opponent of the piece on `sq` win material by capturing it (SEE > 0)? */
export function isHanging(pos: Position, s: Square): boolean {
  const p = pos.board[s];
  if (!p) return false;
  const opp = opposite(p.color);
  for (const a of attackersOf(pos, s, opp)) {
    if (see(pos, { from: a, to: s }) > 0) return true;
  }
  return false;
}

/** Total material of `color` in pawn units, excluding the king. */
export function materialCount(pos: Position, color: Color): number {
  let sum = 0;
  for (let s = 0; s < 90; s++) {
    const p = pos.board[s];
    if (p && p.color === color && p.type !== 'k') sum += pieceValue(p, s);
  }
  return sum;
}

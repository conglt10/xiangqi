// Xiangqi version of WhyBlunder's SituationRecognizer: turns a move into a
// concrete tactical motif with the squares that explain it.
import { attackersOf, isInCheck, legalMoves, makeMove, pieceValue, see } from '../xiangqi';
import { fileOf, opposite, rankOf, type Color, type Move, type PieceType, type Position, type Square } from '../xiangqi/types';

export type Motif =
  | 'mate'
  | 'fork'
  | 'discovered'
  | 'pin'
  | 'winMaterial'
  | 'hanging'
  | 'check'
  | 'positional';

export interface MotifResult {
  motif: Motif;
  move: Move;
  /** Squares of the pieces the tactic hits. */
  targets: Square[];
  targetTypes: PieceType[];
  /** For discovered attacks / pins: the line piece doing the work. */
  lineSquare?: Square;
  /** Mate distance when motif === 'mate'. */
  mateIn?: number;
  /** Material gained (pawn units) when known. */
  gain?: number;
}

const kingSquare = (pos: Position, c: Color): Square => pos.board.findIndex((p) => p?.type === 'k' && p.color === c);

/** Opponent pieces that the piece on `from` attacks in `pos` (as if its side were to move). */
function attackedBy(pos: Position, from: Square): Square[] {
  const me = pos.board[from];
  if (!me) return [];
  const out: Square[] = [];
  for (let s = 0; s < 90; s++) {
    const p = pos.board[s];
    if (p && p.color !== me.color && attackersOf(pos, s, me.color).includes(from)) out.push(s);
  }
  return out;
}

/** A target is "real" if it's the king, or capturing it wins material by SEE. */
function isRealTarget(pos: Position, attacker: Square, target: Square): boolean {
  const t = pos.board[target];
  const a = pos.board[attacker];
  if (!t || !a) return false;
  if (t.type === 'k') return true;
  const asMover: Position = { ...pos, turn: a.color };
  return see(asMover, { from: attacker, to: target }) > 0;
}

/** Is the piece on `s` capturable by its opponent with a positive exchange? */
function isLoose(pos: Position, s: Square): boolean {
  const p = pos.board[s];
  if (!p) return false;
  const opp = opposite(p.color);
  const asOpp: Position = { ...pos, turn: opp };
  return attackersOf(pos, s, opp).some((a) => see(asOpp, { from: a, to: s }) > 0);
}

export function detectFork(before: Position, move: Move): MotifResult | null {
  const after = makeMove(before, move);
  if (isLoose(after, move.to) && !isInCheck(after, after.turn)) return null;
  const targets = attackedBy(after, move.to).filter((t) => isRealTarget(after, move.to, t));
  if (targets.length < 2) return null;
  targets.sort((a, b) => pieceValue(after.board[b]!, b) - pieceValue(after.board[a]!, a));
  return { motif: 'fork', move, targets, targetTypes: targets.map((t) => after.board[t]!.type) };
}

export function detectDiscovered(before: Position, move: Move): MotifResult | null {
  const after = makeMove(before, move);
  const me = move.piece.color;
  for (let s = 0; s < 90; s++) {
    const p = after.board[s];
    if (!p || p.color !== me || s === move.to || (p.type !== 'r' && p.type !== 'c' && p.type !== 'n')) continue;
    const prev = new Set(attackedBy(before, s));
    const fresh = attackedBy(after, s).filter((t) => !prev.has(t) && isRealTarget(after, s, t));
    if (!fresh.length) continue;
    fresh.sort((a, b) => pieceValue(after.board[b]!, b) - pieceValue(after.board[a]!, a));
    return { motif: 'discovered', move, targets: fresh, targetTypes: fresh.map((t) => after.board[t]!.type), lineSquare: s };
  }
  return null;
}

/** Rook pin created by the moved piece: exactly one enemy piece between it and the enemy king or chariot. */
export function detectPin(before: Position, move: Move): MotifResult | null {
  if (move.piece.type !== 'r') return null;
  const after = makeMove(before, move);
  const from = move.to;
  const f0 = fileOf(from);
  const r0 = rankOf(from);
  for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const between: Square[] = [];
    let f = f0 + df;
    let r = r0 + dr;
    while (f >= 0 && f < 9 && r >= 0 && r < 10) {
      const s = r * 9 + f;
      const p = after.board[s];
      if (p) {
        if (between.length === 0) {
          if (p.color === move.piece.color) break;
          between.push(s);
        } else {
          const pinned = after.board[between[0]]!;
          if (p.color !== move.piece.color && (p.type === 'k' || (p.type === 'r' && pinned.type !== 'r'))) {
            return { motif: 'pin', move, targets: [between[0], s], targetTypes: [pinned.type, p.type], lineSquare: from };
          }
          break;
        }
      }
      f += df;
      r += dr;
    }
  }
  return null;
}

export function detectWinMaterial(before: Position, move: Move): MotifResult | null {
  if (!move.captured) return null;
  const gain = see(before, move);
  if (gain <= 0) return null;
  return { motif: 'winMaterial', move, targets: [move.to], targetTypes: [move.captured.type], gain };
}

/** After `move`, the opponent can win one of the mover's pieces. Returns the most valuable one. */
export function detectHangingAfter(before: Position, move: Move): MotifResult | null {
  const after = makeMove(before, move);
  let best: { s: Square; gain: number; capture: Move } | null = null;
  for (const m of legalMoves(after)) {
    if (!m.captured) continue;
    const g = see(after, m);
    if (g > 0 && (!best || g > best.gain)) best = { s: m.to, gain: g, capture: m };
  }
  if (!best) return null;
  return {
    motif: 'hanging',
    move: best.capture,
    targets: [best.s],
    targetTypes: [after.board[best.s]!.type],
    lineSquare: best.capture.from,
    gain: best.gain,
  };
}

/**
 * Classifies the tactical idea behind `move` in `before`. `mateIn` (from the
 * engine, mover's POV) upgrades the motif to mate.
 */
export function classifyTacticalMotif(before: Position, move: Move, mateIn?: number): MotifResult {
  const after = makeMove(before, move);
  const opp = opposite(move.piece.color);
  if (mateIn !== undefined && mateIn > 0) {
    return { motif: 'mate', move, targets: [kingSquare(after, opp)], targetTypes: ['k'], mateIn };
  }
  return (
    detectFork(before, move) ??
    detectDiscovered(before, move) ??
    detectPin(before, move) ??
    detectWinMaterial(before, move) ??
    (isInCheck(after, opp)
      ? { motif: 'check', move, targets: [kingSquare(after, opp)], targetTypes: ['k'] as PieceType[] }
      : { motif: 'positional', move, targets: [], targetTypes: [] })
  );
}

export function isSacrifice(before: Position, move: Move): boolean {
  const after = makeMove(before, move);
  if (!isLoose(after, move.to)) return false;
  const gained = move.captured ? pieceValue(move.captured, move.to) : 0;
  return pieceValue(move.piece, move.to) - gained >= 1.5;
}

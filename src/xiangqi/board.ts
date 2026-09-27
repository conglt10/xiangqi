// Board utilities: FEN parsing/serialisation and square helpers.
import { type Color, type Piece, type PieceType, type Position, type Square, fileOf, rankOf, sq } from './types';

const FILES = 'abcdefghi';
const PIECE_CHARS = 'kabnrcp';

// Shared immutable piece objects (one per color/type) so boards are cheap to copy.
const PIECE_CACHE: Record<string, Piece> = {};
for (const c of ['r', 'b'] as Color[]) {
  for (const t of PIECE_CHARS) {
    PIECE_CACHE[c + t] = Object.freeze({ color: c, type: t as PieceType });
  }
}

/** Returns a shared, frozen piece object for the given color/type. */
export function makePiece(color: Color, type: PieceType): Piece {
  return PIECE_CACHE[color + type];
}

/** Maps FEN letters (including common aliases e/h for elephant/horse) to piece types. */
function charToType(ch: string): PieceType | null {
  const l = ch.toLowerCase();
  if (PIECE_CHARS.includes(l)) return l as PieceType;
  if (l === 'e') return 'b';
  if (l === 'h') return 'n';
  return null;
}

export function pieceToChar(p: Piece): string {
  return p.color === 'r' ? p.type.toUpperCase() : p.type;
}

/**
 * Parses a (Pikafish-style) FEN. Only the board field is required; missing fields
 * default to red to move, halfmove 0, fullmove 1. Side 'w'/'r' = red, 'b' = black.
 * Throws on a malformed board.
 */
export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  const rows = (parts[0] ?? '').split('/');
  if (rows.length !== 10) throw new Error(`Invalid FEN (need 10 ranks): ${fen}`);
  const board: (Piece | null)[] = new Array(90).fill(null);
  for (let i = 0; i < 10; i++) {
    const rank = 9 - i;
    let file = 0;
    for (const ch of rows[i]) {
      if (ch >= '1' && ch <= '9') {
        file += ch.charCodeAt(0) - 48;
      } else {
        const t = charToType(ch);
        if (!t || file > 8) throw new Error(`Invalid FEN: ${fen}`);
        const color: Color = ch === ch.toUpperCase() ? 'r' : 'b';
        board[sq(file, rank)] = makePiece(color, t);
        file++;
      }
    }
    if (file !== 9) throw new Error(`Invalid FEN rank ${rank}: ${fen}`);
  }
  const side = (parts[1] ?? 'w').toLowerCase();
  const turn: Color = side === 'b' ? 'b' : 'r';
  // Fields 3 and 4 are '-' placeholders in xiangqi FEN.
  const halfmove = parseInt(parts[4] ?? '0', 10);
  const fullmove = parseInt(parts[5] ?? '1', 10);
  return {
    board,
    turn,
    halfmove: Number.isFinite(halfmove) && halfmove >= 0 ? halfmove : 0,
    fullmove: Number.isFinite(fullmove) && fullmove >= 1 ? fullmove : 1,
  };
}

/** Board part of the FEN only. */
export function boardToFen(board: (Piece | null)[]): string {
  const rows: string[] = [];
  for (let rank = 9; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 9; file++) {
      const p = board[sq(file, rank)];
      if (!p) {
        empty++;
      } else {
        if (empty) row += empty;
        empty = 0;
        row += pieceToChar(p);
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join('/');
}

/** Full 6-field FEN: `<board> <w|b> - - <halfmove> <fullmove>`. */
export function toFen(pos: Position): string {
  return `${boardToFen(pos.board)} ${pos.turn === 'r' ? 'w' : 'b'} - - ${pos.halfmove} ${pos.fullmove}`;
}

/** 0..89 → 'a0'..'i9'. */
export function squareName(s: Square): string {
  return FILES[fileOf(s)] + String(rankOf(s));
}

/** 'e0' → square index, or -1 if invalid. Case-insensitive. */
export function parseSquare(name: string): Square {
  const m = /^([a-i])([0-9])$/i.exec(name.trim());
  if (!m) return -1;
  return sq(FILES.indexOf(m[1].toLowerCase()), Number(m[2]));
}

export function pieceAt(pos: Position, s: Square): Piece | null {
  return s >= 0 && s < 90 ? pos.board[s] ?? null : null;
}

/** Shallow copy of the board array (pieces are immutable and shared). */
export function cloneBoard(board: (Piece | null)[]): (Piece | null)[] {
  return board.slice();
}

export function clonePosition(pos: Position): Position {
  return { board: pos.board.slice(), turn: pos.turn, halfmove: pos.halfmove, fullmove: pos.fullmove };
}

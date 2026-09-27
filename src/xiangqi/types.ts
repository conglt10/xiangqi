// Core xiangqi types shared by the whole app.
//
// Coordinates: file 0..8 (a..i, left→right from Red's view), rank 0..9
// (0 = Red's back rank, 9 = Black's back rank). Square index = rank * 9 + file.
// UCI squares use the same letters/digits as Pikafish: a0 .. i9.

export type Color = 'r' | 'b'; // red (moves first, uppercase in FEN), black
export type PieceType = 'k' | 'a' | 'b' | 'n' | 'r' | 'c' | 'p'; // king, advisor, bishop(elephant), knight(horse), rook(chariot), cannon, pawn

export interface Piece {
  color: Color;
  type: PieceType;
}

export type Square = number; // 0..89

export interface Position {
  board: (Piece | null)[]; // length 90
  turn: Color;
  halfmove: number; // plies since last capture (FEN field 5)
  fullmove: number; // FEN field 6
}

export interface Move {
  from: Square;
  to: Square;
  piece: Piece;
  captured?: Piece;
}

export type GameResult = 'red' | 'black' | 'draw';

export interface GameStatus {
  over: boolean;
  winner?: Color;
  reason?: 'checkmate' | 'stalemate' | 'repetition';
}

export const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

export const sq = (file: number, rank: number): Square => rank * 9 + file;
export const fileOf = (s: Square) => s % 9;
export const rankOf = (s: Square) => Math.floor(s / 9);
export const opposite = (c: Color): Color => (c === 'r' ? 'b' : 'r');

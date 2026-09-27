import { describe, it, expect } from 'vitest';
import { parseFen, toFen, squareName, parseSquare, pieceAt } from './board';
import {
  gameStatus, isInCheck, legalMoves, legalMovesFrom, makeMove, moveToUci, positionKey, uciToMove,
} from './movegen';
import { START_FEN } from './types';

const ucis = (fen: string, from: string) =>
  legalMovesFrom(parseFen(fen), parseSquare(from)).map(moveToUci).sort();

describe('board', () => {
  it('FEN round trip and defaults', () => {
    expect(toFen(parseFen(START_FEN))).toBe(START_FEN);
    const p = parseFen('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR b');
    expect(p.turn).toBe('b');
    expect(p.halfmove).toBe(0);
    expect(p.fullmove).toBe(1);
    expect(parseFen('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR r').turn).toBe('r');
    expect(squareName(4)).toBe('e0');
    expect(parseSquare('e0')).toBe(4);
    expect(parseSquare('i9')).toBe(89);
    expect(pieceAt(p, parseSquare('e0'))).toEqual({ color: 'r', type: 'k' });
  });
});

describe('move rules', () => {
  it('flying general: king cannot step onto an open file facing the enemy king', () => {
    expect(ucis('3k5/9/9/9/9/9/9/9/9/4K4 w', 'e0')).toEqual(['e0e1', 'e0f0']);
  });
  it('a piece shielding the king from a rook is pinned', () => {
    expect(ucis('4k4/4r4/9/9/9/9/4R4/9/9/3K5 b', 'e8')).toEqual(['e8e3', 'e8e4', 'e8e5', 'e8e6', 'e8e7']);
  });
  it('horse leg blocks', () => {
    expect(ucis('3k5/9/9/9/9/9/9/9/1P7/1N2K4 w', 'b0')).toEqual(['b0d1']);
    expect(ucis('3k5/9/9/9/9/9/9/9/9/1N2K4 w', 'b0')).toEqual(['b0a2', 'b0c2', 'b0d1']);
  });
  it('elephant eye and river', () => {
    expect(ucis('3k5/9/9/9/9/9/9/9/3P5/2B1K4 w', 'c0')).toEqual(['c0a2']);
    expect(ucis('3k5/9/9/9/9/2B6/9/9/9/4K4 w', 'c4')).toEqual(['c4a2', 'c4e2']);
    expect(ucis('3k5/9/9/9/2b6/9/9/9/9/4K4 b', 'c5')).toEqual(['c5a7', 'c5e7']);
  });
  it('advisor and king stay in the palace', () => {
    expect(ucis('3k5/9/9/9/9/9/9/9/4A4/5K3 w', 'e1')).toEqual(['e1d0', 'e1d2', 'e1f2']);
    expect(ucis('3k5/9/9/9/9/9/9/9/9/3K5 w', 'd0').includes('d0c0')).toBe(false);
  });
  it('cannon captures only over exactly one screen', () => {
    const fen = '3k5/9/1r7/9/9/9/1P7/1C7/9/4K4 w';
    const m = ucis(fen, 'b2');
    expect(m).toContain('b2b7');
    expect(m).not.toContain('b2b3');
    expect(m).not.toContain('b2b4');
    expect(m).toEqual(['b2a2', 'b2b0', 'b2b1', 'b2b7', 'b2c2', 'b2d2', 'b2e2', 'b2f2', 'b2g2', 'b2h2', 'b2i2']);
    // two screens: no capture
    expect(ucis('3k5/9/1r7/9/1p7/9/1P7/1C7/9/4K4 w', 'b2')).not.toContain('b2b7');
  });
  it('pawns move sideways only after crossing the river, never backward', () => {
    expect(ucis('5k3/9/9/9/9/9/4P4/9/9/3K5 w', 'e3')).toEqual(['e3e4']);
    expect(ucis('5k3/9/9/9/4P4/9/9/9/9/3K5 w', 'e5')).toEqual(['e5d5', 'e5e6', 'e5f5']);
    expect(ucis('3k4P/9/9/9/9/9/9/9/9/4K4 w', 'i9')).toEqual(['i9h9']);
    expect(ucis('4k4/9/9/4p4/9/9/9/9/9/3K5 b', 'e6')).toEqual(['e6e5']);
    expect(ucis('4k4/9/9/9/9/4p4/9/9/9/3K5 b', 'e4')).toEqual(['e4d4', 'e4e3', 'e4f4']);
  });
  it('start position has 44 moves; makeMove updates counters', () => {
    const p = parseFen(START_FEN);
    expect(legalMoves(p)).toHaveLength(44);
    const a = makeMove(p, uciToMove(p, 'h2e2')!);
    expect(a.turn).toBe('b');
    expect(a.fullmove).toBe(1);
    expect(a.halfmove).toBe(1);
    const b = makeMove(a, uciToMove(a, 'h9g7')!);
    expect(b.fullmove).toBe(2);
    const c = makeMove(b, uciToMove(b, 'e2e6')!); // cannon takes pawn
    expect(c.halfmove).toBe(0);
    expect(p.board[parseSquare('h2')]).not.toBeNull(); // original untouched
    expect(uciToMove(p, 'h2h8')).toBeNull();
    expect(uciToMove(p, 'e0e1')?.piece.type).toBe('k');
  });
});

describe('game status', () => {
  it('checkmate', () => {
    const p = parseFen('1R2k4/R8/9/9/9/9/9/9/9/3K5 b');
    expect(isInCheck(p, 'b')).toBe(true);
    expect(gameStatus(p)).toEqual({ over: true, winner: 'r', reason: 'checkmate' });
  });
  it('stalemate (no legal moves, not in check) is a loss', () => {
    const p = parseFen('4k4/R8/9/9/9/9/9/9/9/3K1R3 b');
    expect(isInCheck(p, 'b')).toBe(false);
    expect(gameStatus(p)).toEqual({ over: true, winner: 'r', reason: 'stalemate' });
  });
  it('check by flying general', () => {
    expect(isInCheck(parseFen('4k4/9/9/9/9/9/9/9/9/4K4 w'), 'r')).toBe(true);
  });
  it('repetition', () => {
    let p = parseFen(START_FEN);
    const hist = [positionKey(p)];
    for (const u of ['h0g2', 'h9g7', 'g2h0', 'g7h9', 'h0g2', 'h9g7', 'g2h0', 'g7h9']) {
      p = makeMove(p, uciToMove(p, u)!);
      hist.push(positionKey(p));
    }
    expect(gameStatus(p, hist)).toEqual({ over: true, reason: 'repetition' });
    expect(gameStatus(p, hist.slice(0, 5))).toEqual({ over: false });
    expect(gameStatus(parseFen(START_FEN))).toEqual({ over: false });
  });
});

describe('flying general pin', () => {
  it('the only piece between the kings cannot leave the file', () => {
    expect(ucis('4k4/9/9/9/4n4/9/9/9/9/4K4 b', 'e5')).toEqual([]);
    expect(ucis('4k4/9/9/9/4r4/9/9/4P4/9/4K4 b', 'e5')).toHaveLength(14); // pawn also shields: rook is free
    expect(ucis('4k4/9/9/9/4r4/9/9/9/9/3K5 b', 'e5')).toHaveLength(16);
  });
});

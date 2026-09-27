import { describe, it, expect } from 'vitest';
import { parseFen, parseSquare as S } from './board';
import { attackersOf, isHanging, materialCount, pieceValue, see } from './attacks';
import { START_FEN } from './types';

const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

describe('attackersOf', () => {
  it('start position', () => {
    const p = parseFen(START_FEN);
    // e2: both elephants; the cannons on the same rank have no screen
    expect(sorted(attackersOf(p, S('e2'), 'r'))).toEqual([S('c0'), S('g0')]);
    // black cannon b7 attacks the b0 horse using the red b2 cannon as screen
    expect(attackersOf(p, S('b0'), 'b')).toEqual([S('b7')]);
    // e6 black pawn attacked by nobody red
    expect(attackersOf(p, S('e6'), 'r')).toEqual([]);
  });
  it('horse leg, elephant eye, palace', () => {
    const p = parseFen('3k5/9/9/9/9/9/9/2N6/3P5/2B1K4 w');
    // horse c2 → e3 (leg d2 empty) ; elephant c0 → e2 blocked by d1 pawn
    expect(attackersOf(p, S('e3'), 'r')).toEqual([S('c2')]);
    expect(attackersOf(p, S('e2'), 'r')).toEqual([]);
    // e1: king e0 (palace), horse c2 (leg d2 empty); d1 pawn cannot move sideways
    expect(sorted(attackersOf(p, S('e1'), 'r'))).toEqual(sorted([S('e0'), S('c2')]));
    // d3: pawn d1? no (two ranks); horse c2 → d4 not d3
    expect(attackersOf(p, S('d2'), 'r')).toEqual([S('d1')]);
  });
});

describe('SEE', () => {
  // black rook e5 defended by pawn e6, red cannon e1 attacks through screen e3
  const fen = '5k3/9/9/4p4/4r4/9/4P4/9/4C4/3K5 w';
  it('cannon takes rook defended by pawn: +9 - 4.5', () => {
    const p = parseFen(fen);
    expect(attackersOf(p, S('e5'), 'r')).toEqual([S('e1')]);
    expect(attackersOf(p, S('e5'), 'b')).toEqual([S('e6')]);
    expect(see(p, { from: S('e1'), to: S('e5') })).toBe(4.5);
    expect(isHanging(p, S('e5'))).toBe(true);
  });
  it('rook takes defended pawn loses material', () => {
    const p = parseFen('5k3/9/9/4p4/4p4/9/9/9/9/3KR4 w');
    // e5 black pawn (not crossed: value 1) defended by e6 pawn
    expect(see(p, { from: S('e0'), to: S('e5') })).toBe(1 - 9);
    expect(isHanging(p, S('e5'))).toBe(false);
  });
  it('undefended piece', () => {
    const p = parseFen('5k3/9/9/9/4n4/9/9/9/9/3KR4 w');
    expect(see(p, { from: S('e0'), to: S('e5') })).toBe(4);
    expect(isHanging(p, S('e5'))).toBe(true);
  });
  it('recapture changes cannon screen', () => {
    // Red rook e0 x black horse e5, black cannon e9 recaptures using e6 screen? No:
    // black cannon e9 with black pawn e6 as screen captures on e5.
    const p = parseFen('3kc4/9/9/4p4/4n4/9/9/9/9/3KR4 w');
    // e5 horse defended by e6 pawn and (after pawn recaptures) cannon loses screen.
    expect(sorted(attackersOf(p, S('e5'), 'b'))).toEqual([S('e6'), S('e9')]);
    expect(see(p, { from: S('e0'), to: S('e5') })).toBe(4 - 9);
  });
  it('x-ray: capturing the screen opens a cannon', () => {
    // black horse e5 defended by rook e9. Red cannon e0 uses red rook e2 as screen.
    const p = parseFen('3kr4/9/9/9/4n4/9/9/4R4/9/3KC4 w');
    expect(sorted(attackersOf(p, S('e5'), 'r'))).toEqual([S('e2'), S('e0')].sort((a, b) => a - b));
    // RxN, RxR and the cannon has lost its screen: 4 - 9
    expect(see(p, { from: S('e2'), to: S('e5') })).toBe(-5);
    // CxN: black RxC would lose the rook to RxR, so black declines: +4
    expect(see(p, { from: S('e0'), to: S('e5') })).toBe(4);
    expect(isHanging(p, S('e5'))).toBe(true);
  });
  it('non-capture into attacked square', () => {
    // black pawn d4 has crossed the river and attacks e4 sideways
    const p = parseFen('5k3/9/9/9/9/3p5/9/9/9/3KR4 w');
    expect(see(p, { from: S('e0'), to: S('e5') })).toBe(0);
    expect(see(p, { from: S('e0'), to: S('e4') })).toBe(-9);
  });
});

describe('values', () => {
  it('pawn value after crossing', () => {
    expect(pieceValue({ color: 'r', type: 'p' }, S('e4'))).toBe(1);
    expect(pieceValue({ color: 'r', type: 'p' }, S('e5'))).toBe(2);
    expect(pieceValue({ color: 'b', type: 'p' }, S('e5'))).toBe(1);
    expect(pieceValue({ color: 'b', type: 'p' }, S('e4'))).toBe(2);
    const p = parseFen(START_FEN);
    expect(materialCount(p, 'r')).toBe(2 * 9 + 2 * 4.5 + 2 * 4 + 2 * 2 + 2 * 2 + 5);
    expect(materialCount(p, 'b')).toBe(materialCount(p, 'r'));
  });
});

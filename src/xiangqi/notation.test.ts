import { describe, it, expect } from 'vitest';
import { parseFen } from './board';
import { legalMoves, makeMove, moveToUci, uciToMove } from './movegen';
import { parseMoveText, toChinese, toWxf } from './notation';
import { type Position, START_FEN } from './types';

const BLACK_START = START_FEN.replace(' w ', ' b ');

function wxf(fen: string, uci: string): string {
  const p = parseFen(fen);
  const m = uciToMove(p, uci);
  expect(m, uci).not.toBeNull();
  return toWxf(p, m!);
}
function cn(fen: string, uci: string): string {
  const p = parseFen(fen);
  return toChinese(p, uciToMove(p, uci)!);
}
function parse(fen: string, text: string): string | null {
  const m = parseMoveText(parseFen(fen), text);
  return m ? moveToUci(m) : null;
}

describe('WXF', () => {
  it('basic moves from the start position', () => {
    expect(wxf(START_FEN, 'h2e2')).toBe('C2=5');
    expect(wxf(START_FEN, 'b0c2')).toBe('H8+7');
    expect(wxf(START_FEN, 'h0g2')).toBe('H2+3');
    expect(wxf(START_FEN, 'i0i1')).toBe('R1+1');
    expect(wxf(START_FEN, 'c3c4')).toBe('P7+1');
    expect(wxf(START_FEN, 'f0e1')).toBe('A4+5');
    expect(wxf(START_FEN, 'g0e2')).toBe('E3+5');
    expect(wxf(START_FEN, 'e0e1')).toBe('K5+1');
    expect(wxf(START_FEN, 'b2b9')).toBe('C8+7');
  });
  it('black moves', () => {
    expect(wxf(BLACK_START, 'h9g7')).toBe('H8+7');
    expect(wxf(BLACK_START, 'b7e7')).toBe('C2=5');
    expect(wxf(BLACK_START, 'c9e7')).toBe('E3+5');
    expect(wxf(BLACK_START, 'g6g5')).toBe('P7+1');
    expect(wxf(BLACK_START, 'a9a8')).toBe('R1+1');
    expect(wxf(BLACK_START, 'f9e8')).toBe('A6+5');
  });
  it('king sideways and backward', () => {
    expect(wxf('9/4k4/9/9/9/4P4/9/9/4K4/9 w', 'e1d1')).toBe('K5=6');
    expect(wxf('9/4k4/9/9/9/4P4/9/9/4K4/9 w', 'e1e0')).toBe('K5-1');
    expect(wxf('9/4k4/9/9/9/4P4/9/9/4K4/9 b', 'e8d8')).toBe('K5=4');
    expect(wxf('9/4k4/9/9/9/4P4/9/9/4K4/9 b', 'e8e9')).toBe('K5-1');
  });
  it('tandem pieces', () => {
    // two red rooks on file a (red file 9): a5 front, a0 rear
    const fen = '4k4/9/9/9/R8/9/9/9/9/R2K5 w';
    expect(wxf(fen, 'a5a6')).toBe('+R+1');
    expect(wxf(fen, 'a0b0')).toBe('-R=8');
    expect(cn(fen, 'a5a6')).toBe('前车进一');
    expect(cn(fen, 'a0b0')).toBe('后车平八');
    // black cannons on e file: front is the one closer to rank 0
    const fen2 = '3k5/9/4c4/9/9/4c4/9/9/9/5K3 b';
    expect(wxf(fen2, 'e4d4')).toBe('+C=4');
    expect(wxf(fen2, 'e7f7')).toBe('-C=6');
    expect(cn(fen2, 'e4d4')).toBe('前炮平4');
    // three pawns on a file, plus a second doubled file
    const fen3 = '5k3/9/9/2P1P4/2P1P4/2P6/9/9/9/4K4 w';
    expect(wxf(fen3, 'c6b6')).toBe('1P7=8');
    expect(wxf(fen3, 'c5b5')).toBe('2P7=8');
    expect(wxf(fen3, 'e6f6')).toBe('+P5=4');
    expect(cn(fen3, 'c6b6')).toBe('前七平八');
    expect(cn(fen3, 'c5b5')).toBe('中七平八');
    expect(cn(fen3, 'e5d5')).toBe('后五平六');
  });
});

describe('Chinese', () => {
  it('examples', () => {
    expect(cn(START_FEN, 'h2e2')).toBe('炮二平五');
    expect(cn(START_FEN, 'h0g2')).toBe('马二进三');
    expect(cn(START_FEN, 'c3c4')).toBe('兵七进一');
    expect(cn(START_FEN, 'f0e1')).toBe('仕四进五');
    expect(cn(START_FEN, 'g0e2')).toBe('相三进五');
    expect(cn(BLACK_START, 'h9g7')).toBe('马8进7');
    expect(cn(BLACK_START, 'b9c7')).toBe('马2进3');
    expect(cn(BLACK_START, 'g6g5')).toBe('卒7进1');
    expect(cn(BLACK_START, 'c9e7')).toBe('象3进5');
    expect(cn(BLACK_START, 'e9e8')).toBe('将5进1');
  });
});

describe('parseMoveText', () => {
  it('UCI / ICCS', () => {
    expect(parse(START_FEN, 'h2e2')).toBe('h2e2');
    expect(parse(START_FEN, 'H2-E2')).toBe('h2e2');
    expect(parse(START_FEN, 'h2-e2')).toBe('h2e2');
    expect(parse(START_FEN, 'h2h8')).toBeNull();
  });
  it('WXF variants', () => {
    expect(parse(START_FEN, 'C2=5')).toBe('h2e2');
    expect(parse(START_FEN, 'C2.5')).toBe('h2e2');
    expect(parse(START_FEN, 'c2=5')).toBe('h2e2');
    expect(parse(START_FEN, 'N2+3')).toBe('h0g2');
    expect(parse(START_FEN, 'B3+5')).toBe('g0e2');
    expect(parse(START_FEN, 'e3+5')).toBe('g0e2');
    expect(parse(START_FEN, 'H8+7!?')).toBe('b0c2');
    expect(parse(BLACK_START, 'h8+7')).toBe('h9g7');
    expect(parse('4k4/9/9/9/R8/9/9/9/9/R2K5 w', '+R+1')).toBe('a5a6');
    expect(parse('4k4/9/9/9/R8/9/9/9/9/R2K5 w', 'R+.8')).toBe('a5b5');
    expect(parse('4k4/9/9/9/R8/9/9/9/9/R2K5 w', 'R9+1')).toBeNull(); // ambiguous
    expect(parse(START_FEN, 'C3=5')).toBeNull();
  });
  it('Chinese variants', () => {
    expect(parse(START_FEN, '炮二平五')).toBe('h2e2');
    expect(parse(START_FEN, '砲2平5')).toBe('h2e2');
    expect(parse(START_FEN, '炮２平５')).toBe('h2e2');
    expect(parse(START_FEN, '傌二進三')).toBe('h0g2');
    expect(parse(START_FEN, '馬八进七')).toBe('b0c2');
    expect(parse(START_FEN, '相三进五')).toBe('g0e2');
    expect(parse(START_FEN, '俥一進一')).toBe('i0i1');
    expect(parse(START_FEN, '帥五進一')).toBe('e0e1');
    expect(parse(BLACK_START, '馬８進７')).toBe('h9g7');
    expect(parse(BLACK_START, '马8进7')).toBe('h9g7');
    expect(parse(BLACK_START, '包２平５')).toBe('b7e7');
    expect(parse(BLACK_START, '將5進1')).toBe('e9e8');
    expect(parse(BLACK_START, '象三进五')).toBe('c9e7');
    expect(parse('4k4/9/9/9/R8/9/9/9/9/R2K5 w', '後車平八')).toBe('a0b0');
    expect(parse('5k3/9/9/2P1P4/2P1P4/2P6/9/9/9/4K4 w', '中兵七平八')).toBe('c5b5');
  });
});

// Deterministic PRNG (mulberry32).
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkPosition(pos: Position) {
  const moves = legalMoves(pos);
  const w = new Set<string>();
  const c = new Set<string>();
  for (const m of moves) {
    const sw = toWxf(pos, m);
    const sc = toChinese(pos, m);
    w.add(sw);
    c.add(sc);
    const pw = parseMoveText(pos, sw);
    const pc = parseMoveText(pos, sc);
    if (!pw || pw.from !== m.from || pw.to !== m.to) throw new Error(`WXF ${sw} failed (${moveToUci(m)})`);
    if (!pc || pc.from !== m.from || pc.to !== m.to) throw new Error(`CN ${sc} failed (${moveToUci(m)})`);
  }
  expect(w.size).toBe(moves.length);
  expect(c.size).toBe(moves.length);
}

describe('round trip on random games', () => {
  const starts = [
    START_FEN,
    '5k3/9/9/2P1P4/2P1P4/2P6/9/9/9/4K4 w', // doubled / tripled pawns
    '4k4/9/9/9/2pp1p3/2p2p3/2p6/9/9/3K5 b',
    '3akab2/9/4b4/p1P1P1P1p/2P1P4/9/9/2C1C4/4A4/3AK4 w',
  ];
  it('WXF and Chinese strings parse back uniquely', () => {
    const rand = rng(12345);
    let positions = 0;
    for (let g = 0; g < 200; g++) {
      let pos = parseFen(starts[g % starts.length]);
      for (let ply = 0; ply < 40; ply++) {
        checkPosition(pos);
        positions++;
        const moves = legalMoves(pos);
        if (!moves.length) break;
        pos = makeMove(pos, moves[Math.floor(rand() * moves.length)]);
      }
    }
    expect(positions).toBeGreaterThan(1000);
  }, 60000);
});

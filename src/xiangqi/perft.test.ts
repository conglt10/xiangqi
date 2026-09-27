import { describe, it, expect } from 'vitest';
import { parseFen } from './board';
import { perft } from './movegen';
import { START_FEN } from './types';

describe('perft', () => {
  const pos = parseFen(START_FEN);
  it('start position depth 1-3', () => {
    expect(perft(pos, 1)).toBe(44);
    expect(perft(pos, 2)).toBe(1920);
    expect(perft(pos, 3)).toBe(79666);
  });
  it('start position depth 4', () => {
    expect(perft(pos, 4)).toBe(3290240);
  }, 30000);

  // Reference positions from the Chess Programming Wiki xiangqi perft table.
  const cases: [string, number[]][] = [
    ['r1ba1a3/4kn3/2n1b4/pNp1p1p1p/4c4/6P2/P1P2R2P/1CcC5/9/2BAKAB2 w - - 0 1', [38, 1128, 43929]],
    ['1cbak4/9/n2a5/2p1p3p/5cp2/2n2N3/6PCP/3AB4/2C6/3A1K1N1 w - - 0 1', [7, 281, 8620]],
    ['5a3/3k5/3aR4/9/5r3/5n3/9/3A1A3/5K3/2BC2B2 w - - 0 1', [25, 424, 9850]],
    ['CRN1k1b2/3ca4/4ba3/9/2nr5/9/9/4B4/4A4/4KA3 w - - 0 1', [28, 516, 14808]],
    ['R1N1k1b2/9/3aba3/9/2nr5/2B6/9/4B4/4A4/4KA3 w - - 0 1', [21, 364, 7626]],
    ['C1nNk4/9/9/9/9/9/n1pp5/B3C4/9/3A1K3 w - - 0 1', [28, 222, 6241]],
    ['4ka3/4a4/9/9/4N4/p8/9/4C3c/7n1/2BK5 w - - 0 1', [23, 345, 8124]],
    ['2b1ka3/9/b3N4/4n4/9/9/9/4C4/2p6/2BK5 w - - 0 1', [21, 195, 3883]],
    ['1C2ka3/9/C1Nab1n2/p3p3p/6p2/9/P3P3P/3AB4/3p2c2/c1BAK4 w - - 0 1', [30, 830, 22787]],
    ['CnN1k1b2/c3a4/4ba3/9/2nr5/9/9/4C4/4A4/4KA3 w - - 0 1', [19, 583, 11714]],
  ];
  for (const [fen, counts] of cases) {
    it(`perft ${fen}`, () => {
      const p = parseFen(fen);
      counts.forEach((n, i) => expect(perft(p, i + 1)).toBe(n));
    });
  }
});

import { describe, it, expect } from 'vitest';
import { parseMoveList, parsePgn, toPgn } from './pgn';
import { START_FEN } from './types';
import { parseFen } from './board';
import { moveToUci } from './movegen';
import { detectNotation, parseMoveText } from './notation';

const EXPECTED = ['h2e2', 'h9g7', 'h0g2', 'i9h9', 'i0h0', 'b9c7', 'c3c4', 'g6g5'];

describe('parsePgn', () => {
  it('WXF game with comments, variations and NAGs', () => {
    const pgn = `[Event "Test"]
[Red "Alice"]
[Black "Bob"]
[Result "1-0"]
[Format "WXF"]

1. C2=5 H8+7 {classic} 2. H2+3 R9=8 $1 (2... P7+1 (2... C8=6) 3. R1=2)
3. R1=2 H2+3 ; line comment
4. P7+1 P7+1 1-0`;
    const r = parsePgn(pgn);
    expect(r.error).toBeUndefined();
    expect(r.headers.Red).toBe('Alice');
    expect(r.headers.Format).toBe('WXF');
    expect(r.startFen).toBe(START_FEN);
    expect(r.moves).toEqual(EXPECTED);
    expect(r.result).toBe('1-0');
  });

  it('Chinese game with full-width digits and glued move numbers', () => {
    const pgn = `[Game "Chinese Chess"]
[Format "Chinese"]
1.炮二平五 马８进７ 2．马二进三 车９平８
3. 车一平二 马２进３ 4. 兵七进一 卒７进１ *`;
    const r = parsePgn(pgn);
    expect(r.error).toBeUndefined();
    expect(r.moves).toEqual(EXPECTED);
    expect(r.result).toBe('*');
  });

  it('traditional Chinese glyphs', () => {
    const r = parseMoveList('1. 炮二平五 馬8進7 2. 傌二進三 車9平8 3. 俥一平二 馬2進3 4. 兵七進一 卒7進1');
    expect(r.error).toBeUndefined();
    expect(r.moves).toEqual(EXPECTED);
  });

  it('ICCS game', () => {
    const r = parsePgn(`[Format "ICCS"]
1. H2-E2 H9-G7 2. H0-G2 I9-H9 3. I0-H0 B9-C7 4. C3-C4 G6-G5 0-1`);
    expect(r.error).toBeUndefined();
    expect(r.moves).toEqual(EXPECTED);
    expect(r.result).toBe('0-1');
  });

  it('FEN header and black to move', () => {
    const fen = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C4C2/9/RNBAKABNR b - - 0 1';
    const r = parsePgn(`[FEN "${fen}"]\n1... C8=5 2. H8+7`);
    expect(r.error).toBeUndefined();
    expect(r.startFen).toBe(fen);
    expect(r.moves).toEqual(['h7e7', 'b0c2']);
  });

  it('stops at the first bad token', () => {
    const r = parsePgn('1. C2=5 H8+7 2. R5+1 H2+3');
    expect(r.moves).toEqual(['h2e2', 'h9g7']);
    expect(r.error).toEqual({ ply: 2, token: 'R5+1' });
  });

  it('UCI move list', () => {
    expect(parseMoveList('h2e2 h9g7 h0g2').moves).toEqual(['h2e2', 'h9g7', 'h0g2']);
  });
});

describe('toPgn', () => {
  for (const fmt of ['WXF', 'ICCS', 'Chinese'] as const) {
    it(`round trip ${fmt}`, () => {
      const text = toPgn({ headers: { Event: 'X', Red: 'A "q"' }, startFen: START_FEN, moves: EXPECTED, result: '1/2-1/2' }, fmt);
      const r = parsePgn(text);
      expect(r.error).toBeUndefined();
      expect(r.moves).toEqual(EXPECTED);
      expect(r.result).toBe('1/2-1/2');
      expect(r.headers.Red).toBe('A "q"');
      expect(r.headers.Format).toBe(fmt);
    });
  }
  it('writes expected WXF text', () => {
    const text = toPgn({ headers: {}, startFen: START_FEN, moves: EXPECTED.slice(0, 3) });
    expect(text).toContain('1. C2=5 H8+7 2. H2+3 *');
    expect(toPgn({ moves: EXPECTED.slice(0, 2) }, 'Chinese')).toContain('1. 炮二平五 马8进7 *');
  });
  it('custom start position with black to move', () => {
    const fen = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C4C2/9/RNBAKABNR b - - 0 1';
    const text = toPgn({ startFen: fen, moves: ['h7e7', 'b0c2'] });
    expect(text).toContain(`[FEN "${fen}"]`);
    expect(text).toContain('1... C8=5 2. H8+7');
    expect(parsePgn(text).moves).toEqual(['h7e7', 'b0c2']);
  });
});

describe('algebraic notation (elephantchess.io)', () => {
  const GAME = `[Site "https://elephantchess.io/database/game?id=B8EZo0EIzGc0"]
[White "Wang Tianyi"]
[Black "Cao YanLei"]
[Result "1-0"]
[Variant "Xiangqi"]

1. Che3 Nhg8 2. Nhg3 Rih10 3. Rih1 Nbc8 4. Pg5 Pc6 5. Nba3 Pa6 6. Cbc3 Ncb6 7. Ra2 Bce8 8. Rad2 Nbxa4 9. Cc2 Ra7 10. Rh7 Afe9 11. Rd4 Chi8 12. Rxh10 Ngxh10 13. Cch2 Pe6 14. Cxe6 Raf7 15. Pe5 Nhg8 16. Ade2 Pa5 17. Bce3 Cba8 18. Nac2 Pab5 19. Ngh5 Ci9 20. Ch3 Nab2 21. Kd1 Rfe7 22. Nhxg7 Cad8+ 23. Ke1 Cd7 24. Ngf5 Ref7 25. Pg6 Rxf5 26. Rxd7 Rfxe5 27. Ncd4 Pbc5 28. Pxc5 Pxc5 29. Rdg7 Pcd5 30. Pgf6 Pxd4 31. Ch10+ Bgi8 32. Rxg8
`;

  it('parses the whole game with 1-based ranks', () => {
    const r = parsePgn(GAME);
    expect(r.error).toBeUndefined();
    expect(r.result).toBe('1-0');
    expect(r.moves.length).toBe(63);
    // Che3 Nhg8 Nhg3 Rih10 → h2e2 h9g7 h0g2 i9h9
    expect(r.moves.slice(0, 4)).toEqual(['h2e2', 'h9g7', 'h0g2', 'i9h9']);
    expect(r.headers.White).toBe('Wang Tianyi');
  });

  it('parses single tokens, disambiguation and captures', () => {
    const pos = parseFen(START_FEN);
    expect(moveToUci(parseMoveText(pos, 'Che3')!)).toBe('h2e2');
    expect(moveToUci(parseMoveText(pos, 'Pg5')!)).toBe('g3g4');
    expect(parseMoveText(pos, 'Ce3')).toBeNull(); // ambiguous: both cannons can go to e3
    expect(parseMoveText(pos, 'Cxe3')).toBeNull(); // not a capture
    expect(detectNotation('Ch10+')).toBe('algebraic');
  });
});

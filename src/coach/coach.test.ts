import { describe, expect, it } from 'vitest';
import { makeMove, moveToUci, parseFen, see, uciToMove } from '../xiangqi';
import { START_FEN } from '../xiangqi/types';
import { findBait } from './coachStore';
import { LEVELS } from './strength';

describe('findBait', () => {
  const pos = makeMove(parseFen(START_FEN), uciToMove(parseFen(START_FEN), 'h2e2')!);

  it('falls back to leaving a minor piece en prise', () => {
    // Only the best line is available, so the fallback (leave a minor piece en prise) is used.
    const lines = [{ multipv: 1, depth: 10, cp: -20, wdl: [100, 800, 100] as [number, number, number], pv: ['h9g7'] }];
    const bait = findBait(pos, lines, LEVELS[0]);
    expect(bait).not.toBeNull();
    const after = makeMove(pos, bait!.move);
    // The refutation must be a legal capture for Red that wins material.
    const ref = uciToMove(after, moveToUci(bait!.plan.move));
    expect(ref).not.toBeNull();
    expect(ref!.captured).toBeDefined();
    expect(see(after, ref!)).toBeGreaterThan(0);
    expect(bait!.move.piece.type).not.toBe('r');
  });

  it('returns null without candidate lines', () => {
    expect(findBait(pos, [], LEVELS[0])).toBeNull();
  });
});

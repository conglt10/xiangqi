import { describe, expect, it } from 'vitest';
import { parseFen, parseSquare, uciToMove } from '../xiangqi';
import { classifyTacticalMotif, detectHangingAfter, isSacrifice } from './recognizer';
import { explainMove } from './explain';
import { renderHintLevel, type HintPlan } from '../coach/hints';
import { pickLine } from '../coach/strength';

const mv = (fen: string, uci: string) => {
  const pos = parseFen(fen);
  const m = uciToMove(pos, uci);
  if (!m) throw new Error(`illegal ${uci}`);
  return { pos, m };
};

describe('recognizer', () => {
  it('detects a horse fork', () => {
    const { pos, m } = mv('4k4/2r3r2/9/9/5N3/9/9/9/9/3K5 w', 'f5e7');
    const r = classifyTacticalMotif(pos, m);
    expect(r.motif).toBe('fork');
    expect(r.targets.sort()).toEqual([parseSquare('c8'), parseSquare('g8')].sort());
    expect(r.targetTypes).toEqual(['r', 'r']);
  });

  it('detects winning material', () => {
    const { pos, m } = mv('4k4/9/9/9/4n4/9/9/9/4R4/3K5 w', 'e1e5');
    const r = classifyTacticalMotif(pos, m);
    expect(r.motif).toBe('winMaterial');
    expect(r.gain).toBe(4);
  });

  it('detects a rook pin against the general', () => {
    const { pos, m } = mv('4k4/9/4n4/9/9/9/9/9/R8/3K5 w', 'a1e1');
    const r = classifyTacticalMotif(pos, m);
    expect(r.motif).toBe('pin');
    expect(r.targets).toEqual([parseSquare('e7'), parseSquare('e9')]);
  });

  it('detects a piece left hanging', () => {
    const { pos, m } = mv('4k4/9/9/9/r8/9/9/9/8R/3K5 w', 'i1i5');
    const h = detectHangingAfter(pos, m);
    expect(h?.targets).toEqual([parseSquare('i5')]);
    expect(isSacrifice(pos, m)).toBe(true); // the rook is en prise with Black to move
  });

  it('mate score upgrades motif', () => {
    const { pos, m } = mv('4k4/9/9/9/4n4/9/9/9/4R4/3K5 w', 'e1e5');
    expect(classifyTacticalMotif(pos, m, 2).motif).toBe('mate');
  });

  it('explains a blunder with the refutation', () => {
    const { pos, m } = mv('4k4/9/9/9/r8/9/9/9/8R/3K5 w', 'i1i5');
    const ex = explainMove({ before: pos, played: m, classification: 'blunder', delta: 0.5, bestPv: ['i1i9'], refutationPv: ['a5i5'] });
    expect(ex.flaw?.key).toBe('explain.flaw.hanging');
    expect(ex.danger).toContain(parseSquare('i5'));
    expect(ex.betterLine?.key).toBe('explain.better');
  });
});

describe('hint ladder', () => {
  const { pos, m } = mv('4k4/2r3r2/9/9/5N3/9/9/9/9/3K5 w', 'f5e7');
  const r = classifyTacticalMotif(pos, m);
  const plan: HintPlan = { source: 'engine', motif: r.motif, move: m, wxf: 'H4+5', targets: r.targets, targetTypes: r.targetTypes, followUp: null };

  it('escalates from motif to full answer', () => {
    const l1 = renderHintLevel(plan, 1, true);
    expect(l1.msg.key).toBe('hint.l1.fork');
    expect(Object.keys(l1.highlights)).toEqual([String(m.from)]);
    expect(l1.arrow).toBeNull();
    const l2 = renderHintLevel(plan, 2, true);
    expect(l2.msg.key).toBe('hint.l2.fork');
    expect(Object.keys(l2.highlights).length).toBe(3);
    const l3 = renderHintLevel(plan, 3, true);
    expect(l3.highlights[m.to]).toBe('good');
    const l4 = renderHintLevel(plan, 4, true);
    expect(l4.arrow).toMatchObject({ from: m.from, to: m.to });
    expect(renderHintLevel(plan, 9, true).msg.key).toBe('hint.l4');
    expect(renderHintLevel(plan, 1, false).msg.key).toBe('hint.l1s.fork');
  });
});

describe('strength', () => {
  const lines = [
    { multipv: 1, depth: 10, cp: 100, pv: ['a'] },
    { multipv: 2, depth: 10, cp: 0, pv: ['b'] },
    { multipv: 3, depth: 10, cp: -300, pv: ['c'] },
  ];
  it('temperature 0 always picks best', () => {
    expect(pickLine(lines, 0, () => 0.99)).toBe(0);
  });
  it('high temperature can pick weaker lines', () => {
    expect(pickLine(lines, 1, () => 0.99)).toBe(2);
    expect(pickLine(lines, 1, () => 0.0)).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { averageAccuracy, classifyMove } from './classify';
import { lineWp, lineCp } from './winprob';
import { isBookSequence } from './book';

describe('winprob', () => {
  it('uses WDL when present', () => {
    expect(lineWp({ cp: 20, wdl: [500, 400, 100] })).toBeCloseTo(0.7);
  });
  it('maps mate scores', () => {
    expect(lineCp({ mate: 3 })).toBe(9970);
    expect(lineCp({ mate: -2 })).toBe(-9980);
    expect(lineWp({ mate: 1 })).toBe(1);
    expect(lineWp({ mate: -1 })).toBe(0);
  });
  it('falls back to logistic', () => {
    expect(lineWp({ cp: 0 })).toBeCloseTo(0.5);
    expect(lineWp({ cp: 400 })).toBeCloseTo(10 / 11);
  });
});

describe('classifyMove', () => {
  const base = { isEngineBest: false };
  it('thresholds', () => {
    expect(classifyMove({ ...base, bestWp: 0.6, playedWp: 0.595 }).classification).toBe('best');
    expect(classifyMove({ ...base, bestWp: 0.6, playedWp: 0.58 }).classification).toBe('good');
    expect(classifyMove({ ...base, bestWp: 0.6, playedWp: 0.55 }).classification).toBe('inaccuracy');
    expect(classifyMove({ ...base, bestWp: 0.6, playedWp: 0.45 }).classification).toBe('mistake');
    expect(classifyMove({ ...base, bestWp: 0.6, playedWp: 0.3 }).classification).toBe('blunder');
  });
  it('missed win is a blunder', () => {
    const r = classifyMove({ ...base, bestWp: 0.9, playedWp: 0.5 });
    expect(r.classification).toBe('blunder');
    expect(r.missedWin).toBe(true);
  });
  it('winning simplification safeguard', () => {
    expect(classifyMove({ ...base, bestWp: 0.99, playedWp: 0.86 }).classification).toBe('inaccuracy');
  });
  it('great and brilliant', () => {
    expect(classifyMove({ bestWp: 0.7, playedWp: 0.7, secondWp: 0.4, isEngineBest: true }).classification).toBe('great');
    expect(
      classifyMove({ bestWp: 0.8, playedWp: 0.8, secondWp: 0.6, isEngineBest: true, isSacrifice: true }).classification,
    ).toBe('brilliant');
  });
  it('book', () => {
    expect(classifyMove({ bestWp: 0.55, playedWp: 0.54, isEngineBest: false, isBook: true }).classification).toBe('book');
    expect(isBookSequence(['h2e2', 'h9g7'])).toBe(true);
    expect(isBookSequence(['b2e2', 'b9c7'])).toBe(true); // mirrored
    expect(isBookSequence(['a0a1'])).toBe(false);
  });
  it('accuracy', () => {
    expect(averageAccuracy([0, 0])).toBeCloseTo(100, 0);
    expect(averageAccuracy([0.3])).toBeLessThan(40);
  });
});

// Engine score → expected score ("win probability") for the side to move.
import type { EngineLine } from '../engine/uci';

export const MATE_CP = 10000;

/** Centipawns with mate mapped to a bounded scale, as in WhyBlunder: ±(10000 − 10·|m|). */
export function lineCp(line: Pick<EngineLine, 'cp' | 'mate'>): number {
  if (line.mate !== undefined) {
    if (line.mate === 0) return -MATE_CP; // side to move is mated
    return Math.sign(line.mate) * (MATE_CP - 10 * Math.abs(line.mate));
  }
  return line.cp ?? 0;
}

export function cpToWp(cp: number): number {
  return 1 / (1 + Math.pow(10, -cp / 400));
}

/** Expected score in [0,1] for the side to move: (W + D/2) from WDL, logistic fallback. */
export function lineWp(line: Pick<EngineLine, 'cp' | 'mate' | 'wdl'>): number {
  if (line.mate !== undefined) return line.mate > 0 ? 1 : 0;
  if (line.wdl) {
    const [w, d, l] = line.wdl;
    const total = w + d + l || 1000;
    return (w + d / 2) / total;
  }
  return cpToWp(lineCp(line));
}

/** Formats a score from the given line for display, from Red's perspective when `redPov`. */
export function formatScore(line: Pick<EngineLine, 'cp' | 'mate'>, sign = 1): string {
  if (line.mate !== undefined) {
    const m = line.mate * sign;
    return m > 0 ? `#${m}` : `#-${Math.abs(m)}`;
  }
  const v = ((line.cp ?? 0) * sign) / 100;
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

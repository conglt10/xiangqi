// Coach strength model. The Pikafish build has no Skill Level / UCI_Elo, so
// weaker play comes from sampling among MultiPV candidates by win probability
// plus occasional deliberate "instructive" mistakes (baits).
import type { EngineLine } from '../engine/uci';
import { lineWp } from '../analysis/winprob';

export interface LevelConfig {
  id: number;
  depth: number;
  multipv: number;
  /** Softmax temperature in win-probability units (0 = always best). */
  temperature: number;
  /** Chance to play an instructive mistake when a suitable one exists. */
  baitChance: number;
  /** Largest win-probability loss the coach accepts for a bait. */
  maxBaitLoss: number;
  /** Explicit motif names in bait/hint text (beginner-friendly). */
  explicit: boolean;
}

export const LEVELS: LevelConfig[] = [
  { id: 1, depth: 10, multipv: 8, temperature: 0.12, baitChance: 0.3, maxBaitLoss: 0.45, explicit: true },
  { id: 2, depth: 11, multipv: 6, temperature: 0.07, baitChance: 0.18, maxBaitLoss: 0.35, explicit: true },
  { id: 3, depth: 12, multipv: 5, temperature: 0.035, baitChance: 0.1, maxBaitLoss: 0.3, explicit: true },
  { id: 4, depth: 13, multipv: 4, temperature: 0.012, baitChance: 0.04, maxBaitLoss: 0.25, explicit: false },
  { id: 5, depth: 15, multipv: 3, temperature: 0, baitChance: 0, maxBaitLoss: 0, explicit: false },
];

/** Picks a line index by softmax over win probability. `rand` is injectable for tests. */
export function pickLine(lines: EngineLine[], temperature: number, rand: () => number = Math.random): number {
  if (lines.length <= 1 || temperature <= 0) return 0;
  const wps = lines.map(lineWp);
  const best = Math.max(...wps);
  const weights = wps.map((w) => Math.exp((w - best) / temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

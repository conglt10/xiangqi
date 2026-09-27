// A tiny opening book (UCI sequences, Red's view). Mirrored lines are added automatically.
const LINES = [
  // 中炮对屏风马 Central Cannon vs Screen Horses
  'h2e2 h9g7 h0g2 i9h9 i0h0 b9c7 c3c4 c6c5 b0c2 b7a7',
  'h2e2 h9g7 h0g2 i9h9 i0h0 b9c7 b0c2 c6c5',
  'h2e2 h9g7 h0g2 b9c7 i0h0 i9h9 c3c4',
  // 顺炮 Same-direction cannons
  'h2e2 h7e7 h0g2 h9g7 i0h0 i9h9 b0c2',
  // 列炮 Opposite-direction cannons
  'h2e2 b7e7 h0g2 b9c7 i0h0 a9b9',
  // 中炮对反宫马
  'h2e2 b9c7 h0g2 h7f7 i0h0 h9g7',
  // 仙人指路 Pawn opening
  'c3c4 g6g5 b2e2 h9g7 b0c2',
  'c3c4 b7e7 b0c2 b9c7',
  'c3c4 h9g7 h0g2 g6g5',
  // 飞相局 Elephant opening
  'c0e2 h7e7 h0g2 h9g7 i0h0',
  'c0e2 c6c5 b0c2 b9c7',
  'c0e2 h9g7 b0c2 i9h9',
  // 起马局 Horse opening
  'h0g2 c6c5 g3g4 b9c7',
  'b0c2 g6g5 g3g4 h9g7',
  // 过宫炮 Palace-corner cannon
  'h2f2 h9g7 h0g2 i9h9',
];

const MIRROR: Record<string, string> = { a: 'i', b: 'h', c: 'g', d: 'f', e: 'e', f: 'd', g: 'c', h: 'b', i: 'a' };
const mirror = (u: string) => MIRROR[u[0]] + u[1] + MIRROR[u[2]] + u[3];

const prefixes = new Set<string>();
for (const l of LINES) {
  for (const seq of [l.split(' '), l.split(' ').map(mirror)]) {
    for (let i = 1; i <= seq.length; i++) prefixes.add(seq.slice(0, i).join(' '));
  }
}

/** True when the moves played so far (from the standard start) are a known opening line. */
export function isBookSequence(ucis: string[]): boolean {
  return ucis.length > 0 && ucis.length <= 10 && prefixes.has(ucis.join(' '));
}

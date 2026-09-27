// Internal fast move-generation core (mailbox Int8Array, make/unmake).
// Not part of the public API surface re-exported by index.ts, but used by
// movegen.ts and attacks.ts.
import { type Color, type Piece, type PieceType, type Position } from './types';

export const K = 1, A = 2, B = 3, N = 4, R = 5, C = 6, P = 7;

export const TYPE_CODE: Record<PieceType, number> = { k: K, a: A, b: B, n: N, r: R, c: C, p: P };
export const CODE_TYPE: PieceType[] = ['k', 'k', 'a', 'b', 'n', 'r', 'c', 'p'];

export const sideOf = (c: Color): 1 | -1 => (c === 'r' ? 1 : -1);

const fileOf = (s: number) => s % 9;
const rankOf = (s: number) => (s / 9) | 0;
const onBoard = (f: number, r: number) => f >= 0 && f < 9 && r >= 0 && r < 10;
const palace = (f: number, r: number) => f >= 3 && f <= 5 && (r <= 2 || r >= 7);
const half = (r: number) => (r <= 4 ? 0 : 1);

// ---- Precomputed tables ----------------------------------------------------
export const KING_TO: number[][] = [];
export const ADV_TO: number[][] = [];
export const ELE_TO: number[][] = []; // flat pairs [to, eye, to, eye, ...]
export const HORSE_TO: number[][] = []; // flat pairs [to, leg, ...]
export const HORSE_FROM: number[][] = []; // flat pairs [from, leg, ...] (attackers of sq)
export const RAYS: number[][][] = []; // RAYS[sq][dir] dir: 0 N(+rank),1 S,2 E(+file),3 W

const ORTH = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

for (let s = 0; s < 90; s++) {
  const f = fileOf(s), r = rankOf(s);
  const k: number[] = [], a: number[] = [], e: number[] = [], h: number[] = [], hf: number[] = [];
  if (palace(f, r)) {
    for (const [df, dr] of ORTH) {
      const nf = f + df, nr = r + dr;
      if (palace(nf, nr) && half(nr) === half(r)) k.push(nr * 9 + nf);
    }
    for (const [df, dr] of DIAG) {
      const nf = f + df, nr = r + dr;
      if (palace(nf, nr) && half(nr) === half(r)) a.push(nr * 9 + nf);
    }
  }
  for (const [df, dr] of DIAG) {
    const nf = f + 2 * df, nr = r + 2 * dr;
    if (onBoard(nf, nr) && half(nr) === half(r)) e.push(nr * 9 + nf, (r + dr) * 9 + (f + df));
  }
  for (const [df, dr] of ORTH) {
    const lf = f + df, lr = r + dr;
    if (!onBoard(lf, lr)) continue;
    // Then diagonal continuing in the same orthogonal direction.
    const perp = df === 0 ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
    for (const [pf, pr] of perp) {
      const tf = lf + df + pf, tr = lr + dr + pr;
      if (onBoard(tf, tr)) h.push(tr * 9 + tf, lr * 9 + lf);
    }
  }
  // Attackers: horse at (f+df, r+dr) with |df|,|dr| = {1,2}; leg is diagonal
  // neighbour of target toward the horse.
  for (const [df, dr] of [[1, 2], [-1, 2], [1, -2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]]) {
    const hf2 = f + df, hr = r + dr;
    if (!onBoard(hf2, hr)) continue;
    hf.push(hr * 9 + hf2, (r + Math.sign(dr)) * 9 + (f + Math.sign(df)));
  }
  const rays: number[][] = [];
  for (const [df, dr] of ORTH) {
    const ray: number[] = [];
    let nf = f + df, nr = r + dr;
    while (onBoard(nf, nr)) {
      ray.push(nr * 9 + nf);
      nf += df;
      nr += dr;
    }
    rays.push(ray);
  }
  KING_TO.push(k);
  ADV_TO.push(a);
  ELE_TO.push(e);
  HORSE_TO.push(h);
  HORSE_FROM.push(hf);
  RAYS.push(rays);
}

// ---- Board state -----------------------------------------------------------
export interface Core {
  b: Int8Array; // +code red, -code black, 0 empty
  side: 1 | -1; // side to move
  kings: [number, number]; // [red king sq, black king sq] (-1 if absent)
}

export function coreFromBoard(board: (Piece | null)[], turn: Color): Core {
  const b = new Int8Array(90);
  const kings: [number, number] = [-1, -1];
  for (let s = 0; s < 90; s++) {
    const p = board[s];
    if (!p) continue;
    const code = TYPE_CODE[p.type];
    b[s] = p.color === 'r' ? code : -code;
    if (code === K) kings[p.color === 'r' ? 0 : 1] = s;
  }
  return { b, side: sideOf(turn), kings };
}

export function coreFromPosition(pos: Position): Core {
  return coreFromBoard(pos.board, pos.turn);
}

export const kingIdx = (side: number) => (side > 0 ? 0 : 1);

/**
 * Is the king-like square `s` attacked by `side` for check purposes: rooks,
 * cannons, horses, pawns and the flying general (enemy king on same open file).
 */
export function kingAttacked(b: Int8Array, s: number, side: number): boolean {
  const rays = RAYS[s];
  const rook = side * R, cannon = side * C, king = side * K;
  for (let d = 0; d < 4; d++) {
    const ray = rays[d];
    let i = 0;
    const n = ray.length;
    for (; i < n; i++) {
      const p = b[ray[i]];
      if (p !== 0) {
        if (p === rook || (p === king && d < 2)) return true;
        break;
      }
    }
    for (i++; i < n; i++) {
      const p = b[ray[i]];
      if (p !== 0) {
        if (p === cannon) return true;
        break;
      }
    }
  }
  const horse = side * N;
  const hf = HORSE_FROM[s];
  for (let i = 0; i < hf.length; i += 2) {
    if (b[hf[i]] === horse && b[hf[i + 1]] === 0) return true;
  }
  const pawn = side * P;
  const f = s % 9, r = (s / 9) | 0;
  if (side > 0) {
    if (r > 0 && b[s - 9] === pawn) return true;
    if (r >= 5) {
      if (f > 0 && b[s - 1] === pawn) return true;
      if (f < 8 && b[s + 1] === pawn) return true;
    }
  } else {
    if (r < 9 && b[s + 9] === pawn) return true;
    if (r <= 4) {
      if (f > 0 && b[s - 1] === pawn) return true;
      if (f < 8 && b[s + 1] === pawn) return true;
    }
  }
  return false;
}

/**
 * Squares of all pieces of `side` that could pseudo-legally move to (capture on) `s`,
 * regardless of what occupies `s`. Kings count only via palace adjacency (not flying).
 */
export function attackersCore(b: Int8Array, s: number, side: number): number[] {
  const out: number[] = [];
  const rays = RAYS[s];
  for (let d = 0; d < 4; d++) {
    const ray = rays[d];
    let i = 0;
    const n = ray.length;
    for (; i < n; i++) {
      const p = b[ray[i]];
      if (p !== 0) {
        if (p === side * R) out.push(ray[i]);
        break;
      }
    }
    for (i++; i < n; i++) {
      const p = b[ray[i]];
      if (p !== 0) {
        if (p === side * C) out.push(ray[i]);
        break;
      }
    }
  }
  const hf = HORSE_FROM[s];
  for (let i = 0; i < hf.length; i += 2) {
    if (b[hf[i]] === side * N && b[hf[i + 1]] === 0) out.push(hf[i]);
  }
  const f = s % 9, r = (s / 9) | 0;
  const pawn = side * P;
  if (side > 0) {
    if (r > 0 && b[s - 9] === pawn) out.push(s - 9);
    if (r >= 5) {
      if (f > 0 && b[s - 1] === pawn) out.push(s - 1);
      if (f < 8 && b[s + 1] === pawn) out.push(s + 1);
    }
  } else {
    if (r < 9 && b[s + 9] === pawn) out.push(s + 9);
    if (r <= 4) {
      if (f > 0 && b[s - 1] === pawn) out.push(s - 1);
      if (f < 8 && b[s + 1] === pawn) out.push(s + 1);
    }
  }
  for (const t of KING_TO[s]) if (b[t] === side * K) out.push(t);
  for (const t of ADV_TO[s]) if (b[t] === side * A) out.push(t);
  const e = ELE_TO[s];
  for (let i = 0; i < e.length; i += 2) {
    if (b[e[i]] === side * B && b[e[i + 1]] === 0) out.push(e[i]);
  }
  return out;
}

/** Push pseudo-legal moves (encoded from*128+to) of piece on `s` into `out`. */
export function genPiece(b: Int8Array, s: number, out: number[]): void {
  const p = b[s];
  const side = p > 0 ? 1 : -1;
  const t = p * side;
  const base = s * 128;
  switch (t) {
    case K: {
      for (const to of KING_TO[s]) if (b[to] * side <= 0) out.push(base + to);
      break;
    }
    case A: {
      for (const to of ADV_TO[s]) if (b[to] * side <= 0) out.push(base + to);
      break;
    }
    case B: {
      const e = ELE_TO[s];
      for (let i = 0; i < e.length; i += 2) {
        if (b[e[i + 1]] === 0 && b[e[i]] * side <= 0) out.push(base + e[i]);
      }
      break;
    }
    case N: {
      const h = HORSE_TO[s];
      for (let i = 0; i < h.length; i += 2) {
        if (b[h[i + 1]] === 0 && b[h[i]] * side <= 0) out.push(base + h[i]);
      }
      break;
    }
    case R: {
      const rays = RAYS[s];
      for (let d = 0; d < 4; d++) {
        const ray = rays[d];
        for (let i = 0; i < ray.length; i++) {
          const to = ray[i];
          const q = b[to];
          if (q === 0) out.push(base + to);
          else {
            if (q * side < 0) out.push(base + to);
            break;
          }
        }
      }
      break;
    }
    case C: {
      const rays = RAYS[s];
      for (let d = 0; d < 4; d++) {
        const ray = rays[d];
        let i = 0;
        for (; i < ray.length; i++) {
          const to = ray[i];
          if (b[to] === 0) out.push(base + to);
          else break;
        }
        for (i++; i < ray.length; i++) {
          const q = b[ray[i]];
          if (q !== 0) {
            if (q * side < 0) out.push(base + ray[i]);
            break;
          }
        }
      }
      break;
    }
    case P: {
      const f = s % 9, r = (s / 9) | 0;
      if (side > 0) {
        if (r < 9 && b[s + 9] <= 0) out.push(base + s + 9);
        if (r >= 5) {
          if (f > 0 && b[s - 1] <= 0) out.push(base + s - 1);
          if (f < 8 && b[s + 1] <= 0) out.push(base + s + 1);
        }
      } else {
        if (r > 0 && b[s - 9] >= 0) out.push(base + s - 9);
        if (r <= 4) {
          if (f > 0 && b[s - 1] >= 0) out.push(base + s - 1);
          if (f < 8 && b[s + 1] >= 0) out.push(base + s + 1);
        }
      }
      break;
    }
  }
}

export function genPseudo(c: Core, out: number[]): void {
  const b = c.b, side = c.side;
  for (let s = 0; s < 90; s++) if (b[s] * side > 0) genPiece(b, s, out);
}

/** Is the side-to-move's move (encoded) legal? Uses make/unmake internally. */
export function isLegalCore(c: Core, m: number): boolean {
  const b = c.b;
  const from = (m / 128) | 0, to = m & 127;
  const p = b[from];
  const side = p > 0 ? 1 : -1;
  const cap = b[to];
  b[to] = p;
  b[from] = 0;
  const ki = kingIdx(side);
  const ks = p * side === K ? to : c.kings[ki];
  const bad = ks >= 0 && kingAttacked(b, ks, -side);
  b[from] = p;
  b[to] = cap;
  return !bad;
}

export function genLegal(c: Core, out: number[]): void {
  const pseudo: number[] = [];
  genPseudo(c, pseudo);
  for (const m of pseudo) if (isLegalCore(c, m)) out.push(m);
}

export function genLegalFrom(c: Core, s: number, out: number[]): void {
  if (c.b[s] * c.side <= 0) return;
  const pseudo: number[] = [];
  genPiece(c.b, s, pseudo);
  for (const m of pseudo) if (isLegalCore(c, m)) out.push(m);
}

/** Make a move in place; returns captured code for unmake. */
export function makeCore(c: Core, m: number): number {
  const from = (m / 128) | 0, to = m & 127;
  const b = c.b;
  const p = b[from];
  const cap = b[to];
  b[to] = p;
  b[from] = 0;
  if (p === K) c.kings[0] = to;
  else if (p === -K) c.kings[1] = to;
  c.side = -c.side as 1 | -1;
  return cap;
}

export function unmakeCore(c: Core, m: number, cap: number): void {
  const from = (m / 128) | 0, to = m & 127;
  const b = c.b;
  const p = b[to];
  b[from] = p;
  b[to] = cap;
  if (p === K) c.kings[0] = from;
  else if (p === -K) c.kings[1] = from;
  c.side = -c.side as 1 | -1;
}

export function inCheckCore(c: Core, side: number): boolean {
  const ks = c.kings[kingIdx(side)];
  return ks >= 0 && kingAttacked(c.b, ks, -side);
}

export function perftCore(c: Core, depth: number): number {
  const moves: number[] = [];
  genLegal(c, moves);
  if (depth <= 1) return depth === 1 ? moves.length : 1;
  let n = 0;
  for (const m of moves) {
    const cap = makeCore(c, m);
    n += perftCore(c, depth - 1);
    unmakeCore(c, m, cap);
  }
  return n;
}

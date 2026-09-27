// Human move notations: WXF and Chinese (plus parsing of UCI / ICCS / WXF / Chinese).
//
// Conventions implemented
// -----------------------
// File numbers are counted from each player's own right: Red a..i = 9..1,
// Black a..i = 1..9. Direction + / 进 forward, - / 退 backward, = / 平 sideways.
// For K, R, C, P moving forward/backward the last number is the number of ranks
// moved; otherwise (sideways, or A/E/H) it is the destination file.
//
// Tandem pieces (2+ pieces of the same type on the moving piece's file):
//  * R, C, H, P use position markers instead of the file number:
//      2 pieces   WXF  +R / -R           Chinese 前车 / 后车
//      3 pieces   WXF  1P / 2P / 3P      Chinese 前兵 / 中兵 / 后兵
//      4-5 pieces WXF  1P..5P            Chinese 一兵 .. 五兵
//    (front = closer to the opponent).
//  * When pawns are doubled on more than one file, the file is appended to the
//    marker: WXF `+P7=6`, Chinese `前七平六` (piece name replaced by the file).
//  * A and E keep the file number even when doubled (direction disambiguates),
//    as in standard Chinese notation, e.g. `A6+5` / `A6-5`.
//
// Parsing is lenient (accepts the alternate forms, piece letters B/N, `.` for `=`,
// traditional glyphs, Chinese or Arabic numerals for either side) and resolves the
// move by matching against the legal moves; it returns null unless exactly one
// legal move matches.
import { parseSquare } from './board';
import { legalMoves } from './movegen';
import { type Color, type Move, type Piece, type PieceType, type Position, fileOf, rankOf } from './types';

type Dir = '+' | '-' | '=';
type Marker = 'F' | 'M' | 'L' | number; // front / middle / last / ordinal (1-based from front)

interface Desc {
  type: PieceType;
  color: Color;
  fileNum: number; // 1..9 from the mover's right
  idx: number; // index in tandem group (0 = front)
  n: number; // tandem group size (1 if alone on file)
  multi: boolean; // pawns doubled on more than one file
  useMarker: boolean;
  dir: Dir;
  num: number;
}

const WXF_LETTER: Record<PieceType, string> = { k: 'K', a: 'A', b: 'E', n: 'H', r: 'R', c: 'C', p: 'P' };
const RED_NAMES: Record<PieceType, string> = { k: '帅', a: '仕', b: '相', n: '马', r: '车', c: '炮', p: '兵' };
const BLACK_NAMES: Record<PieceType, string> = { k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒' };
const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CN_DIR: Record<Dir, string> = { '+': '进', '-': '退', '=': '平' };

const fileNumber = (color: Color, file: number) => (color === 'r' ? 9 - file : file + 1);
const isStraight = (t: PieceType) => t === 'k' || t === 'r' || t === 'c' || t === 'p';

function describe(pos: Position, move: Pick<Move, 'from' | 'to'>): Desc | null {
  const piece: Piece | null = pos.board[move.from];
  if (!piece) return null;
  const { color, type } = piece;
  const ff = fileOf(move.from), fr = rankOf(move.from);
  const tf = fileOf(move.to), tr = rankOf(move.to);
  const fwd = color === 'r' ? 1 : -1;

  // Tandem group on the same file, ordered front to back.
  const group: number[] = [];
  for (let r = 0; r < 10; r++) {
    const p = pos.board[r * 9 + ff];
    if (p && p.color === color && p.type === type) group.push(r);
  }
  group.sort((a, b) => (b - a) * fwd);
  const idx = group.indexOf(fr);
  const n = group.length;

  let multi = false;
  if (type === 'p') {
    let files = 0;
    for (let f = 0; f < 9; f++) {
      let cnt = 0;
      for (let r = 0; r < 10; r++) {
        const p = pos.board[r * 9 + f];
        if (p && p.color === color && p.type === 'p') cnt++;
      }
      if (cnt >= 2) files++;
    }
    multi = files > 1;
  }
  const useMarker = n >= 2 && type !== 'a' && type !== 'b' && type !== 'k';

  let dir: Dir;
  let num: number;
  if (tr === fr) {
    dir = '=';
    num = fileNumber(color, tf);
  } else {
    dir = (tr - fr) * fwd > 0 ? '+' : '-';
    num = isStraight(type) ? Math.abs(tr - fr) : fileNumber(color, tf);
  }
  return { type, color, fileNum: fileNumber(color, ff), idx, n, multi, useMarker, dir, num };
}

function wxfMarker(d: Desc): string {
  return d.n === 2 ? (d.idx === 0 ? '+' : '-') : String(d.idx + 1);
}

function cnMarker(d: Desc): string {
  if (d.n === 2) return d.idx === 0 ? '前' : '后';
  if (d.n === 3) return ['前', '中', '后'][d.idx];
  return CN_NUM[d.idx + 1];
}

const cnDigit = (color: Color, n: number) => (color === 'r' ? CN_NUM[n] : String(n));

/** WXF notation of `move` in the pre-move position `pos`, e.g. `C2=5`, `+R+1`. */
export function toWxf(pos: Position, move: Pick<Move, 'from' | 'to'>): string {
  const d = describe(pos, move);
  if (!d) return '';
  const L = WXF_LETTER[d.type];
  if (d.useMarker) return `${wxfMarker(d)}${L}${d.multi ? d.fileNum : ''}${d.dir}${d.num}`;
  return `${L}${d.fileNum}${d.dir}${d.num}`;
}

/** Chinese notation, e.g. `炮二平五` (red), `马8进7` (black), `前炮平四`. */
export function toChinese(pos: Position, move: Pick<Move, 'from' | 'to'>): string {
  const d = describe(pos, move);
  if (!d) return '';
  const name = (d.color === 'r' ? RED_NAMES : BLACK_NAMES)[d.type];
  const tail = CN_DIR[d.dir] + cnDigit(d.color, d.num);
  if (d.useMarker) return cnMarker(d) + (d.multi ? cnDigit(d.color, d.fileNum) : name) + tail;
  return name + cnDigit(d.color, d.fileNum) + tail;
}

/** ICCS notation, e.g. `H2-E2`. */
export function toIccs(move: Pick<Move, 'from' | 'to'>): string {
  const n = (s: number) => 'ABCDEFGHI'[fileOf(s)] + String(rankOf(s));
  return `${n(move.from)}-${n(move.to)}`;
}

// ---------------------------------------------------------------------------
// Parsing

interface Spec {
  marker?: Marker;
  type?: PieceType;
  file?: number;
  dir: Dir;
  num: number;
}

const LETTER_TYPE: Record<string, PieceType> = {
  K: 'k', G: 'k', A: 'a', S: 'a', E: 'b', B: 'b', H: 'n', N: 'n', R: 'r', C: 'c', P: 'p',
};

const CN_PIECE: Record<string, PieceType> = {
  帥: 'k', 帅: 'k', 將: 'k', 将: 'k',
  仕: 'a', 士: 'a',
  相: 'b', 象: 'b',
  馬: 'n', 马: 'n', 傌: 'n', 碼: 'n',
  車: 'r', 车: 'r', 俥: 'r', 伡: 'r',
  炮: 'c', 砲: 'c', 包: 'c',
  兵: 'p', 卒: 'p',
};
const CN_DIRS: Record<string, Dir> = { 进: '+', 進: '+', 退: '-', 平: '=' };
const CN_MARK: Record<string, Marker> = { 前: 'F', 中: 'M', 后: 'L', 後: 'L' };
const CN_NUMERAL: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  壹: 1, 贰: 2, 叁: 3, 肆: 4, 伍: 5, 陆: 6, 柒: 7, 捌: 8, 玖: 9,
};

/** Converts full-width ASCII variants (digits, letters, punctuation) to ASCII. */
export function normalizeFullWidth(s: string): string {
  return s
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');
}

function parseChineseSpec(text: string): Spec | null {
  type Tok = { k: 'P'; v: PieceType } | { k: 'D'; v: Dir } | { k: 'M'; v: Marker } | { k: 'N'; v: number };
  const toks: Tok[] = [];
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    if (CN_PIECE[ch]) toks.push({ k: 'P', v: CN_PIECE[ch] });
    else if (CN_DIRS[ch]) toks.push({ k: 'D', v: CN_DIRS[ch] });
    else if (CN_MARK[ch]) toks.push({ k: 'M', v: CN_MARK[ch] });
    else if (CN_NUMERAL[ch]) toks.push({ k: 'N', v: CN_NUMERAL[ch] });
    else if (ch >= '1' && ch <= '9') toks.push({ k: 'N', v: ch.charCodeAt(0) - 48 });
    else return null;
  }
  const pat = toks.map((t) => t.k).join('');
  const v = toks.map((t) => t.v);
  switch (pat) {
    case 'PNDN':
      return { type: v[0] as PieceType, file: v[1] as number, dir: v[2] as Dir, num: v[3] as number };
    case 'MPDN':
      return { marker: v[0] as Marker, type: v[1] as PieceType, dir: v[2] as Dir, num: v[3] as number };
    case 'MNDN':
      return { marker: v[0] as Marker, type: 'p', file: v[1] as number, dir: v[2] as Dir, num: v[3] as number };
    case 'MPNDN':
      return { marker: v[0] as Marker, type: v[1] as PieceType, file: v[2] as number, dir: v[3] as Dir, num: v[4] as number };
    case 'NPDN':
      return { marker: v[0] as number, type: v[1] as PieceType, dir: v[2] as Dir, num: v[3] as number };
    case 'NNDN':
      return { marker: v[0] as number, type: 'p', file: v[1] as number, dir: v[2] as Dir, num: v[3] as number };
    case 'NPNDN':
      return { marker: v[0] as number, type: v[1] as PieceType, file: v[2] as number, dir: v[3] as Dir, num: v[4] as number };
    default:
      return null;
  }
}

function wxfMarkerOf(m: string): Marker {
  if (m === '+') return 'F';
  if (m === '-') return 'L';
  return Number(m);
}

function parseWxfSpec(text: string): Spec | null {
  const t = text.toUpperCase().replace(/\./g, '=');
  let m = /^([KGASEBHNRCP])([1-9])([+\-=])([1-9])$/.exec(t);
  if (m) return { type: LETTER_TYPE[m[1]], file: Number(m[2]), dir: m[3] as Dir, num: Number(m[4]) };
  m = /^([+\-]|[1-5])([KGASEBHNRCP])([1-9])?([+\-=])([1-9])$/.exec(t);
  if (m) {
    return {
      marker: wxfMarkerOf(m[1]),
      type: LETTER_TYPE[m[2]],
      file: m[3] ? Number(m[3]) : undefined,
      dir: m[4] as Dir,
      num: Number(m[5]),
    };
  }
  m = /^([KGASEBHNRCP])([+\-])([+\-=])([1-9])$/.exec(t);
  if (m) return { marker: wxfMarkerOf(m[2]), type: LETTER_TYPE[m[1]], dir: m[3] as Dir, num: Number(m[4]) };
  m = /^([+\-]|[1-5])([1-9])([+\-=])([1-9])$/.exec(t);
  if (m) return { marker: wxfMarkerOf(m[1]), type: 'p', file: Number(m[2]), dir: m[3] as Dir, num: Number(m[4]) };
  return null;
}

function matches(spec: Spec, d: Desc): boolean {
  if (spec.dir !== d.dir || spec.num !== d.num) return false;
  if (spec.type && spec.type !== d.type) return false;
  if (spec.file !== undefined && spec.file !== d.fileNum) return false;
  if (spec.marker !== undefined) {
    if (d.n < 2) return false;
    const mk = spec.marker;
    if (mk === 'F') return d.idx === 0;
    if (mk === 'L') return d.idx === d.n - 1;
    if (mk === 'M') return d.n === 3 && d.idx === 1;
    return d.idx === mk - 1;
  }
  return spec.file !== undefined;
}

/**
 * Algebraic notation used by elephantchess.io and some Western databases:
 * piece letter, optional origin file and/or rank, optional `x`, destination
 * square, optional `+`/`#`. Ranks are 1..10 from Red's side (so `e3` is our e2),
 * e.g. `Che3`, `Nbxa4`, `Rih10`, `Ch10+`, `Pgf6`.
 */
const ALGEBRAIC = /^([KGASEBHNRCP])([a-i])?(10|[1-9])?(x|-)?([a-i])(10|[1-9])[+#]?$/;

function parseAlgebraic(legal: Move[], t: string): Move | null | undefined {
  const m = ALGEBRAIC.exec(t);
  if (!m) return undefined;
  const type = LETTER_TYPE[m[1]];
  const fromFile = m[2] ? m[2].charCodeAt(0) - 97 : undefined;
  const fromRank = m[3] ? Number(m[3]) - 1 : undefined;
  const to = (Number(m[6]) - 1) * 9 + (m[5].charCodeAt(0) - 97);
  const hits = legal.filter(
    (mv) =>
      mv.to === to &&
      mv.piece.type === type &&
      (fromFile === undefined || fileOf(mv.from) === fromFile) &&
      (fromRank === undefined || rankOf(mv.from) === fromRank) &&
      (m[4] !== 'x' || !!mv.captured),
  );
  return hits.length === 1 ? hits[0] : null;
}

/** Cleans a move token: full-width → ASCII, strips annotations like `!?`, `#`. */
function cleanToken(text: string): string {
  return normalizeFullWidth(text).trim().replace(/[!?#]+$/g, '').trim();
}

/**
 * Parses one move written in UCI (`h2e2`), ICCS (`H2-E2`), WXF (`C2=5`, `C2.5`,
 * `+R+1`, letters B/N accepted), Chinese (`炮二平五`, `馬8進7`, `前炮平四`) or
 * algebraic (`Che3`, `Nbxa4`, ranks 1..10).
 * Returns the unique matching legal move, or null.
 */
export function parseMoveText(pos: Position, text: string): Move | null {
  const t = cleanToken(text);
  if (!t) return null;
  const legal = legalMoves(pos);

  const coord = /^([a-i][0-9])-?([a-i][0-9])$/i.exec(t);
  if (coord) {
    const from = parseSquare(coord[1]);
    const to = parseSquare(coord[2]);
    return legal.find((m) => m.from === from && m.to === to) ?? null;
  }

  const alg = parseAlgebraic(legal, t);
  if (alg !== undefined) return alg;

  const spec = /[㐀-鿿]/.test(t) ? parseChineseSpec(t) : parseWxfSpec(t);
  if (!spec) return null;
  let found: Move | null = null;
  for (const m of legal) {
    const d = describe(pos, m);
    if (d && matches(spec, d)) {
      if (found) return null; // ambiguous
      found = m;
    }
  }
  return found;
}

/** Detects which notation a token appears to use (best effort). */
export function detectNotation(text: string): 'uci' | 'iccs' | 'wxf' | 'chinese' | 'algebraic' | null {
  const t = cleanToken(text);
  if (ALGEBRAIC.test(t)) return 'algebraic';
  if (/^[a-i][0-9][a-i][0-9]$/i.test(t)) return 'uci';
  if (/^[a-i][0-9]-[a-i][0-9]$/i.test(t)) return 'iccs';
  if (/[㐀-鿿]/.test(t)) return parseChineseSpec(t) ? 'chinese' : null;
  return parseWxfSpec(t) ? 'wxf' : null;
}

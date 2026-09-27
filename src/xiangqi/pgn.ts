// PGN (xiangqi flavour) reading and writing.
import { parseFen, toFen } from './board';
import { makeMove, moveToUci, uciToMove } from './movegen';
import { normalizeFullWidth, parseMoveText, toChinese, toIccs, toWxf } from './notation';
import { type Position, START_FEN } from './types';

export type PgnResult = '1-0' | '0-1' | '1/2-1/2' | '*';
export type PgnFormat = 'WXF' | 'ICCS' | 'Chinese';

export interface ParsedPgn {
  headers: Record<string, string>;
  startFen: string;
  moves: string[]; // UCI
  result?: PgnResult;
  /** First token that could not be parsed; `ply` = 0-based index of that move. */
  error?: { ply: number; token: string };
}

export interface MoveListResult {
  moves: string[];
  result?: PgnResult;
  error?: { ply: number; token: string };
}

const RESULTS: Record<string, PgnResult> = {
  '1-0': '1-0',
  '0-1': '0-1',
  '1/2-1/2': '1/2-1/2',
  '½-½': '1/2-1/2',
  '*': '*',
};

/** Removes `{...}` comments, `;` line comments and (nested) `( ... )` variations. */
function stripNonMoves(text: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      const end = text.indexOf('}', i + 1);
      i = end < 0 ? text.length : end;
      out += ' ';
      continue;
    }
    if (ch === ';' && depth === 0) {
      const end = text.indexOf('\n', i + 1);
      i = end < 0 ? text.length : end;
      out += ' ';
      continue;
    }
    if (ch === '(' || ch === '（') {
      depth++;
      continue;
    }
    if ((ch === ')' || ch === '）') && depth > 0) {
      depth--;
      out += ' ';
      continue;
    }
    if (depth === 0) out += ch;
  }
  return out;
}

const CJK = /[㐀-鿿]/;

/** Splits the move-text section into raw tokens (move numbers removed). */
function tokenize(text: string): string[] {
  let t = normalizeFullWidth(stripNonMoves(text));
  t = t.replace(/\$\d+/g, ' ').replace(/[、，,]/g, ' ');
  const out: string[] = [];
  for (let tok of t.split(/\s+/)) {
    if (!tok) continue;
    // Leading move numbers: "1." "1..." "12." possibly glued to the move.
    tok = tok.replace(/^\d+\s*\.+/, '');
    if (!tok || /^\.+$/.test(tok)) continue;
    if (/^\d+$/.test(tok)) continue; // bare move number without dot
    // Glued Chinese moves (e.g. "炮二平五马8进7"): Chinese moves are 4 chars
    // (5 for the rare marker+name+file form); split into 4-char chunks.
    if (CJK.test(tok) && tok.length > 5 && tok.length % 4 === 0) {
      for (let i = 0; i < tok.length; i += 4) out.push(tok.slice(i, i + 4));
      continue;
    }
    out.push(tok);
  }
  return out;
}

function parseTokens(tokens: string[], startFen: string): MoveListResult {
  let pos: Position = parseFen(startFen);
  const moves: string[] = [];
  let result: PgnResult | undefined;
  for (const tok of tokens) {
    const r = RESULTS[tok];
    if (r) {
      result = r;
      break;
    }
    const m = parseMoveText(pos, tok);
    if (!m) return { moves, result, error: { ply: moves.length, token: tok } };
    moves.push(moveToUci(m));
    pos = makeMove(pos, m);
  }
  return result ? { moves, result } : { moves };
}

/** Parses a plain move list (any supported notation, move numbers allowed). */
export function parseMoveList(text: string, startFen: string = START_FEN): MoveListResult {
  return parseTokens(tokenize(text), startFen);
}

/**
 * Parses a single-game PGN. Header tags `[Key "Value"]`; the FEN tag sets the start
 * position. Each move token's notation is auto-detected (UCI, ICCS, WXF, Chinese).
 * Parsing stops at the first unparseable token (reported in `error`).
 */
export function parsePgn(text: string): ParsedPgn {
  const headers: Record<string, string> = {};
  const tagRe = /\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]/g;
  let body = text.replace(tagRe, (_all, k: string, v: string) => {
    headers[k] = v.replace(/\\(.)/g, '$1');
    return ' ';
  });
  body = body.replace(/^﻿/, '');
  const fenKey = Object.keys(headers).find((k) => k.toUpperCase() === 'FEN');
  let startFen = START_FEN;
  if (fenKey && headers[fenKey].trim()) {
    try {
      startFen = toFen(parseFen(headers[fenKey]));
    } catch {
      return { headers, startFen: START_FEN, moves: [], error: { ply: 0, token: headers[fenKey] } };
    }
  }
  const r = parseTokens(tokenize(body), startFen);
  const out: ParsedPgn = { headers, startFen, moves: r.moves };
  const headerResult = headers.Result ? RESULTS[headers.Result.trim()] : undefined;
  const result = r.result ?? headerResult;
  if (result) out.result = result;
  if (r.error) out.error = r.error;
  return out;
}

/** Writes a PGN with moves in the chosen notation (default WXF). */
export function toPgn(
  game: { headers?: Record<string, string>; startFen?: string; moves: string[]; result?: PgnResult },
  format: PgnFormat = 'WXF',
): string {
  const startFen = game.startFen ?? START_FEN;
  const headers: Record<string, string> = { ...(game.headers ?? {}) };
  const result = game.result ?? (headers.Result as PgnResult | undefined) ?? '*';
  headers.Result = result;
  const fenKey = Object.keys(headers).find((k) => k.toUpperCase() === 'FEN');
  if (fenKey) delete headers[fenKey];
  if (toFen(parseFen(startFen)) !== toFen(parseFen(START_FEN))) headers.FEN = startFen;
  headers.Format = format;

  const lines: string[] = [];
  const order = ['Event', 'Site', 'Date', 'Round', 'Red', 'Black', 'Result'];
  const keys = [...order.filter((k) => k in headers), ...Object.keys(headers).filter((k) => !order.includes(k))];
  for (const k of keys) lines.push(`[${k} "${headers[k].replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
  lines.push('');

  let pos = parseFen(startFen);
  const parts: string[] = [];
  let first = true;
  for (const uci of game.moves) {
    const m = uciToMove(pos, uci);
    if (!m) break;
    const text = format === 'ICCS' ? toIccs(m) : format === 'Chinese' ? toChinese(pos, m) : toWxf(pos, m);
    if (pos.turn === 'r') parts.push(`${pos.fullmove}.`);
    else if (first) parts.push(`${pos.fullmove}...`);
    parts.push(text);
    first = false;
    pos = makeMove(pos, m);
  }
  parts.push(result);
  // Wrap move text at ~80 columns.
  let line = '';
  for (const p of parts) {
    if (line && line.length + 1 + p.length > 80) {
      lines.push(line);
      line = p;
    } else line = line ? `${line} ${p}` : p;
  }
  if (line) lines.push(line);
  return lines.join('\n') + '\n';
}

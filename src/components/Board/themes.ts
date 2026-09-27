// Board and piece themes. Each theme is a set of CSS custom properties applied
// inline on the board <svg>, so the board and the theme picker previews share them.
import type { CSSProperties } from 'react';

export type BoardThemeId = 'wood' | 'maple' | 'walnut' | 'jade' | 'paper' | 'slate';
export type PieceThemeId = 'ivory' | 'wood' | 'solid';
export type PieceStyle = '2d' | '3d';

export interface BoardTheme {
  id: BoardThemeId;
  bg: string; // board surface
  bg2: string; // gradient end
  line: string; // grid, river text, coordinates
  grain: number; // 0..1 wood-grain overlay strength
  frame: string; // outer frame
}

export interface PieceTheme {
  id: PieceThemeId;
  edge: string; // rim / side of the disc
  r: { face: string; hi: string; lo: string; glyph: string; ring: string };
  b: { face: string; hi: string; lo: string; glyph: string; ring: string };
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'wood', bg: '#ebcb91', bg2: '#d9ad68', line: '#5b3b17', grain: 0.35, frame: '#7a5225' },
  { id: 'maple', bg: '#f6e4bd', bg2: '#ead1a2', line: '#6e4b22', grain: 0.22, frame: '#9a7446' },
  { id: 'walnut', bg: '#8e5d36', bg2: '#6a4224', line: '#f3dfb8', grain: 0.4, frame: '#3f2612' },
  { id: 'jade', bg: '#c4e0cb', bg2: '#a3c9ae', line: '#1f5132', grain: 0, frame: '#2e6b45' },
  { id: 'paper', bg: '#f8f6f0', bg2: '#ece8de', line: '#3a3a3a', grain: 0, frame: '#555' },
  { id: 'slate', bg: '#3d4d5d', bg2: '#2c3947', line: '#d3dde7', grain: 0, frame: '#1d2731' },
];

export const PIECE_THEMES: PieceTheme[] = [
  {
    id: 'ivory',
    edge: '#8a6532',
    r: { face: '#fbf0d6', hi: '#fffaf0', lo: '#e2cc9c', glyph: '#c0271d', ring: '#c0271d' },
    b: { face: '#fbf0d6', hi: '#fffaf0', lo: '#e2cc9c', glyph: '#1d1d1d', ring: '#1d1d1d' },
  },
  {
    id: 'wood',
    edge: '#5e3a18',
    r: { face: '#d8a468', hi: '#efcb95', lo: '#a26d36', glyph: '#9b1a10', ring: '#9b1a10' },
    b: { face: '#d8a468', hi: '#efcb95', lo: '#a26d36', glyph: '#23160b', ring: '#23160b' },
  },
  {
    id: 'solid',
    edge: '#141414',
    r: { face: '#c8352b', hi: '#e6655a', lo: '#8a1c14', glyph: '#fff4e2', ring: '#ffd9b3' },
    b: { face: '#2e2e2e', hi: '#555555', lo: '#121212', glyph: '#f3efe6', ring: '#cfc9bc' },
  },
];

export const boardTheme = (id: string) => BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
export const pieceTheme = (id: string) => PIECE_THEMES.find((t) => t.id === id) ?? PIECE_THEMES[0];

/** CSS variables for the given themes (spread into an element's style). */
export function themeVars(b: BoardTheme, p: PieceTheme): CSSProperties {
  return {
    '--board-bg': b.bg,
    '--board-bg2': b.bg2,
    '--board-line': b.line,
    '--board-frame': b.frame,
    '--board-grain': b.grain,
    '--p-edge': p.edge,
    '--pr-face': p.r.face,
    '--pr-hi': p.r.hi,
    '--pr-lo': p.r.lo,
    '--pr-glyph': p.r.glyph,
    '--pr-ring': p.r.ring,
    '--pb-face': p.b.face,
    '--pb-hi': p.b.hi,
    '--pb-lo': p.b.lo,
    '--pb-glyph': p.b.glyph,
    '--pb-ring': p.b.ring,
  } as CSSProperties;
}

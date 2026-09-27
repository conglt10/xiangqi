// Piece and board-surface graphics. Colours come from the theme CSS variables
// (see themes.ts); `uid` scopes gradient/filter ids to one <svg>.
import type { Color, Piece } from '../../xiangqi/types';
import type { PieceStyle } from './themes';
import styles from './Board.module.css';

export const GLYPHS: Record<Color, Record<Piece['type'], string>> = {
  r: { k: '帥', a: '仕', b: '相', n: '傌', r: '俥', c: '炮', p: '兵' },
  b: { k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒' },
};

/** <defs> shared by the board surface and the pieces. */
export function BoardDefs({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" style={{ stopColor: 'var(--board-bg)' }} />
        <stop offset="100%" style={{ stopColor: 'var(--board-bg2)' }} />
      </linearGradient>
      {/* Wood grain: stretched turbulence mapped to a translucent dark brown. */}
      <filter id={`${uid}-grain`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.32 0.012" numOctaves="3" seed="7" />
        <feColorMatrix type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.18  0 0 0 0 0.06  1.2 0 0 0 -0.5" />
      </filter>
      {(['r', 'b'] as const).map((c) => (
        <radialGradient key={c} id={`${uid}-face-${c}`} cx="38%" cy="32%" r="75%">
          <stop offset="0%" style={{ stopColor: `var(--p${c}-hi)` }} />
          <stop offset="55%" style={{ stopColor: `var(--p${c}-face)` }} />
          <stop offset="100%" style={{ stopColor: `var(--p${c}-lo)` }} />
        </radialGradient>
      ))}
      <filter id={`${uid}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.4" />
      </filter>
    </defs>
  );
}

interface PieceGraphicProps {
  piece: Piece;
  pieceStyle: PieceStyle;
  uid: string;
  r: number;
  selected?: boolean;
  lifted?: boolean; // being dragged
}

/** One piece centred at (0,0). */
export function PieceGraphic({ piece, pieceStyle, uid, r, selected, lifted }: PieceGraphicProps) {
  const c = piece.color;
  const glyph = GLYPHS[c][piece.type];
  const sel = selected ? <circle r={r + 3} fill="none" stroke="var(--accent)" strokeWidth={3.5} /> : null;

  if (pieceStyle === '2d') {
    return (
      <g>
        <circle r={r} fill={`var(--p${c}-face)`} stroke="var(--p-edge)" strokeWidth={2} />
        <circle r={r - 4} fill="none" stroke={`var(--p${c}-ring)`} strokeWidth={1.5} />
        <text className={styles.glyph} dy="0.35em" fill={`var(--p${c}-glyph)`}>
          {glyph}
        </text>
        {sel}
      </g>
    );
  }

  // 3D: soft drop shadow, visible disc thickness, domed face, engraved glyph, gloss.
  const lift = lifted ? -6 : selected ? -3 : 0;
  return (
    <g>
      <ellipse cx={1.5} cy={6 - lift / 2} rx={r} ry={r * 0.96} fill="rgba(0,0,0,0.38)" filter={`url(#${uid}-shadow)`} />
      <g transform={`translate(0,${lift})`}>
        <circle cy={4} r={r} fill="var(--p-edge)" />
        <circle r={r} fill={`url(#${uid}-face-${c})`} stroke="var(--p-edge)" strokeWidth={1} />
        <circle r={r - 4.5} fill="none" stroke={`var(--p${c}-ring)`} strokeWidth={1.6} opacity={0.85} />
        <text className={styles.glyph} dy="0.35em" x={0.9} y={0.9} fill="rgba(255,255,255,0.45)">
          {glyph}
        </text>
        <text className={styles.glyph} dy="0.35em" fill={`var(--p${c}-glyph)`}>
          {glyph}
        </text>
        <ellipse cx={-r * 0.22} cy={-r * 0.48} rx={r * 0.55} ry={r * 0.26} fill="#fff" opacity={0.2} />
        {sel}
      </g>
    </g>
  );
}

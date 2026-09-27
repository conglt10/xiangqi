import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { isInCheck, legalMovesFrom } from '../../xiangqi';
import { playSound } from '../../sound';
import { useSettings } from '../../store/settingsStore';
import { BoardDefs, PieceGraphic } from './pieces';
import { boardTheme, pieceTheme, themeVars } from './themes';
import { fileOf, rankOf, sq, type Color, type Move, type Position, type Square } from '../../xiangqi/types';
import styles from './Board.module.css';

export interface Arrow {
  from: Square;
  to: Square;
  color?: string; // CSS color or var()
  width?: number; // stroke width in board units
  opacity?: number;
  label?: string;
}

export type HighlightKind = 'hint' | 'target' | 'danger' | 'good';

interface BoardProps {
  position: Position;
  orientation?: Color; // side shown at the bottom
  /** Which side the user may move; null = board is read-only. 'both' = either side to move. */
  interactive?: Color | 'both' | null;
  onMove?: (move: Move) => void;
  lastMove?: { from: Square; to: Square } | null;
  arrows?: Arrow[];
  highlights?: Partial<Record<Square, HighlightKind>>;
  /** Small badge drawn at a square (e.g. move classification). */
  badge?: { square: Square; text: string; color: string } | null;
}

const CELL = 60;
const M = 46; // margin
const W = CELL * 8 + M * 2;
const H = CELL * 9 + M * 2;
const R = 26; // piece radius


export function Board({
  position,
  orientation = 'r',
  interactive = null,
  onMove,
  lastMove,
  arrows = [],
  highlights = {},
  badge = null,
}: BoardProps) {
  const flipped = orientation === 'b';
  const uid = 'b' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const { boardTheme: boardId, pieceTheme: pieceId, pieceStyle } = useSettings();
  const vars = useMemo(() => themeVars(boardTheme(boardId), pieceTheme(pieceId)), [boardId, pieceId]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<{ from: Square; x: number; y: number; moved: boolean } | null>(null);

  const xy = (s: Square) => {
    const f = fileOf(s);
    const r = rankOf(s);
    return { x: M + (flipped ? 8 - f : f) * CELL, y: M + (flipped ? r : 9 - r) * CELL };
  };

  const canMoveColor = (c: Color) =>
    interactive === 'both' ? c === position.turn : interactive === c && c === position.turn;

  const targets = useMemo(() => {
    const from = drag?.from ?? selected;
    if (from == null) return new Map<Square, Move>();
    return new Map(legalMovesFrom(position, from).map((m) => [m.to, m]));
  }, [position, selected, drag?.from]);

  // Deselect when the position changes underneath us.
  const posRef = useRef(position);
  if (posRef.current !== position) {
    posRef.current = position;
    if (selected != null) setSelected(null);
  }

  // Play a sound when the position advances by `lastMove` (not when navigating backwards/jumping).
  const soundPosRef = useRef(position);
  useEffect(() => {
    const prev = soundPosRef.current;
    soundPosRef.current = position;
    if (prev === position || !lastMove) return;
    const mover = prev.board[lastMove.from];
    const landed = position.board[lastMove.to];
    if (!mover || !landed || mover.color !== landed.color || mover.type !== landed.type || position.board[lastMove.from]) return;
    if (isInCheck(position, position.turn)) playSound('check');
    else playSound(prev.board[lastMove.to] ? 'capture' : 'move');
  }, [position, lastMove]);

  const toBoardPoint = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  const squareAt = (x: number, y: number): Square | null => {
    const fx = Math.round((x - M) / CELL);
    const ry = Math.round((y - M) / CELL);
    if (fx < 0 || fx > 8 || ry < 0 || ry > 9) return null;
    const cx = M + fx * CELL;
    const cy = M + ry * CELL;
    if (Math.hypot(x - cx, y - cy) > CELL * 0.55) return null;
    const file = flipped ? 8 - fx : fx;
    const rank = flipped ? ry : 9 - ry;
    return sq(file, rank);
  };

  const tryMove = (to: Square) => {
    const m = targets.get(to);
    if (m) {
      setSelected(null);
      onMove?.(m);
      return true;
    }
    return false;
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const p = toBoardPoint(e);
    const s = squareAt(p.x, p.y);
    if (s == null) {
      setSelected(null);
      return;
    }
    if (selected != null && s !== selected && tryMove(s)) return;
    const piece = position.board[s];
    if (piece && canMoveColor(piece.color)) {
      setSelected(s);
      setDrag({ from: s, x: p.x, y: p.y, moved: false });
      svgRef.current?.setPointerCapture?.(e.pointerId);
    } else {
      setSelected(null);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const p = toBoardPoint(e);
    const moved = drag.moved || Math.hypot(p.x - xy(drag.from).x, p.y - xy(drag.from).y) > 8;
    setDrag({ ...drag, x: p.x, y: p.y, moved });
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const p = toBoardPoint(e);
    const s = squareAt(p.x, p.y);
    const wasDrag = drag.moved;
    setDrag(null);
    if (wasDrag && s != null && s !== drag.from) tryMove(s);
  };

  const lines = [];
  for (let r = 0; r < 10; r++) {
    lines.push(<line key={`h${r}`} x1={M} y1={M + r * CELL} x2={M + 8 * CELL} y2={M + r * CELL} />);
  }
  for (let f = 0; f < 9; f++) {
    const x = M + f * CELL;
    if (f === 0 || f === 8) lines.push(<line key={`v${f}`} x1={x} y1={M} x2={x} y2={M + 9 * CELL} />);
    else {
      lines.push(<line key={`vt${f}`} x1={x} y1={M} x2={x} y2={M + 4 * CELL} />);
      lines.push(<line key={`vb${f}`} x1={x} y1={M + 5 * CELL} x2={x} y2={M + 9 * CELL} />);
    }
  }
  // Palace diagonals
  for (const top of [0, 7]) {
    const y1 = M + top * CELL;
    const y2 = y1 + 2 * CELL;
    lines.push(<line key={`p1${top}`} x1={M + 3 * CELL} y1={y1} x2={M + 5 * CELL} y2={y2} />);
    lines.push(<line key={`p2${top}`} x1={M + 5 * CELL} y1={y1} x2={M + 3 * CELL} y2={y2} />);
  }

  const arrowEls = arrows.map((a, i) => {
    const p1 = xy(a.from);
    const p2 = xy(a.to);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const w = a.width ?? 9;
    const head = w * 2.2;
    const sx = p1.x + ux * 14;
    const sy = p1.y + uy * 14;
    const ex = p2.x - ux * head;
    const ey = p2.y - uy * head;
    const color = a.color ?? 'var(--arrow-best)';
    const pts = [
      `${p2.x},${p2.y}`,
      `${ex - uy * head * 0.75},${ey + ux * head * 0.75}`,
      `${ex + uy * head * 0.75},${ey - ux * head * 0.75}`,
    ].join(' ');
    return (
      <g key={`a${i}`} opacity={a.opacity ?? 0.8} className={styles.arrow}>
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth={w} strokeLinecap="round" />
        <polygon points={pts} fill={color} />
        {a.label && (
          <g>
            <circle cx={ex - ux * 6} cy={ey - uy * 6} r={9} fill={color} />
            <text x={ex - ux * 6} y={ey - uy * 6} className={styles.arrowLabel}>
              {a.label}
            </text>
          </g>
        )}
      </g>
    );
  });

  const pieces = [];
  for (let s = 0; s < 90; s++) {
    const piece = position.board[s];
    if (!piece) continue;
    const dragging = drag?.moved && drag.from === s;
    const { x, y } = dragging ? { x: drag.x, y: drag.y } : xy(s);
    pieces.push(
      <g key={`pc${s}`} className={styles.piece} transform={`translate(${x},${y})`} style={dragging ? { pointerEvents: 'none' } : undefined}>
        <PieceGraphic piece={piece} pieceStyle={pieceStyle} uid={uid} r={R} selected={selected === s} lifted={!!dragging} />
      </g>,
    );
  }

  return (
    <svg
      ref={svgRef}
      className={styles.board}
      viewBox={`0 0 ${W} ${H}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="img"
      aria-label="Xiangqi board"
      style={vars}
    >
      <BoardDefs uid={uid} />
      <rect x={0} y={0} width={W} height={H} rx={10} fill={`url(#${uid}-bg)`} />
      <rect x={0} y={0} width={W} height={H} rx={10} filter={`url(#${uid}-grain)`} style={{ opacity: 'var(--board-grain)' }} pointerEvents="none" />
      <rect x={M - 6} y={M - 6} width={8 * CELL + 12} height={9 * CELL + 12} className={styles.frame} />
      <g className={styles.grid}>{lines}</g>
      <text x={M + 2 * CELL} y={M + 4.5 * CELL} className={styles.river} dy="0.35em">
        {flipped ? '漢 界' : '楚 河'}
      </text>
      <text x={M + 6 * CELL} y={M + 4.5 * CELL} className={styles.river} dy="0.35em">
        {flipped ? '楚 河' : '漢 界'}
      </text>
      <g className={styles.coords}>
        {Array.from({ length: 9 }, (_, f) => (
          <text key={`cf${f}`} x={M + f * CELL} y={H - 5}>
            {'abcdefghi'[flipped ? 8 - f : f]}
          </text>
        ))}
        {Array.from({ length: 10 }, (_, r) => (
          <text key={`cr${r}`} x={9} y={M + r * CELL} dy="0.35em">
            {flipped ? r : 9 - r}
          </text>
        ))}
      </g>
      {lastMove &&
        [lastMove.from, lastMove.to].map((s, i) => {
          const { x, y } = xy(s);
          return <rect key={`lm${i}`} x={x - R - 3} y={y - R - 3} width={2 * R + 6} height={2 * R + 6} rx={6} className={styles.lastMove} />;
        })}
      {Object.entries(highlights).map(([s, kind]) => {
        const { x, y } = xy(+s);
        return <circle key={`hl${s}`} cx={x} cy={y} r={R + 5} className={`${styles.highlight} ${styles[`hl_${kind}`]}`} />;
      })}
      {pieces.filter((p) => p.key !== `pc${drag?.moved ? drag.from : -1}`)}
      {pieces.filter((p) => p.key === `pc${drag?.moved ? drag.from : -1}`)}
      {[...targets.keys()].map((s) => {
        const { x, y } = xy(s);
        const capture = !!position.board[s];
        return capture ? (
          <circle key={`t${s}`} cx={x} cy={y} r={R + 2} className={styles.captureRing} />
        ) : (
          <circle key={`t${s}`} cx={x} cy={y} r={8} className={styles.dot} />
        );
      })}
      <g pointerEvents="none">{arrowEls}</g>
      {badge && (() => {
        const { x, y } = xy(badge.square);
        return (
          <g transform={`translate(${x + R - 4},${y - R + 4})`} pointerEvents="none">
            <circle r={11} fill={badge.color} stroke="#fff" strokeWidth={2} />
            <text className={styles.badgeText} dy="0.35em">{badge.text}</text>
          </g>
        );
      })()}
    </svg>
  );
}

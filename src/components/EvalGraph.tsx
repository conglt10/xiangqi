import type { MouseEvent } from 'react';
import { CLASS_COLOR, type Classification } from '../analysis/classify';
import styles from './components.module.css';

interface Point {
  ply: number;
  redWp: number;
  cls?: Classification;
}

/** Red's expected score over the game; click to jump to a ply. */
export function EvalGraph({ points, current, onSelect }: { points: Point[]; current: number; onSelect: (ply: number) => void }) {
  const W = 600;
  const H = 120;
  const n = Math.max(1, points.length - 1);
  const x = (i: number) => (i / n) * W;
  const y = (wp: number) => (1 - wp) * H;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.redWp).toFixed(1)}`).join(' ');
  const area = `${path} L${W},${H} L0,${H} Z`;
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left) / rect.width) * n);
    const p = points[Math.max(0, Math.min(points.length - 1, i))];
    if (p) onSelect(p.ply);
  };
  const ci = points.findIndex((p) => p.ply === current);
  return (
    <svg className={styles.graph} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick={onClick}>
      <rect width={W} height={H} className={styles.graphBg} />
      <path d={area} className={styles.graphArea} />
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className={styles.graphMid} />
      <path d={path} className={styles.graphLine} vectorEffect="non-scaling-stroke" />
      {points.map((p, i) =>
        p.cls === 'blunder' || p.cls === 'mistake' || p.cls === 'brilliant' || p.cls === 'great' ? (
          <circle key={i} cx={x(i)} cy={y(p.redWp)} r={3.5} fill={CLASS_COLOR[p.cls]} vectorEffect="non-scaling-stroke" />
        ) : null,
      )}
      {ci >= 0 && <line x1={x(ci)} x2={x(ci)} y1={0} y2={H} className={styles.graphCursor} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

import type { EngineLine } from '../engine/uci';
import { formatScore, lineWp } from '../analysis/winprob';
import { pvToWxf } from '../analysis/explain';
import { useT } from '../i18n';
import type { Position } from '../xiangqi/types';
import styles from './components.module.css';

interface Props {
  lines: EngineLine[];
  position: Position;
  running: boolean;
  onPlay: (uci: string) => void;
  onHover?: (pv: string[] | null) => void;
}

/** Engine candidate lines, ranked by Pikafish (MultiPV order). Scores are shown from Red's point of view. */
export function EngineLines({ lines, position, running, onPlay, onHover }: Props) {
  const t = useT();
  const sign = position.turn === 'r' ? 1 : -1;
  const depth = lines[0]?.depth ?? 0;
  const nps = lines[0]?.nps;
  return (
    <div className={styles.engineLines}>
      <div className={styles.linesHeader}>
        <span>{t('analysis.depth', { d: depth })}</span>
        {nps ? <span className="dim">{Math.round(nps / 1000)} kN/s</span> : null}
        {running && <span className={styles.pulse} />}
      </div>
      {lines.length === 0 && <div className="dim">{running ? t('analysis.thinking') : t('analysis.noLines')}</div>}
      {lines.map((l) => {
        const wp = lineWp(l);
        const redWp = sign === 1 ? wp : 1 - wp;
        const [w, d, lo] = l.wdl ?? [0, 0, 0];
        const redW = sign === 1 ? w : lo;
        const redL = sign === 1 ? lo : w;
        const score = formatScore(l, sign);
        return (
          <button
            key={l.multipv}
            className={styles.lineRow}
            onClick={() => onPlay(l.pv[0])}
            onMouseEnter={() => onHover?.(l.pv)}
            onMouseLeave={() => onHover?.(null)}
            title={l.wdl ? t('analysis.wdl', { w: (redW / 10).toFixed(1), d: (d / 10).toFixed(1), l: (redL / 10).toFixed(1) }) : ''}
          >
            <span className={styles.lineRank}>{l.multipv}</span>
            <span className={`${styles.lineScore} ${redWp >= 0.5 ? styles.scoreRed : styles.scoreBlack}`}>{score}</span>
            <span className={styles.lineWp}>{Math.round(redWp * 100)}%</span>
            <span className={styles.linePv}>{pvToWxf(position, l.pv, 12)}</span>
          </button>
        );
      })}
    </div>
  );
}

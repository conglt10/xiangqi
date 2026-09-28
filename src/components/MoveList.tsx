import { useEffect, useRef } from 'react';
import { CLASS_COLOR, CLASS_SYMBOL, type Classification } from '../analysis/classify';
import styles from './components.module.css';

export interface MoveItem {
  key: number | string;
  ply: number; // 1-based ply number
  text: string;
  cls?: Classification;
  hints?: number;
}

interface Props {
  items: MoveItem[];
  currentKey: number | string | null;
  onSelect: (key: number | string) => void;
  /** Ply parity of the first move: true if the game starts with Black to move. */
  blackFirst?: boolean;
}

export function MoveList({ items, currentKey, onSelect, blackFirst }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep the current move visible by scrolling the list only; scrollIntoView would
    // also scroll the page and move the board.
    const list = ref.current;
    const el = list?.querySelector<HTMLElement>(`.${styles.moveCurrent}`);
    if (!list || !el) return;
    const top = el.offsetTop - list.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [currentKey]);
  const rows: { no: number; r?: MoveItem; b?: MoveItem }[] = [];
  for (const it of items) {
    const idx = it.ply - 1 + (blackFirst ? 1 : 0);
    const no = Math.floor(idx / 2) + 1;
    const isRed = idx % 2 === 0;
    let row = rows[rows.length - 1];
    if (!row || row.no !== no) {
      row = { no };
      rows.push(row);
    }
    if (isRed) row.r = it;
    else row.b = it;
  }
  const cell = (it?: MoveItem) =>
    it ? (
      <button className={`${styles.moveCell} ${it.key === currentKey ? styles.moveCurrent : ''}`} onClick={() => onSelect(it.key)}>
        <span className="mono">{it.text}</span>
        {it.cls && (
          <span className={styles.clsDot} style={{ background: CLASS_COLOR[it.cls] }} title={it.cls}>
            {CLASS_SYMBOL[it.cls]}
          </span>
        )}
        {it.hints ? <span className={styles.hintMark}>💡×{it.hints}</span> : null}
      </button>
    ) : (
      <span className={styles.moveCell} />
    );
  return (
    <div className={styles.moveList} ref={ref}>
      {rows.map((row) => (
        <div key={row.no} className={styles.moveRow}>
          <span className={styles.moveNo}>{row.no}.</span>
          {cell(row.r)}
          {cell(row.b)}
        </div>
      ))}
    </div>
  );
}

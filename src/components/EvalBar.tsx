import styles from './components.module.css';

/** Vertical bar: share of Red's expected score. `redWp` in [0,1]. */
export function EvalBar({ redWp, label, flipped }: { redWp: number | null; label?: string; flipped?: boolean }) {
  const pct = Math.round((redWp ?? 0.5) * 1000) / 10;
  return (
    <div className={`${styles.evalBar} ${flipped ? styles.evalFlipped : ''}`} title={label}>
      <div className={styles.evalRed} style={{ height: `${pct}%` }} />
      <span className={`${styles.evalLabel} ${pct >= 50 ? styles.evalLabelBottom : styles.evalLabelTop}`}>{label}</span>
    </div>
  );
}

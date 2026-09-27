import { useEffect, useId, useRef, useState } from 'react';
import { useT, type MessageKey } from '../i18n';
import { useSettings } from '../store/settingsStore';
import { BoardDefs, PieceGraphic } from './Board/pieces';
import { BOARD_THEMES, PIECE_THEMES, boardTheme, pieceTheme, themeVars, type BoardTheme, type PieceTheme } from './Board/themes';
import type { PieceStyle } from './Board/themes';
import styles from './ThemePicker.module.css';

/** Mini board + two pieces rendered with real theme colours. */
function Preview({ board, pieces, pieceStyle, showPieces }: { board: BoardTheme; pieces: PieceTheme; pieceStyle: PieceStyle; showPieces: boolean }) {
  const uid = 'tp' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg viewBox="0 0 120 64" className={styles.preview} style={themeVars(board, pieces)} aria-hidden>
      <BoardDefs uid={uid} />
      <rect width={120} height={64} rx={6} fill={`url(#${uid}-bg)`} />
      <rect width={120} height={64} rx={6} filter={`url(#${uid}-grain)`} style={{ opacity: 'var(--board-grain)' }} />
      <g stroke="var(--board-line)" strokeWidth={1}>
        {[12, 32, 52].map((y) => <line key={y} x1={8} x2={112} y1={y} y2={y} />)}
        {[8, 34, 60, 86, 112].map((x) => <line key={x} x1={x} x2={x} y1={12} y2={52} />)}
      </g>
      {showPieces && (
        <>
          <g transform="translate(40,32) scale(0.62)">
            <PieceGraphic piece={{ color: 'r', type: 'k' }} pieceStyle={pieceStyle} uid={uid} r={26} />
          </g>
          <g transform="translate(80,32) scale(0.62)">
            <PieceGraphic piece={{ color: 'b', type: 'k' }} pieceStyle={pieceStyle} uid={uid} r={26} />
          </g>
        </>
      )}
    </svg>
  );
}

export function ThemePicker() {
  const t = useT();
  const { boardTheme: boardId, pieceTheme: pieceId, pieceStyle, setTheme } = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const currentBoard = boardTheme(boardId);
  const currentPieces = pieceTheme(pieceId);

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog" title={t('theme.title')}>
        🎨
      </button>
      {open && (
        <div className={styles.popover} role="dialog" aria-label={t('theme.title')}>
          <div className={styles.section}>
            <div className={styles.label}>{t('theme.style')}</div>
            <div className={styles.segment}>
              {(['2d', '3d'] as const).map((s) => (
                <button key={s} className={pieceStyle === s ? styles.segActive : ''} onClick={() => setTheme({ pieceStyle: s })} aria-pressed={pieceStyle === s}>
                  {t(`theme.${s}` as MessageKey)}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.label}>{t('theme.pieces')}</div>
            <div className={styles.grid}>
              {PIECE_THEMES.map((p) => (
                <button key={p.id} className={`${styles.option} ${p.id === pieceId ? styles.optActive : ''}`} onClick={() => setTheme({ pieceTheme: p.id })} aria-pressed={p.id === pieceId}>
                  <Preview board={currentBoard} pieces={p} pieceStyle={pieceStyle} showPieces />
                  <span>{t(`theme.piece.${p.id}` as MessageKey)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.label}>{t('theme.board')}</div>
            <div className={styles.grid}>
              {BOARD_THEMES.map((b) => (
                <button key={b.id} className={`${styles.option} ${b.id === boardId ? styles.optActive : ''}`} onClick={() => setTheme({ boardTheme: b.id })} aria-pressed={b.id === boardId}>
                  <Preview board={b} pieces={currentPieces} pieceStyle={pieceStyle} showPieces={false} />
                  <span>{t(`theme.board.${b.id}` as MessageKey)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

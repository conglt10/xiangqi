import { useEffect, useRef, useState } from 'react';
import { Board, type Arrow, type HighlightKind } from '../components/Board/Board';
import { MoveList, type MoveItem } from '../components/MoveList';
import { CLASS_COLOR } from '../analysis/classify';
import { useCoach, type ChatEntry } from '../coach/coachStore';
import { MAX_HINT_LEVEL } from '../coach/hints';
import { useT, type MessageKey } from '../i18n';
import { useNav } from '../store/navStore';
import { uciToMove } from '../xiangqi';
import type { Color, Square } from '../xiangqi/types';
import styles from './pages.module.css';

const LEVEL_KEYS: MessageKey[] = ['level.1', 'level.2', 'level.3', 'level.4', 'level.5'];

function Setup() {
  const t = useT();
  const c = useCoach();
  const [color, setColor] = useState<Color | 'random'>('r');
  return (
    <div className={styles.page} style={{ gridTemplateColumns: 'minmax(0, 560px)', justifyContent: 'center' }}>
      <div className={styles.side}>
        <div className={styles.panel}>
          <div className={styles.coachHead}>
            <div className={styles.avatar}>師</div>
            <div>
              <b>{t('coach.title')}</b>
              <div className="dim">{t('coach.intro')}</div>
            </div>
          </div>
        </div>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>{t('coach.playAs')}</div>
          <div className={styles.row}>
            {(['r', 'b', 'random'] as const).map((v) => (
              <button key={v} className={color === v ? styles.active : ''} onClick={() => setColor(v)}>
                {t(v === 'r' ? 'side.redFirst' : v === 'b' ? 'side.black' : 'side.random')}
              </button>
            ))}
          </div>
          <div className={styles.panelTitle}>{t('coach.level')}</div>
          <div className={styles.levels}>
            {LEVEL_KEYS.map((k, i) => (
              <button key={k} className={`${styles.levelBtn} ${c.level === i + 1 ? styles.active : ''}`} onClick={() => c.setOptions({ level: i + 1 })}>
                <b>{i + 1}</b>
                {t(k)}
              </button>
            ))}
          </div>
          <div className={styles.hint}>{t(`level.${c.level}.desc` as MessageKey)}</div>
          <label>
            <input type="checkbox" checked={c.hintsEnabled} onChange={(e) => c.setOptions({ hintsEnabled: e.target.checked })} /> {t('coach.allowHints')}
          </label>
          <label>
            <input type="checkbox" checked={c.takebacksEnabled} onChange={(e) => c.setOptions({ takebacksEnabled: e.target.checked })} /> {t('coach.allowTakebacks')}
          </label>
          <button className="primary" onClick={() => c.start(color, c.level)}>
            {t('coach.start')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ e }: { e: ChatEntry }) {
  const t = useT();
  const cls =
    e.kind === 'bait' || e.kind === 'challenge' ? styles.bait : e.kind === 'hint' ? styles.hintBubble : e.kind === 'summary' ? styles.summaryBubble : '';
  return (
    <div className={`${styles.bubble} ${cls}`} style={e.cls ? { borderLeftColor: CLASS_COLOR[e.cls] } : undefined}>
      {e.msgs.map((m, i) => (
        <p key={i} className={i === 0 && (e.cls || e.kind === 'summary') ? styles.bubbleTitle : ''} style={i === 0 && e.cls ? { color: CLASS_COLOR[e.cls] } : undefined}>
          {e.ply && i === 0 ? `${Math.ceil(e.ply / 2)}. ` : ''}
          {e.kind === 'hint' ? '💡 ' : ''}
          {t(m)}
        </p>
      ))}
    </div>
  );
}

export function PlayCoachPage() {
  const t = useT();
  const c = useCoach();
  const openInReview = useNav((s) => s.openInReview);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [c.chat.length]);

  if (c.phase === 'setup') return <Setup />;

  const pos = c.positions[c.positions.length - 1];
  const prev = c.positions[c.positions.length - 2];
  const lastUci = c.moves[c.moves.length - 1];
  const last = prev && lastUci ? uciToMove(prev, lastUci) : null;
  const playerTurn = c.phase === 'playing' && pos.turn === c.playerColor && !c.thinking;

  const arrows: Arrow[] = [];
  if (c.hintView?.arrow) arrows.push(c.hintView.arrow);
  else if (c.feedbackArrow && playerTurn) arrows.push(c.feedbackArrow);
  const highlights: Partial<Record<Square, HighlightKind>> = { ...(playerTurn ? c.feedbackHighlights : {}), ...(c.hintView?.highlights ?? {}) };

  const items: MoveItem[] = c.records.map((r, i) => ({ key: i + 1, ply: i + 1, text: r.wxf, cls: r.by === 'player' ? r.classification : undefined, hints: r.hintsUsed }));
  const hintLevel = c.hint?.level ?? 0;
  const hintLabel = hintLevel >= MAX_HINT_LEVEL - 1 ? t('coach.showAnswer') : t('coach.hint');

  return (
    <div className={styles.page}>
      <div className={styles.boardCol}>
        <div className={styles.boardWrap}>
          <Board
            position={pos}
            orientation={c.playerColor}
            interactive={playerTurn ? c.playerColor : null}
            onMove={c.playerMove}
            lastMove={last ? { from: last.from, to: last.to } : null}
            arrows={arrows}
            highlights={highlights}
          />
        </div>
      </div>
      <div className={styles.side}>
        <div className={styles.panel}>
          <div className={styles.coachHead}>
            <div className={styles.avatar}>師</div>
            <div className={styles.grow}>
              <b>{t('coach.title')}</b> <span className="dim">· {t(LEVEL_KEYS[c.level - 1])}</span>
              <div className={styles.thinking}>
                {c.phase === 'over'
                  ? t('coach.gameOver')
                  : c.thinking
                    ? t('coach.thinking')
                    : pos.turn === c.playerColor
                      ? t('coach.yourMove')
                      : ''}
              </div>
            </div>
          </div>
          <div className={styles.chat} ref={chatRef}>
            {c.chat.map((e) => (
              <Bubble key={e.id} e={e} />
            ))}
          </div>
          <div className={styles.row}>
            {c.hintsEnabled && c.phase === 'playing' && (
              <button onClick={c.requestHint} disabled={!playerTurn || c.hintLoading}>
                💡 {c.hintLoading ? t('coach.thinking') : hintLabel}
                {hintLevel > 0 && <span className={styles.badge}>{hintLevel}/{MAX_HINT_LEVEL}</span>}
              </button>
            )}
            {c.takebacksEnabled && (
              <button onClick={c.takeback} disabled={c.thinking || c.records.filter((r) => r.by === 'player').length === 0}>
                ↶ {t('coach.takeback')}
              </button>
            )}
            {c.phase === 'playing' && <button onClick={c.resign}>🏳 {t('coach.resign')}</button>}
          </div>
          {c.phase === 'over' && (
            <div className={styles.row}>
              <button className="primary" onClick={() => openInReview({ startFen: c.startFen, moves: c.moves, headers: { PlayerColor: c.playerColor } })}>
                {t('coach.reviewGame')}
              </button>
              <button onClick={() => c.start(c.playerColor, c.level)}>{t('coach.rematch')}</button>
              <button onClick={c.backToSetup}>{t('coach.newGame')}</button>
            </div>
          )}
          {c.phase === 'playing' && (
            <button className={styles.hint} style={{ alignSelf: 'flex-start' }} onClick={c.backToSetup}>
              {t('coach.newGame')}
            </button>
          )}
        </div>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>{t('analysis.moves')}</div>
          <MoveList items={items} currentKey={items.length || null} onSelect={() => {}} />
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { Board, type Arrow } from '../components/Board/Board';
import { EvalBar } from '../components/EvalBar';
import { EvalGraph } from '../components/EvalGraph';
import { MoveList, type MoveItem } from '../components/MoveList';
import { PgnImport } from '../components/PgnImport';
import { Panel } from '../components/Panel';
import { CLASS_COLOR, CLASS_ORDER, CLASS_SYMBOL } from '../analysis/classify';
import { reviewGame, type GameReview } from '../review/reviewGame';
import { useT, type MessageKey } from '../i18n';
import { useNav } from '../store/navStore';
import { listGames, type SavedGame } from '../store/savedGames';
import { useBoardKeys } from '../hooks/useBoardKeys';
import { makeMove, parseFen, uciToMove } from '../xiangqi';
import type { Color, Position } from '../xiangqi/types';
import styles from './pages.module.css';

interface ReviewState {
  game: { startFen: string; moves: string[]; headers: Record<string, string> } | null;
  review: GameReview | null;
  progress: { done: number; total: number } | null;
  ply: number;
  signal: { cancelled: boolean } | null;
  setPly: (p: number) => void;
  start: (g: { startFen: string; moves: string[]; headers?: Record<string, string> }, depth: number) => Promise<void>;
  cancel: () => void;
  clear: () => void;
}

const useReview = create<ReviewState>((set, get) => ({
  game: null,
  review: null,
  progress: null,
  ply: 0,
  signal: null,
  setPly: (ply) => {
    const n = get().game?.moves.length ?? 0;
    set({ ply: Math.max(0, Math.min(n, ply)) });
  },
  start: async (g, depth) => {
    get().signal && (get().signal!.cancelled = true);
    const signal = { cancelled: false };
    set({ game: { startFen: g.startFen, moves: g.moves, headers: g.headers ?? {} }, review: null, progress: { done: 0, total: g.moves.length + 1 }, ply: 0, signal });
    const review = await reviewGame(g.startFen, g.moves, { depth, signal, onProgress: (done, total) => !signal.cancelled && set({ progress: { done, total } }) });
    if (signal.cancelled) return;
    set({ review, progress: null, signal: null });
  },
  cancel: () => {
    const s = get().signal;
    if (s) s.cancelled = true;
    set({ progress: null, signal: null, game: get().review ? get().game : null });
  },
  clear: () => {
    get().cancel();
    set({ game: null, review: null, ply: 0 });
  },
}));

export function ReviewPage() {
  const t = useT();
  const st = useReview();
  const consume = useNav((s) => s.consumeReview);
  const [depth, setDepth] = useState(14);
  const [orientation, setOrientation] = useState<Color>('r');
  const [games, setGames] = useState<SavedGame[]>([]);

  useEffect(() => {
    setGames(listGames());
    const g = consume();
    if (g) {
      if (g.headers?.PlayerColor === 'b') setOrientation('b');
      st.start(g, depth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const positions = useMemo(() => {
    if (!st.game) return [] as Position[];
    const out = [parseFen(st.game.startFen)];
    for (const u of st.game.moves) {
      const m = uciToMove(out[out.length - 1], u);
      if (!m) break;
      out.push(makeMove(out[out.length - 1], m));
    }
    return out;
  }, [st.game]);

  useBoardKeys({ back: () => st.setPly(st.ply - 1), forward: () => st.setPly(st.ply + 1), start: () => st.setPly(0), end: () => st.setPly(1e9) });

  if (!st.game) {
    return (
      <div className={styles.page} style={{ gridTemplateColumns: 'minmax(0, 720px)', justifyContent: 'center' }}>
        <div className={styles.side}>
          <div className={styles.panel}>
            <div className={styles.panelTitle}>{t('review.title')}</div>
            <p className="dim" style={{ margin: 0 }}>{t('review.intro')}</p>
            <div className={styles.row}>
              <span>{t('review.depth')}</span>
              <select value={depth} onChange={(e) => setDepth(+e.target.value)}>
                {[10, 12, 14, 16, 18].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
          <PgnImport onLoad={(g) => st.start(g, depth)} />
          <div className={styles.panel}>
            <div className={styles.panelTitle}>{t('review.savedGames')}</div>
            {games.length === 0 && <div className="dim">{t('review.noSaved')}</div>}
            {games.map((g) => (
              <button
                key={g.id}
                className={styles.gameItem}
                onClick={() => {
                  setOrientation(g.playerColor);
                  st.start({ startFen: g.startFen, moves: g.moves }, depth);
                }}
              >
                <span>
                  {new Date(g.date).toLocaleString()} · {t('review.vsCoach', { level: g.level })} · {t(g.playerColor === 'r' ? 'side.red' : 'side.black')}
                </span>
                <span className="mono">{g.result} · {g.moves.length} {t('review.plies')}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const rv = st.review;
  const ply = Math.min(st.ply, positions.length - 1);
  const pos = positions[ply];
  const pr = rv && ply > 0 ? rv.plies[ply - 1] : null;
  const lastMove = ply > 0 ? uciToMove(positions[ply - 1], st.game.moves[ply - 1]) : null;
  const redWp = rv ? (ply === 0 ? rv.redWpStart : rv.plies[ply - 1]?.redWpAfter ?? 0.5) : null;
  const cp = pr ? pr.redCpAfter : null;
  const evalLabel = cp === null ? '' : Math.abs(cp) >= 9000 ? (cp > 0 ? '#' : '-#') : (cp > 0 ? '+' : '') + (cp / 100).toFixed(1);

  const arrows: Arrow[] = [];
  if (pr && lastMove && pr.bestUci && pr.bestUci !== pr.uci && ['inaccuracy', 'mistake', 'blunder'].includes(pr.classification)) {
    const best = uciToMove(positions[ply - 1], pr.bestUci);
    if (best) arrows.push({ from: best.from, to: best.to, color: 'var(--arrow-2)', width: 9, opacity: 0.8 });
  }
  const highlights: Record<number, 'danger'> = {};
  pr?.explanation.danger.forEach((s) => (highlights[s] = 'danger'));

  const items: MoveItem[] = st.game.moves.slice(0, positions.length - 1).map((u, i) => ({
    key: i + 1,
    ply: i + 1,
    text: rv?.plies[i]?.wxf ?? u,
    cls: rv?.plies[i]?.classification,
  }));

  const moments = rv ? rv.plies.filter((p) => p.classification === 'blunder' || p.classification === 'mistake' || p.missedWin || p.classification === 'brilliant') : [];
  const clsLabel = (c: string) => t(`cls.${c}` as MessageKey);

  return (
    <div className={styles.page}>
      <div className={styles.boardCol}>
        <EvalBar redWp={redWp} label={evalLabel} flipped={orientation === 'b'} />
        <div className={styles.boardWrap}>
          <Board
            position={pos}
            orientation={orientation}
            lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
            arrows={arrows}
            highlights={highlights}
            badge={pr && lastMove ? { square: lastMove.to, text: CLASS_SYMBOL[pr.classification], color: CLASS_COLOR[pr.classification] } : null}
          />
        </div>
      </div>
      <div className={styles.side}>
        {st.progress && (
          <Panel id="review.progress" title={t('review.analyzing')} extra={<span className="mono">{st.progress.done}/{st.progress.total}</span>}>
            <div className={styles.row}>
              <div className={styles.grow} style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(st.progress.done / st.progress.total) * 100}%`, height: '100%', background: 'var(--accent)' }} />
              </div>
              <button onClick={st.cancel}>{t('common.cancel')}</button>
            </div>
          </Panel>
        )}

        {rv && (
          <Panel id="review.summary" title={t('review.summary')} extra={<span className="dim">{t('review.depthN', { d: rv.depth })}</span>}>
            <div className={styles.accRow}>
              <div className={styles.accBox} style={{ borderTop: '3px solid var(--eval-red)' }}>
                {t('side.red')}
                <b>{rv.accuracy.r.toFixed(1)}</b>
                <span className="dim">{t('review.accuracy')}</span>
              </div>
              <div className={styles.accBox} style={{ borderTop: '3px solid var(--eval-black)' }}>
                {t('side.black')}
                <b>{rv.accuracy.b.toFixed(1)}</b>
                <span className="dim">{t('review.accuracy')}</span>
              </div>
            </div>
            <table className={styles.countTable}>
              <tbody>
                {CLASS_ORDER.map((c) => (
                  <tr key={c}>
                    <td className={styles.clsName}>
                      <span className={styles.clsSwatch} style={{ background: CLASS_COLOR[c] }}>{CLASS_SYMBOL[c]}</span>
                      {clsLabel(c)}
                    </td>
                    <td>{rv.counts.r[c] ?? 0}</td>
                    <td>{rv.counts.b[c] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <EvalGraph
              points={[{ ply: 0, redWp: rv.redWpStart }, ...rv.plies.map((p) => ({ ply: p.ply, redWp: p.redWpAfter, cls: p.classification }))]}
              current={ply}
              onSelect={st.setPly}
            />
          </Panel>
        )}

        {rv && (
          // Always rendered with a fixed-height body so the panels below (and the
          // prev/next buttons) never move when the explanation text changes.
          <Panel
            id="review.explain"
            className={styles.explainCard}
            style={{ borderLeftColor: pr ? CLASS_COLOR[pr.classification] : 'var(--border)' }}
            title={
              pr ? (
                <>
                  {Math.ceil(pr.ply / 2)}{pr.color === 'r' ? '.' : '...'} {pr.wxf} — <span style={{ color: CLASS_COLOR[pr.classification] }}>{clsLabel(pr.classification)}</span>
                </>
              ) : (
                t('review.explanation')
              )
            }
            extra={pr ? <span className="dim">{t(pr.color === 'r' ? 'side.red' : 'side.black')}</span> : null}
          >
            <div className={styles.explainBody}>
              {!pr && <div className="dim">{t('review.selectMove')}</div>}
              {pr && [pr.explanation.praise, pr.explanation.flaw, pr.explanation.missedChance, pr.explanation.betterLine].map((m, i) => (m ? <div key={i}>{t(m)}</div> : null))}
              {pr && pr.bestUci && pr.bestUci !== pr.uci && !pr.explanation.betterLine && (
                <div className="dim">{t('review.bestWas', { move: pr.bestWxf, loss: Math.round(pr.delta * 100) })}</div>
              )}
              {pr && pr.explanation.tags.length > 0 && (
                <div className={styles.chips}>
                  {pr.explanation.tags.map((tag) => (
                    <span key={tag} className={styles.chip} style={{ background: 'var(--surface-2)' }}>{t(tag)}</span>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        )}

        <Panel id="review.moves" title={t('analysis.moves')}>
          <MoveList items={items} currentKey={ply || null} onSelect={(k) => st.setPly(+k)} blackFirst={positions[0]?.turn === 'b'} />
          <div className={styles.navBtns}>
            <button onClick={() => st.setPly(0)}>«</button>
            <button onClick={() => st.setPly(ply - 1)}>‹</button>
            <button onClick={() => st.setPly(ply + 1)}>›</button>
            <button onClick={() => st.setPly(1e9)}>»</button>
            <button onClick={() => setOrientation(orientation === 'r' ? 'b' : 'r')}>⇅</button>
          </div>
          <div className={styles.row}>
            <button onClick={st.clear}>{t('review.newReview')}</button>
          </div>
        </Panel>

        {moments.length > 0 && (
          <Panel id="review.moments" title={t('review.keyMoments')} extra={<span className="dim">{moments.length}</span>}>
            {moments.map((p) => (
              <button key={p.ply} className={styles.moment} onClick={() => st.setPly(p.ply)}>
                <span className={styles.clsSwatch} style={{ background: CLASS_COLOR[p.classification] }}>{CLASS_SYMBOL[p.classification]}</span>
                <span className="mono">{Math.ceil(p.ply / 2)}{p.color === 'r' ? '.' : '...'} {p.wxf}</span>
                <span className="dim">{p.missedWin ? t('review.missedWin') : clsLabel(p.classification)}</span>
              </button>
            ))}
          </Panel>
        )}
      </div>
    </div>
  );
}

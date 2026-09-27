import { useEffect, useMemo, useState } from 'react';
import { Board, type Arrow } from '../components/Board/Board';
import { EvalBar } from '../components/EvalBar';
import { EngineLines } from '../components/EngineLines';
import { MoveList, type MoveItem } from '../components/MoveList';
import { PgnImport } from '../components/PgnImport';
import { engine, type EngineLine } from '../engine/EngineClient';
import { formatScore, lineWp } from '../analysis/winprob';
import { useT } from '../i18n';
import { useNav } from '../store/navStore';
import { useSettings } from '../store/settingsStore';
import { createGameTree, historyKeys, mainLine, pathTo } from '../store/gameTree';
import { gameStatus, makeMove, parseFen, toPgn, uciToMove } from '../xiangqi';
import type { Color, Position } from '../xiangqi/types';
import { useBoardKeys } from '../hooks/useBoardKeys';
import styles from './pages.module.css';

export const useAnalysisTree = createGameTree();

const ARROW_COLORS = ['var(--arrow-best)', 'var(--arrow-2)', 'var(--arrow-3)'];

function pvArrows(pos: Position, pv: string[], max = 4): Arrow[] {
  const out: Arrow[] = [];
  let p = pos;
  for (let i = 0; i < Math.min(max, pv.length); i++) {
    const m = uciToMove(p, pv[i]);
    if (!m) break;
    out.push({ from: m.from, to: m.to, color: p.turn === 'r' ? 'var(--eval-red)' : 'var(--eval-black)', width: 7, opacity: 0.75 - i * 0.1, label: String(i + 1) });
    p = makeMove(p, m);
  }
  return out;
}

export function AnalysisPage() {
  const t = useT();
  const tree = useAnalysisTree();
  const { multipv, setMultipv, showArrows, setShowArrows } = useSettings();
  const consume = useNav((s) => s.consumeAnalysis);
  const [orientation, setOrientation] = useState<Color>('r');
  const [engineOn, setEngineOn] = useState(true);
  const [lines, setLines] = useState<EngineLine[]>([]);
  const [running, setRunning] = useState(false);
  const [hoverPv, setHoverPv] = useState<string[] | null>(null);
  const [fenInput, setFenInput] = useState('');
  const [fenError, setFenError] = useState('');
  const [hidden, setHidden] = useState(document.hidden);

  const node = tree.nodes[tree.currentId];
  const pos = node.pos;
  const status = useMemo(() => gameStatus(pos, historyKeys(tree.nodes, tree.currentId)), [pos, tree.nodes, tree.currentId]);

  useEffect(() => {
    const g = consume();
    if (g) tree.load(g.startFen, g.moves, g.ply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Continuous analysis of the current position.
  useEffect(() => {
    setLines([]);
    if (!engineOn || hidden || status.over) {
      setRunning(false);
      return;
    }
    let handle: ReturnType<typeof engine.analyze> | null = null;
    const timer = setTimeout(() => {
      setRunning(true);
      handle = engine.analyze({ fen: node.fen, multipv, infinite: true, priority: 'interactive', onInfo: setLines });
      handle.promise.then((r) => {
        if (!r.cancelled) setRunning(false);
      });
    }, 150);
    return () => {
      clearTimeout(timer);
      handle?.cancel();
    };
  }, [node.fen, multipv, engineOn, hidden, status.over]);

  useBoardKeys({ back: tree.back, forward: tree.forward, start: tree.toStart, end: tree.toEnd });

  const top = lines[0];
  const redWp = top ? (pos.turn === 'r' ? lineWp(top) : 1 - lineWp(top)) : status.over ? (status.winner === 'r' ? 1 : status.winner === 'b' ? 0 : 0.5) : null;
  const evalLabel = top ? formatScore(top, pos.turn === 'r' ? 1 : -1) : '';

  let arrows: Arrow[] = [];
  if (hoverPv) arrows = pvArrows(pos, hoverPv);
  else if (showArrows && engineOn) {
    lines.slice(0, 3).forEach((l, i) => {
      const m = uciToMove(pos, l.pv[0]);
      if (m) arrows.push({ from: m.from, to: m.to, color: ARROW_COLORS[i], width: 11 - i * 3, opacity: 0.85 - i * 0.2 });
    });
  }

  // Current line: path to the current node + main continuation.
  const path = pathTo(tree.nodes, tree.currentId);
  const cont = mainLine(tree.nodes, tree.currentId).slice(1);
  const lineNodes = [...path.slice(1), ...cont];
  const items: MoveItem[] = lineNodes.map((n) => ({ key: n.id, ply: n.ply, text: n.wxf }));
  const parent = node.parent !== null ? tree.nodes[node.parent] : null;
  const siblings = parent ? parent.children.filter((c) => c !== node.id).map((c) => tree.nodes[c]) : [];
  const root = tree.nodes[tree.rootId];

  const loadFen = () => {
    try {
      const p = parseFen(fenInput.trim());
      if (!p.board.some((x) => x?.type === 'k' && x.color === 'r') || !p.board.some((x) => x?.type === 'k' && x.color === 'b')) throw new Error();
      tree.reset(fenInput.trim());
      setFenError('');
    } catch {
      setFenError(t('analysis.badFen'));
    }
  };

  const pgnText = () =>
    toPgn({ headers: { Event: 'Analysis' }, startFen: root.fen, moves: mainLine(tree.nodes).slice(1).map((n) => n.uci!) }, 'WXF');

  return (
    <div className={styles.page}>
      <div className={styles.boardCol}>
        <EvalBar redWp={redWp} label={evalLabel} flipped={orientation === 'b'} />
        <div className={styles.boardWrap}>
          <Board
            position={pos}
            orientation={orientation}
            interactive="both"
            onMove={(m) => tree.play(m)}
            lastMove={node.move ? { from: node.move.from, to: node.move.to } : null}
            arrows={arrows}
          />
        </div>
      </div>
      <div className={styles.side}>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>
            <span>{t('analysis.engine')}</span>
            <span className={styles.row}>
              <select value={multipv} onChange={(e) => setMultipv(+e.target.value)} title={t('analysis.lines')}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {t('analysis.nLines', { n })}
                  </option>
                ))}
              </select>
              <button onClick={() => setEngineOn(!engineOn)}>{engineOn ? t('analysis.stop') : t('analysis.start')}</button>
            </span>
          </div>
          {status.over ? (
            <div className={styles.status}>
              {status.reason === 'repetition'
                ? t('status.repetition')
                : t(status.reason === 'checkmate' ? 'status.checkmate' : 'status.stalemate', { side: t(status.winner === 'r' ? 'side.red' : 'side.black') })}
            </div>
          ) : (
            <EngineLines lines={lines} position={pos} running={running} onPlay={(u) => tree.play(u)} onHover={setHoverPv} />
          )}
          <label className={styles.hint}>
            <input type="checkbox" checked={showArrows} onChange={(e) => setShowArrows(e.target.checked)} /> {t('analysis.showArrows')}
          </label>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelTitle}>
            <span>{t('analysis.moves')}</span>
            <span className={styles.row}>
              <span className="dim">{t(pos.turn === 'r' ? 'status.redToMove' : 'status.blackToMove')}</span>
            </span>
          </div>
          <MoveList items={items} currentKey={tree.currentId} onSelect={(k) => tree.goTo(+k)} blackFirst={root.pos.turn === 'b'} />
          {siblings.length > 0 && (
            <div className={styles.chips}>
              <span className={styles.hint}>{t('analysis.alternatives')}</span>
              {siblings.map((s) => (
                <button key={s.id} className={styles.chip} onClick={() => tree.goTo(s.id)}>
                  {s.wxf}
                </button>
              ))}
            </div>
          )}
          <div className={styles.navBtns}>
            <button onClick={tree.toStart} title={t('nav.start')}>«</button>
            <button onClick={tree.back} title={t('nav.back')}>‹</button>
            <button onClick={tree.forward} title={t('nav.forward')}>›</button>
            <button onClick={tree.toEnd} title={t('nav.end')}>»</button>
            <button onClick={() => setOrientation(orientation === 'r' ? 'b' : 'r')} title={t('nav.flip')}>⇅</button>
          </div>
          <div className={styles.row}>
            <button onClick={() => tree.reset()}>{t('analysis.newBoard')}</button>
            <button onClick={() => tree.truncateAfterCurrent()} disabled={!node.children.length}>
              {t('analysis.deleteAfter')}
            </button>
            <button onClick={() => navigator.clipboard?.writeText(pgnText())}>{t('analysis.copyPgn')}</button>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelTitle}>FEN</div>
          <div className={styles.row}>
            <input className={`${styles.grow} mono`} value={fenInput} placeholder={node.fen} onChange={(e) => setFenInput(e.target.value)} />
            <button onClick={loadFen} disabled={!fenInput.trim()}>
              {t('analysis.loadFen')}
            </button>
            <button onClick={() => navigator.clipboard?.writeText(node.fen)} title={t('analysis.copyFen')}>
              {t('common.copy')}
            </button>
          </div>
          {fenError && <div className={styles.error}>{fenError}</div>}
        </div>
        <PgnImport compact onLoad={(g) => tree.load(g.startFen, g.moves, 0)} />
      </div>
    </div>
  );
}

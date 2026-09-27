// Play-vs-Coach game loop: move feedback, strength-limited replies,
// instructive baits and the progressive hint ladder.
import { create } from 'zustand';
import { engine, type AnalyzeResult, type EngineLine } from '../engine/EngineClient';
import type { Arrow, HighlightKind } from '../components/Board/Board';
import type { Msg } from '../i18n';
import { averageAccuracy, classifyMove, type Classification } from '../analysis/classify';
import { explainMove, pvToWxf, type Explanation } from '../analysis/explain';
import { classifyTacticalMotif, detectHangingAfter, isSacrifice, type Motif } from '../analysis/recognizer';
import { isBookSequence } from '../analysis/book';
import { lineWp } from '../analysis/winprob';
import { gameStatus, legalMoves, makeMove, moveToUci, parseFen, positionKey, toFen, toWxf, uciToMove } from '../xiangqi';
import { START_FEN, opposite, type Color, type Move, type Position, type Square } from '../xiangqi/types';
import { saveGame } from '../store/savedGames';
import { playSound } from '../sound';
import { MAX_HINT_LEVEL, renderHintLevel, type HintPlan, type HintState, type HintView } from './hints';
import { LEVELS, pickLine, type LevelConfig } from './strength';

export interface MoveRecord {
  uci: string;
  wxf: string;
  color: Color;
  by: 'player' | 'coach';
  classification?: Classification;
  delta?: number;
  hintsUsed?: number;
  bait?: boolean;
  explanation?: Explanation;
}

export interface ChatEntry {
  id: number;
  kind: 'feedback' | 'bait' | 'hint' | 'challenge' | 'info' | 'summary';
  msgs: Msg[];
  cls?: Classification;
  ply?: number;
}

interface Challenge {
  posKey: string; // position where the player should find the refutation
  plan: HintPlan;
}

export interface CoachState {
  phase: 'setup' | 'playing' | 'over';
  playerColor: Color;
  level: number;
  hintsEnabled: boolean;
  takebacksEnabled: boolean;
  startFen: string;
  moves: string[];
  positions: Position[];
  records: MoveRecord[];
  thinking: boolean;
  hintLoading: boolean;
  chat: ChatEntry[];
  result: { winner?: Color; reason: string } | null;
  challenge: Challenge | null;
  hint: HintState | null;
  hintView: HintView | null;
  feedbackArrow: Arrow | null;
  feedbackHighlights: Partial<Record<Square, HighlightKind>>;
  stats: { hints: number; movesWithHints: number; reveals: number; challengesSolved: number; challengesTotal: number };

  setOptions: (o: Partial<Pick<CoachState, 'level' | 'hintsEnabled' | 'takebacksEnabled'>>) => void;
  start: (color: Color | 'random', level: number) => void;
  playerMove: (m: Move) => void;
  requestHint: () => void;
  takeback: () => void;
  resign: () => void;
  backToSetup: () => void;
}

// Pre-computed analysis of positions where the player is to move (reused for feedback and hints).
const preAnalysis = new Map<string, Promise<AnalyzeResult>>();
const PRE_DEPTH = 12;
let gen = 0; // bumps on start/takeback/resign; stale async continuations bail out
let chatId = 0;

function getPreAnalysis(pos: Position): Promise<AnalyzeResult> {
  const key = positionKey(pos);
  let p = preAnalysis.get(key);
  if (!p) {
    p = engine.analyze({ fen: toFen(pos), multipv: 3, depth: PRE_DEPTH, priority: 'coach' }).promise;
    preAnalysis.set(key, p);
    const mine = p;
    p.then((r) => {
      if (r.cancelled && preAnalysis.get(key) === mine) preAnalysis.delete(key);
    });
  }
  return p;
}

const levelCfg = (level: number): LevelConfig => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level - 1))];

function planFromLine(pos: Position, line: EngineLine | undefined, source: HintPlan['source']): HintPlan | null {
  const move = line?.pv[0] ? uciToMove(pos, line.pv[0]) : null;
  if (!move || !line) return null;
  const r = classifyTacticalMotif(pos, move, line.mate);
  const afterPos = makeMove(pos, move);
  const follow = line.pv.length >= 3 ? pvToWxf(afterPos, line.pv.slice(1, 3)) : null;
  return { source, motif: r.motif, move, wxf: toWxf(pos, move), targets: r.targets, targetTypes: r.targetTypes, followUp: follow, mateIn: r.mateIn };
}

/** Looks for an instructive mistake for the coach: a candidate that loses a bit and has a clear tactical refutation. */
export function findBait(pos: Position, lines: EngineLine[], cfg: LevelConfig): { move: Move; plan: HintPlan } | null {
  if (!lines.length) return null;
  const bestWp = lineWp(lines[0]);
  const good: Motif[] = ['fork', 'winMaterial', 'pin', 'discovered', 'mate'];
  for (const line of lines.slice(1)) {
    const loss = bestWp - lineWp(line);
    if (loss < 0.08 || loss > cfg.maxBaitLoss || line.pv.length < 2) continue;
    const move = uciToMove(pos, line.pv[0]);
    if (!move) continue;
    const afterPos = makeMove(pos, move);
    const refLine: EngineLine = { ...line, multipv: 1, pv: line.pv.slice(1), mate: line.mate !== undefined ? -line.mate : undefined };
    const plan = planFromLine(afterPos, refLine, 'challenge');
    if (plan && good.includes(plan.motif)) return { move, plan };
  }
  // Fallback: leave a minor piece or pawn en prise (never a chariot).
  const candidates: { move: Move; plan: HintPlan }[] = [];
  for (const move of legalMoves(pos)) {
    if (move.piece.type === 'r' || move.piece.type === 'k') continue;
    const h = detectHangingAfter(pos, move);
    if (!h || h.targetTypes[0] === 'r' || (h.gain ?? 0) < 1 || (h.gain ?? 0) > (cfg.explicit ? 4.5 : 2)) continue;
    const afterPos = makeMove(pos, move);
    const r = classifyTacticalMotif(afterPos, h.move);
    candidates.push({
      move,
      plan: { source: 'challenge', motif: r.motif === 'positional' ? 'winMaterial' : r.motif, move: h.move, wxf: toWxf(afterPos, h.move), targets: r.targets.length ? r.targets : h.targets, targetTypes: r.targetTypes.length ? r.targetTypes : h.targetTypes, followUp: null },
    });
  }
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}

export const useCoach = create<CoachState>((set, get) => {
  const push = (entry: Omit<ChatEntry, 'id'>) => set((s) => ({ chat: [...s.chat, { ...entry, id: ++chatId }] }));
  const current = () => {
    const s = get();
    return s.positions[s.positions.length - 1];
  };

  const applyMove = (m: Move, rec: Omit<MoveRecord, 'uci' | 'wxf' | 'color'>) => {
    const s = get();
    const pos = current();
    const next = makeMove(pos, m);
    set({
      moves: [...s.moves, moveToUci(m)],
      positions: [...s.positions, next],
      records: [...s.records, { ...rec, uci: moveToUci(m), wxf: toWxf(pos, m), color: pos.turn }],
    });
  };

  const checkGameOver = (): boolean => {
    const s = get();
    const st = gameStatus(current(), s.positions.map(positionKey));
    if (!st.over) return false;
    finish(st.winner, st.reason ?? 'checkmate');
    return true;
  };

  const finish = (winner: Color | undefined, reason: string) => {
    const s = get();
    gen++;
    const mine = s.records.filter((r) => r.by === 'player' && r.delta !== undefined);
    const acc = Math.round(averageAccuracy(mine.map((r) => r.delta!)));
    const blunders = mine.filter((r) => r.classification === 'blunder').length;
    const resultKey = winner === undefined ? 'coach.result.draw' : winner === s.playerColor ? 'coach.result.win' : 'coach.result.loss';
    set({ phase: 'over', thinking: false, result: { winner, reason }, hintView: null, challenge: null });
    setTimeout(() => playSound('gameEnd'), 350); // after the final move sound
    push({
      kind: 'summary',
      msgs: [
        { key: resultKey },
        { key: `reason.${reason}` as Msg['key'] },
        { key: 'coach.summary', params: { acc, blunders, hints: s.stats.hints, moves: s.stats.movesWithHints } },
        ...(s.stats.challengesTotal ? [{ key: 'coach.summary.challenges' as const, params: { solved: s.stats.challengesSolved, total: s.stats.challengesTotal } }] : []),
      ],
    });
    saveGame({
      id: `${Date.now()}`,
      date: Date.now(),
      startFen: s.startFen,
      moves: s.moves,
      playerColor: s.playerColor,
      level: s.level,
      result: winner === 'r' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2',
    });
  };

  const coachMove = async (token: number, lines?: EngineLine[]) => {
    const s = get();
    const cfg = levelCfg(s.level);
    const pos = current();
    set({ thinking: true });
    let cand = lines;
    if (!cand || !cand.length) {
      const res = await engine.analyze({ fen: toFen(pos), multipv: cfg.multipv, depth: cfg.depth, priority: 'coach' }).promise;
      if (token !== gen) return;
      cand = res.lines;
    }
    let move: Move | null = null;
    let bait: { move: Move; plan: HintPlan } | null = null;
    if (s.moves.length >= 6 && Math.random() < cfg.baitChance) bait = findBait(pos, cand, cfg);
    if (bait) move = bait.move;
    else {
      const idx = pickLine(cand, cfg.temperature);
      const u = cand[idx]?.pv[0] ?? cand[0]?.pv[0];
      move = u ? uciToMove(pos, u) : null;
    }
    if (!move) move = legalMoves(pos)[0] ?? null;
    if (!move) {
      checkGameOver();
      return;
    }
    applyMove(move, { by: 'coach', bait: !!bait });
    const after = current();
    if (bait) {
      set({ challenge: { posKey: positionKey(after), plan: bait.plan } });
      setTimeout(() => playSound('notify'), 300);
      push({ kind: 'bait', msgs: [{ key: (cfg.explicit ? `bait.${bait.plan.motif}` : `bait.subtle.${bait.plan.motif}`) as Msg['key'] }] });
    }
    set({ thinking: false });
    if (checkGameOver()) return;
    getPreAnalysis(after); // warm up feedback + hints for the player's move
  };

  return {
    phase: 'setup',
    playerColor: 'r',
    level: 2,
    hintsEnabled: true,
    takebacksEnabled: true,
    startFen: START_FEN,
    moves: [],
    positions: [parseFen(START_FEN)],
    records: [],
    thinking: false,
    hintLoading: false,
    chat: [],
    result: null,
    challenge: null,
    hint: null,
    hintView: null,
    feedbackArrow: null,
    feedbackHighlights: {},
    stats: { hints: 0, movesWithHints: 0, reveals: 0, challengesSolved: 0, challengesTotal: 0 },

    setOptions: (o) => set(o),

    start: (color, level) => {
      gen++;
      preAnalysis.clear();
      engine.cancelAll('coach');
      engine.newGame();
      const playerColor: Color = color === 'random' ? (Math.random() < 0.5 ? 'r' : 'b') : color;
      set({
        phase: 'playing',
        playerColor,
        level,
        startFen: START_FEN,
        moves: [],
        positions: [parseFen(START_FEN)],
        records: [],
        thinking: false,
        chat: [],
        result: null,
        challenge: null,
        hint: null,
        hintView: null,
        feedbackArrow: null,
        feedbackHighlights: {},
        stats: { hints: 0, movesWithHints: 0, reveals: 0, challengesSolved: 0, challengesTotal: 0 },
      });
      push({ kind: 'info', msgs: [{ key: 'coach.welcome', params: { level } }] });
      playSound('gameStart');
      const token = gen;
      if (playerColor === 'b') coachMove(token);
      else getPreAnalysis(current());
    },

    playerMove: async (m) => {
      const s = get();
      if (s.phase !== 'playing' || s.thinking || current().turn !== s.playerColor) return;
      const token = gen;
      const before = current();
      const beforeKey = positionKey(before);
      const hintsUsed = s.hint?.posKey === beforeKey ? s.hint.level : 0;
      const challenge = s.challenge?.posKey === beforeKey ? s.challenge : null;
      const uci = moveToUci(m);
      applyMove(m, { by: 'player', hintsUsed });
      set((st) => ({
        thinking: true,
        hint: null,
        hintView: null,
        feedbackArrow: null,
        feedbackHighlights: {},
        challenge: null,
        stats: hintsUsed ? { ...st.stats, movesWithHints: st.stats.movesWithHints + 1 } : st.stats,
      }));
      const plyIndex = get().records.length - 1;
      const after = current();
      const cfg = levelCfg(s.level);
      const over = gameStatus(after, get().positions.map(positionKey)).over;

      const pre = await getPreAnalysis(before);
      if (token !== gen) return;
      let postLines: EngineLine[] = [];
      if (!over) {
        const post = await engine.analyze({ fen: toFen(after), multipv: Math.max(cfg.multipv, 3), depth: Math.max(cfg.depth, PRE_DEPTH), priority: 'coach' }).promise;
        if (token !== gen) return;
        postLines = post.lines;
      }

      // Classify the player's move.
      const top = pre.lines[0];
      const bestWp = top ? lineWp(top) : 0.5;
      const inLines = pre.lines.find((l) => l.pv[0] === uci);
      const playedWp = inLines ? lineWp(inLines) : over ? (gameStatus(after).winner === m.piece.color ? 1 : 0.5) : 1 - (postLines[0] ? lineWp(postLines[0]) : 0.5);
      const res = classifyMove({
        bestWp,
        playedWp,
        secondWp: pre.lines[1] ? lineWp(pre.lines[1]) : undefined,
        isEngineBest: top?.pv[0] === uci,
        isSacrifice: top?.pv[0] === uci && isSacrifice(before, m),
        isBook: isBookSequence(get().moves),
      });
      const explanation = explainMove({
        before,
        played: m,
        classification: res.classification,
        delta: res.delta,
        bestPv: top?.pv,
        bestMate: top?.mate,
        refutationPv: postLines[0]?.pv,
        refutationMate: postLines[0]?.mate,
      });
      set((st) => {
        const records = st.records.slice();
        records[plyIndex] = { ...records[plyIndex], classification: res.classification, delta: res.delta, explanation };
        return { records };
      });

      const msgs: Msg[] = [{ key: `cls.feedback.${res.classification}` as Msg['key'] }];
      for (const x of [explanation.praise, explanation.flaw, explanation.missedChance, explanation.betterLine]) if (x) msgs.push(x);

      if (challenge) {
        const solved = uci === moveToUci(challenge.plan.move) || res.delta <= 0.02;
        set((st) => ({
          stats: { ...st.stats, challengesTotal: st.stats.challengesTotal + 1, challengesSolved: st.stats.challengesSolved + (solved ? 1 : 0) },
        }));
        push({
          kind: 'challenge',
          msgs: [
            solved
              ? { key: hintsUsed === 0 ? 'coach.challenge.solved' : hintsUsed >= MAX_HINT_LEVEL ? 'coach.challenge.solvedReveal' : 'coach.challenge.solvedHint' }
              : { key: 'coach.challenge.missed', params: { move: challenge.plan.wxf } },
          ],
        });
      }
      push({ kind: 'feedback', msgs, cls: res.classification, ply: plyIndex + 1 });

      const bad = res.classification === 'inaccuracy' || res.classification === 'mistake' || res.classification === 'blunder';
      if (bad && top?.pv[0]) {
        const best = uciToMove(before, top.pv[0]);
        const hl: Partial<Record<Square, HighlightKind>> = {};
        explanation.danger.forEach((d) => (hl[d] = 'danger'));
        set({ feedbackArrow: best ? { from: best.from, to: best.to, color: 'var(--arrow-2)', width: 8, opacity: 0.55 } : null, feedbackHighlights: hl });
      }

      if (checkGameOver()) return;
      await coachMove(token, postLines.length >= Math.min(cfg.multipv, 3) ? postLines : undefined);
    },

    requestHint: async () => {
      const s = get();
      if (!s.hintsEnabled || s.phase !== 'playing' || s.thinking || s.hintLoading) return;
      const pos = current();
      if (pos.turn !== s.playerColor) return;
      const key = positionKey(pos);
      const cfg = levelCfg(s.level);
      let hint = s.hint?.posKey === key ? { ...s.hint, level: Math.min(s.hint.level + 1, MAX_HINT_LEVEL) } : null;
      if (!hint) {
        let plan: HintPlan | null = s.challenge?.posKey === key ? s.challenge.plan : null;
        if (!plan) {
          const token = gen;
          set({ hintLoading: true });
          const res = await getPreAnalysis(pos);
          set({ hintLoading: false });
          if (token !== gen || positionKey(current()) !== key) return;
          plan = planFromLine(pos, res.lines[0], 'engine');
        }
        if (!plan) return;
        hint = { posKey: key, level: 1, plan };
      }
      const view = renderHintLevel(hint.plan, hint.level, cfg.explicit);
      const wasReveal = s.hint?.level === MAX_HINT_LEVEL;
      set((st) => ({
        hint,
        hintView: view,
        stats: {
          ...st.stats,
          hints: st.stats.hints + (wasReveal ? 0 : 1),
          reveals: st.stats.reveals + (hint!.level === MAX_HINT_LEVEL && !wasReveal ? 1 : 0),
        },
      }));
      if (!wasReveal) push({ kind: 'hint', msgs: [view.msg] });
    },

    takeback: () => {
      const s = get();
      if (!s.takebacksEnabled || s.thinking || s.records.length === 0 || s.phase === 'setup') return;
      let n = 0;
      const recs = s.records.slice();
      // Undo back to the most recent position where the player was to move.
      while (recs.length) {
        const r = recs.pop()!;
        n++;
        if (r.by === 'player') break;
      }
      if (recs.length === 0 && s.records[0]?.by === 'coach' && n === s.records.length) {
        // Coach opened the game; keep its first move.
        recs.push(s.records[0]);
        n--;
      }
      if (n <= 0) return;
      gen++;
      preAnalysis.clear();
      engine.cancelAll('coach');
      set({
        phase: 'playing',
        result: null,
        moves: s.moves.slice(0, s.moves.length - n),
        positions: s.positions.slice(0, s.positions.length - n),
        records: recs,
        thinking: false,
        hint: null,
        hintView: null,
        challenge: null,
        feedbackArrow: null,
        feedbackHighlights: {},
      });
      push({ kind: 'info', msgs: [{ key: 'coach.takeback.done' }] });
      getPreAnalysis(current());
    },

    resign: () => {
      const s = get();
      if (s.phase !== 'playing') return;
      engine.cancelAll('coach');
      finish(opposite(s.playerColor), 'resign');
    },

    backToSetup: () => {
      gen++;
      engine.cancelAll('coach');
      set({ phase: 'setup', thinking: false, hintView: null, feedbackArrow: null, feedbackHighlights: {} });
    },
  };
});

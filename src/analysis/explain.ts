// Turns engine output + recognizer motifs into translatable explanations
// (same shape as WhyBlunder: flaw / missedChance / betterLine / tags).
import type { MessageKey, Msg } from '../i18n';
import { makeMove, squareName, toWxf, uciToMove } from '../xiangqi';
import type { Move, Position, Square } from '../xiangqi/types';
import type { Classification } from './classify';
import { classifyTacticalMotif, detectHangingAfter, type Motif, type MotifResult } from './recognizer';

export interface Explanation {
  flaw?: Msg;
  missedChance?: Msg;
  betterLine?: Msg;
  praise?: Msg;
  tags: MessageKey[];
  /** Squares worth highlighting on the board. */
  danger: Square[];
}

export interface ExplainInput {
  before: Position;
  played: Move;
  classification: Classification;
  delta: number;
  /** Engine best move in `before` (UCI) and its PV. */
  bestPv?: string[];
  bestMate?: number; // mate for the mover in the best line
  /** Opponent's best reply line after the played move (UCI), and its mate score from the opponent's POV. */
  refutationPv?: string[];
  refutationMate?: number;
}

const BAD: Classification[] = ['inaccuracy', 'mistake', 'blunder'];
const GOOD: Classification[] = ['brilliant', 'great', 'best'];

/** Renders a PV as WXF text, e.g. "C2=5 H8+7 H2+3". */
export function pvToWxf(pos: Position, pv: string[], max = 6): string {
  const out: string[] = [];
  let p = pos;
  for (const u of pv.slice(0, max)) {
    const m = uciToMove(p, u);
    if (!m) break;
    out.push(toWxf(p, m));
    p = makeMove(p, m);
  }
  return out.join(' ');
}

function motifParams(r: MotifResult) {
  return {
    t1: { p: r.targetTypes[0] ?? 'k' },
    t2: { p: r.targetTypes[1] ?? r.targetTypes[0] ?? 'k' },
    square: r.targets[0] !== undefined ? squareName(r.targets[0]) : '',
    n: r.mateIn ?? 0,
  };
}

const TAG: Record<Motif, MessageKey | null> = {
  mate: 'tag.mate',
  fork: 'tag.fork',
  discovered: 'tag.discovered',
  pin: 'tag.pin',
  winMaterial: 'tag.winMaterial',
  hanging: 'tag.hanging',
  check: 'tag.check',
  positional: null,
};

export function explainMove(i: ExplainInput): Explanation {
  const ex: Explanation = { tags: [], danger: [] };
  const after = makeMove(i.before, i.played);
  const addTag = (m: Motif) => {
    const t = TAG[m];
    if (t && !ex.tags.includes(t)) ex.tags.push(t);
  };

  if (BAD.includes(i.classification)) {
    // What does the opponent do to us?
    const reply = i.refutationPv?.[0] ? uciToMove(after, i.refutationPv[0]) : null;
    let flaw: Msg | undefined;
    const replyText = reply ? toWxf(after, reply) : '';
    if (i.refutationMate !== undefined && i.refutationMate > 0) {
      flaw = { key: 'explain.flaw.mate', params: { n: i.refutationMate } };
      addTag('mate');
    } else if (reply) {
      const r = classifyTacticalMotif(after, reply);
      const replyWxf = toWxf(after, reply);
      const params = { ...motifParams(r), reply: replyWxf };
      if (r.motif === 'fork' || r.motif === 'discovered' || r.motif === 'pin') {
        flaw = { key: `explain.flaw.${r.motif}` as MessageKey, params };
        ex.danger.push(...r.targets);
        addTag(r.motif);
      } else if (r.motif === 'winMaterial') {
        flaw = { key: 'explain.flaw.hanging', params };
        ex.danger.push(...r.targets);
        addTag('hanging');
      }
    }
    if (!flaw) {
      const hanging = detectHangingAfter(i.before, i.played);
      if (hanging) {
        flaw = { key: 'explain.flaw.hanging', params: { ...motifParams(hanging), reply: toWxf(after, hanging.move) } };
        ex.danger.push(...hanging.targets);
        addTag('hanging');
      }
    }
    ex.flaw = flaw ?? {
      key: replyText ? 'explain.flaw.genericReply' : 'explain.flaw.generic',
      params: { loss: Math.round(i.delta * 100), reply: replyText },
    };

    // What did we miss?
    const best = i.bestPv?.[0] ? uciToMove(i.before, i.bestPv[0]) : null;
    if (best) {
      const r = classifyTacticalMotif(i.before, best, i.bestMate);
      const bestWxf = toWxf(i.before, best);
      if (r.motif !== 'positional') {
        ex.missedChance = { key: `explain.missed.${r.motif}` as MessageKey, params: { ...motifParams(r), best: bestWxf } };
        addTag(r.motif);
      }
      ex.betterLine = { key: 'explain.better', params: { best: bestWxf, line: pvToWxf(i.before, i.bestPv!) } };
    }
  } else if (GOOD.includes(i.classification)) {
    const r = classifyTacticalMotif(i.before, i.played, i.bestMate);
    if (r.motif !== 'positional') {
      ex.praise = { key: `explain.good.${r.motif}` as MessageKey, params: motifParams(r) };
      addTag(r.motif);
    } else {
      ex.praise = { key: i.classification === 'great' ? 'explain.good.onlyMove' : 'explain.good.solid' };
    }
  }
  return ex;
}

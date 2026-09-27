// Progressive hint ladder (see docs-reference/progressive-coach-hints-plan.md).
import type { Arrow, HighlightKind } from '../components/Board/Board';
import type { MessageKey, Msg } from '../i18n';
import type { Motif } from '../analysis/recognizer';
import { squareName } from '../xiangqi';
import type { Move, PieceType, Square } from '../xiangqi/types';

export const MAX_HINT_LEVEL = 4;

export interface HintPlan {
  source: 'challenge' | 'engine';
  motif: Motif;
  move: Move;
  wxf: string;
  targets: Square[];
  targetTypes: PieceType[];
  followUp: string | null; // WXF of the next move in the line
  mateIn?: number;
}

export interface HintState {
  posKey: string;
  level: number;
  plan: HintPlan;
}

export interface HintView {
  msg: Msg;
  highlights: Partial<Record<Square, HighlightKind>>;
  arrow: Arrow | null;
}

export function renderHintLevel(plan: HintPlan, level: number, explicit: boolean): HintView {
  const lv = Math.max(1, Math.min(level, MAX_HINT_LEVEL));
  const params = {
    piece: { p: plan.move.piece.type },
    t1: { p: plan.targetTypes[0] ?? 'k' },
    t2: { p: plan.targetTypes[1] ?? plan.targetTypes[0] ?? 'k' },
    from: squareName(plan.move.from),
    to: squareName(plan.move.to),
    move: plan.wxf,
    followUp: plan.followUp ?? '',
    n: plan.mateIn ?? 0,
  };
  const highlights: Partial<Record<Square, HighlightKind>> = {};
  if (lv >= 1) highlights[plan.move.from] = 'hint';
  if (lv >= 2) plan.targets.forEach((t) => (highlights[t] = 'target'));
  if (lv >= 3) highlights[plan.move.to] = 'good';

  let key: MessageKey;
  if (lv === 1) key = (explicit ? `hint.l1.${plan.motif}` : `hint.l1s.${plan.motif}`) as MessageKey;
  else if (lv === 2) key = `hint.l2.${plan.motif}` as MessageKey;
  else if (lv === 3) key = 'hint.l3';
  else key = plan.followUp ? 'hint.l4.follow' : 'hint.l4';

  return {
    msg: { key, params },
    highlights,
    arrow: lv >= MAX_HINT_LEVEL ? { from: plan.move.from, to: plan.move.to, color: '#f5b400', width: 10, opacity: 0.9 } : null,
  };
}

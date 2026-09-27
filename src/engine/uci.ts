// UCI output parsing for Pikafish.

export interface EngineLine {
  multipv: number;
  depth: number;
  seldepth?: number;
  /** Centipawns from the side-to-move's point of view (undefined when mate). */
  cp?: number;
  /** Mate in N moves; positive = side to move mates. */
  mate?: number;
  /** Win/draw/loss per mille from the side-to-move's point of view. */
  wdl?: [number, number, number];
  bound?: 'lower' | 'upper';
  nodes?: number;
  nps?: number;
  time?: number;
  pv: string[];
}

export function parseInfo(line: string): EngineLine | null {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
  const t = line.split(/\s+/);
  const out: EngineLine = { multipv: 1, depth: 0, pv: [] };
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth': out.depth = +t[++i]; break;
      case 'seldepth': out.seldepth = +t[++i]; break;
      case 'multipv': out.multipv = +t[++i]; break;
      case 'nodes': out.nodes = +t[++i]; break;
      case 'nps': out.nps = +t[++i]; break;
      case 'time': out.time = +t[++i]; break;
      case 'score':
        if (t[i + 1] === 'cp') out.cp = +t[i + 2];
        else if (t[i + 1] === 'mate') out.mate = +t[i + 2];
        i += 2;
        break;
      case 'lowerbound': out.bound = 'lower'; break;
      case 'upperbound': out.bound = 'upper'; break;
      case 'wdl': out.wdl = [+t[i + 1], +t[i + 2], +t[i + 3]]; i += 3; break;
      case 'pv': out.pv = t.slice(i + 1).filter(Boolean); i = t.length; break;
      default: break;
    }
  }
  return out.pv.length ? out : null;
}

export function parseBestMove(line: string): { best: string; ponder?: string } | null {
  if (!line.startsWith('bestmove')) return null;
  const t = line.split(/\s+/);
  return { best: t[1], ponder: t[3] };
}

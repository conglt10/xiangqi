// A move tree with a cursor, used by every page (each page owns its own store).
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { makeMove, parseFen, toFen, toWxf, uciToMove, moveToUci, positionKey } from '../xiangqi';
import { START_FEN, type Move, type Position } from '../xiangqi/types';

export interface TreeNode {
  id: number;
  parent: number | null;
  children: number[]; // children[0] is the main line
  uci: string | null; // move leading to this node (null for root)
  move: Move | null;
  wxf: string;
  pos: Position;
  fen: string;
  ply: number;
}

export interface GameTreeState {
  nodes: Record<number, TreeNode>;
  rootId: number;
  currentId: number;
  nextId: number;
  reset: (fen?: string) => void;
  /** Loads a linear game; returns the number of moves applied (stops at the first illegal move). */
  load: (startFen: string, ucis: string[], cursorPly?: number) => number;
  play: (moveOrUci: Move | string) => boolean;
  goTo: (id: number) => void;
  back: () => void;
  forward: () => void;
  toStart: () => void;
  toEnd: () => void;
  truncateAfterCurrent: () => void;
}

function rootNode(fen: string): TreeNode {
  const pos = parseFen(fen);
  return { id: 0, parent: null, children: [], uci: null, move: null, wxf: '', pos, fen: toFen(pos), ply: 0 };
}

export function createGameTree(): UseBoundStore<StoreApi<GameTreeState>> {
  return create<GameTreeState>((set, get) => ({
    nodes: { 0: rootNode(START_FEN) },
    rootId: 0,
    currentId: 0,
    nextId: 1,

    reset: (fen = START_FEN) => set({ nodes: { 0: rootNode(fen) }, rootId: 0, currentId: 0, nextId: 1 }),

    load: (startFen, ucis, cursorPly) => {
      const nodes: Record<number, TreeNode> = { 0: rootNode(startFen) };
      let cur = nodes[0];
      let id = 1;
      for (const u of ucis) {
        const m = uciToMove(cur.pos, u);
        if (!m) break;
        const pos = makeMove(cur.pos, m);
        const node: TreeNode = { id, parent: cur.id, children: [], uci: u, move: m, wxf: toWxf(cur.pos, m), pos, fen: toFen(pos), ply: cur.ply + 1 };
        nodes[id] = node;
        cur.children.push(id);
        cur = node;
        id++;
      }
      let currentId = cur.id;
      if (cursorPly !== undefined) {
        let n = nodes[0];
        while (n.ply < cursorPly && n.children.length) n = nodes[n.children[0]];
        currentId = n.id;
      }
      set({ nodes, rootId: 0, currentId, nextId: id });
      return id - 1;
    },

    play: (moveOrUci) => {
      const { nodes, currentId, nextId } = get();
      const cur = nodes[currentId];
      const m = typeof moveOrUci === 'string' ? uciToMove(cur.pos, moveOrUci) : moveOrUci;
      if (!m) return false;
      const uci = moveToUci(m);
      const existing = cur.children.find((c) => nodes[c].uci === uci);
      if (existing !== undefined) {
        set({ currentId: existing });
        return true;
      }
      const pos = makeMove(cur.pos, m);
      const node: TreeNode = { id: nextId, parent: cur.id, children: [], uci, move: m, wxf: toWxf(cur.pos, m), pos, fen: toFen(pos), ply: cur.ply + 1 };
      set({
        nodes: { ...nodes, [nextId]: node, [cur.id]: { ...cur, children: [...cur.children, nextId] } },
        currentId: nextId,
        nextId: nextId + 1,
      });
      return true;
    },

    goTo: (id) => {
      if (get().nodes[id]) set({ currentId: id });
    },
    back: () => {
      const { nodes, currentId } = get();
      const p = nodes[currentId].parent;
      if (p !== null) set({ currentId: p });
    },
    forward: () => {
      const { nodes, currentId } = get();
      const c = nodes[currentId].children[0];
      if (c !== undefined) set({ currentId: c });
    },
    toStart: () => set({ currentId: get().rootId }),
    toEnd: () => {
      const { nodes } = get();
      let n = nodes[get().currentId];
      while (n.children.length) n = nodes[n.children[0]];
      set({ currentId: n.id });
    },
    truncateAfterCurrent: () => {
      const { nodes, currentId } = get();
      const keep: Record<number, TreeNode> = {};
      // Keep ancestors (with only the path child) and the current node without children.
      let n: TreeNode | undefined = nodes[currentId];
      let child: number | null = null;
      while (n) {
        keep[n.id] = { ...n, children: child === null ? [] : [child] };
        child = n.id;
        n = n.parent === null ? undefined : nodes[n.parent];
      }
      set({ nodes: keep });
    },
  }));
}

/** Nodes from the root to `id` (inclusive). */
export function pathTo(nodes: Record<number, TreeNode>, id: number): TreeNode[] {
  const out: TreeNode[] = [];
  let n: TreeNode | undefined = nodes[id];
  while (n) {
    out.push(n);
    n = n.parent === null ? undefined : nodes[n.parent];
  }
  return out.reverse();
}

/** Main line starting at root following children[0]. */
export function mainLine(nodes: Record<number, TreeNode>, rootId = 0): TreeNode[] {
  const out: TreeNode[] = [];
  let n: TreeNode | undefined = nodes[rootId];
  while (n) {
    out.push(n);
    n = n.children.length ? nodes[n.children[0]] : undefined;
  }
  return out;
}

/** Repetition keys along the path, for gameStatus(). */
export function historyKeys(nodes: Record<number, TreeNode>, id: number): string[] {
  return pathTo(nodes, id).map((n) => positionKey(n.pos));
}

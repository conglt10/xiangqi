// UI-side client for the Pikafish worker: a SharedArrayBuffer command channel,
// a priority job queue (one search at a time), and UCI output parsing.
import { parseBestMove, parseInfo, type EngineLine } from './uci';

export type EngineState = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';
export type Priority = 'interactive' | 'coach' | 'review';
const PRIORITY_RANK: Record<Priority, number> = { interactive: 2, coach: 1, review: 0 };

export interface AnalyzeRequest {
  fen: string;
  moves?: string[];
  multipv?: number;
  depth?: number;
  movetime?: number;
  nodes?: number;
  infinite?: boolean;
  priority?: Priority;
  /** Hard cap in ms; the search is stopped after this long. */
  timeout?: number;
  onInfo?: (lines: EngineLine[]) => void;
}

export interface AnalyzeResult {
  bestmove: string | null;
  lines: EngineLine[]; // sorted by multipv (engine ranking)
  cancelled: boolean;
}

export interface AnalysisHandle {
  promise: Promise<AnalyzeResult>;
  cancel: () => void;
}

interface Job {
  req: AnalyzeRequest;
  rank: number;
  resolve: (r: AnalyzeResult) => void;
  lines: Map<number, EngineLine>;
  cancelled: boolean;
  preempted: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

const RING_BYTES = 1 << 16;

class EngineClient {
  state: EngineState = 'idle';
  progress = { loaded: 0, total: 0 };
  errorMessage = '';
  engineName = '';
  threads = 1;

  private worker: Worker | null = null;
  private header: Int32Array | null = null;
  private ring: Uint8Array | null = null;
  private writePos = 0;
  private queue: Job[] = [];
  private current: Job | null = null;
  private stopping = false;
  private multipv = 1;
  private listeners = new Set<() => void>();
  private waiters: { token: string; resolve: () => void }[] = [];
  private readyPromise: Promise<void> | null = null;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  /** Starts the worker (idempotent). Resolves once the engine answered `readyok`. */
  init(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      if (typeof SharedArrayBuffer === 'undefined' || !globalThis.crossOriginIsolated) {
        this.state = 'unsupported';
        this.errorMessage = 'SharedArrayBuffer is unavailable (page is not cross-origin isolated).';
        this.emit();
        reject(new Error(this.errorMessage));
        return;
      }
      this.state = 'loading';
      this.emit();
      const sab = new SharedArrayBuffer(4 + RING_BYTES);
      this.header = new Int32Array(sab, 0, 1);
      this.ring = new Uint8Array(sab, 4);
      const url = new URL('engine/engine-worker.js', document.baseURI);
      this.worker = new Worker(url);
      this.worker.onmessage = (e) => this.onWorkerMessage(e.data);
      this.worker.onerror = (e) => this.fail(e.message || 'Engine worker failed to start');
      this.worker.postMessage({ type: 'init', sab });

      const cores = navigator.hardwareConcurrency || 4;
      this.threads = Math.max(1, Math.min(cores - 1, 16));
      this.send('uci');
      this.waitFor('uciok')
        .then(() => {
          this.send(`setoption name Threads value ${this.threads}`);
          this.send('setoption name Hash value 128');
          this.send('setoption name UCI_ShowWDL value true');
          this.send('setoption name MultiPV value 1');
          this.multipv = 1;
          this.send('isready');
          return this.waitFor('readyok');
        })
        .then(() => {
          this.state = 'ready';
          this.emit();
          resolve();
          this.pump();
        }, reject);
    });
    return this.readyPromise;
  }

  private fail(message: string) {
    this.state = 'error';
    this.errorMessage = message;
    this.emit();
  }

  private send(cmd: string) {
    if (!this.header || !this.ring) return;
    const bytes = new TextEncoder().encode(cmd + '\n');
    for (let i = 0; i < bytes.length; i++) this.ring[(this.writePos + i) % RING_BYTES] = bytes[i];
    this.writePos += bytes.length;
    Atomics.store(this.header, 0, this.writePos);
    Atomics.notify(this.header, 0);
  }

  private waitFor(token: string): Promise<void> {
    return new Promise((resolve) => this.waiters.push({ token, resolve }));
  }

  private onWorkerMessage(msg: { type: string; line?: string; loaded?: number; total?: number; message?: string }) {
    switch (msg.type) {
      case 'progress':
        this.progress = { loaded: msg.loaded ?? 0, total: msg.total ?? 0 };
        this.emit();
        return;
      case 'fatal':
        this.fail(msg.message ?? 'Engine crashed');
        return;
      case 'line':
        this.onLine(msg.line ?? '');
        return;
      default:
        return;
    }
  }

  private onLine(line: string) {
    if (line.startsWith('id name ')) this.engineName = line.slice(8);
    const w = this.waiters.findIndex((x) => line.startsWith(x.token));
    if (w >= 0) {
      this.waiters[w].resolve();
      this.waiters.splice(w, 1);
    }
    const job = this.current;
    if (!job) return;
    const info = parseInfo(line);
    if (info) {
      // Keep exact scores over bound-only updates at the same depth.
      const prev = job.lines.get(info.multipv);
      if (!(info.bound && prev && prev.depth >= info.depth)) job.lines.set(info.multipv, info);
      if (!job.cancelled && !job.preempted) job.req.onInfo?.(this.sortedLines(job));
      return;
    }
    const best = parseBestMove(line);
    if (best) this.finishCurrent(best.best === '(none)' ? null : best.best);
  }

  private sortedLines(job: Job): EngineLine[] {
    return [...job.lines.values()].sort((a, b) => a.multipv - b.multipv);
  }

  private finishCurrent(bestmove: string | null) {
    const job = this.current;
    this.current = null;
    this.stopping = false;
    if (job) {
      clearTimeout(job.timer);
      if (job.preempted && !job.cancelled) {
        // Re-run later from scratch.
        job.preempted = false;
        job.started = false;
        job.lines = new Map();
        this.enqueue(job, true);
      } else {
        job.resolve({ bestmove, lines: this.sortedLines(job), cancelled: job.cancelled });
      }
    }
    this.pump();
  }

  private enqueue(job: Job, front = false) {
    if (front) this.queue.unshift(job);
    else this.queue.push(job);
    // Stable sort by priority (higher first).
    this.queue.sort((a, b) => b.rank - a.rank);
  }

  private pump() {
    if (this.state !== 'ready' || this.current || this.stopping) return;
    const job = this.queue.shift();
    if (!job) return;
    if (job.cancelled) {
      job.resolve({ bestmove: null, lines: [], cancelled: true });
      this.pump();
      return;
    }
    this.current = job;
    job.started = true;
    const r = job.req;
    const mpv = Math.max(1, Math.min(r.multipv ?? 1, 10));
    if (mpv !== this.multipv) {
      this.send(`setoption name MultiPV value ${mpv}`);
      this.multipv = mpv;
    }
    this.send(`position fen ${r.fen}${r.moves?.length ? ' moves ' + r.moves.join(' ') : ''}`);
    let go = 'go';
    if (r.infinite) go += ' infinite';
    else {
      if (r.depth) go += ` depth ${r.depth}`;
      if (r.movetime) go += ` movetime ${r.movetime}`;
      if (r.nodes) go += ` nodes ${r.nodes}`;
      if (go === 'go') go += ' depth 12';
    }
    this.send(go);
    if (r.timeout) job.timer = setTimeout(() => this.stopCurrent(), r.timeout);
  }

  private stopCurrent() {
    if (this.current && !this.stopping) {
      this.stopping = true;
      this.send('stop');
    }
  }

  analyze(req: AnalyzeRequest): AnalysisHandle {
    let job!: Job;
    const promise = new Promise<AnalyzeResult>((resolve) => {
      job = {
        req,
        rank: PRIORITY_RANK[req.priority ?? 'interactive'],
        resolve,
        lines: new Map(),
        cancelled: false,
        preempted: false,
        started: false,
      };
    });
    this.enqueue(job);
    const cur = this.current;
    if (cur && job.rank > cur.rank) {
      // Preempt lower-priority work; infinite searches simply end.
      if (!cur.req.infinite) cur.preempted = true;
      this.stopCurrent();
    }
    this.init().then(() => this.pump(), () => job.resolve({ bestmove: null, lines: [], cancelled: true }));
    return {
      promise,
      cancel: () => {
        if (job.cancelled) return;
        job.cancelled = true;
        if (this.current === job) this.stopCurrent();
        else {
          const i = this.queue.indexOf(job);
          if (i >= 0) {
            this.queue.splice(i, 1);
            job.resolve({ bestmove: null, lines: [], cancelled: true });
          }
        }
      },
    };
  }

  /** Cancels every queued/running job of the given priority (or all). */
  cancelAll(priority?: Priority) {
    const rank = priority ? PRIORITY_RANK[priority] : undefined;
    for (const job of [...this.queue]) {
      if (rank === undefined || job.rank === rank) {
        job.cancelled = true;
      }
    }
    if (this.current && (rank === undefined || this.current.rank === rank)) {
      this.current.cancelled = true;
      this.stopCurrent();
    }
    this.pump();
  }

  newGame() {
    if (this.state === 'ready' && !this.current) this.send('ucinewgame');
  }
}

export const engine = new EngineClient();
export type { EngineLine };

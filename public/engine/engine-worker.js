/* Pikafish host worker (classic worker).
 *
 * pikafish.js is an Emscripten pthreads build whose only input is a blocking
 * stdin. This worker runs the engine's main thread; the UI thread writes UCI
 * commands into a SharedArrayBuffer ring (see src/engine/EngineClient.ts) and
 * the stdin callback blocks on it with Atomics.wait. While blocked we keep
 * calling Module.checkMailbox() so proxied pthread calls (e.g. search
 * threads printing `info`/`bestmove`) are still serviced.
 *
 * Emscripten spawns pthread workers from this same script URL with
 * name === 'em-pthread'; pikafish.js boots itself in that case.
 */
importScripts('pikafish.js');

if (self.name !== 'em-pthread') {
  const NNUE_CACHE = 'pikafish-nnue-v1';
  let header; // Int32Array: [0] = total bytes written by the UI thread
  let ring; // Uint8Array ring of commands
  let readPos = 0;
  let line = [];
  let endOfRead = false;
  let mod = null;

  const post = (msg) => self.postMessage(msg);

  async function fetchNnue(url) {
    let cache = null;
    try {
      cache = await caches.open(NNUE_CACHE);
      const hit = await cache.match(url);
      if (hit) return new Uint8Array(await hit.arrayBuffer());
    } catch {
      cache = null; // Cache Storage unavailable (e.g. private mode)
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to download NNUE: ' + res.status);
    const total = Number(res.headers.get('Content-Length')) || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    let lastReport = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (loaded - lastReport > 1 << 20) {
        lastReport = loaded;
        post({ type: 'progress', loaded, total });
      }
    }
    const bytes = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) {
      bytes.set(c, off);
      off += c.length;
    }
    if (cache) {
      try {
        await cache.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }));
      } catch {
        /* quota exceeded: fine, just re-download next time */
      }
    }
    return bytes;
  }

  function nextCommandLine() {
    for (;;) {
      const written = Atomics.load(header, 0);
      if (written !== readPos) {
        const bytes = [];
        while (readPos !== written) {
          bytes.push(ring[readPos % ring.length]);
          readPos++;
        }
        return bytes;
      }
      Atomics.wait(header, 0, readPos, 20);
      if (mod) mod.checkMailbox();
    }
  }

  function stdin() {
    if (line.length) {
      const c = line.shift();
      if (c === 10) endOfRead = true;
      return c;
    }
    if (endOfRead) {
      endOfRead = false;
      return null; // end this read() call; the next call blocks for more input
    }
    line = nextCommandLine();
    return stdin();
  }

  self.onmessage = async (e) => {
    const msg = e.data;
    if (msg.type !== 'init') return;
    header = new Int32Array(msg.sab, 0, 1);
    ring = new Uint8Array(msg.sab, 4);
    try {
      const base = new URL('.', self.location.href).href;
      const nnue = await fetchNnue(base + 'pikafish.nnue');
      post({ type: 'progress', loaded: nnue.length, total: nnue.length });
      await Pikafish({
        locateFile: (f) => base + f,
        preRun: [
          (m) => {
            mod = m;
            m.FS.writeFile('/pikafish.nnue', nnue);
          },
        ],
        stdin,
        print: (l) => post({ type: 'line', line: l }),
        printErr: (l) => post({ type: 'error', line: l }),
      });
    } catch (err) {
      post({ type: 'fatal', message: String((err && err.message) || err) });
    }
  };
  post({ type: 'loaded' });
}

# Xiangqi Trainer

<img width="1919" height="910" alt="image" src="https://github.com/user-attachments/assets/05de1313-d3b9-4e54-992b-3403d94ff3dd" />


A React app for xiangqi (Chinese chess) with no backend. The Pikafish engine runs in your browser as multithreaded WebAssembly. The architecture follows WhyBlunder (see `docs-reference/`).

- **Analysis**: live MultiPV lines (1–5) ranked by Pikafish, with W/D/L, best-move arrows, an eval bar, a move tree with variations, FEN import, and PGN import/export.
- **Play Coach**: 5 levels. The coach gives feedback and an explanation for every move, sets instructive traps, offers a 4-step hint ladder, allows takebacks, and summarises the game at the end.
- **Review**: import a PGN (WXF, Chinese, ICCS or algebraic move text such as elephantchess.io's), or pick one of your coach games. Every move is classified, with per-side accuracy, an eval graph, key moments, and explanations.
- UI in English and Vietnamese.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # rules, notation, PGN, classification, recognizer, hint ladder
npm run build      # static site in dist/
```

`predev`/`prebuild` run `scripts/patch-pikafish.mjs`. It copies `pikafish.{js,wasm,nnue}` from the repo root into `public/engine/` and patches `pikafish.js` so that `FS` and `checkMailbox` are exposed.

## How the engine is wired

`pikafish.js` is an Emscripten **pthreads** build that reads UCI commands from a blocking stdin. `public/engine/engine-worker.js` runs the engine's main thread:

- The UI writes commands into a `SharedArrayBuffer` ring buffer (`src/engine/EngineClient.ts`).
- The worker's stdin callback blocks with `Atomics.wait`, and calls `Module.checkMailbox()` between waits so that pthread output (`info`, `bestmove`) keeps flowing.
- The 50 MB NNUE is downloaded once, cached in Cache Storage, and written into MEMFS before `main()` runs.

## Hosting

The engine needs `SharedArrayBuffer`, so the page must be **cross-origin isolated**:

- The dev and preview servers send COOP/COEP headers.
- On static hosts that can't set headers (e.g. GitHub Pages), `coi-serviceworker.js` adds the headers and reloads the page once.

## Limitations

- Perpetual check/chase adjudication (Asian rules) is not implemented; only threefold repetition is detected.
- Tactical explanations are heuristic (fork/pin/discovered/hanging/mate). Otherwise the app falls back to "loses N% + strongest reply".

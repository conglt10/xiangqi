// Copies the Pikafish engine files from the repo root into public/engine/ and
// patches pikafish.js so the host worker can reach Emscripten's FS (to write
// the NNUE into MEMFS) and checkMailbox (to service proxied pthread calls
// while the main engine thread is blocked waiting on stdin).
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'engine');
mkdirSync(outDir, { recursive: true });

const ANCHOR = 'var wasmExports;if(!ENVIRONMENT_IS_PTHREAD){wasmExports=await createWasm();await run()}';
const INJECT = 'Module.FS=FS;Module.checkMailbox=checkMailbox;';

const src = readFileSync(join(root, 'pikafish.js'), 'utf8');
if (!src.includes(ANCHOR)) {
  console.error('[patch-pikafish] anchor not found in pikafish.js; the engine build changed.');
  process.exit(1);
}
writeFileSync(join(outDir, 'pikafish.js'), src.replace(ANCHOR, INJECT + ANCHOR));

for (const f of ['pikafish.wasm', 'pikafish.nnue']) {
  const from = join(root, f);
  const to = join(outDir, f);
  if (!existsSync(to) || statSync(to).size !== statSync(from).size || statSync(to).mtimeMs < statSync(from).mtimeMs) {
    copyFileSync(from, to);
  }
}
// Service worker that adds COOP/COEP headers on static hosts that can't set them.
copyFileSync(join(root, 'node_modules', 'coi-serviceworker', 'coi-serviceworker.min.js'), join(root, 'public', 'coi-serviceworker.js'));
console.log('[patch-pikafish] engine files ready in public/engine/');

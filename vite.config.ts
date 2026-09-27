import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Pikafish is a pthreads WASM build: SharedArrayBuffer requires cross-origin isolation.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  test: { include: ['src/**/*.test.ts'] },
});

import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Three pages: the game (index.html), the pastel-cubism kit sheet (kit.html) and the asset studio
// (asset.html: one asset of the cave painting alone, judged against its cut-out).
export default defineConfig({
  build: {
    target: 'es2022', // the kit page uses top-level await
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        kit: resolve(import.meta.dirname, 'kit.html'),
        asset: resolve(import.meta.dirname, 'asset.html'),
      },
    },
  },
});

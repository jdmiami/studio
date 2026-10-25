import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Two pages: the game (index.html) and the pastel-cubism kit sheet (kit.html).
export default defineConfig({
  build: {
    target: 'es2022', // the kit page uses top-level await
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        kit: resolve(import.meta.dirname, 'kit.html'),
      },
    },
  },
});

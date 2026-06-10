import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    svelte({ preprocess: vitePreprocess() }),
    dts({
      rollupTypes: true,
      bundledPackages: ['@wick-charts/core'],
      exclude: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', 'test-setup.ts'],
    }),
  ],
  build: {
    // Keep native #private fields — Vite's default target lowers them to
    // WeakMap helpers, costing ~10% raw size and a call on every access.
    target: 'es2022',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['svelte', 'svelte/store', 'svelte/internal', /^svelte\//],
    },
  },
});

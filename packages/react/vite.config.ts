import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
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
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: [
        {
          // Per-module ESM so consumer bundlers tree-shake series/navigator/
          // perf they don't import; a flat file defeats sideEffects: false.
          format: 'es',
          preserveModules: true,
          preserveModulesRoot: resolve(__dirname, 'src'),
          entryFileNames: '[name].js',
          // Every module here uses hooks/canvas — mark the package client-only
          // so importing it from a Next.js Server Component doesn't crash.
          banner: "'use client';",
        },
        {
          format: 'cjs',
          entryFileNames: 'index.cjs',
          banner: "'use client';",
        },
      ],
    },
  },
});

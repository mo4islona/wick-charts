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
      // `testing` is a second, independent entry point (`@wick-charts/react/
      // testing`) — a jsdom/happy-dom canvas+ResizeObserver+matchMedia mock
      // for consumers' own test suites. Not imported by `index.ts`, so it
      // needs its own entry to end up in the output at all.
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        testing: resolve(__dirname, 'src/testing.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
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
          entryFileNames: '[name].cjs',
          banner: "'use client';",
        },
      ],
    },
  },
});

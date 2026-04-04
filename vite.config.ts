import { resolve } from 'node:path';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(({ command, mode }) => {
  const aliases = {
    '@wick-charts/react': resolve(__dirname, 'packages/react/src/index.ts'),
    '@wick-charts/core': resolve(__dirname, 'packages/core/src/index.ts'),
  };

  // Library build: npm run build (handled by per-package vite configs now)
  if (command === 'build' && mode !== 'demo') {
    return {
      plugins: [dts({ rollupTypes: true })],
      build: {
        lib: {
          entry: resolve(__dirname, 'packages/react/src/index.ts'),
          formats: ['es', 'cjs'],
          fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
        },
        rollupOptions: {
          external: ['react', 'react-dom', 'react/jsx-runtime'],
        },
      },
      resolve: { alias: aliases },
    };
  }

  // Demo build (GitHub Pages): npm run build:demo
  if (command === 'build' && mode === 'demo') {
    return {
      root: 'demo',
      base: '/wick/',
      build: {
        outDir: resolve(__dirname, 'docs'),
        emptyOutDir: true,
      },
      resolve: { alias: aliases },
    };
  }

  // Dev server: npm run dev
  return {
    root: 'demo',
    resolve: { alias: aliases },
  };
});

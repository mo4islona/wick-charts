import { resolve } from 'node:path';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(({ command, mode }) => {
  const aliases = {
    '@wick-charts/react': resolve(__dirname, 'packages/react/src/index.ts'),
    '@wick-charts/core': resolve(__dirname, 'packages/core/src/index.ts'),
  };

  // Library build: npm run build (handled by per-package vite configs now)
  if (command === 'build' && mode !== 'docs') {
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

  // Docs build (GitHub Pages): npm run build:docs
  if (command === 'build' && mode === 'docs') {
    return {
      root: 'docs',
      base: '/wick-charts/',
      build: {
        outDir: resolve(__dirname, 'docs-dist'),
        emptyOutDir: true,
      },
      resolve: { alias: aliases },
    };
  }

  // Dev server: npm run dev
  return {
    root: 'docs',
    resolve: { alias: aliases },
  };
});

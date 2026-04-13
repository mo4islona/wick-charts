import { resolve } from 'node:path';

import { defineConfig } from 'vite';

// Library builds live in packages/*/vite.config.ts. This root config
// only powers the docs app (dev server + GitHub Pages build).
export default defineConfig(({ mode }) => {
  const aliases = {
    '@wick-charts/react': resolve(__dirname, 'packages/react/src/index.ts'),
    '@wick-charts/core': resolve(__dirname, 'packages/core/src/index.ts'),
  };

  if (mode === 'docs') {
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

  return {
    root: 'docs',
    resolve: { alias: aliases },
  };
});

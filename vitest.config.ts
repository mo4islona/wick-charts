import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['packages/core/src/**/*.test.ts'],
    environmentMatchGlobs: [
      // Tests that instantiate ChartInstance need a DOM.
      ['packages/core/src/__tests__/chart-*.test.ts', 'happy-dom'],
    ],
  },
  resolve: {
    alias: {
      '@wick-charts/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@wick-charts/react': resolve(__dirname, 'packages/react/src/index.ts'),
    },
  },
});

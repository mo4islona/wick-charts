import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  preprocess: vitePreprocess(),
  kit: {
    // svelte-package stages its output here; keep it out of git, Biome and tsc.
    outDir: 'node_modules/.svelte-kit',
    // `@wick-charts/core` is private: svelte-package rewrites its imports to the
    // copy that `scripts/copy-core.mjs` places in `dist/core`.
    alias: { '@wick-charts/core': resolve(__dirname, 'src/core/index.js') },
  },
};

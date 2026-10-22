import { resolve } from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const repo = resolve(__dirname, '../../..');
const registry = resolve(repo, 'registry/shadcn-svelte');

// The shadcn-svelte demo needs Svelte 5, and the rest of the repo builds with Svelte 4, so it has a Vite of its own.
// `$lib/` reaches the registry sources as a project would, except the card and `cn`, which the project brings.
export default defineConfig({
  root: __dirname,
  base: '/demos/shadcn-svelte/',
  plugins: [svelte(), tailwindcss()],
  resolve: {
    alias: {
      '@wick-charts/core': resolve(repo, 'packages/core/src/index.ts'),
      '@wick-charts/svelte': resolve(repo, 'packages/svelte/src/index.ts'),
      '$lib/registry/hooks/wick-theme.svelte.js': resolve(registry, 'hooks/wick-theme.svelte.ts'),
      '$lib/registry/ui/card/index.js': resolve(__dirname, 'ui/card/index.ts'),
      '$lib/registry/ui/wick-chart/index.js': resolve(registry, 'ui/wick-chart/index.ts'),
      '$lib/utils.js': resolve(repo, 'docs/demos/shadcn/lib/utils.ts'),
    },
    // The registry and the library sit outside this package; they must share its Svelte 5 runtime.
    dedupe: ['svelte'],
  },
  // The docs dev server starts this one and proxies the demo's URLs to it.
  server: { port: 5179, strictPort: true },
  build: {
    outDir: resolve(repo, 'docs-dist/demos/shadcn-svelte'),
    emptyOutDir: true,
  },
});

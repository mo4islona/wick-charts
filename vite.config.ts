import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { type Plugin, defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(({ command, mode }) => {
  const aliases = {
    '@wick-charts/react': resolve(__dirname, 'packages/react/src/index.ts'),
    '@wick-charts/vue': resolve(__dirname, 'packages/vue/src/index.ts'),
    '@wick-charts/core': resolve(__dirname, 'packages/core/src/index.ts'),
  };

  // The shadcn demos (docs/demos/shadcn, docs/demos/shadcn-vue) render the registry sources as a project would:
  // `@/` reaches the registry, except the card and `cn`, which the project itself brings.
  const shadcnDemo = resolve(__dirname, 'docs/demos/shadcn');
  const shadcnVueDemo = resolve(__dirname, 'docs/demos/shadcn-vue');
  const shadcnProjects: { roots: string[]; paths: Record<string, string> }[] = [
    {
      roots: [resolve(__dirname, 'registry/shadcn-vue'), shadcnVueDemo],
      paths: {
        '@/components/ui/card': resolve(shadcnVueDemo, 'ui/card/index.ts'),
        '@/components/ui/wick-chart': resolve(__dirname, 'registry/shadcn-vue/components/ui/wick-chart/index.ts'),
        '@/composables/useWickTheme': resolve(__dirname, 'registry/shadcn-vue/composables/useWickTheme.ts'),
        '@/lib/utils': resolve(shadcnDemo, 'lib/utils.ts'),
      },
    },
    {
      roots: [resolve(__dirname, 'registry/shadcn'), shadcnDemo],
      paths: {
        '@/components/ui/card': resolve(shadcnDemo, 'ui/card.tsx'),
        '@/components/ui/wick-chart': resolve(__dirname, 'registry/shadcn/ui/wick-chart.tsx'),
        '@/hooks/use-wick-theme': resolve(__dirname, 'registry/shadcn/hooks/use-wick-theme.ts'),
        '@/lib/utils': resolve(shadcnDemo, 'lib/utils.ts'),
      },
    },
  ];

  // Both registries import the same `@/` paths, so a global alias cannot serve them: the importer picks the project.
  const shadcnPaths: Plugin = {
    name: 'shadcn-demo-paths',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!source.startsWith('@/') || !importer) return null;

      const project = shadcnProjects.find(({ roots }) => roots.some((root) => importer.startsWith(`${root}/`)));

      return project?.paths[source] ?? null;
    },
  };

  // The registry files start with 'use client' for Next.js, which a client bundle warns about.
  // Spaces of the same length keep every position, so the source maps stay valid.
  const dropUseClient: Plugin = {
    name: 'drop-registry-use-client',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/registry/shadcn/')) return null;

      return { code: code.replace(/^'use client';/, ' '.repeat("'use client';".length)), map: null };
    },
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

  // Docs build (Cloudflare Pages, custom domain): npm run build:docs.
  // Served at the domain root, so base is '/' (assets resolve from any depth,
  // which matters for prerendered nested routes like /charts/candlestick/).
  if (command === 'build' && mode === 'docs') {
    return {
      root: 'docs',
      base: '/',
      plugins: [vue(), tailwindcss(), dropUseClient, shadcnPaths],
      build: {
        outDir: resolve(__dirname, 'docs-dist'),
        emptyOutDir: true,
        rollupOptions: {
          input: {
            main: resolve(__dirname, 'docs/index.html'),
            shadcnDemo: resolve(shadcnDemo, 'index.html'),
            shadcnVueDemo: resolve(shadcnVueDemo, 'index.html'),
          },
        },
      },
      resolve: { alias: aliases },
    };
  }

  // Dev server: npm run dev
  return {
    root: 'docs',
    plugins: [vue(), tailwindcss(), dropUseClient, shadcnPaths],
    resolve: { alias: aliases },
  };
});

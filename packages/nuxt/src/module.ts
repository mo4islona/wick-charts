import { addComponent, addImports, defineNuxtModule, extendViteConfig, useLogger } from '@nuxt/kit';
import type { Component, NuxtModule } from '@nuxt/schema';
import { pascalCase } from 'scule';

export interface ModuleOptions {
  /**
   * Prefix for the auto-registered components: `<WickChartContainer>`,
   * `<WickLineSeries>`, `<WickTooltip>`. Default: `Wick`.
   */
  prefix: string;
  /** Auto-import the composables (`useVisibleRange`, `useYRange`, …). Default: `true`. */
  composables: boolean;
}

const SOURCE = '@wick-charts/vue';

const COMPONENTS = [
  'ChartContainer',
  'BandSeries',
  'BarSeries',
  'CandlestickSeries',
  'DepthSeries',
  'GaugeSeries',
  'HeatmapSeries',
  'LineSeries',
  'PieSeries',
  'RadialProgressSeries',
  'SankeySeries',
  'Crosshair',
  'HeatmapTooltip',
  'InfoBar',
  'Legend',
  'Marker',
  'Navigator',
  'NumberFlow',
  'PieLegend',
  'PieTooltip',
  'ReferenceLine',
  'SankeyTooltip',
  'TimeAxis',
  'TimeRegion',
  'Title',
  'Tooltip',
  'XAxis',
  'YAxis',
  'YLabel',
];

// `useTheme` stays an explicit import: Vuetify and other UI kits auto-import the same name.
const COMPOSABLES = [
  'useChartInstance',
  'useCrosshairPosition',
  'useLastYValue',
  'usePreviousClose',
  'useVisibleRange',
  'useYRange',
];

type RenderMode = 'client' | 'server';

const WHERE: Record<RenderMode, string> = { client: 'in the browser', server: 'on the server' };

interface LostComponent {
  name: string;
  owner: string;
  /** Set when ours still renders in the other mode. */
  mode?: RenderMode;
}

/** The component that Nuxt picks for the name in a render mode, unless it is ours. */
function otherWinner(args: { components: Component[]; exportName: string; mode: RenderMode }): Component | undefined {
  // Nuxt takes the first component of the name that renders in the mode; app files come first.
  const winner = args.components.find((component) => {
    const mode = component.mode ?? 'all';

    return mode === 'all' || mode === args.mode;
  });
  const ours = winner?.filePath === SOURCE && winner.export === args.exportName;

  return ours ? undefined : winner;
}

function ownerOf(component: Component): string {
  return component.shortPath || component.filePath;
}

/**
 * Our names that another component takes, and Nuxt does not warn: Nuxt's `<Title>` or an app file
 * outranks ours, or an app's `.client.vue` or `.server.vue` file wins in its mode.
 */
function findLostComponents(args: { components: Component[]; prefix: string }): LostComponent[] {
  const lost: LostComponent[] = [];

  for (const exportName of COMPONENTS) {
    // The form `addComponent` stores and a tag resolves to: `chart` and `Chart-` prefixes both give `ChartTitle`.
    const name = pascalCase(`${args.prefix}${exportName}`);
    const sameName = args.components.filter((component) => component.pascalName === name);
    const client = otherWinner({ components: sameName, exportName, mode: 'client' });
    const server = otherWinner({ components: sameName, exportName, mode: 'server' });

    if (client && client === server) {
      lost.push({ name: client.pascalName, owner: ownerOf(client) });
      continue;
    }

    if (client) lost.push({ name: client.pascalName, owner: ownerOf(client), mode: 'client' });
    if (server) lost.push({ name: server.pascalName, owner: ownerOf(server), mode: 'server' });
  }

  return lost;
}

const nuxtModule: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@wick-charts/nuxt',
    configKey: 'wickCharts',
    compatibility: { nuxt: '>=3.12.0' },
    docs: 'https://wick-charts.eeff.io/integrations/nuxt/',
  },
  defaults: {
    prefix: 'Wick',
    composables: true,
  },
  setup(options, nuxt) {
    for (const name of COMPONENTS) {
      addComponent({ name: `${options.prefix}${name}`, export: name, filePath: SOURCE });
    }

    // Registered after every module, so the check sees the components that later modules add.
    // The hook runs again on each dev rebuild; `warned` keeps each warning to one line.
    const warned = new Set<string>();
    nuxt.hook('modules:done', () => {
      nuxt.hook('components:extend', (components) => {
        const logger = useLogger('@wick-charts/nuxt');

        for (const { name, owner, mode } of findLostComponents({ components, prefix: options.prefix })) {
          const where = mode ? ` ${WHERE[mode]}` : '';
          const message = `<${name}> resolves to ${owner}${where}, not to the Wick Charts component. Set a \`wickCharts.prefix\`.`;
          if (warned.has(message)) continue;

          warned.add(message);
          logger.warn(message);
        }
      });
    });

    // A strict pnpm app does not link our dependency into its own node_modules.
    nuxt.options.typescript.hoist.push(SOURCE);

    // Without this, the dev server finds the package on the first page load and reloads the page.
    // The nested form resolves it from this module, which a strict pnpm app needs.
    extendViteConfig((config) => {
      config.optimizeDeps ||= {};
      config.optimizeDeps.include ||= [];
      config.optimizeDeps.include.push(`@wick-charts/nuxt > ${SOURCE}`);
    });

    if (!options.composables) return;

    addImports(COMPOSABLES.map((name) => ({ name, from: SOURCE })));
  },
});

export default nuxtModule;

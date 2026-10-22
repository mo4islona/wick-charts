import { addComponent, addImports, defineNuxtModule, extendViteConfig } from '@nuxt/kit';
import type { NuxtModule } from '@nuxt/schema';

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
  'HeatmapSeries',
  'LineSeries',
  'PieSeries',
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

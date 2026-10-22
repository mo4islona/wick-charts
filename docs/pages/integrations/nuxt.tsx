import { useMemo } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { generateOHLCData } from '../../data';
import { routeToPath } from '../../router';
import { RealtimeDataDemo } from '../use-cases/realtime-data.example';

const CONFIG_CODE = `export default defineNuxtConfig({
  modules: ['@wick-charts/nuxt'],
});`;

const PAGE_CODE = `<script setup lang="ts">
import type { OHLCData } from '@wick-charts/vue';

const { data: candles } = await useFetch<OHLCData[]>('/api/candles');
</script>

<template>
  <div class="h-96">
    <WickChartContainer>
      <PriceTitle />
      <WickCandlestickSeries id="price" :data="candles ?? []" />
      <WickCrosshair />
      <WickTooltip />
      <WickYAxis />
      <WickTimeAxis />
    </WickChartContainer>
  </div>
</template>`;

const COMPOSABLE_CODE = `<!-- components/PriceTitle.vue -->
<script setup lang="ts">
const chart = useChartInstance();
const last = useLastYValue(chart, 'price');
</script>

<template>
  <WickTitle>BTC {{ last?.value.toFixed(2) }}</WickTitle>
</template>`;

const OPTIONS_CODE = `export default defineNuxtConfig({
  modules: ['@wick-charts/nuxt'],
  wickCharts: {
    prefix: 'Chart', // <ChartLineSeries>, <ChartTooltip>
    composables: false,
  },
});`;

export const NUXT_STEPS: Step[] = [
  {
    heading: '01 — ADD THE MODULE',
    body: (
      <>
        Run <code>npx nuxi module add @wick-charts/nuxt</code>. It installs the package and adds it to{' '}
        <code>modules</code> in <code>nuxt.config.ts</code>. The module brings <code>@wick-charts/vue</code> with it.
      </>
    ),
    code: CONFIG_CODE,
  },
  {
    heading: '02 — USE THE COMPONENTS',
    body: (
      <>
        Every component has a <code>Wick</code> prefix: <code>ChartContainer</code> becomes{' '}
        <code>&lt;WickChartContainer&gt;</code>, <code>Tooltip</code> becomes <code>&lt;WickTooltip&gt;</code>. The
        prefix keeps short names such as <code>Title</code> and <code>Legend</code> apart from your own components.
        Import types, themes and helpers from <code>@wick-charts/vue</code>.
      </>
    ),
    code: PAGE_CODE,
  },
  {
    heading: '03 — COMPOSABLES WITH NO IMPORT',
    body: (
      <>
        <code>useChartInstance</code>, <code>useVisibleRange</code>, <code>useYRange</code>, <code>useLastYValue</code>,{' '}
        <code>usePreviousClose</code> and <code>useCrosshairPosition</code> are auto-imported. Call them in a component
        inside <code>&lt;WickChartContainer&gt;</code>. Import <code>useTheme</code> from <code>@wick-charts/vue</code>:
        Vuetify and other UI kits auto-import the same name.
      </>
    ),
    code: COMPOSABLE_CODE,
  },
  {
    heading: '04 — SERVER RENDERING',
    body: (
      <>
        The chart draws on a canvas in the browser. On the server, Nuxt renders the chart container with its size and
        theme background, so the page does not jump when the chart appears. You do not need a{' '}
        <code>&lt;ClientOnly&gt;</code> wrapper, and data from <code>useFetch</code> is ready on the first paint.
      </>
    ),
  },
  {
    heading: '05 — OPTIONS',
    body: (
      <>
        Set a different component prefix, or turn off the composable auto-imports. The module works with Nuxt 3.12 and
        later, and with Nuxt 4.
      </>
    ),
    code: OPTIONS_CODE,
  },
];

const COUNT = 60;
const INTERVAL = 60_000 * 60;

/** The `@wick-charts/nuxt` module: install, auto-imported components and composables, server rendering. */
export function NuxtPage({ theme }: { theme: ChartTheme }) {
  const seed = useMemo(() => generateOHLCData(COUNT, 100, INTERVAL), []);

  const lead = (
    <p style={{ margin: 0 }}>
      A Nuxt module for Wick Charts. It registers the <code>@wick-charts/vue</code> components and composables, so a
      page uses charts with no imports. For chart blocks themed by shadcn-vue, see the{' '}
      <a href={routeToPath('integrations/shadcn/vue')}>shadcn-vue blocks</a>.
    </p>
  );

  return (
    <AdvancedLayout
      theme={theme}
      lead={lead}
      chart={<RealtimeDataDemo theme={theme} seed={seed} />}
      mobileChartHeight={360}
      steps={NUXT_STEPS}
    />
  );
}

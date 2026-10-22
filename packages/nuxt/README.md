# @wick-charts/nuxt

[![npm @wick-charts/nuxt](https://img.shields.io/npm/v/@wick-charts/nuxt.svg?label=%40wick-charts%2Fnuxt)](https://www.npmjs.com/package/@wick-charts/nuxt) [![license](https://img.shields.io/github/license/mo4islona/wick-charts.svg)](./LICENSE)

Nuxt module for [Wick Charts](https://wick-charts.eeff.io/): realtime, animated canvas charts. It registers the `@wick-charts/vue` components and composables, so a page uses charts with no imports.

[Nuxt guide](https://wick-charts.eeff.io/integrations/nuxt/) · [Live demo](https://wick-charts.eeff.io/) · [API](https://wick-charts.eeff.io/api/chart-container/)

## Install

```bash
npx nuxi module add @wick-charts/nuxt
```

Or install it by hand:

```bash
npm install @wick-charts/nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@wick-charts/nuxt'],
});
```

## Usage

```vue
<script setup lang="ts">
import type { OHLCData } from '@wick-charts/vue';

const { data: candles } = await useFetch<OHLCData[]>('/api/candles');
</script>

<template>
  <div style="height: 400px">
    <WickChartContainer>
      <WickCandlestickSeries :data="candles ?? []" />
      <WickCrosshair />
      <WickTooltip />
      <WickYAxis />
      <WickTimeAxis />
    </WickChartContainer>
  </div>
</template>
```

Every component of `@wick-charts/vue` has a `Wick` prefix: `ChartContainer` becomes `<WickChartContainer>`, `Tooltip` becomes `<WickTooltip>`. Import types, themes and helpers from `@wick-charts/vue`. The chart fills its parent, so give the parent a height.

The page reads its rows from a server route. A candle is `{ time, open, high, low, close, volume? }`, with `time` in milliseconds: a `Date` becomes a string on its way through JSON.

```ts
// server/api/candles.ts
import type { OHLCData } from '@wick-charts/vue';

const HOUR = 3_600_000;

// A random walk. Read your database or exchange API here.
export default defineEventHandler((): OHLCData[] => {
  const start = Date.now() - 200 * HOUR;
  let close = 100;

  return Array.from({ length: 200 }, (_, i) => {
    const open = close;
    close = open + (Math.random() - 0.5) * 4;

    return {
      time: start + i * HOUR,
      open,
      high: Math.max(open, close) + Math.random(),
      low: Math.min(open, close) - Math.random(),
      close,
    };
  });
});
```

`useChartInstance`, `useVisibleRange`, `useYRange`, `useLastYValue`, `usePreviousClose` and `useCrosshairPosition` are auto-imported. Import `useTheme` from `@wick-charts/vue`: Vuetify and other UI kits auto-import the same name.

## Server rendering

The chart draws on a canvas in the browser, after hydration. On the server, Nuxt renders the chart container with its size and theme background, so the page does not jump when the chart appears. You do not need a `<ClientOnly>` wrapper.

`useFetch` on the server puts every row into the HTML payload: 1,500 candles add about 290 kB, and Nuxt dev warns about the size. For a long series, fetch in the browser:

```ts
const { data: candles } = useFetch<OHLCData[]>('/api/candles', { server: false });
```

## Options

```ts
export default defineNuxtConfig({
  modules: ['@wick-charts/nuxt'],
  wickCharts: {
    prefix: 'Wick', // component prefix
    composables: true, // auto-import the composables
  },
});
```

A prefix applies to every name: `prefix: 'Chart'` gives `<ChartChartContainer>`, `<ChartLineSeries>` and `<ChartTooltip>`. An empty prefix gives the bare names, and then `<Title>` is Nuxt's head component, not the chart title. The module warns at build time when another component takes one of its names.

Works with Nuxt 3.12 and later, and with Nuxt 4.

## License

[MIT](./LICENSE)

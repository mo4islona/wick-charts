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

Every component of `@wick-charts/vue` has a `Wick` prefix: `ChartContainer` becomes `<WickChartContainer>`, `Tooltip` becomes `<WickTooltip>`. Import types, themes and helpers from `@wick-charts/vue`.

`useChartInstance`, `useVisibleRange`, `useYRange`, `useLastYValue`, `usePreviousClose` and `useCrosshairPosition` are auto-imported. Import `useTheme` from `@wick-charts/vue`: Vuetify and other UI kits auto-import the same name.

## Server rendering

The chart draws on a canvas in the browser. On the server, Nuxt renders the chart container with its size and theme background, so the page does not jump when the chart appears. You do not need a `<ClientOnly>` wrapper.

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

Works with Nuxt 3.12 and later, and with Nuxt 4.

## License

[MIT](./LICENSE)

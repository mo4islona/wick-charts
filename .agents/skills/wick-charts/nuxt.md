# Nuxt

`@wick-charts/nuxt` registers every `@wick-charts/vue` component with a `Wick` prefix and auto-imports the composables, so a page needs no imports. Import types, themes, helpers and `useTheme` from `@wick-charts/vue`.

```bash
npx nuxi module add @wick-charts/nuxt
```

```vue
<script setup lang="ts">
import type { OHLCData } from '@wick-charts/vue';

// A server route that returns [{ time, open, high, low, close }], time in ms.
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

- No `<ClientOnly>`: the server renders the sized, themed container, and the canvas draws after hydration.
- `useFetch` on the server puts every row into the HTML payload. For thousands of rows, pass `{ server: false }`.
- Options: `wickCharts: { prefix: 'Wick', composables: true }` in `nuxt.config.ts`. A prefix applies to every name (`prefix: 'Chart'` gives `<ChartChartContainer>`). Do not set an empty prefix: `<Title>` is then Nuxt's head component, and the app's own components can take other names. The module warns at build time when that happens.
- The shadcn-vue registry works in Nuxt too: [shadcn.md](shadcn.md).

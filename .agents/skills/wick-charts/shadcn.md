# shadcn/ui, shadcn-vue and shadcn-svelte

In a shadcn/ui project (React), a shadcn-vue project (Vue, Nuxt) or a shadcn-svelte project (Svelte 5), install from the Wick Charts registry instead of wiring a theme by hand. The items install as source files into the project, and the three registries have the same items:

- `wick-theme` — `useWickTheme(ref?)` builds a `ChartTheme` from the shadcn CSS variables (`--background`, `--foreground`, `--muted-foreground`, `--border`, `--chart-1` … `--chart-5`) and follows light / dark switches. React: `@/hooks/use-wick-theme`. Vue: `@/composables/useWickTheme`, takes a template ref. Svelte: `$lib/hooks/wick-theme.svelte`, takes a getter for a `bind:this` element and returns `{ current }`.
- `wick-chart` — `<WickChart>`: a `ChartContainer` themed by that hook, sized with classes (`aspect-video` by default), with horizontal grid lines only. `theme` takes a `ChartTheme`, or a function that adjusts the generated one. Import it from `@/components/ui/wick-chart` (Svelte: `$lib/components/ui/wick-chart/index.js`).
- Blocks in a shadcn `Card`: `chart-line-live`, `chart-candlestick`, `chart-order-book`, `chart-sparkline-cards`, `chart-bar-grouped`, `chart-pie-donut`, `chart-band-latency`, `chart-area-stacked`, `chart-heatmap`, `chart-line-annotations`, `chart-line-navigator`. A Vue block is `@/components/ChartCandlestick.vue` (PascalCase), a Svelte block `$lib/components/chart-candlestick.svelte` (default export).

| | React (shadcn/ui) | Vue / Nuxt (shadcn-vue) | Svelte (shadcn-svelte) |
|---|---|---|---|
| CLI | `npx shadcn@latest add` | `npx shadcn-vue@latest add` | `npx shadcn-svelte@latest add` |
| Registry | `https://wick-charts.eeff.io/r/{name}.json` | `https://wick-charts.eeff.io/r/vue/{name}.json` | `https://wick-charts.eeff.io/r/svelte/{name}.json` |
| Index | `https://wick-charts.eeff.io/r/registry.json` | `https://wick-charts.eeff.io/r/vue/registry.json` | `https://wick-charts.eeff.io/r/svelte/index.json` |

```bash
# React: the shadcn CLI resolves @wick-charts without config
npx shadcn@latest add @wick-charts/wick-chart @wick-charts/chart-candlestick
# Vue / Nuxt
npx shadcn-vue@latest add https://wick-charts.eeff.io/r/vue/wick-chart.json
# Svelte
npx shadcn-svelte@latest add https://wick-charts.eeff.io/r/svelte/wick-chart.json
# shadcn-vue: or add "@wick-charts": "<registry URL above>" under "registries" in components.json and add by name.
```

```tsx
import { LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/react';

import { WickChart } from '@/components/ui/wick-chart';

export function Revenue({ data }: { data: TimePoint[] }) {
  return (
    <WickChart className="aspect-auto h-[250px]">
      <LineSeries data={data} />
      <YAxis />
      <TimeAxis />
      <Tooltip />
    </WickChart>
  );
}
```

```vue
<script setup lang="ts">
import { LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/vue';

import { WickChart } from '@/components/ui/wick-chart';

defineProps<{ data: TimePoint[] }>();
</script>

<template>
  <WickChart class="aspect-auto h-[250px]">
    <LineSeries :data="data" />
    <YAxis />
    <TimeAxis />
    <Tooltip />
  </WickChart>
</template>
```

```svelte
<script lang="ts">
  import { LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/svelte';

  import { WickChart } from '$lib/components/ui/wick-chart/index.js';

  let { data }: { data: TimePoint[] } = $props();
</script>

<WickChart class="aspect-auto h-[250px]">
  <LineSeries {data} />
  <YAxis />
  <TimeAxis />
  <Tooltip />
</WickChart>
```

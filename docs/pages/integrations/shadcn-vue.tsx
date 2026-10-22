import { FLAVORS, installAllCommand, installCommand } from '../../demos/shadcn/catalog';
import { FrameworkLink, type GuideCopy, HEADINGS, registriesJson } from './shadcn-guide';

const THEME_COMPOSABLE_CODE = `<script setup lang="ts">
import { ChartContainer } from '@wick-charts/vue';
import { ref } from 'vue';

import { useWickTheme } from '@/composables/useWickTheme';

const root = ref<HTMLDivElement | null>(null);
const theme = useWickTheme(root);
</script>

<template>
  <div ref="root" class="h-64">
    <ChartContainer :theme="theme">…</ChartContainer>
  </div>
</template>`;

const WRAPPER_CODE = `<script setup lang="ts">
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
</template>`;

/** The shadcn-vue registry for Vue and Nuxt. */
export const VUE_COPY: GuideCopy = {
  lead: (demoLink) => (
    <p style={{ margin: 0 }}>
      Chart blocks for shadcn-vue and Nuxt. For React, see the{' '}
      <FrameworkLink framework="react">shadcn/ui blocks</FrameworkLink>. {demoLink}
    </p>
  ),
  steps: (block) => [
    {
      heading: HEADINGS.add,
      body: (
        <>
          Install the block, then render <code>&lt;{block.component} /&gt;</code> from{' '}
          <code>@/components/{block.component}.vue</code>.
        </>
      ),
      code: installCommand(block.name, 'vue'),
    },
    {
      heading: HEADINGS.byName,
      body: (
        <>
          Add the registry to <code>components.json</code> to install by name:{' '}
          <code>npx shadcn-vue@latest add @wick-charts/{block.name}</code>. All items:{' '}
          <a href={`${FLAVORS.vue.registryUrl}/registry.json`} target="_blank" rel="noopener noreferrer">
            registry.json
          </a>
          .
        </>
      ),
      code: registriesJson('vue'),
    },
    {
      heading: HEADINGS.all,
      body: (
        <>
          <code>shadcn-vue add --all</code> reads only the default registry, so name every block in one command.
        </>
      ),
      code: installAllCommand('vue'),
    },
    {
      heading: HEADINGS.theme,
      body: (
        <>
          The <code>wick-theme</code> item adds <code>useWickTheme</code> to <code>@/composables</code>; every block
          brings it. To add it alone: <code>npx shadcn-vue@latest add @wick-charts/wick-theme</code>.{' '}
          <code>useWickTheme(target?)</code> reads <code>--background</code>, <code>--foreground</code>,{' '}
          <code>--muted-foreground</code>, <code>--border</code> and <code>--chart-1</code> … <code>--chart-5</code>,
          and follows dark mode. Candles and order book sides take your chart colors, not green and red. Pass a template
          ref to read the tokens inside a scoped <code>.dark</code> panel.
        </>
      ),
      code: THEME_COMPOSABLE_CODE,
    },
    {
      heading: HEADINGS.wrapper,
      body: (
        <>
          The <code>wick-chart</code> item adds <code>WickChart</code> to <code>@/components/ui/wick-chart</code>:{' '}
          <code>npx shadcn-vue@latest add @wick-charts/wick-chart</code>. Size it with classes:{' '}
          <code>aspect-video</code> by default,{' '}
          <code>aspect-auto h-[250px]</code> for a fixed height. Other attributes go to <code>ChartContainer</code>; it
          draws horizontal grid lines only. <code>theme</code> also takes a function that adjusts the generated theme;
          keep it in <code>&lt;script setup&gt;</code>.
        </>
      ),
      code: WRAPPER_CODE,
    },
  ],
};

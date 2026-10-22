<script setup lang="ts">
import { ChartContainer, type ChartTheme } from '@wick-charts/vue';
import { type HTMLAttributes, computed, ref } from 'vue';

import { useWickTheme } from '@/composables/useWickTheme';
import { cn } from '@/lib/utils';

/**
 * Wick Charts `ChartContainer` themed from the shadcn-vue CSS variables. Size it
 * with classes, like the shadcn `ChartContainer`: `aspect-video` by default,
 * `aspect-auto h-[250px]` for a fixed height. Horizontal grid lines only, as in
 * shadcn charts; pass `grid` to change it. Every other attribute goes to
 * `ChartContainer`.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes['class'];
    /**
     * A theme, or a function that adjusts the theme built from the CSS variables.
     * Keep the function stable: an inline arrow in a template is new on each render and re-themes the chart.
     */
    theme?: ChartTheme | ((theme: ChartTheme) => ChartTheme);
    grid?: { visible?: boolean; horizontal?: boolean; vertical?: boolean };
  }>(),
  { grid: () => ({ vertical: false }) },
);

const root = ref<HTMLDivElement | null>(null);
const wickTheme = useWickTheme(root);
const chartTheme = computed(() => {
  if (typeof props.theme === 'function') return props.theme(wickTheme.value);

  return props.theme ?? wickTheme.value;
});
</script>

<template>
  <div ref="root" data-slot="wick-chart" :class="cn('flex aspect-video w-full', props.class)">
    <ChartContainer style="min-height: 0; background: transparent" v-bind="$attrs" :theme="chartTheme" :grid="grid">
      <slot />
    </ChartContainer>
  </div>
</template>

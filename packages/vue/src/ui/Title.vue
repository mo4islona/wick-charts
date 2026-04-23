<script setup lang="ts">
import { inject } from 'vue';

import { ThemeKey, TitleAnchorKey } from '../context';

withDefaults(
  defineProps<{
    sub?: string;
  }>(),
  {},
);

const anchor = inject(TitleAnchorKey);
const theme = inject(ThemeKey);

// Match the "loud failure" contract of other Vue overlays (`useChartInstance`,
// `useTheme`) — misuse outside `<ChartContainer>` should throw, not render
// nothing silently.
if (!anchor) {
  throw new Error('<Title> must be used within <ChartContainer>: missing TitleAnchorKey.');
}
if (!theme) {
  throw new Error('<Title> must be used within <ChartContainer>: missing ThemeKey.');
}
</script>

<template>
  <Teleport v-if="anchor" :to="anchor">
    <div
      data-chart-title=""
      :style="{
        display: 'flex',
        alignItems: 'baseline',
        gap: '6px',
        padding: '6px 8px 4px',
        flexShrink: 0,
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.fontSize + 'px',
        fontWeight: 600,
        color: theme.tooltip.textColor,
        pointerEvents: 'none',
      }"
    >
      <span><slot /></span>
      <span
        v-if="sub"
        :style="{
          fontWeight: 400,
          color: theme.axis.textColor,
          fontSize: theme.axis.fontSize + 'px',
        }"
      >
        {{ sub }}
      </span>
    </div>
  </Teleport>
</template>

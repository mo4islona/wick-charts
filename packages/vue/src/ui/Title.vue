<script setup lang="ts">
import { computed, inject, useSlots } from 'vue';

import { ThemeKey, TitleAnchorKey } from '../context';

defineSlots<{
  default?(): unknown;
  /**
   * Secondary label rendered in a muted colour next to the primary one. Use a
   * named slot (instead of a `sub` prop) so consumers can pass arbitrary
   * markup — icons, badges, anchor tags — to mirror React's `sub: ReactNode`.
   */
  sub?(): unknown;
}>();

const anchor = inject(TitleAnchorKey);
const theme = inject(ThemeKey);
const slots = useSlots();
const hasSub = computed(() => typeof slots.sub === 'function');

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
        v-if="hasSub"
        :style="{
          fontWeight: 400,
          color: theme.axis.textColor,
          fontSize: theme.axis.fontSize + 'px',
        }"
      >
        <slot name="sub" />
      </span>
    </div>
  </Teleport>
</template>

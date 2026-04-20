<!--
  @deprecated Use <InfoBar> instead. Kept as a thin wrapper for one minor so
  pre-rename callers keep rendering. Forwards every prop/attr AND the default
  scoped slot to InfoBar ($attrs does not relay slots, so we forward by hand).
-->
<script setup lang="ts">
import type { SeriesSnapshot } from '@wick-charts/core';

import InfoBar from './InfoBar.vue';

defineSlots<{
  default?(ctx: { snapshots: readonly SeriesSnapshot[]; time: number; isHover: boolean }): unknown;
}>();
</script>

<template>
  <InfoBar v-bind="$attrs">
    <template v-if="$slots.default" #default="ctx">
      <slot v-bind="ctx" />
    </template>
  </InfoBar>
</template>

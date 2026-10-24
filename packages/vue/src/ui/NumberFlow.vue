<script setup lang="ts">
import { type NumberFlowHandle, mountNumberFlow, resolveNumberFlowFormat } from '@wick-charts/core';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type { NumberFlowProps } from './props';

const props = withDefaults(defineProps<NumberFlowProps>(), {
  locale: 'en-US',
  spinDuration: 350,
  shrinkDelay: 0,
});

const resolved = computed(() => resolveNumberFlowFormat(props.format, props.locale));
const text = computed(() => resolved.value.format(props.value));
// Server HTML and hydration show this text; it is not reactive, so Vue never overwrites the slots.
// `data-allow-mismatch` keeps a value that ticked before hydration from warning.
const initialText = text.value;

// The engine owns the root's children once mounted.
const root = ref<HTMLSpanElement | null>(null);
let flow: NumberFlowHandle | null = null;

onMounted(() => {
  if (root.value === null) return;

  flow = mountNumberFlow(root.value, {
    spinDuration: props.spinDuration,
    shrinkDelay: props.shrinkDelay,
    decimal: resolved.value.decimal,
  });
  flow.update(text.value, props.value);
});

onBeforeUnmount(() => {
  flow?.destroy();
  flow = null;
});

watch(
  () => [props.spinDuration, props.shrinkDelay, resolved.value.decimal] as const,
  ([spinDuration, shrinkDelay, decimal]) => {
    flow?.setOptions({ spinDuration, shrinkDelay, decimal });
  },
);

watch([text, () => props.value], ([nextText, nextValue]) => {
  flow?.update(nextText, nextValue);
});
</script>

<template>
  <span
    ref="root"
    data-allow-mismatch="text"
    :style="{
      display: 'inline-flex',
      fontVariantNumeric: 'tabular-nums',
      lineHeight: 1.2,
      whiteSpace: 'nowrap',
    }"
  >{{ initialText }}</span>
</template>

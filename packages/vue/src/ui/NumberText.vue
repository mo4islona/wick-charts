<script setup lang="ts">
import { NUMBER_MUTED_OPACITY, NUMBER_SCRIPT_STYLE, type NumberRun, numberRuns } from '@wick-charts/core';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** A formatted number, e.g. the output of `formatSignificant`. */
    text: string;
    /** Mute the characters that only place the value (`0.0₅` in `0.0₅8123`). */
    mute?: boolean;
  }>(),
  { mute: true },
);

const SCRIPT_PART = { sub: 'zeros', sup: 'exponent' } as const;

const runs = computed(() => numberRuns(props.text, { mute: props.mute }));
const plain = computed(() => runs.value.every((run) => run.kind === 'plain' && !run.muted));

function runStyle(run: NumberRun) {
  const opacity = run.muted ? NUMBER_MUTED_OPACITY : undefined;
  if (run.kind === 'plain') return { opacity };

  const script = NUMBER_SCRIPT_STYLE[run.kind];

  return { opacity, fontSize: script.fontSize, position: 'relative' as const, top: script.top };
}
</script>

<template>
  <template v-if="plain">{{ text }}</template>
  <template v-else>
    <span
      v-for="(run, i) in runs"
      :key="i"
      :data-part="run.kind === 'plain' ? undefined : SCRIPT_PART[run.kind]"
      :style="runStyle(run)"
    >{{ run.text }}</span>
  </template>
</template>

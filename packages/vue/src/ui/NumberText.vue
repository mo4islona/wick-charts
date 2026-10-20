<script setup lang="ts">
import {
  NUMBER_HIDDEN_STYLE,
  NUMBER_MUTED_OPACITY,
  NUMBER_SCRIPT_STYLE,
  type NumberRun,
  accessibleNumberText,
  hasScriptDigits,
  numberRuns,
} from '@wick-charts/core';
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
// Script digits show as plain digits, so a reader gets a hidden copy: `0.0₅81` is not `0.0581`.
const script = computed(() => hasScriptDigits(props.text));

function runStyle(run: NumberRun) {
  const opacity = run.muted ? NUMBER_MUTED_OPACITY : undefined;
  if (run.kind === 'plain') return { opacity };

  const scriptStyle = NUMBER_SCRIPT_STYLE[run.kind];

  return { opacity, fontSize: scriptStyle.fontSize, position: 'relative' as const, top: scriptStyle.top };
}
</script>

<template>
  <template v-if="plain">{{ text }}</template>
  <template v-else>
    <span v-if="script" :style="NUMBER_HIDDEN_STYLE">{{ accessibleNumberText(text) }}</span>
    <span :aria-hidden="script ? 'true' : undefined">
      <span
        v-for="(run, i) in runs"
        :key="i"
        :data-part="run.kind === 'plain' ? undefined : SCRIPT_PART[run.kind]"
        :style="runStyle(run)"
      >{{ run.text }}</span>
    </span>
  </template>
</template>

<script setup lang="ts">
import {
  BadgeAnimator,
  type ChartInstance,
  type ValueFormatter,
  type YLabelAnimate,
  firstVisibleValue,
  prefersReducedMotion,
  resolveAnimate,
} from '@wick-charts/core';
import { computed, onMounted, onUnmounted, ref, useSlots } from 'vue';

import { useChartInstance } from '../context';
import NumberFlow from './NumberFlow.vue';

// Badge motion tuning types + the resolve/reduced-motion/count-up helpers live
// in core next to BadgeAnimator so React / Vue / Svelte share one set of
// defaults. Re-exported here to keep YLabel's public surface stable.
export type { YLabelAnimate, YLabelAnimateOptions } from '@wick-charts/core';

/** Direction of the current value vs. previous close. Drives the badge color in the default UI. */
export type YLabelDirection = 'up' | 'down' | 'neutral';

const props = defineProps<{
  /**
   * Owning series id. **Optional** — when omitted, the first visible
   * single-layer time series is picked, falling back to the first visible
   * multi-layer time series.
   */
  seriesId?: string;
  color?: string;
  /** Custom formatter; routed through NumberFlow's `formatter` so the digit animation still plays. */
  format?: ValueFormatter;
  /**
   * Badge motion. `true` (default) glides + counts up + fades in with the
   * intro; `false` snaps with no easing; an object tunes individual parts.
   */
  animate?: YLabelAnimate;
}>();

defineSlots<{
  default?(ctx: {
    value: number;
    y: number;
    bgColor: string;
    isLive: boolean;
    direction: YLabelDirection;
    format: ValueFormatter;
    opacity: number;
  }): unknown;
}>();

const chart = useChartInstance();
const slots = useSlots();
const hasCustomSlot = computed(() => typeof slots.default === 'function');

// Re-render bump for viewport/data/theme changes: `viewportChange` covers
// pixel-Y drift on pan/zoom (value unchanged, badge must move); the others
// cover value/visibility/theme. The badge's own value glide + intro reveal
// ride the rAF loop below instead — this bump only keeps `top` in sync with
// the current yScale.
const bump = ref(0);

// rAF-driven badge motion via the shared core BadgeAnimator, so React / Vue /
// Svelte animate the badge identically. `null` until the first frame runs.
const frame = ref<{ positionValue: number; textValue: number; opacity: number } | null>(null);
let animator: BadgeAnimator | null = null;
let animatorId: string | null = null;
let rafId: number | null = null;

// Resolve once per `animate` change (memoized by computed) rather than
// allocating a fresh object every rAF frame on the hot path.
const resolvedAnimate = computed(() => resolveAnimate(props.animate));

function runFrame() {
  rafId = null;

  const id = resolvedId.value;
  const snapshot = id !== null ? chart.getStackedLastValue(id) : null;
  if (id === null || !snapshot) {
    animator = null;
    animatorId = null;
    return;
  }

  const target = snapshot.value;
  // Recreate the animator when the tracked series changes (not just when it
  // goes null) so the badge shows the new series' value immediately instead of
  // gliding from the previous series' stale last value.
  if (animator === null || animatorId !== id) {
    animator = new BadgeAnimator(target);
    animatorId = id;
  }

  const { glide, countUp, settleMs } = resolvedAnimate.value;
  const introFront = chart.getIntroFront(id);

  const out = animator.frame({
    target,
    // Only needed for the intro count-up; skip the visible-range binary search
    // entirely once the reveal has settled (the hot streaming path).
    firstVisible: introFront < 1 ? firstVisibleValue(chart, id, target) : target,
    introFront,
    now: performance.now(),
    glide,
    countUp,
    settleMs,
    reducedMotion: prefersReducedMotion(),
  });

  const prev = frame.value;
  if (
    prev === null ||
    prev.positionValue !== out.positionValue ||
    prev.textValue !== out.textValue ||
    prev.opacity !== out.opacity
  ) {
    frame.value = { positionValue: out.positionValue, textValue: out.textValue, opacity: out.opacity };
  }

  if (out.animating && rafId === null) rafId = requestAnimationFrame(runFrame);
}

function kick() {
  if (rafId === null) rafId = requestAnimationFrame(runFrame);
}

const onChange = () => {
  bump.value++;
  kick();
};

onMounted(() => {
  chart.setYLabel(true);
  chart.on('overlayChange', onChange);
  chart.on('viewportChange', onChange);
  if (chart.getSeriesIds().length > 0) onChange();
});

onUnmounted(() => {
  chart.setYLabel(false);
  chart.off('overlayChange', onChange);
  chart.off('viewportChange', onChange);
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
});

function resolveSeriesId(c: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const singleLayer = c.getSeriesIdsByType('time', { visibleOnly: true, singleLayerOnly: true });
  if (singleLayer.length > 0) return singleLayer[0];

  const anyTime = c.getSeriesIdsByType('time', { visibleOnly: true });

  return anyTime.length > 0 ? anyTime[0] : null;
}

const resolvedId = computed<string | null>(() => {
  void bump.value;

  return resolveSeriesId(chart, props.seriesId);
});

const last = computed<{ value: number; isLive: boolean } | null>(() => {
  void bump.value;

  return resolvedId.value !== null ? chart.getStackedLastValue(resolvedId.value) : null;
});

const previousClose = computed<number | null>(() => {
  void bump.value;

  return resolvedId.value !== null ? chart.getPreviousClose(resolvedId.value) : null;
});

const theme = computed(() => {
  void bump.value;

  return chart.getTheme();
});

// Position eases (the glide); the digit value steps discretely (once per real
// point, not per frame) so the roll doesn't churn. Before the first rAF frame
// lands, fall back to the settled value (hidden if an intro is still sweeping).
const positionValue = computed<number>(() => {
  if (frame.value !== null) return frame.value.positionValue;

  return last.value?.value ?? 0;
});

const textValue = computed<number>(() => {
  if (frame.value !== null) return frame.value.textValue;

  return last.value?.value ?? 0;
});

const opacity = computed<number>(() => {
  if (frame.value !== null) return frame.value.opacity;
  if (resolvedId.value === null) return 1;

  return chart.getIntroFront(resolvedId.value) < 1 ? 0 : 1;
});

const y = computed(() => {
  void bump.value;
  if (last.value === null) return 0;

  return chart.yScale.valueToY(positionValue.value);
});

// Direction / color track the settled last value (not the mid-glide display
// value) so the accent doesn't flicker while the badge eases into place.
const direction = computed<YLabelDirection>(() => {
  if (last.value === null || previousClose.value === null) return 'neutral';
  if (last.value.value > previousClose.value) return 'up';
  if (last.value.value < previousClose.value) return 'down';

  return 'neutral';
});

const bgColor = computed<string>(() => {
  if (last.value === null) return theme.value.yLabel.neutralBackground;
  if (!last.value.isLive) return theme.value.axis.textColor;
  if (props.color) return props.color;

  switch (direction.value) {
    case 'up':
      return theme.value.yLabel.upBackground;
    case 'down':
      return theme.value.yLabel.downBackground;
    default:
      return theme.value.yLabel.neutralBackground;
  }
});

const fractionDigits = computed(() => {
  void bump.value;
  const yRange = chart.yScale.getRange();
  const range = yRange.max - yRange.min;
  if (range < 0.1) return 6;
  if (range < 10) return 4;
  if (range < 1000) return 2;

  return 0;
});

const effectiveFormat = computed<ValueFormatter>(() => {
  if (props.format) return props.format;
  const nf = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits.value,
    maximumFractionDigits: fractionDigits.value,
    useGrouping: false,
  });

  return (v: number) => nf.format(v);
});
</script>

<template>
  <template v-if="last !== null">
    <slot
      v-if="hasCustomSlot"
      :value="last.value"
      :y="y"
      :bg-color="bgColor"
      :is-live="last.isLive"
      :direction="direction"
      :format="effectiveFormat"
      :opacity="opacity"
    />
    <template v-else>
      <div
        :style="{
          position: 'absolute',
          left: '0',
          right: chart.yAxisWidth + 'px',
          top: y + 'px',
          height: '0',
          borderTop: '1px dashed ' + bgColor,
          opacity: opacity * 0.5,
          pointerEvents: 'none',
          zIndex: 2,
        }"
      />
      <div
        :style="{
          position: 'absolute',
          right: '4px',
          top: y + 'px',
          transform: 'translateY(-50%)',
          opacity: opacity,
          pointerEvents: 'auto',
          zIndex: 3,
          background: bgColor,
          color: theme.yLabel.textColor,
          fontSize: theme.yLabel.fontSize + 'px',
          fontFamily: theme.typography.fontFamily,
          padding: '3px 8px',
          borderRadius: '3px',
          whiteSpace: 'nowrap',
          transition: 'background-color 0.3s ease',
        }"
      >
        <NumberFlow :value="textValue" :format="effectiveFormat" :spin-duration="350" />
      </div>
    </template>
  </template>
</template>

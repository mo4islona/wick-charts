<script context="module" lang="ts">
/** Direction of the current value vs. previous close. Drives the badge color in the default UI. */
export type YLabelDirection = 'up' | 'down' | 'neutral';

// Badge motion tuning types live in core next to BadgeAnimator so React / Vue /
// Svelte share one set of defaults. Re-exported to keep the public surface stable.
export type { YLabelAnimate, YLabelAnimateOptions } from '@wick-charts/core';
</script>

<script lang="ts">
  import {
    BadgeAnimator,
    type ChartInstance,
    type ValueFormatter,
    type YLabelAnimate,
    firstVisibleValue,
    prefersReducedMotion,
    resolveAnimate,
  } from '@wick-charts/core';
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';

  import { getChartContext } from '../context';
  import NumberFlow from './NumberFlow.svelte';

  /**
   * Owning series id. **Optional** — when omitted, the first visible
   * single-layer time series is picked, falling back to the first visible
   * multi-layer time series.
   */
  export let seriesId: string | undefined = undefined;
  export let color: string | undefined = undefined;
  /** Custom formatter; routed through NumberFlow so the digit animation plays. */
  export let format: ValueFormatter | undefined = undefined;
  /**
   * Badge motion. `true` (default) glides + counts up + fades in with the
   * intro; `false` snaps with no easing; an object tunes individual parts.
   */
  export let animate: YLabelAnimate | undefined = undefined;

  const chartStore = getChartContext();

  // Re-render bump for viewport/data/theme changes: `viewportChange` covers
  // pixel-Y drift on pan/zoom (value unchanged, badge must move); the others
  // cover value/visibility/theme. The badge's own value glide + intro reveal
  // ride the rAF loop below instead — this bump only keeps `top` in sync with
  // the current yScale.
  let bump = 0;
  let overlayUnsub: (() => void) | null = null;
  let viewportUnsub: (() => void) | null = null;

  // rAF-driven badge motion via the shared core BadgeAnimator, so React / Vue /
  // Svelte animate the badge identically. `null` until the first frame runs.
  let frame: { positionValue: number; textValue: number; opacity: number } | null = null;
  let animator: BadgeAnimator | null = null;
  let animatorId: string | null = null;
  let rafId: number | null = null;

  function runFrame() {
    rafId = null;

    const c = chart;
    const id = resolvedId;
    const snapshot = c && id !== null ? c.getStackedLastValue(id) : null;
    if (!c || id === null || !snapshot) {
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

    const { glide, countUp, settleMs } = resolvedAnimate;
    const introFront = c.getIntroFront(id);

    const out = animator.frame({
      target,
      // Only needed for the intro count-up; skip the visible-range binary search
      // entirely once the reveal has settled (the hot streaming path).
      firstVisible: introFront < 1 ? firstVisibleValue(c, id, target) : target,
      introFront,
      now: performance.now(),
      glide,
      countUp,
      settleMs,
      reducedMotion: prefersReducedMotion(),
    });

    if (
      frame === null ||
      frame.positionValue !== out.positionValue ||
      frame.textValue !== out.textValue ||
      frame.opacity !== out.opacity
    ) {
      frame = { positionValue: out.positionValue, textValue: out.textValue, opacity: out.opacity };
    }

    if (out.animating && rafId === null) rafId = requestAnimationFrame(runFrame);
  }

  function kick() {
    if (rafId === null) rafId = requestAnimationFrame(runFrame);
  }

  $: {
    const c = $chartStore;
    if (c && !overlayUnsub) {
      const onChange = () => {
        bump++;
        kick();
      };
      c.on('overlayChange', onChange);
      c.on('viewportChange', onChange);
      overlayUnsub = () => c.off('overlayChange', onChange);
      viewportUnsub = () => c.off('viewportChange', onChange);
      if (c.getSeriesIds().length > 0) onChange();
    }
  }

  onMount(() => {
    const c = get(chartStore);
    if (c) c.setYLabel(true);
  });

  onDestroy(() => {
    const c = get(chartStore);
    if (c) c.setYLabel(false);
    overlayUnsub?.();
    viewportUnsub?.();
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

  $: chart = $chartStore;
  // Resolve once per `animate` change rather than allocating a fresh object
  // every rAF frame on the hot path.
  $: resolvedAnimate = resolveAnimate(animate);
  $: resolvedId = chart && bump >= 0 ? resolveSeriesId(chart, seriesId) : null;
  $: last =
    chart && resolvedId !== null && bump >= 0 ? chart.getStackedLastValue(resolvedId) : (null as null | { value: number; isLive: boolean });
  $: previousClose = chart && resolvedId !== null && bump >= 0 ? chart.getPreviousClose(resolvedId) : null;
  $: theme = chart && bump >= 0 ? chart.getTheme() : null;

  // Position eases (the glide); the digit value steps discretely (once per real
  // point, not per frame) so the roll doesn't churn. Before the first rAF frame
  // lands, fall back to the settled value (hidden if an intro is still sweeping).
  $: positionValue = frame !== null ? frame.positionValue : (last?.value ?? 0);
  $: textValue = frame !== null ? frame.textValue : (last?.value ?? 0);
  $: opacity = ((): number => {
    if (frame !== null) return frame.opacity;
    if (!chart || resolvedId === null) return 1;

    return chart.getIntroFront(resolvedId) < 1 ? 0 : 1;
  })();
  $: y = chart && last !== null ? chart.yScale.valueToY(positionValue) : 0;

  // Direction / color track the settled last value (not the mid-glide display
  // value) so the accent doesn't flicker while the badge eases into place.
  $: direction = ((): YLabelDirection => {
    if (last === null || previousClose === null) return 'neutral';
    if (last.value > previousClose) return 'up';
    if (last.value < previousClose) return 'down';

    return 'neutral';
  })();

  $: bgColor = ((): string => {
    if (!theme || last === null) return '#888';
    if (!last.isLive) return theme.axis.textColor;
    if (color) return color;

    return direction === 'up'
      ? theme.yLabel.upBackground
      : direction === 'down'
        ? theme.yLabel.downBackground
        : theme.yLabel.neutralBackground;
  })();

  $: fractionDigits = ((): number => {
    if (!chart) return 2;
    const yRange = chart.yScale.getRange();
    const range = yRange.max - yRange.min;
    if (range < 0.1) return 6;
    if (range < 10) return 4;
    if (range < 1000) return 2;

    return 0;
  })();

  $: intlFallback = ((): ValueFormatter => {
    const nf = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      useGrouping: false,
    });

    return (v: number) => nf.format(v);
  })();
  $: effectiveFormat = format ?? intlFallback;
</script>

{#if last !== null && chart && theme}
  {#if $$slots.default}
    <slot
      value={last.value}
      {y}
      {bgColor}
      isLive={last.isLive}
      {direction}
      format={effectiveFormat}
      {opacity}
    />
  {:else}
    <div
      style="position:absolute;left:0;right:{chart.yAxisWidth}px;top:{y}px;height:0;border-top:1px dashed {bgColor};opacity:{opacity * 0.5};pointer-events:none;z-index:2;"
    />
    <div
      style="position:absolute;right:4px;top:{y}px;transform:translateY(-50%);opacity:{opacity};pointer-events:auto;z-index:3;background:{bgColor};color:{theme.yLabel.textColor};font-size:{theme.yLabel.fontSize}px;font-family:{theme.typography.fontFamily};padding:3px 8px;border-radius:3px;white-space:nowrap;transition:background-color 0.3s ease;"
    >
      <NumberFlow value={textValue} format={effectiveFormat} spinDuration={350} />
    </div>
  {/if}
{/if}

import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  BadgeAnimator,
  type ChartInstance,
  type ResolvedAnimate,
  type ValueFormatter,
  type YLabelAnimate,
  firstVisibleValue,
  prefersReducedMotion,
  resolveAnimate,
} from '@wick-charts/core';

import { useChartInstance } from '../context';
import { NumberFlow } from './NumberFlow';

// Badge motion tuning types + the resolve/reduced-motion/count-up helpers live
// in core next to BadgeAnimator so React / Vue / Svelte share one set of
// defaults. Re-exported here to keep YLabel's public surface stable.
export type { YLabelAnimate, YLabelAnimateOptions } from '@wick-charts/core';

/** Direction of the current value vs. previous close. Drives the badge color in the default UI. */
export type YLabelDirection = 'up' | 'down' | 'neutral';

/** Context passed to the {@link YLabel} render-prop. */
export interface YLabelRenderContext {
  readonly value: number;
  /** Pixel Y of the badge anchor (already account for current viewport). */
  readonly y: number;
  /** Final background color chosen by the built-in UI — handy if you want to match the dashed line accent. */
  readonly bgColor: string;
  /** `true` while the chart is tracking a live last point (still mutating). */
  readonly isLive: boolean;
  readonly direction: YLabelDirection;
  readonly format: ValueFormatter;
  /** Entrance opacity in `[0, 1]` — ramps up as the initial-load reveal completes. */
  readonly opacity: number;
}

export interface YLabelProps {
  /**
   * Owning series id. **Optional** — when omitted, the first visible
   * single-layer time series is picked, falling back to the first visible
   * multi-layer time series. `null` (no compatible series) renders nothing.
   */
  seriesId?: string;
  /** Override badge color (e.g. line color). If not set, uses up/down/neutral from theme. */
  color?: string;
  /**
   * Custom formatter. Routed through NumberFlow as its `format` prop so the
   * digit-by-digit animation still plays on the output string — NumberFlow
   * animates whichever characters the formatter returns.
   */
  format?: ValueFormatter;
  /**
   * Badge motion. `true` (default) glides the badge to new values, counts the
   * value up during the initial reveal, and fades in with the intro. `false`
   * snaps with no easing. Pass an object to tune {@link YLabelAnimateOptions}.
   */
  animate?: YLabelAnimate;
  /**
   * Render-prop escape hatch. Receives the resolved value, pixel position, and
   * direction metadata. Replaces the built-in badge + dashed line entirely.
   */
  children?: (ctx: YLabelRenderContext) => ReactNode;
}

function resolveSeriesId(chart: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const singleLayer = chart.getSeriesIdsByType('time', { visibleOnly: true, singleLayerOnly: true });
  if (singleLayer.length > 0) return singleLayer[0];

  const anyTime = chart.getSeriesIdsByType('time', { visibleOnly: true });

  return anyTime.length > 0 ? anyTime[0] : null;
}

interface BadgeFrame {
  positionValue: number;
  textValue: number;
  opacity: number;
}

export function YLabel({ seriesId, color, format, animate, children }: YLabelProps) {
  const chart = useChartInstance();

  // Notify chart that YLabel is present (affects right padding).
  useEffect(() => {
    chart.setYLabel(true);
    return () => chart.setYLabel(false);
  }, [chart]);

  // Re-render bump for viewport/data/theme changes: `viewportChange` covers
  // pixel-Y drift on pan/zoom (value unchanged, badge must move); the others
  // cover value/visibility/theme. The badge's own value glide + intro reveal
  // ride the rAF loop below instead — this bump only keeps `top` in sync with
  // the current yScale.
  const [, setBumpSignal] = useState(0);

  // rAF-driven badge motion: a value spring for the append glide + the intro
  // count-up / fade-in, all owned by the shared core BadgeAnimator so React /
  // Vue / Svelte behave identically. `null` until the first frame runs.
  const [frame, setFrame] = useState<BadgeFrame | null>(null);
  const animatorRef = useRef<BadgeAnimator | null>(null);
  const animatorIdRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const resolvedIdRef = useRef<string | null>(null);
  const animateRef = useRef<ResolvedAnimate>({ glide: true, countUp: true, settleMs: 320 });

  const resolvedId = resolveSeriesId(chart, seriesId);
  resolvedIdRef.current = resolvedId;
  animateRef.current = resolveAnimate(animate);

  useLayoutEffect(() => {
    const runFrame = () => {
      rafRef.current = null;

      const id = resolvedIdRef.current;
      const last = id !== null ? chart.getStackedLastValue(id) : null;
      if (id === null || !last) {
        animatorRef.current = null;
        animatorIdRef.current = null;
        return;
      }

      const target = last.value;
      // Recreate the animator when the tracked series changes (not just when it
      // goes null) so the badge shows the new series' value immediately instead
      // of gliding from the previous series' stale last value.
      if (animatorRef.current === null || animatorIdRef.current !== id) {
        animatorRef.current = new BadgeAnimator(target);
        animatorIdRef.current = id;
      }

      const { glide, countUp, settleMs } = animateRef.current;
      const introFront = chart.getIntroFront(id);

      const out = animatorRef.current.frame({
        target,
        // Only needed for the intro count-up; skip the visible-range binary
        // search entirely once the reveal has settled (the hot streaming path).
        firstVisible: introFront < 1 ? firstVisibleValue(chart, id, target) : target,
        introFront,
        now: performance.now(),
        glide,
        countUp,
        settleMs,
        reducedMotion: prefersReducedMotion(),
      });

      setFrame((prev) =>
        prev !== null &&
        prev.positionValue === out.positionValue &&
        prev.textValue === out.textValue &&
        prev.opacity === out.opacity
          ? prev
          : { positionValue: out.positionValue, textValue: out.textValue, opacity: out.opacity },
      );

      if (out.animating && rafRef.current === null) rafRef.current = requestAnimationFrame(runFrame);
    };

    const kick = () => {
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(runFrame);
    };

    const onChange = () => {
      setBumpSignal((n) => n + 1);
      kick();
    };

    chart.on('overlayChange', onChange);
    chart.on('viewportChange', onChange);
    if (chart.getSeriesIds().length > 0) onChange();

    return () => {
      chart.off('overlayChange', onChange);
      chart.off('viewportChange', onChange);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [chart]);

  const last = resolvedId !== null ? chart.getStackedLastValue(resolvedId) : null;
  const previousClose = resolvedId !== null ? chart.getPreviousClose(resolvedId) : null;

  const yRange = chart.yScale.getRange();
  const range = yRange.max - yRange.min;
  const fractionDigits = range < 0.1 ? 6 : range < 10 ? 4 : range < 1000 ? 2 : 0;

  // Build the fallback range-adaptive Intl formatter before the early return
  // so this hook call can't be skipped on subsequent renders (Rules of Hooks).
  const effectiveFormat = useMemo<ValueFormatter>(() => {
    if (format) return format;
    const nf = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      useGrouping: false,
    });

    return (v: number) => nf.format(v);
  }, [format, fractionDigits]);

  if (!last || resolvedId === null) return null;

  const { value, isLive } = last;
  const theme = chart.getTheme();

  // Position eases (the glide); the digit value steps discretely (once per
  // real point, not per frame) so the roll doesn't churn. Before the first rAF
  // frame lands, fall back to the settled value (hidden if an intro is sweeping).
  const positionValue = frame ? frame.positionValue : value;
  const textValue = frame ? frame.textValue : value;
  const y = chart.yScale.valueToY(positionValue);

  let opacity: number;
  if (frame) {
    opacity = frame.opacity;
  } else {
    opacity = chart.getIntroFront(resolvedId) < 1 ? 0 : 1;
  }

  // Direction / color track the settled last value (not the mid-glide display
  // value) so the accent doesn't flicker while the badge eases into place.
  const direction: YLabelDirection =
    previousClose === null ? 'neutral' : value > previousClose ? 'up' : value < previousClose ? 'down' : 'neutral';

  let bgColor: string;
  if (!isLive) {
    bgColor = theme.axis.textColor;
  } else if (color) {
    bgColor = color;
  } else {
    bgColor =
      direction === 'up'
        ? theme.yLabel.upBackground
        : direction === 'down'
          ? theme.yLabel.downBackground
          : theme.yLabel.neutralBackground;
  }

  if (children) {
    return <>{children({ value, y, bgColor, isLive, direction, format: effectiveFormat, opacity })}</>;
  }

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: chart.yAxisWidth,
          top: y,
          height: 0,
          borderTop: `1px dashed ${bgColor}`,
          opacity: opacity * 0.5,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 4,
          top: y,
          transform: 'translateY(-50%)',
          opacity,
          pointerEvents: 'auto',
          zIndex: 3,
          background: bgColor,
          color: theme.yLabel.textColor,
          fontSize: theme.yLabel.fontSize,
          fontFamily: theme.typography.fontFamily,
          padding: '3px 8px',
          borderRadius: 3,
          whiteSpace: 'nowrap',
          transition: 'background-color 0.3s ease',
        }}
      >
        <NumberFlow value={textValue} format={effectiveFormat} spinDuration={350} />
      </div>
    </>
  );
}

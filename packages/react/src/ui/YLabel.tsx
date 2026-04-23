import { type ReactNode, useEffect, useLayoutEffect, useMemo, useState } from 'react';

import type { ChartInstance, ValueFormatter } from '@wick-charts/core';

import { useChartInstance } from '../context';
import { NumberFlow } from './NumberFlow';

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

export function YLabel({ seriesId, color, format, children }: YLabelProps) {
  const chart = useChartInstance();

  // Notify chart that YLabel is present (affects right padding).
  useEffect(() => {
    chart.setYLabel(true);
    return () => chart.setYLabel(false);
  }, [chart]);

  // Single subscription covering data/visibility/theme/options changes, plus
  // viewportChange for pixel-Y drift on pan/zoom where the value is unchanged
  // but the badge must move.
  const [, setBumpSignal] = useState(0);
  useLayoutEffect(() => {
    const onChange = () => setBumpSignal((n) => n + 1);
    chart.on('overlayChange', onChange);
    chart.on('viewportChange', onChange);
    if (chart.getSeriesIds().length > 0) setBumpSignal((n) => n + 1);

    return () => {
      chart.off('overlayChange', onChange);
      chart.off('viewportChange', onChange);
    };
  }, [chart]);

  const resolvedId = resolveSeriesId(chart, seriesId);
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
  const y = chart.yScale.valueToY(value);

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
    return <>{children({ value, y, bgColor, isLive, direction, format: effectiveFormat })}</>;
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
          opacity: 0.5,
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
        <NumberFlow value={value} format={effectiveFormat} spinDuration={350} />
      </div>
    </>
  );
}

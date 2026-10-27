import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  type AxisBound,
  type ChartTheme,
  type TimePointInput,
  type ValueFormatter,
  catppuccin,
  formatCompact,
  normalizeTime,
  resolveCandlestickBodyColor,
} from '@wick-charts/core';

import { BarSeries } from '../BarSeries';
import { ChartContainer } from '../ChartContainer';
import { LineSeries } from '../LineSeries';
import { useThemeOptional } from '../ThemeContext';

export type SparklineVariant = 'line' | 'bar';
export type SparklineValuePosition = 'left' | 'right' | 'none';

export interface SparklineProps {
  /** Data points plotted by the sparkline. A flat `TimePointInput[]` (time may be ms or a `Date`) — the sparkline only ever shows one tiny line/bar. */
  data: TimePointInput[];
  /**
   * Streaming-window mode: viewport is fixed at `capacity` bars wide. Pass
   * at least two seed points in `data` so the initial window can infer the
   * tick interval.
   *
   * `align` controls where the seed sits at mount:
   * - `'right'` *(default)* — seed flush with the right edge; each tick
   *   shifts the viewport left by one interval and the new tick lands at
   *   the right edge.
   * - `'left'` — seed flush with the left edge; the viewport is held in
   *   place until empty bars on the right are consumed, then normal
   *   tail-scroll resumes.
   * - `'offscreen'` — seed starts one interval past the right edge so the
   *   first tick's tail-scroll animates it onto canvas (a brief "drive-in"
   *   effect).
   */
  flow?: { capacity: number; align?: 'left' | 'right' | 'offscreen' };
  /**
   * Visual theme. Drives series colour, background gradient, and the change-direction colours used in the value block.
   * Defaults to the `ThemeProvider` theme, else the default theme of `ChartContainer`.
   */
  theme?: ChartTheme;
  /** 'line' (default) or 'bar' */
  variant?: SparklineVariant;
  /** Where to show the value label */
  valuePosition?: SparklineValuePosition;
  /** Custom format for the value. Same shape as {@link ValueFormatter} used elsewhere in the API. */
  format?: ValueFormatter;
  /** Label text above the value */
  label?: string;
  /** Sublabel text below the value (defaults to the change %) */
  sublabel?: string;
  /** Line/bar color override (defaults to theme) */
  color?: string;
  /** Secondary color for negative bars */
  negativeColor?: string;
  /** Show area fill under line */
  area?: {
    /** Whether the area fill is rendered under the sparkline. Defaults to `true`. */
    visible: boolean;
  };
  /** @deprecated Use {@link area} instead. */
  areaFill?: boolean;
  /**
   * Fixed Y-axis bounds. Omit a side (or pass `'auto'`) to keep that edge
   * auto-scaled. Useful to pin a baseline (`{ min: 0 }`) or hold a stable
   * window so streaming ticks don't rescale the line.
   *
   * Each bound is an {@link AxisBound}: a number, `'auto'`, a percentage
   * offset string (`'+10%'`), or a `(values) => number` reducer.
   */
  yRange?: { min?: AxisBound; max?: AxisBound };
  /** Chart width in px (default: 140). In a sparkline box sized through `style`, the chart stretches or shrinks to the free width. */
  width?: number;
  /** Minimum chart height in px (default: 48). A taller sparkline box (set through `style`) stretches the chart. */
  height?: number;
  /** Stroke width in CSS pixels (default: 1) */
  strokeWidth?: number;
  /** Show the background gradient across the whole sparkline box (default: false) */
  gradient?: boolean;
  /** Container style override */
  style?: CSSProperties;
}

// Holds a typical label, value and change, so the charts in a grid of
// sparklines end on one line.
const VALUE_COLUMN_MIN_WIDTH = 100;

function hexToRgba(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color;
  if (!color.startsWith('#')) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The readings in order — a `null` / `NaN` gap is not a value to show or diff. */
function finiteValues(data: TimePointInput[]): number[] {
  const values: number[] = [];
  for (const point of data) {
    if (typeof point.value === 'number' && Number.isFinite(point.value)) {
      values.push(point.value);
    }
  }

  return values;
}

function computeChange(values: number[]): { value: number; pct: number; positive: boolean } {
  if (values.length < 2) return { value: 0, pct: 0, positive: true };
  const first = values[0];
  const last = values[values.length - 1];
  const diff = last - first;
  // A negative start would flip the sign of the percentage against the diff.
  const pct = first !== 0 ? (diff / Math.abs(first)) * 100 : 0;
  return { value: diff, pct, positive: diff >= 0 };
}

export function Sparkline({
  data,
  theme: themeProp,
  variant = 'line',
  valuePosition = 'right',
  format = formatCompact,
  label,
  sublabel,
  color,
  negativeColor,
  area,
  areaFill,
  yRange,
  flow,
  width = 140,
  height = 48,
  strokeWidth = 1,
  gradient = false,
  style,
}: SparklineProps) {
  const contextTheme = useThemeOptional();
  const theme = themeProp ?? contextTheme ?? catppuccin.theme;

  // Default area-visible = true. `area` wins if caller passes it; otherwise
  // fall back to the deprecated flat `areaFill` flag for backward compatibility.
  const areaVisible = area?.visible ?? areaFill ?? true;
  const values = useMemo(() => finiteValues(data), [data]);
  const lastValue = values.length > 0 ? values[values.length - 1] : 0;
  const change = useMemo(() => computeChange(values), [values]);

  const resolvedColor = color ?? theme.seriesColors[0];
  const resolvedNegColor = negativeColor ?? resolveCandlestickBodyColor(theme.candlestick.down.body);
  const changeColor = resolveCandlestickBodyColor(
    change.positive ? theme.candlestick.up.body : theme.candlestick.down.body,
  );

  // Previously Sparkline kept its own running min/max in a useRef and handed
  // a padded Y range to ChartContainer via `axis.y.{min,max}`. That worked
  // around the chart's default auto-Y "jumps" on streamed wild values, but
  // it had a hidden cost: every new data prop made the memo emit a fresh
  // `{min, max}` object, which ChartContainer fed into `chart.setAxis`, and
  // setAxis SNAPS Y (sets `#yInited = false` and calls `updateYRange(true)`).
  // Result: every streaming tick snapped Y without animation, which is the
  // jerky behaviour you saw. The chart core now has sticky-Y bounds + a
  // `viewportChange` emit on Y advance, so the chart handles streaming
  // stability itself — Sparkline can drop its local fix.

  // Captured-at-mount viewport for flow mode. Three layouts, see the
  // `flow.align` docstring on SparklineProps for the user-facing summary.
  //
  // - 'left' uses the `{ from, bars }` form, which arms the viewport's
  //   warm-up hold (#holdUntilFilled) so it stays put while empty bars on
  //   the right are consumed, then releases to normal tail-scroll.
  // - 'right' and 'offscreen' use `{ from, to }`, which leaves the hold off
  //   so tail-scroll kicks in on the first tick. The only difference is
  //   `to`: at `last` the seed sits flush right; at `last - interval` the
  //   seed sits one interval past the right edge and the first tick's scroll
  //   animates it into view.
  //
  // Requires at least 2 seed points so `interval` can be inferred; falls
  // back to undefined otherwise (chart fits to data normally). Subsequent
  // renders don't recompute because ChartContainer ignores viewport prop
  // changes after mount.
  const viewport = useMemo(() => {
    if (!flow || data.length < 2) return undefined;

    // Normalize first — `time` may be a `Date`, and the interval / bound math
    // below needs concrete numbers (TS forbids arithmetic on `Date`).
    const t0 = normalizeTime(data[0].time);
    const interval = normalizeTime(data[1].time) - t0;
    if (interval <= 0) return undefined;

    const align = flow.align ?? 'right';

    if (align === 'left') {
      return {
        maxVisibleBars: flow.capacity,
        initialRange: { from: t0, bars: flow.capacity } as const,
      };
    }

    const last = normalizeTime(data[data.length - 1].time);
    const to = align === 'offscreen' ? last - interval : last;
    const from = to - flow.capacity * interval;

    return {
      maxVisibleBars: flow.capacity,
      initialRange: { from, to } as const,
    };
  }, []);

  // The chart takes the free width, so a value text that changes width per tick
  // would resize it. The value column keeps its widest width instead.
  const valueRef = useRef<HTMLDivElement>(null);
  const [valueMinWidth, setValueMinWidth] = useState(VALUE_COLUMN_MIN_WIDTH);
  useLayoutEffect(() => {
    const width = valueRef.current?.offsetWidth ?? 0;
    if (width > valueMinWidth) setValueMinWidth(width);
  });

  const valueBlock = valuePosition !== 'none' && (
    <div
      ref={valueRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 1,
        // border-box: the measured offsetWidth includes the padding, so a
        // content-box minWidth would grow by the padding on every render.
        boxSizing: 'border-box',
        padding: '8px 16px',
        minWidth: valueMinWidth,
        flexShrink: 0,
      }}
    >
      {label && (
        <div
          style={{
            fontSize: theme.axis.fontSize,
            color: theme.axis.textColor,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          fontSize: theme.typography.fontSize + 3,
          fontWeight: 700,
          color: theme.tooltip.textColor,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {format(lastValue)}
      </div>
      {sublabel !== undefined ? (
        <div
          style={{
            fontSize: theme.axis.fontSize - 1,
            color: theme.axis.textColor,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          {sublabel}
        </div>
      ) : (
        <div
          style={{
            fontSize: theme.axis.fontSize - 1,
            fontWeight: 500,
            color: changeColor,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {change.positive ? '+' : ''}
          {change.pct.toFixed(1)}%
        </div>
      )}
    </div>
  );

  const [gradientTop, gradientBottom] = theme.chartGradient;
  const background = gradient
    ? `linear-gradient(to bottom, ${gradientTop} 0%, ${theme.background} 70%, ${gradientBottom} 100%)`
    : hexToRgba(theme.tooltip.background, 0.7);

  const chartBlock = (
    <div
      style={{
        flex: `1 1 ${width}px`,
        minWidth: 0,
        alignSelf: 'stretch',
        minHeight: height,
        overflow: 'hidden',
      }}
    >
      <ChartContainer
        // ChartContainer floors its own height at 240px so a copy-pasted chart
        // in an unsized parent stays visible. A sparkline is intentionally
        // shorter than that floor — release the floor so the canvas matches
        // the `height` wrapper instead of overflowing it (the wrapper clips,
        // leaving only the top slice of the chart visible). The box paints
        // the background: a chart fill would show as a seam beside the value.
        style={{ minHeight: 0, background: 'transparent' }}
        theme={theme}
        axis={{
          // `min`/`max` are stable user props (not recomputed per tick), so
          // ChartContainer's setAxis effect — keyed on the primitive bound
          // values — only re-applies on an actual change, never per stream
          // tick. This is why a fixed `yRange` is safe where the old
          // recompute-every-update min/max was not (see note above).
          y: { visible: false, width: 0, min: yRange?.min, max: yRange?.max },
          x: { visible: false, height: 0 },
        }}
        padding={{ top: 5, right: 0, bottom: 0, left: 0 }}
        interactive={false}
        grid={{ visible: false }}
        viewport={viewport}
      >
        {variant === 'line' ? (
          <LineSeries
            data={{ color: resolvedColor, data }}
            options={{
              strokeWidth,
              area: { visible: areaVisible },
              pulse: false,
              stacking: 'off',
            }}
          />
        ) : (
          <BarSeries
            // Sign coloring rides in the data now: positive bars take the main
            // color, negative ones the secondary.
            data={{ color: (value) => (value >= 0 ? resolvedColor : resolvedNegColor), data }}
            options={{
              barWidthRatio: 0.7,
              stacking: 'off',
              anchor: 'right',
            }}
          />
        )}
      </ChartContainer>
    </div>
  );

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 8,
        // The chart runs to the border; this clips it to the rounded corners.
        overflow: 'hidden',
        background,
        border: `1px solid ${theme.tooltip.borderColor}`,
        fontFamily: theme.typography.fontFamily,
        ...style,
      }}
    >
      {valuePosition === 'left' && valueBlock}
      {chartBlock}
      {valuePosition === 'right' && valueBlock}
    </div>
  );
}

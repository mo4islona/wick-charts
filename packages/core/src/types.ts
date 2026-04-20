/**
 * Accepted time input: a timestamp in **milliseconds** (like `Date.now()`) or a `Date` object.
 * `Date` values are converted to milliseconds internally via `Date.getTime()`.
 */
export type TimeValue = number | Date;

/** A single OHLC(V) candlestick data point. Time is a timestamp in milliseconds. */
export interface OHLCData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** {@link OHLCData} that also accepts `Date` for the time field. */
export type OHLCInput = Omit<OHLCData, 'time'> & { time: TimeValue };

/** A single time-value data point for line and bar series. Time is a timestamp in milliseconds. */
export interface TimePoint {
  time: number;
  value: number;
}

/** {@link TimePoint} that also accepts `Date` for the time field. */
export type TimePointInput = Omit<TimePoint, 'time'> & { time: TimeValue };

/** @deprecated Use {@link TimePoint} instead. */
export type LineData = TimePoint;

/** Time range (timestamps in milliseconds) of the currently visible portion of the chart. */
export interface VisibleRange {
  from: number;
  to: number;
}

/** Min/max value range for the Y axis. */
export interface YRange {
  min: number;
  max: number;
}

/** Axis-aligned rectangle in media (CSS) coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Width and height pair. */
export interface Size {
  width: number;
  height: number;
}

/**
 * Canvas size in both CSS (media) and physical (bitmap) pixels,
 * along with the device pixel ratios used to convert between them.
 */
export interface CanvasSize {
  media: Size;
  bitmap: Size;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
}

/** 2D point in media (CSS) coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** Crosshair position in both pixel and data space. */
export interface CrosshairPosition {
  /** X position in CSS pixels relative to the chart container. */
  mediaX: number;
  /** Y position in CSS pixels relative to the chart container. */
  mediaY: number;
  /** Snapped time value (timestamp in milliseconds) under the crosshair. */
  time: number;
  /** Y (value) under the crosshair. */
  y: number;
}

/** Layout metrics describing the chart area, Y axis, and time axis sizes. */
export interface ChartLayout {
  chartArea: Rect;
  yAxisWidth: number;
  xAxisHeight: number;
}

/** Supported primary series types. */
export type SeriesType = 'candlestick' | 'line' | 'bar' | 'pie';

/**
 * Entrance animation styles for candlesticks (shown when a new candle appears via `appendData`).
 * - `'none'` — no animation.
 * - `'fade'` — opacity 0→1.
 * - `'unfold'` — body scales from the open line outward.
 * - `'slide'` — translates in from the right with a fade.
 * - `'fade-unfold'` *(default)* — fade + unfold combined; the default because a lone fade is
 *   hard to notice in streaming demos, while the body-unfold gives a clear visual anchor.
 */
export type CandlestickEnterAnimation = 'none' | 'fade' | 'unfold' | 'slide' | 'fade-unfold';

/** Visual options for a candlestick series. */
export interface CandlestickSeriesOptions {
  /** Display label shown in the tooltip. */
  label?: string;
  upColor: string;
  downColor: string;
  wickUpColor: string;
  wickDownColor: string;
  /** Width of candle body as a fraction of the available bar slot (0-1). */
  bodyWidthRatio: number;
  /** Apply a subtle vertical gradient to candle bodies. Default: true. */
  candleGradient?: boolean;
  /**
   * Entrance animation style for newly appended candles. Style is specific to
   * the candlestick; there is no chart-level override for style — only for
   * duration. Default: `'fade-unfold'`.
   *
   * @see enterMs — cross-linked duration for this animation.
   */
  enterAnimation?: CandlestickEnterAnimation;
  /**
   * Entrance animation duration in milliseconds. `false` or `0` disables the
   * per-candle entrance (equivalent to `enterAnimation: 'none'`). Omit to
   * inherit from {@link AnimationsConfig.points}.`enterMs` (default 400).
   *
   * When `animations.points.enterMs` is `false` at the chart level, the
   * entrance is forced off regardless of this field.
   *
   * @see CandlestickSeriesOptions.enterAnimation
   */
  enterMs?: number | false;
  /**
   * Exponential-smoothing time constant (ms) for live-tracking the last
   * candle's O/H/L/C under `updateLastPoint`. `0` or `false` snaps directly
   * to the target (no smoothing). Omit to inherit from
   * {@link AnimationsConfig.points}.`smoothMs` (default 70 ms).
   *
   * When `animations.points.smoothMs` is `false` at the chart level, smoothing
   * is forced off regardless of this field.
   */
  smoothMs?: number | false;
}

/**
 * Entrance animation styles for new line points.
 * - `'none'` — new segments appear instantly.
 * - `'grow'` *(default)* — trailing segment reveals left-to-right.
 * - `'fade'` — geometry fixed; trailing segment strokes in with alpha 0→1.
 */
export type LineEnterAnimation = 'none' | 'grow' | 'fade';

/** @deprecated Use {@link LineEnterAnimation} instead. */
export type LineAppendAnimation = LineEnterAnimation;

/** Visual options for a line series. */
export interface LineSeriesOptions {
  /** Display label shown in the tooltip (e.g. "BTC", "Revenue"). */
  label?: string;
  /** One color per layer. */
  colors: string[];
  lineWidth: number;
  /** Whether to render a gradient area fill below the line (or between stacked layers). */
  areaFill: boolean;
  /**
   * Whether to show an animated pulsing dot at the last data point.
   */
  pulse: boolean;
  /**
   * Pulse cycle period in milliseconds. `false`/`0` disables the halo (both
   * the drawing and the associated animation loop). Omit to inherit from
   * {@link AnimationsConfig.points}.`pulseMs` (default 600 ms). When
   * `animations.points.pulseMs` is `false` at the chart level the pulse is
   * forced off regardless of this field.
   */
  pulseMs?: number | false;
  /** Stacking mode. Default: 'off'. */
  stacking: StackingMode;
  /**
   * Entrance animation style for new points. Style is specific to the line
   * series; there is no chart-level override for style — only for duration.
   * Default: `'grow'`.
   *
   * @see enterMs — cross-linked duration for this animation.
   */
  enterAnimation?: LineEnterAnimation;
  /**
   * Entrance animation duration in milliseconds. `false` or `0` disables the
   * per-point entrance (equivalent to `enterAnimation: 'none'`). Omit to
   * inherit from {@link AnimationsConfig.points}.`enterMs` (default 400).
   *
   * When `animations.points.enterMs` is `false` at the chart level, the
   * entrance is forced off regardless of this field.
   *
   * @see LineSeriesOptions.enterAnimation
   */
  enterMs?: number | false;
  /**
   * Exponential-smoothing time constant (ms) for live-tracking the last
   * point's value under `updateLastPoint`. `0` or `false` snaps directly to
   * the target (no smoothing). Omit to inherit from
   * {@link AnimationsConfig.points}.`smoothMs` (default 70 ms).
   *
   * When `animations.points.smoothMs` is `false` at the chart level, smoothing
   * is forced off regardless of this field.
   */
  smoothMs?: number | false;
}

/** Stacking mode for bar/line series: off (overlap), normal (stacked), percent (100% stacked). */
export type StackingMode = 'off' | 'normal' | 'percent';

/** @deprecated Use {@link StackingMode} instead. */
export type BarStacking = StackingMode;

/**
 * Entrance animation styles for bars.
 * - `'none'` — no animation.
 * - `'fade'` — opacity 0→1.
 * - `'grow'` — height grows from baseline.
 * - `'slide'` — translates in from the right with a fade.
 * - `'fade-grow'` *(default)* — fade + grow combined.
 */
export type BarEnterAnimation = 'none' | 'fade' | 'grow' | 'slide' | 'fade-grow';

/** Visual options for a bar series. */
export interface BarSeriesOptions {
  /** Display label shown in the tooltip (e.g. "Volume"). */
  label?: string;
  /** One color per layer. */
  colors: string[];
  barWidthRatio: number;
  /** Stacking mode. Default: 'off'. */
  stacking: StackingMode;
  /**
   * Entrance animation style for newly appended bars. Style is specific to
   * the bar series; there is no chart-level override for style — only for
   * duration. Default: `'fade-grow'`.
   *
   * @see enterMs — cross-linked duration for this animation.
   */
  enterAnimation?: BarEnterAnimation;
  /**
   * Entrance animation duration in milliseconds. `false` or `0` disables the
   * per-bar entrance (equivalent to `enterAnimation: 'none'`). Omit to inherit
   * from {@link AnimationsConfig.points}.`enterMs` (default 400).
   *
   * When `animations.points.enterMs` is `false` at the chart level, the
   * entrance is forced off regardless of this field.
   *
   * @see BarSeriesOptions.enterAnimation
   */
  enterMs?: number | false;
  /**
   * Exponential-smoothing time constant (ms) for live-tracking the last
   * bar's value under `updateLastPoint`. `0` or `false` snaps directly to the
   * target (no smoothing). Omit to inherit from
   * {@link AnimationsConfig.points}.`smoothMs` (default 70 ms).
   *
   * When `animations.points.smoothMs` is `false` at the chart level, smoothing
   * is forced off regardless of this field.
   */
  smoothMs?: number | false;
}

/**
 * Defines a bound for the Y axis.
 *
 * - `"auto"` — fully automatic (default)
 * - `number` — static value, e.g. `0` or `100`
 * - `string` — percentage offset from the auto value, e.g. `"+10%"`, `"-5%"`
 * - `(values: number[]) => number` — custom function receiving all visible values
 */
export type AxisBound = 'auto' | number | string | ((values: number[]) => number);

/** Optional min/max constraints for the Y axis. Omit a side for automatic scaling. */
/** A single slice in a pie/donut chart. */
export interface PieSliceData {
  label: string;
  value: number;
  /** Override color for this slice. Falls back to seriesColors palette. */
  color?: string;
}

/** Visual options for a pie/donut series. `innerRadiusRatio > 0` makes it a donut. */
export interface PieSeriesOptions {
  /** Palette fallback (defaults to theme.seriesColors). */
  colors?: string[];
  /** 0 = pie, 0.6 = donut. Fraction of outer radius used as inner hole. */
  innerRadiusRatio: number;
  /** Gap between slices in radians (default 0.02). */
  padAngle: number;
  /** Slice border color (default transparent). */
  strokeColor: string;
  /** Slice border width (default 0). */
  strokeWidth: number;
  /** Display label shown in tooltip. */
  label?: string;
}

/** Configuration for the Y axis. */
export interface YAxisConfig {
  /** Width in pixels. Default: 55. */
  width?: number;
  /** Minimum bound. Default: 'auto'. */
  min?: AxisBound;
  /** Maximum bound. Default: 'auto'. */
  max?: AxisBound;
  /** Whether the axis is visible. Default: true. When false, width is treated as 0. */
  visible?: boolean;
}

/** Configuration for the X (time) axis. */
export interface XAxisConfig {
  /** Height in pixels. Default: 30. */
  height?: number;
  /** Whether the axis is visible. Default: true. When false, height is treated as 0. */
  visible?: boolean;
}

/** Grouped axis configuration for both axes. */
export interface AxisConfig {
  y?: YAxisConfig;
  x?: XAxisConfig;
}

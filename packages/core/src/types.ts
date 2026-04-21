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
export type CandlestickEntryAnimation = 'none' | 'fade' | 'unfold' | 'slide' | 'fade-unfold';

/** @deprecated Use {@link CandlestickEntryAnimation} instead. */
export type CandlestickEnterAnimation = CandlestickEntryAnimation;

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
  bodyGradient?: boolean;
  /** @deprecated Use {@link bodyGradient} instead. */
  candleGradient?: boolean;
  /**
   * Entrance animation style for newly appended candles. Style is specific to
   * the candlestick; there is no chart-level override for style — only for
   * duration. Default: `'unfold'`.
   *
   * @see entryMs — cross-linked duration for this animation.
   */
  entryAnimation?: CandlestickEntryAnimation;
  /** @deprecated Use {@link entryAnimation} instead. */
  enterAnimation?: CandlestickEntryAnimation;
  /**
   * Entrance animation duration in milliseconds. `false` or `0` disables the
   * per-candle entrance (equivalent to `entryAnimation: 'none'`). Omit to
   * inherit from {@link AnimationsConfig.points}.`entryMs` (default 400).
   *
   * When `animations.points.entryMs` is `false` at the chart level, the
   * entrance is forced off regardless of this field.
   *
   * @see CandlestickSeriesOptions.entryAnimation
   */
  entryMs?: number | false;
  /** @deprecated Use {@link entryMs} instead. */
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
export type LineEntryAnimation = 'none' | 'grow' | 'fade';

/** @deprecated Use {@link LineEntryAnimation} instead. */
export type LineEnterAnimation = LineEntryAnimation;

/** Visual options for a line series. */
export interface LineSeriesOptions {
  /** Display label shown in the tooltip (e.g. "BTC", "Revenue"). */
  label?: string;
  /** One color per layer. */
  colors: string[];
  /** Stroke width in CSS pixels. Default: 1. `0` hides the line stroke. */
  strokeWidthPx: number;
  /** @deprecated Use {@link strokeWidthPx} instead. */
  lineWidth?: number;
  /** Area-fill configuration. Default: `{ visible: true }`. */
  area: { visible: boolean };
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
   * @see entryMs — cross-linked duration for this animation.
   */
  entryAnimation?: LineEntryAnimation;
  /** @deprecated Use {@link entryAnimation} instead. */
  enterAnimation?: LineEntryAnimation;
  /**
   * Entrance animation duration in milliseconds. `false` or `0` disables the
   * per-point entrance (equivalent to `entryAnimation: 'none'`). Omit to
   * inherit from {@link AnimationsConfig.points}.`entryMs` (default 400).
   *
   * When `animations.points.entryMs` is `false` at the chart level, the
   * entrance is forced off regardless of this field.
   *
   * @see LineSeriesOptions.entryAnimation
   */
  entryMs?: number | false;
  /** @deprecated Use {@link entryMs} instead. */
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
export type BarEntryAnimation = 'none' | 'fade' | 'grow' | 'slide' | 'fade-grow';

/** @deprecated Use {@link BarEntryAnimation} instead. */
export type BarEnterAnimation = BarEntryAnimation;

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
   * @see entryMs — cross-linked duration for this animation.
   */
  entryAnimation?: BarEntryAnimation;
  /** @deprecated Use {@link entryAnimation} instead. */
  enterAnimation?: BarEntryAnimation;
  /**
   * Entrance animation duration in milliseconds. `false` or `0` disables the
   * per-bar entrance (equivalent to `entryAnimation: 'none'`). Omit to inherit
   * from {@link AnimationsConfig.points}.`entryMs` (default 400).
   *
   * When `animations.points.entryMs` is `false` at the chart level, the
   * entrance is forced off regardless of this field.
   *
   * @see BarSeriesOptions.entryAnimation
   */
  entryMs?: number | false;
  /** @deprecated Use {@link entryMs} instead. */
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

/**
 * How per-slice labels are drawn on a pie/donut.
 *
 * - `'outside'` (default) — a short leader line runs from the slice edge to a
 *   text block outside the pie. Reserves horizontal space so the pie shrinks
 *   to fit. Matches the canonical infographic look.
 * - `'inside'` — text sits on the slice. Auto-skipped when the measured text
 *   won't fit the slice chord at the label radius.
 * - `'none'` — the renderer draws no labels (PieLegend / PieTooltip still work).
 */
export interface PieLabelsOptions {
  /** Default: `'outside'`. */
  mode?: 'inside' | 'outside' | 'none';
  /** What to display per label. Default: `'both'` (e.g. `"BTC  42%"`). */
  content?: 'percent' | 'label' | 'both';
  /** Font size in CSS pixels. Default: 11. */
  fontSize?: number;
  /**
   * Slices with angle (radians) smaller than this get no on-pie label.
   * Default: 0.05 (≈ 2.9°, ~0.8% of the pie). Raise when many tiny slices
   * would crowd the de-cluster pass into unreadable overlaps.
   */
  minSliceAngle?: number;
  /** Leader-line radial segment length in CSS pixels. Default: 12. */
  elbowLen?: number;
  /** Gap between leader line and text in CSS pixels. Default: 6. */
  legPad?: number;
  /**
   * Minimum vertical gap between adjacent outside labels on the same side,
   * expressed as a multiplier of {@link fontSize}. Default: 1.4.
   */
  labelGap?: number;
  /**
   * Reassign labels whose slice midangle is within ~30° of the pole
   * (|cos(midAngle)| < 0.3) to whichever side currently has fewer
   * unambiguous labels — reduces leader-line crossings near 12/6 o'clock.
   * Default: true.
   */
  balanceSides?: boolean;
}

/** Visual options for a pie/donut series. `innerRadiusRatio > 0` makes it a donut. */
export interface PieSeriesOptions {
  /** Palette fallback (defaults to theme.seriesColors). */
  colors?: string[];
  /** 0 = pie, 0.6 = donut. Fraction of the outer radius used as an inner hole. */
  innerRadiusRatio: number;
  /** Gap between slices in radians (default 0.02). */
  padAngle: number;
  /**
   * Slice border. Omit or use `{ color: 'transparent', widthPx: 0 }` for no
   * stroke (default).
   */
  stroke: { color: string; widthPx: number };
  /** Display the label shown in the tooltip. */
  label?: string;
  /** Per-slice label rendering on the pie itself. See {@link PieLabelsOptions}. */
  sliceLabels?: PieLabelsOptions;
}

/** Configuration for the Y axis. */
export interface YAxisConfig {
  /** Width in CSS pixels. Default: 55. */
  widthPx?: number;
  /** @deprecated Use {@link widthPx} instead. */
  width?: number;
  /** Minimum bound. Default: 'auto'. */
  min?: AxisBound;
  /** Maximum bound. Default: 'auto'. */
  max?: AxisBound;
  /** Whether the axis is visible. Default: true. When false, widthPx is treated as 0. */
  visible?: boolean;
}

/** Configuration for the X (time) axis. */
export interface XAxisConfig {
  /** Height in CSS pixels. Default: 30. */
  heightPx?: number;
  /** @deprecated Use {@link heightPx} instead. */
  height?: number;
  /** Whether the axis is visible. Default: true. When false, heightPx is treated as 0. */
  visible?: boolean;
}

/** Grouped axis configuration for both axes. */
export interface AxisConfig {
  y?: YAxisConfig;
  x?: XAxisConfig;
}

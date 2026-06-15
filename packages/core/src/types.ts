import type { BarPainter, CandlePainter, LinePainter } from './series/painters/types';

/**
 * Accepted time input: a timestamp in **milliseconds** (like `Date.now()`) or a `Date` object.
 * `Date` values are converted to milliseconds internally via `Date.getTime()`.
 */
export type TimeValue = number | Date;

/** Horizontal padding expressed as a fixed pixel offset or a number of data intervals. */
export type HorizontalPadding = number | { intervals: number };

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

/**
 * A color, or a function of a datum's value → color. The function form is
 * evaluated per element — per bar in a bar series, per segment in a line — so
 * one layer can paint by sign / threshold (e.g. `v => v >= 0 ? up : down`)
 * without any extra option. Used both for the per-layer `data` override and the
 * theme's default bar color.
 */
export type ValueColor = string | ((value: number) => string);

/**
 * A single named (and optionally colored) layer. Carries the layer's display
 * name and color *alongside* its data, so `Tooltip` / `Legend` show per-layer
 * names without a separate `label` option. `color` applies to line/bar layers;
 * a candlestick stream ignores it (candle colors come from `up` / `down`).
 */
export interface SeriesLayer<T> {
  /** Display name shown in tooltip / legend. A multi-layer series defaults each unnamed layer to `Series N`. */
  label?: string;
  /** Stroke + fill color for this layer; overrides the theme default. A function colors per bar / per line segment by value. Ignored by candlestick. */
  color?: ValueColor;
  /** The layer's points. */
  data: T[];
}

/**
 * Omnivorous `data` shape for line and bar series. Accepts, interchangeably:
 * - `TimePointInput[]` — one auto-named layer (the common single-series case);
 * - `TimePointInput[][]` — N auto-named layers;
 * - `SeriesLayer<TimePointInput>` — one named/colored layer;
 * - an array mixing raw `TimePointInput[]` layers and named `SeriesLayer`s.
 *
 * Everything normalizes to `SeriesLayer[]` internally (see `toLayers`). Time
 * accepts epoch milliseconds or a `Date` on every point.
 */
export type MultiLayerData =
  | TimePointInput[]
  | SeriesLayer<TimePointInput>
  | Array<TimePointInput[] | SeriesLayer<TimePointInput>>;

/**
 * `data` shape for a candlestick series — a flat `OHLCInput[]` stream, or a
 * `SeriesLayer<OHLCInput>` that names it for the tooltip / info bar / legend.
 */
export type CandlestickData = OHLCInput[] | SeriesLayer<OHLCInput>;

/** Time range (timestamps in milliseconds) of the currently visible portion of the chart. */
export interface XRange {
  from: number;
  to: number;
}

/** @deprecated Use {@link XRange} instead. Visible time range of the chart. */
export type VisibleRange = XRange;

/** Value range covered by the chart's Y axis at a given frame. Animated as a
 *  single struct so the upper and lower bounds always move in lockstep — no
 *  half-tween states where the visible domain is wider on one side than the
 *  other for a frame. */
export interface YRange {
  min: number;
  max: number;
}

/**
 * Argument accepted by {@link Chart.setVisibleRange}. Three forms:
 *
 * - `number N` — show the last N bars from the data tail (anchor right).
 * - `{ from, to }` — explicit time range; `from`/`to` accept either epoch
 *   milliseconds or `Date`, normalised to ms internally.
 * - `{ from, bars }` — anchor the visible window at `from` and extend
 *   right by `bars` data intervals. Useful for "show N bars starting
 *   here" patterns (warm-up windows for streaming charts, etc.).
 */
export type VisibleRangeSpec = number | { from: TimeValue; to: TimeValue } | { from: TimeValue; bars: number };

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

/**
 * `body` shape encodes the fill mode: a single color renders flat; a
 * `[top, bottom]` tuple renders a 2-stop vertical gradient. Use
 * `autoGradient(color)` for the subtle lightened/darkened look.
 */
export interface CandlestickDirectionColors {
  /** Body fill — single colour for flat, `[top, bottom]` tuple for a 2-stop vertical gradient. */
  body: string | [string, string];
  /** Wick stroke colour. */
  wick: string;
}

/** Visual options for a candlestick series. */
export interface CandlestickSeriesOptions {
  /** Colours for bullish candles (close ≥ open). */
  up: CandlestickDirectionColors;
  /** Colours for bearish candles (close < open). */
  down: CandlestickDirectionColors;
  /** Width of candle body as a fraction of the available bar slot (0-1). */
  bodyWidthRatio: number;
  /**
   * Entrance animation style for newly appended candles. Style is specific to
   * the candlestick; there is no chart-level override for style — only for
   * duration. Default: `'unfold'`.
   *
   * @see entryMs — cross-linked duration for this animation.
   */
  entryAnimation?: CandlestickEntryAnimation;
  /**
   * Per-candle entrance duration in milliseconds. Default: `250`.
   *
   * ```
   * // Override for one series:
   * <CandlestickSeries options={{ entryMs: 600 }} data={data} />
   *
   * // Or set the default for every candlestick series at once:
   * <ChartContainer animations={{ series: { candlestick: { entry: 600 } } }}>
   *   <CandlestickSeries data={data} />
   * </ChartContainer>
   * ```
   *
   * `false` or `0` disables the entrance (equivalent to
   * `entryAnimation: 'none'`). A chart-level
   * `animations.series.candlestick: false` is a hard disable that wins over
   * this field.
   *
   * @see CandlestickSeriesOptions.entryAnimation
   */
  entryMs?: number | false;
  /**
   * How long the displayed OHLC takes to catch up to the actual last value
   * on every `updateLastPoint`. Default: `250` ms.
   *
   * ```
   * // Per-series override:
   * <CandlestickSeries options={{ smoothMs: 100 }} data={data} />
   *
   * // Chart-level default:
   * <ChartContainer animations={{ series: { candlestick: { smooth: 100 } } }}>
   *   <CandlestickSeries data={data} />
   * </ChartContainer>
   * ```
   *
   * `0` or `false` snaps the displayed value to the target on every tick
   * (no smoothing). A chart-level `animations.series.candlestick: false` is
   * a hard disable that wins over this field.
   */
  smoothMs?: number | false;
  /**
   * Body corner radius in CSS pixels, applied to all four corners (a candle
   * body has no baseline). Default: `3`. `0` is byte-identical to the prior
   * square output. Clamped to half the smaller body dimension, so dojis and
   * ≤2px bodies degrade to flat. The `[top, bottom]` gradient is preserved —
   * the painter fills with the engine-resolved gradient and never rebuilds it.
   */
  cornerRadius?: number;
  /**
   * Custom candle-body painter — a raw `CandlePainter` function that owns the
   * body fill. Leave unset for the built-in rounded fill (driven by
   * `cornerRadius`). Read fresh each frame; a new reference is honored on the
   * next render regardless of wrapper change-detection. Keep it a stable
   * reference (module scope or `useCallback`) so the wrapper diffs it cleanly.
   * A throw falls back to the default fill. The wick and volume histogram are
   * unaffected.
   */
  candlePainter?: CandlePainter;
}

/**
 * Entrance animation styles for new line points.
 * - `'none'` — new segments appear instantly.
 * - `'grow'` *(default)* — trailing segment reveals left-to-right.
 * - `'fade'` — geometry fixed; trailing segment strokes in with alpha 0→1.
 */
export type LineEntryAnimation = 'none' | 'grow' | 'fade';

/** Visual options for a line series. */
export interface LineSeriesOptions {
  /** Stroke width in CSS pixels. Default: 1. `0` hides the line stroke. */
  strokeWidth: number;
  /** Area-fill configuration. Default: `{ visible: true }`. */
  area: {
    /** Whether the area gradient under the line is rendered. Default: `true`. */
    visible: boolean;
  };
  /**
   * Whether to show an animated pulsing dot at the last data point.
   */
  pulse: boolean;
  /**
   * Period of one halo pulse cycle in milliseconds. Continuous loop, not a
   * one-shot — short values pulse fast, long values pulse slowly. Default:
   * `600` (≈ 1.7 Hz, a calm "breathing" rhythm).
   *
   * ```
   * // Per-series override:
   * <LineSeries options={{ pulseMs: 1200 }} data={data} />
   *
   * // Chart-level default:
   * <ChartContainer animations={{ series: { line: { pulse: 1200 } } }}>
   *   <LineSeries data={data} />
   * </ChartContainer>
   * ```
   *
   * `false` or `0` turns the halo off entirely (drawing and animation loop).
   * A chart-level `animations.series.line: false` is a hard disable that
   * wins over this field.
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
  /**
   * Per-point entrance duration in milliseconds. Default: `250`.
   *
   * ```
   * // Override for one series:
   * <LineSeries options={{ entryMs: 600 }} data={data} />
   *
   * // Or set the default for every line series at once:
   * <ChartContainer animations={{ series: { line: { entry: 600 } } }}>
   *   <LineSeries data={data} />
   * </ChartContainer>
   * ```
   *
   * `false` or `0` disables the entrance (equivalent to
   * `entryAnimation: 'none'`). A chart-level `animations.series.line: false`
   * is a hard disable that wins over this field.
   *
   * @see LineSeriesOptions.entryAnimation
   */
  entryMs?: number | false;
  /**
   * How long the displayed last value takes to catch up to the actual one
   * on every `updateLastPoint`. Default: `250` ms.
   *
   * ```
   * // Per-series override:
   * <LineSeries options={{ smoothMs: 100 }} data={data} />
   *
   * // Chart-level default:
   * <ChartContainer animations={{ series: { line: { smooth: 100 } } }}>
   *   <LineSeries data={data} />
   * </ChartContainer>
   * ```
   *
   * `0` or `false` snaps the displayed value to the target on every tick
   * (no smoothing). A chart-level `animations.series.line: false` is a hard
   * disable that wins over this field.
   */
  smoothMs?: number | false;
  /**
   * Declarative line smoothing. Default: `'straight'` (zero visual change —
   * the prior polyline). Resolves to a shipped built-in path builder inside the
   * renderer and drives the stroke, the area fill, and stacked slices from one
   * path:
   * - `'straight'` — plain polyline.
   * - `'smooth'` — Fritsch–Carlson monotone cubic (non-overshooting, so it stays
   *   inside an area fill that closes to a baseline).
   * - `'stepped'` — horizontal-then-vertical step at each sample.
   */
  curve?: 'straight' | 'smooth' | 'stepped';
  /**
   * Custom line path builder — a raw `LinePainter` function. Overrides `curve`,
   * applied per finite run to both the stroke and the area-fill top edge. Read
   * fresh each frame; keep it a stable reference so the wrapper diffs it cleanly.
   * A throw falls back to the straight builder. Stacked mode uses the `curve`
   * kind for gap-free interior tiling, so a custom `linePainter` there falls back
   * to `'straight'`.
   */
  linePainter?: LinePainter;
  /**
   * Threshold coloring. Paints the stroke and the area fill one color below a Y
   * `value` and another above it, with the switch pinned to that value's pixel
   * row — a vertical canvas gradient, so it tracks the Y-axis as it autoscales.
   * Use it to make a series visibly "go critical" past a limit: the line runs
   * calm below the level and hot above it.
   *
   * Positional, so it is independent of (and overrides) the per-layer
   * `data.color` for the stroke and fill. Applies to unstacked lines only.
   *
   * ```
   * <LineSeries data={data} options={{ threshold: { value: 70, above: '#f0556a' } }} />
   * ```
   */
  threshold?: {
    /** Y data value where the color switches. */
    value: number;
    /** Color above the threshold (toward the top of the plot). */
    above: string;
    /** Color below the threshold. Default: the series' resolved color. */
    below?: string;
  };
}

/** Stacking mode for bar/line series: off (overlap), normal (stacked), percent (100% stacked). */
export type StackingMode = 'off' | 'normal' | 'percent';

/**
 * Entrance animation styles for bars.
 * - `'none'` — no animation.
 * - `'fade'` — opacity 0→1.
 * - `'grow'` — height grows from baseline.
 * - `'slide'` — translates in from the right with a fade.
 * - `'fade-grow'` *(default)* — fade + grow combined.
 */
export type BarEntryAnimation = 'none' | 'fade' | 'grow' | 'slide' | 'fade-grow';

/** Visual options for a bar series. */
export interface BarSeriesOptions {
  /** Width of each bar as a fraction of the available bar slot (0–1). `1` = bars touch; `0.6` = roughly 60 % of the slot. Default: 0.7. */
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
  /**
   * Per-bar entrance duration in milliseconds. Default: `250`.
   *
   * ```
   * // Override for one series:
   * <BarSeries options={{ entryMs: 600 }} data={data} />
   *
   * // Or set the default for every bar series at once:
   * <ChartContainer animations={{ series: { bar: { entry: 600 } } }}>
   *   <BarSeries data={data} />
   * </ChartContainer>
   * ```
   *
   * `false` or `0` disables the entrance (equivalent to
   * `entryAnimation: 'none'`). A chart-level `animations.series.bar: false`
   * is a hard disable that wins over this field.
   *
   * @see BarSeriesOptions.entryAnimation
   */
  entryMs?: number | false;
  /**
   * How long the displayed bar value takes to catch up to the actual one
   * on every `updateLastPoint`. Default: `250` ms.
   *
   * ```
   * // Per-series override:
   * <BarSeries options={{ smoothMs: 100 }} data={data} />
   *
   * // Chart-level default:
   * <ChartContainer animations={{ series: { bar: { smooth: 100 } } }}>
   *   <BarSeries data={data} />
   * </ChartContainer>
   * ```
   *
   * `0` or `false` snaps the displayed value to the target on every tick
   * (no smoothing). A chart-level `animations.series.bar: false` is a hard
   * disable that wins over this field.
   */
  smoothMs?: number | false;
  /**
   * Where the bar body sits relative to its time slot.
   *
   * - `'center'` (default) — body centered on the time tick. Standard chart
   *   look; the leftmost and rightmost bars rely on the surrounding
   *   `padding.left` / `padding.right` to keep their outer half on canvas.
   * - `'right'` — body anchored so its right edge sits on the time tick.
   *   Lets the rightmost bar fit fully inside the canvas with
   *   `padding.right = 0` (e.g. Sparkline). Not currently a public option —
   *   subject to change without notice.
   *
   * @internal
   */
  anchor?: 'center' | 'right';
  /**
   * Free-end corner radius in CSS pixels. Default: `4`. `0` is byte-identical to
   * the pre-rounding square output. The radius is clamped to half the smaller
   * bar dimension, so thin bars / sub-radius segments degrade to flat.
   *
   * The renderer decides which edge is "free" per draw mode — a positive bar
   * rounds its top, a negative bar its bottom, and in a stack only the topmost
   * (or bottommost) segment per column rounds, interior segments stay square.
   * `anchor` is orthogonal: rounding operates on the already-offset rect.
   */
  cornerRadius?: number;
  /**
   * Custom bar painter — a raw `BarPainter` function that owns the bar fill.
   * Leave unset for the built-in rounded fill (driven by `cornerRadius`). Read
   * fresh each frame; a new function reference is honored on the next render
   * regardless of wrapper change-detection. Keep it a stable reference (module
   * scope or `useCallback`) so the wrapper diffs it cleanly. A throw falls back
   * to the default fill.
   */
  barPainter?: BarPainter;
  /**
   * Time (epoch ms) at/after which bars are flagged as projected / forecast
   * "ghost" bars. The default painter fills those with a translucent derivative
   * of their color; projected bars also skip the entrance transform so the ghost
   * never double-fades. Omitted: no projected bars.
   */
  projectedFrom?: number;
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
   * Slices narrower than this (in degrees) get no on-pie label. Default: 2.5°
   * (≈ 0.7% of the pie). Raise when many tiny slices would crowd the
   * de-cluster pass into unreadable overlaps.
   */
  minSliceAngle?: number;
  /** Leader-line radial segment length in CSS pixels. Default: 12. */
  elbowLen?: number;
  /** Gap between leader line and text in CSS pixels. Default: 6. */
  legPad?: number;
  /**
   * Radial distance in CSS pixels from the pie's outer edge to the natural
   * label anchor point. The label then extends horizontally outward by
   * {@link railWidth} before the text starts. Clamped internally against
   * {@link elbowLen}. Default: 14.
   */
  distance?: number;
  /**
   * Horizontal length of the final leader-line segment in CSS pixels — the
   * straight tail that runs from the radial elbow out to the text anchor.
   * Higher values give a longer visible "rail" before the label. Default: 16.
   */
  railWidth?: number;
  /**
   * Minimum vertical gap between adjacent outside labels on the same side,
   * expressed as a multiplier of {@link fontSize}. Default: 1.8.
   */
  labelGap?: number;
}

/**
 * Grouping of the smallest slices into a single synthetic "Other" slice.
 * Enabled by default: when the data holds more than {@link maxSlices} slices,
 * the largest `maxSlices - 1` keep their original order and the rest are
 * summed into one "Other" slice appended at the end. The grouped slice
 * behaves like a regular slice in labels / legend / tooltip / hit-testing.
 */
export interface PieOtherOptions {
  /** Max number of rendered slices including "Other". Default: 8. */
  maxSlices?: number;
  /** Label of the aggregated slice. Default: `'Other'`. */
  label?: string;
  /**
   * Color override for the aggregated slice. Default: `theme.pie.otherColor`
   * (falls back to `axis.textColor` for themes without a `pie` block) — a
   * muted tone so the aggregate doesn't carry the same visual weight as a
   * real category.
   */
  color?: string;
}

/** Visual options for a pie/donut series. `innerRadiusRatio > 0` makes it a donut. */
export interface PieSeriesOptions {
  /** Palette fallback (defaults to theme.seriesColors). */
  colors?: string[];
  /** 0 = pie, 0.6 = donut. Fraction of the outer radius used as an inner hole. */
  innerRadiusRatio: number;
  /** Gap between slices in degrees. Default: 1.15° (≈ 0.02 rad). */
  padAngle: number;
  /** Display the label shown in the tooltip. */
  label?: string;
  /** Per-slice label rendering on the pie itself. See {@link PieLabelsOptions}. */
  sliceLabels?: PieLabelsOptions;
  /**
   * Group the smallest slices into a single "Other" slice when the dataset
   * exceeds `maxSlices` (default: 8 rendered slices total). On by default so
   * dense datasets stay readable — pass `false` to always render every slice.
   * See {@link PieOtherOptions}.
   */
  other?: boolean | PieOtherOptions;
  /**
   * When `true`, enables pie motion effects: the outside-label entrance
   * draw-in on mount / data swap, and the hover-explode slice offset.
   * Default: `false` — labels paint fully on the first frame and hovered
   * slices stay in place (hover feedback is left to the tooltip / legend /
   * cursor). Enable for presentations where the motion adds narrative
   * value.
   */
  animate?: boolean;
  /**
   * Per-slice radial *depth* gradient — a subtle lightening from the slice
   * center toward its edge that gives the pie a soft 3D sheen. On by default.
   * Set `false` for flat, solid-color slices (the material / infographic
   * look). Orthogonal to {@link innerShadow}: an explicit `innerShadow` still
   * paints its dark rim band even when the depth gradient is off.
   */
  gradient?: boolean;
  /**
   * Ambient *outer* drop-shadow behind each slice. Adds lift for flat
   * dashboards. Omit / `false` to disable (default). `true` uses soft
   * defaults; pass an object to tune individually.
   */
  shadow?:
    | boolean
    | {
        /** Shadow color. Default: `rgba(0, 0, 0, 0.22)`. */
        color?: string;
        /** Blur radius in CSS pixels. Default: 24. */
        blur?: number;
        /** Horizontal offset in CSS pixels. Default: 0. */
        offsetX?: number;
        /** Vertical offset in CSS pixels. Default: 10. */
        offsetY?: number;
      };
  /**
   * Inner rim darkening — a dark band near each slice's outer edge that
   * gives the pie an "inset" / pressed look. Implemented by extending the
   * per-slice radial gradient with a dark edge stop, so it pairs naturally
   * with the existing depth gradient. Omit / `false` to disable (default).
   */
  innerShadow?:
    | boolean
    | {
        /**
         * Rim color. Default: `rgba(0, 0, 0, 0.1)` (blended over the slice
         * color). Accepts any CSS color.
         */
        color?: string;
        /**
         * Fraction of the slice's radial span covered by the darkened band
         * (0..1). Default: 0.3 — darkening starts at 70% of the radius.
         */
        depth?: number;
      };
}

/** Configuration for the Y axis. */
export interface YAxisConfig {
  /** Width in CSS pixels. Default: 55. */
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
  /** Height in CSS pixels. Default: 30. */
  height?: number;
  /** Whether the axis is visible. Default: true. When false, height is treated as 0. */
  visible?: boolean;
}

/** Grouped axis configuration for both axes. */
export interface AxisConfig {
  /** Y-axis configuration — width, bounds, and visibility of the value axis. */
  y?: YAxisConfig;
  /** X-axis configuration — height and visibility of the time axis. */
  x?: XAxisConfig;
}

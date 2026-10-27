import type { BarIntroFn } from './series/bar-intro';
import type { CandleIntroFn } from './series/candlestick-intro';
import type { LineIntroFn } from './series/line-intro';
import type { BarPainter, CandlePainter, LinePainter } from './series/painters/types';
import type { RadialLabelPainter, RadialLayout, RingPainter } from './series/radial-progress-styles';

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

/**
 * A single time-value data point for line and bar series. Time is a timestamp in milliseconds.
 * On a numeric or category X axis `time` is the internal X coordinate (the number, or the
 * category's index) and `x` is the point's own X.
 */
export interface TimePoint {
  time: number;
  value: number;
  /** The point's X on a numeric or category axis, as passed in. */
  x?: number | string;
}

/** {@link TimePoint} that also accepts `Date` for the time field, and `null` for a gap. */
export type TimePointInput = Omit<TimePoint, 'time' | 'x' | 'value'> & { time: TimeValue; value: number | null };

/**
 * A line / bar point on a numeric or category X axis (`axis.x.type`): `x` is a
 * number on a numeric axis and a category name on a category axis.
 */
export interface XPointInput {
  x: number | string;
  /** `null` (or any non-finite value) is a gap: the line breaks there and the tooltip leaves the point out. */
  value: number | null;
}

/**
 * A single band sample: the filled region between `low` and `high` at `time`.
 * Time is a timestamp in milliseconds. A `low` above `high` is drawn with the
 * edges swapped; a non-finite edge is a gap.
 */
export interface BandPoint {
  time: number;
  low: number;
  high: number;
  /** The sample's X on a numeric or category axis, as passed in; `time` is then the internal X coordinate. */
  x?: number | string;
}

/** {@link BandPoint} that also accepts `Date` for the time field, and a `null` edge for a gap. */
export type BandPointInput = Omit<BandPoint, 'time' | 'x' | 'low' | 'high'> & {
  time: TimeValue;
  low: number | null;
  high: number | null;
};

/** A band sample on a numeric or category X axis — {@link XPointInput} with edges in place of a value. */
export interface XBandPointInput {
  x: number | string;
  /** `null` (or any non-finite edge) is a gap. */
  low: number | null;
  high: number | null;
}

/**
 * A color, or a function of a datum's value → color. A bar series evaluates the
 * function per bar, so one layer can paint by sign (e.g. `v => v >= 0 ? up : down`)
 * without any extra option; a line evaluates it once, at its last value. Used
 * both for the per-layer `data` override and the theme's default bar color.
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

/** A line / bar input point: keyed by `time` on a time axis, by `x` on a numeric or category axis. */
export type LinePointInput = TimePointInput | XPointInput;

/**
 * Omnivorous `data` shape for line and bar series. Accepts, interchangeably:
 * - `TimePointInput[]` — one auto-named layer (the common single-series case);
 * - `TimePointInput[][]` — N auto-named layers;
 * - `SeriesLayer<TimePointInput>` — one named/colored layer;
 * - an array mixing raw `TimePointInput[]` layers and named `SeriesLayer`s.
 *
 * Everything normalizes to `SeriesLayer[]` internally (see `toLayers`). Time
 * accepts epoch milliseconds or a `Date` on every point. On a numeric or
 * category X axis the points are {@link XPointInput}s instead.
 */
export type MultiLayerData =
  | LinePointInput[]
  | SeriesLayer<LinePointInput>
  | Array<LinePointInput[] | SeriesLayer<LinePointInput>>;

/**
 * `data` shape for a candlestick series — a flat `OHLCInput[]` stream, or a
 * `SeriesLayer<OHLCInput>` that names it for the tooltip / info bar / legend.
 */
export type CandlestickData = OHLCInput[] | SeriesLayer<OHLCInput>;

/** A band input sample: keyed by `time` on a time axis, by `x` on a numeric or category axis. */
export type BandSampleInput = BandPointInput | XBandPointInput;

/**
 * `data` shape for a band series — the same omnivorous forms as
 * {@link MultiLayerData}, one band per layer: a flat `BandPointInput[]`, a
 * layered `BandPointInput[][]`, a named `SeriesLayer`, or an array mixing both.
 * On a numeric or category X axis the samples are {@link XBandPointInput}s.
 */
export type BandData =
  | BandSampleInput[]
  | SeriesLayer<BandSampleInput>
  | Array<BandSampleInput[] | SeriesLayer<BandSampleInput>>;

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
  /**
   * Internal X coordinate under the crosshair — the timestamp in milliseconds
   * on a time axis, the number on a numeric axis, the band index on a category axis.
   */
  time: number;
  /** X in the axis domain: epoch ms on a time axis, the number on a numeric axis, the category name on a category axis. */
  x: number | string;
  /** Y (value) under the crosshair. */
  y: number;
}

/** Layout metrics describing the chart area, Y axis, and time axis sizes. */
export interface ChartLayout {
  /** Plot area in container CSS px — `x` is the Y-axis width when the axis sits on the left. */
  chartArea: Rect;
  yAxisWidth: number;
  yAxisPosition: YAxisPosition;
  xAxisHeight: number;
}

/** Primary series types. Open-ended — a custom {@link SeriesDefinition} picks any string that isn't a built-in. */
export type SeriesType =
  | 'candlestick'
  | 'line'
  | 'bar'
  | 'band'
  | 'pie'
  | 'heatmap'
  | 'depth'
  | 'sankey'
  | 'gauge'
  | 'radialProgress'
  | (string & {});

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
  /** Colours for rising candles — close ≥ open, or ≥ the previous close under `colorBy: 'previousClose'`. */
  up: CandlestickDirectionColors;
  /** Colours for falling candles — the rest. */
  down: CandlestickDirectionColors;
  /**
   * What a candle's close is compared with to pick the `up` or `down` colours.
   * `'open'` (the default) colours by the candle's own direction;
   * `'previousClose'` by the move from the previous candle, the convention of
   * hollow candles (`candlePainter: hollowCandle`). The first candle falls back
   * to its open. The volume histogram always colours by close vs open.
   */
  colorBy?: 'open' | 'previousClose';
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
   * Initial-load intro animation — a `CandleIntroFn`, usually one of the
   * shipped factories: `candleUnfoldIntro()` (the default),
   * `wickBodyIntro()`, `riseIntro()`, `fadeIntro()`. Independent of
   * `entryAnimation` — the intro plays once on the first data seed,
   * streaming entrances keep their own style.
   *
   * @see introMs — cross-linked duration for this animation.
   */
  introAnimation?: CandleIntroFn;
  /**
   * Initial-load reveal duration in milliseconds. On the first data seed
   * (empty → non-empty) candles reveal in a left-to-right wave: each candle
   * tweens for `introMs`, starts staggered across another `introMs`, so the
   * full wave lasts ~2×. The visual style is picked by `introAnimation`.
   * Default: `500`.
   *
   * ```
   * // Per-series override:
   * <CandlestickSeries options={{ introMs: 800 }} data={data} />
   *
   * // Chart-level default:
   * <ChartContainer animations={{ series: { candlestick: { intro: 800 } } }}>
   *   <CandlestickSeries data={data} />
   * </ChartContainer>
   * ```
   *
   * `false` or `0` disables the intro. Bulk re-seeds of a non-empty series
   * never replay it. Skipped entirely under `prefers-reduced-motion`.
   */
  introMs?: number | false;
  /**
   * History-prepend reveal — plays when older points land at the front of
   * the series (the `EdgeLoader` load-more-on-scroll path). A wave sweeps
   * from the data boundary into the new history; each candle's stagger
   * position is `0` at the boundary and `1` at the deepest new point, so
   * intro factories that read `el.progress` (`fadeIntro()` — the default,
   * `riseIntro()`, `candleUnfoldIntro()`, `wickBodyIntro()`) work here
   * unchanged. Clip directives are interpreted in reveal space: `x = 0` at
   * the boundary, increasing toward the older end.
   *
   * The fn receives a localized frame: `range` is the prepended time span
   * (not the visible window) and `width` is that span's bitmap width.
   *
   * `'none'` disables the reveal — prepended points appear instantly.
   *
   * @see historyRevealMs — cross-linked duration for this animation.
   */
  historyReveal?: CandleIntroFn | 'none';
  /**
   * History-prepend reveal duration in milliseconds — the per-candle wave
   * duration; the full reveal lasts ~2×. Default: `400`. `false` or `0`
   * disables the reveal. Skipped entirely under `prefers-reduced-motion`.
   *
   * @see CandlestickSeriesOptions.historyReveal
   */
  historyRevealMs?: number | false;
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
   * How each candle is drawn — a `CandlePainter` called once per wick, then
   * once per body. Leave unset for filled candles (`roundedCandleFill`, driven
   * by `cornerRadius`), or pass a shipped style: `hollowCandle` (outlined
   * rising bodies) or `ohlcBar` (a high–low line with open and close ticks).
   * Any other function draws its own shape on the engine's post-transform
   * rects, so entry, intro and live smoothing work unchanged. Read fresh each
   * frame; keep it a stable reference (module scope or `useCallback`) so the
   * wrapper diffs it cleanly. A throw falls back to the default fill. The
   * volume histogram is unaffected.
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
    /**
     * Y value the fill closes to, instead of the plot floor. The fill runs from
     * the line to this value's pixel row on both sides of it and fades toward
     * the row; Y autoscale keeps the value in view. A value outside the plotted
     * Y range clamps to the plot edge. Pair it with a `threshold` at the same
     * value for a two-color fill (P&L around zero, deviation from a target).
     *
     * ```
     * <LineSeries
     *   data={pnl}
     *   options={{ area: { visible: true, baseline: 0 }, threshold: { value: 0, above: up, below: down } }}
     * />
     * ```
     *
     * Ignored in stacked mode — a stack always closes to its own zero.
     * Default: the plot floor.
     */
    baseline?: number;
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
   * Initial-load reveal duration in milliseconds. On the first data seed
   * (empty → non-empty) the line draws itself left-to-right — stroke and
   * area sweep in behind a glowing head that rides the reveal front. The
   * full sweep lasts ~2× `introMs`. Default: `500`.
   *
   * ```
   * // Per-series override:
   * <LineSeries options={{ introMs: 800 }} data={data} />
   *
   * // Chart-level default:
   * <ChartContainer animations={{ series: { line: { intro: 800 } } }}>
   *   <LineSeries data={data} />
   * </ChartContainer>
   * ```
   *
   * `false` or `0` disables the intro. Bulk re-seeds of a non-empty series
   * never replay it. Skipped entirely under `prefers-reduced-motion`.
   */
  introMs?: number | false;
  /**
   * Initial-load reveal choreography — a `LineIntroFn` called once per
   * frame while the intro plays. The shipped styles are factories over the
   * same contract: `unfoldIntro()` (the default — amplitude springs from
   * the mean into shape), `sweepIntro()` (left-to-right draw-on with a
   * glowing head), `traceIntro()` (faint ghost, then an ink sweep),
   * `plotterIntro()` (head advances at constant path speed), `centerOutIntro()`
   * (clip opens from the pane's center outward). Style is specific to the
   * line series; there is no chart-level override for style — only for
   * duration (`introMs`).
   *
   * @see LineIntroFn — the custom-fn contract (frame → directives).
   * @see introMs — cross-linked duration for this animation.
   */
  introAnimation?: LineIntroFn;
  /**
   * History-prepend reveal — plays when older points land at the front of
   * the series (the `EdgeLoader` load-more-on-scroll path). Default: the
   * line back-fills itself from the data boundary into the new history
   * behind a moving clip front (`backfillSweepIntro()`).
   *
   * A custom `LineIntroFn` receives a localized frame: `range` is the
   * prepended time span with `range.to` at the data boundary (not the
   * visible window), `width` is that span's bitmap width, and `progress`
   * runs over the reveal. Value-transform directives are applied to the
   * prepended points only.
   *
   * `'none'` disables the reveal — prepended points appear instantly.
   *
   * @see historyRevealMs — cross-linked duration for this animation.
   */
  historyReveal?: LineIntroFn | 'none';
  /**
   * History-prepend reveal duration in milliseconds — the full sweep lasts
   * ~2×. Default: `400`. `false` or `0` disables the reveal. Skipped
   * entirely under `prefers-reduced-motion`.
   *
   * @see LineSeriesOptions.historyReveal
   */
  historyRevealMs?: number | false;
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
  /**
   * Dot markers at each data point. Hidden by default.
   *
   * Dots ride the same animated geometry as the stroke (entrance unfurl,
   * live-value smoothing, stacked cumulative), so they glide with the line
   * instead of snapping. When the visible points sit too dense to read as
   * discrete markers (average spacing under ~1.5 dot diameters, e.g. zoomed
   * far out), the dots are skipped for that frame — they'd merge into a fat
   * line and hide the stroke. Zooming back in brings them back.
   *
   * ```
   * <LineSeries data={data} options={{ points: { visible: true } }} />
   * ```
   */
  points?: {
    /** Whether a dot is drawn at each data point. */
    visible: boolean;
    /** Dot radius in CSS pixels. Default: `3`. */
    radius?: number;
    /** Fill color override. Default: the layer's resolved series color. */
    color?: string;
  };
}

/** Entrance styles for band points added via `appendData` — the same set as {@link LineEntryAnimation}. */
export type BandEntryAnimation = LineEntryAnimation;

/**
 * Visual options for a band series — the filled region between a `low` and a
 * `high` edge. Each layer is one band; layers draw in order with translucent
 * fills, so nested bands of one color read as a fan chart. There is no
 * stacking: a stack of ranges has no meaning.
 */
export interface BandSeriesOptions {
  /**
   * Fill between the edges: a flat color, or a `[top, bottom]` pair painted
   * as a vertical gradient over each band's visible extent. Applies to every
   * layer. Default: a gradient of the layer color from 40% opacity at the top
   * to 4% at the bottom.
   */
  fill?: string | [string, string];
  /** Edge strokes, in the layer color at 60% opacity. Default: `{ visible: true, width: 1 }`. */
  stroke?: {
    /** Whether the `low` and `high` edges are stroked. Default: `true`. */
    visible?: boolean;
    /** Stroke width in CSS pixels. Default: `1`. */
    width?: number;
    /** Stroke color for every layer. Default: the layer color at 60% opacity. */
    color?: string;
  };
  /**
   * Edge smoothing, with the same builders as the line series. Default:
   * `'straight'`. `'smooth'` is monotone, so an edge never overshoots its own
   * samples.
   */
  curve?: 'straight' | 'smooth' | 'stepped';
  /**
   * Entrance style for appended points. Default: `'grow'` — the trailing
   * segment of both edges unfurls from the previous point.
   *
   * @see entryMs — cross-linked duration for this animation.
   */
  entryAnimation?: BandEntryAnimation;
  /**
   * Per-point entrance duration in milliseconds. Default: `250`. `false` or
   * `0` disables the entrance. A chart-level `animations.series.band: false`
   * wins over this field.
   */
  entryMs?: number | false;
  /**
   * Initial-load reveal duration in milliseconds; the full reveal lasts ~2×.
   * Default: `500`. `false` or `0` disables it. Bulk re-seeds of a non-empty
   * series never replay it. Skipped under `prefers-reduced-motion`.
   */
  introMs?: number | false;
  /**
   * Initial-load reveal choreography — the line series' `LineIntroFn`
   * contract. The frame's `layerData` / `layerMean` / `primaryPath` describe
   * each band's center, and a `value` transform applies to both edges.
   * `heads` are ignored. Default: `unfoldIntro()` — the band opens out of its
   * mean.
   *
   * @see introMs — cross-linked duration for this animation.
   */
  introAnimation?: LineIntroFn;
  /**
   * History-prepend reveal for older points loaded at the front. Default:
   * `backfillSweepIntro()`. `'none'` makes prepended points appear at once.
   *
   * @see historyRevealMs — cross-linked duration for this animation.
   */
  historyReveal?: LineIntroFn | 'none';
  /** History-prepend reveal duration in milliseconds. Default: `400`. `false` or `0` disables it. */
  historyRevealMs?: number | false;
  /**
   * How long both displayed edges take to catch up on every
   * `updateLastPoint`. Default: `250` ms. `0` or `false` snaps.
   */
  smoothMs?: number | false;
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
  /**
   * Width of each bar as a fraction of the available bar slot (0–1). `1` = bars touch; `0.6` = roughly 60 % of the slot.
   * Applies on a time or numeric X axis only — on a category axis a bar fills its band (see `axis.x.padding`). Default: 0.6.
   */
  barWidthRatio: number;
  /**
   * Stacking mode. Default: 'off'. With `'off'`, layers overlap on a time or
   * numeric X axis and stand side by side in each band on a category axis.
   * `'percent'` draws each layer as its share of the column's absolute sum, so
   * a column spans 100% across zero: +3 and -1 give +75% up and -25% down.
   */
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
   * Initial-load intro animation — a `BarIntroFn`, usually one of the
   * shipped factories: `growIntro()` (the default), `springIntro()`,
   * `riseIntro()`, `fadeIntro()`, `wipeIntro()`. Independent of
   * `entryAnimation` — the intro plays once on the first data seed,
   * streaming entrances keep their own style.
   *
   * @see introMs — cross-linked duration for this animation.
   */
  introAnimation?: BarIntroFn;
  /**
   * Initial-load reveal duration in milliseconds. On the first data seed
   * (empty → non-empty) bars reveal in a left-to-right wave: each bar
   * tweens for `introMs`, starts staggered across another `introMs`, so
   * the full wave lasts ~2×. The visual style is picked by
   * `introAnimation`. Default: `500`.
   *
   * ```
   * // Per-series override:
   * <BarSeries options={{ introMs: 800 }} data={data} />
   *
   * // Chart-level default:
   * <ChartContainer animations={{ series: { bar: { intro: 800 } } }}>
   *   <BarSeries data={data} />
   * </ChartContainer>
   * ```
   *
   * `false` or `0` disables the intro. Bulk re-seeds of a non-empty series
   * never replay it. Skipped entirely under `prefers-reduced-motion`.
   */
  introMs?: number | false;
  /**
   * History-prepend reveal — plays when older points land at the front of
   * the series (the `EdgeLoader` load-more-on-scroll path). A wave sweeps
   * from the data boundary into the new history; each bar's stagger
   * position is `0` at the boundary and `1` at the deepest new point, so
   * intro factories that read `el.progress` (`fadeIntro()` — the default,
   * `riseIntro()`, `growIntro()`, `springIntro()`) work here unchanged.
   * Clip directives are interpreted in reveal space: `x = 0` at the
   * boundary, increasing toward the older end.
   *
   * The fn receives a localized frame: `range` is the prepended time span
   * (not the visible window) and `width` is that span's bitmap width.
   *
   * `'none'` disables the reveal — prepended points appear instantly.
   *
   * @see historyRevealMs — cross-linked duration for this animation.
   */
  historyReveal?: BarIntroFn | 'none';
  /**
   * History-prepend reveal duration in milliseconds — the per-bar wave
   * duration; the full reveal lasts ~2×. Default: `400`. `false` or `0`
   * disables the reveal. Skipped entirely under `prefers-reduced-motion`.
   *
   * @see BarSeriesOptions.historyReveal
   */
  historyRevealMs?: number | false;
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
   * Free-end corner radius in CSS pixels. Default: `2`. `0` is byte-identical to
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
  /**
   * Value text just past each bar's free end: above a positive bar, below a
   * negative one. A `'normal'` stack gets one label per signed stack, with its
   * total; `'percent'` stacks and layers overlapping on a time or numeric axis
   * get none. A label wider than its bar is skipped. `true` uses the default
   * format. Color: `theme.bar.labelColor`. Default: off.
   */
  valueLabels?: boolean | BarValueLabelsOptions;
}

/** Value labels drawn past the free end of each bar. */
export interface BarValueLabelsOptions {
  /** Label text. Default: the Y axis format (`<YAxis format>`), else the axis tick format. */
  format?: (value: number) => string;
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

/** {@link PieSliceData} as a pie series takes it: a `null` value is no reading, a slice of zero. */
export type PieSliceInput = Omit<PieSliceData, 'value'> & { value: number | null };

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
  /**
   * Rounds each slice's corners in CSS pixels — the two where the outer rim
   * meets the straight edges, plus two more on the inner rim once
   * `innerRadiusRatio > 0` carves out a donut hole. Default: 3 (matching the
   * bar/candlestick families); pass 0 for sharp wedges. Thin rings and narrow
   * slices automatically clamp the radius down to whatever they can fit
   * without the corners overlapping, so a value that's too large for a given
   * slice degrades gracefully instead of producing a malformed shape.
   */
  cornerRadius?: number;
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
   * Initial-load reveal duration in milliseconds. On the first data seed
   * (empty → non-empty) slices unfurl clockwise over this total duration,
   * then the outside labels draw in. Default: `600`.
   *
   * ```
   * // Per-series override:
   * <PieSeries options={{ entryMs: 900 }} data={data} />
   *
   * // Chart-level default:
   * <ChartContainer animations={{ series: { pie: { entry: 900 } } }}>
   *   <PieSeries data={data} />
   * </ChartContainer>
   * ```
   *
   * `false` or `0` disables the intro (a chart-level
   * `animations.series.pie: false` also force-disables it). Bulk re-seeds
   * of a non-empty series never replay it. Skipped entirely under
   * `prefers-reduced-motion`.
   */
  entryMs?: number | false;
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

/** One cell of a heatmap matrix — a (column, row) coordinate with a magnitude. */
export interface HeatmapCellData {
  /** Column key. Column order follows first appearance unless {@link HeatmapSeriesOptions.columns} pins it. */
  x: string;
  /** Row key. Row order follows first appearance unless {@link HeatmapSeriesOptions.rows} pins it. */
  y: string;
  /** Magnitude mapped onto the sequential color ramp. */
  value: number;
  /** Explicit fill override for this cell. Skips the ramp entirely. */
  color?: string;
}

/** {@link HeatmapCellData} as a heatmap series takes it: a `null` value leaves the cell empty. */
export type HeatmapCellInput = Omit<HeatmapCellData, 'value'> & { value: number | null };

/** Per-cell value labels drawn inside heatmap cells. */
export interface HeatmapCellLabelsOptions {
  /** Font size in CSS pixels. Default: 10. */
  fontSize?: number;
  /**
   * Value formatter. Default: decimals adapt to the value domain — 2 for
   * unit-scale domains (correlations), integers for wide ones, compact
   * notation (`1.2K`) past 1000.
   */
  format?: (value: number) => string;
}

/** Visual options for a heatmap series. */
export interface HeatmapSeriesOptions {
  /**
   * Sequential ramp stops, low → high, interpolated perceptually (OKLab).
   * Two stops give a classic single-hue ramp; three make a diverging scale.
   * Default: derived from the theme — a faint wash of the accent color near
   * the surface up to the full accent (`theme.heatmap.colors` when present).
   */
  colors?: string[];
  /** Domain minimum mapped to the first ramp stop. Default: the data minimum. */
  min?: number;
  /** Domain maximum mapped to the last ramp stop. Default: the data maximum. */
  max?: number;
  /** Surface gap between adjacent cells in CSS pixels. Default: 2. */
  gap?: number;
  /** Cell corner radius in CSS pixels. Default: 3. */
  cornerRadius?: number;
  /** Draw row labels (left) and column labels (bottom). Default: true. */
  axisLabels?: boolean;
  /** Draw the value inside each cell (auto-skipped when it doesn't fit). Default: false. */
  cellLabels?: boolean | HeatmapCellLabelsOptions;
  /** Explicit column order. Keys absent from the data render as empty columns. */
  columns?: string[];
  /** Explicit row order. Keys absent from the data render as empty rows. */
  rows?: string[];
  /**
   * Entrance duration per cell in milliseconds — the diagonal reveal wave on
   * first paint / grid-shape change. `0` paints instantly.
   * Default: chart animation config (600).
   */
  entryMs?: number;
  /**
   * Value/color tween duration when a cell's value changes in place, and the
   * hover-lift ease. `0` snaps. Default: chart animation config (300).
   */
  updateMs?: number;
}

/** One order-book level: `[price, size]`. */
export type DepthLevel = readonly [price: number, size: number];

/**
 * The order book a depth series plots. Levels come in any order: the series
 * sorts them and accumulates the depth itself — bids from the best bid down,
 * asks from the best ask up. A level whose size isn't above 0 is skipped.
 */
export interface DepthBook {
  bids: readonly DepthLevel[];
  asks: readonly DepthLevel[];
}

/**
 * Level changes `chart.updateData` merges into a depth series' book: a level
 * replaces the one at its price, and a size of 0 removes it.
 */
export type DepthBookDelta = Partial<DepthBook>;

/** Visual options for an order book series. */
export interface DepthSeriesOptions {
  /**
   * Half-width of the default view as a fraction of the mid price: `0.01`
   * shows mid ± 1%. Without it the view reaches from mid to the nearer of
   * the two outermost levels on both sides, so both walls fill it.
   * Default: fit to the book.
   */
  span?: number;
  /** Bid wall color. Default: the theme's up color. */
  bidColor?: string;
  /** Ask wall color. Default: the theme's down color. */
  askColor?: string;
  /** Step line width in CSS pixels. Default: `1`. */
  strokeWidth?: number;
  /** The `mid · spread` label at the top of the plot. Default: `true`. */
  midLabel?: boolean;
  /** The dashed vertical line at mid. Default: `true`. */
  midLine?: boolean;
  /**
   * CSS px over which the fill fades out at the left and right edges of the
   * plot, at most a third of its width; the line runs on to the edge. `0` turns
   * it off. Default: `140`.
   */
  fillFade?: number;
  /**
   * Initial-load reveal: both walls grow outward from mid while their steps
   * rise from 0. The full reveal lasts ~2× `introMs`. `0` disables it.
   * Default: chart animation config (500).
   */
  introMs?: number;
  /**
   * Morph from the book on screen to a new snapshot or delta, the mid
   * marker's glide, and the hover highlight's ease. `0` snaps.
   * Default: chart animation config (500).
   */
  updateMs?: number;
}

/** One stage of a sankey diagram. */
export interface SankeyNode {
  /** Key the links point at. */
  id: string;
  /** Text of the node label and tooltip. Default: the `id`. */
  label?: string;
  /** Node fill, and the default color of its outgoing links. Default: `options.colors`, then `theme.seriesColors`. */
  color?: string;
}

/** A flow between two nodes; its band width is proportional to `value`. */
export interface SankeyLink {
  /** `id` of the node the flow leaves. */
  source: string;
  /** `id` of the node the flow enters. */
  target: string;
  /** Size of the flow. A link without a finite value above 0 is skipped. */
  value: number;
  /**
   * Band color, used as is. Default: the source node's color, shaded by the band's
   * place at the source: the top band keeps it, and each next one mixes in more of
   * the theme background, in even steps of at most 40%, up to 60% for the bottom one.
   */
  color?: string;
}

/**
 * The graph a sankey series draws. Links must not form a cycle. A node no
 * link reaches is not drawn; links with the same `source` and `target` merge.
 */
export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

/** Node labels of a sankey series. */
export interface SankeyLabelsOptions {
  /** Text color. Default: the theme's tooltip text color. */
  color?: string;
  /** Fill of the rounded backdrop behind the text. Default: the theme background, translucent. */
  background?: string;
  /** Value formatter. Default: whole numbers as they are, others compact (`1.2K`). */
  format?: (value: number) => string;
}

/** Visual options for a sankey series. */
export interface SankeySeriesOptions {
  /** Node colors in node order, before `theme.seriesColors`. A node's own `color` wins. */
  colors?: string[];
  /** Node width in CSS pixels. Default: 12. */
  nodeWidth?: number;
  /** Vertical gap between the nodes of a column in CSS pixels. Default: 12. */
  nodePadding?: number;
  /** Opacity of the link bands, 0 to 1, over their (shaded) color. Default: 0.35. */
  linkOpacity?: number;
  /** `label · value` beside each node. `false` hides them. Default: `true`. */
  labels?: boolean | SankeyLabelsOptions;
  /**
   * First-data cascade in milliseconds, start to end: sources grow, bands run to
   * their targets and fill them, labels fade in. `0` paints at once.
   * Default: chart animation config (1400).
   */
  entryMs?: number;
  /**
   * Morph from the diagram on screen to new data, and the hover dim ease. `0` snaps.
   * Default: chart animation config (500).
   */
  updateMs?: number;
}

/** A band of a gauge's range, from the previous zone's `to` (or `min`) up to its own `to`. */
export interface GaugeZone {
  /** Upper bound of the zone. Zones are read in ascending `to` order. */
  to: number;
  /** Zone color. Default: the theme's gauge zone ramp, good → bad. */
  color?: string;
}

/** Visual options for a gauge series. */
export interface GaugeSeriesOptions {
  /** Start of the range. Default: 0. */
  min?: number;
  /** End of the range. Default: 100. */
  max?: number;
  /** Where the arc starts, in degrees clockwise from 12 o'clock. Default: -120. */
  startAngle?: number;
  /** Where the arc ends, in degrees clockwise from 12 o'clock, after `startAngle` and at most 360° on. Default: 120. */
  endAngle?: number;
  /**
   * Bands of the range, drawn along the arc. The value arc (or the needle) takes
   * the color of the zone the value ends in, and `color` past the last `to`.
   */
  zones?: GaugeZone[];
  /**
   * How the value arc (or the needle) takes its zone color. `'target'`: the color of the zone
   * the value ends in, so the entrance keeps one color and a glide blends into the new one.
   * `'morph'`: the color follows the arc as it moves and blends into the next zone near each
   * border. Default: `'target'`.
   */
  zoneColor?: 'target' | 'morph';
  /** `'arc'` fills the arc from `min` to the value; `'needle'` points at it. Default: `'arc'`. */
  style?: 'arc' | 'needle';
  /** Caption under the value. Also the series name. */
  label?: string;
  /** Text of the center value. Default: whole numbers as they are, others compact (`1.2K`). */
  format?: (value: number) => string;
  /** Value arc / needle color where no zone applies. Default: the first theme series color. */
  color?: string;
  /** Color of the unfilled arc. Default: `theme.gauge.trackColor`. */
  trackColor?: string;
  /** `min` and `max` in the arc's gap, next to its two ends; not drawn when the gap is under 60°. Default: `true`. */
  rangeLabels?: boolean;
  /**
   * First-data sweep in milliseconds: the arc grows from `min` while the track fades in.
   * `0` paints at once. Default: chart animation config (900).
   */
  entryMs?: number;
  /** Glide from the value on screen to a new one, in milliseconds. `0` snaps. Default: chart animation config (500). */
  updateMs?: number;
}

/**
 * Visual options for a radial progress series: one ring per value, for a few values.
 * Rings get thinner as more are added; past about 10, a bar chart reads better.
 */
export interface RadialProgressSeriesOptions {
  /** The value of a full ring. Default: 100. */
  max?: number;
  /** Where each ring starts, in degrees clockwise from 12 o'clock. Default: 0. */
  startAngle?: number;
  /** Where each ring ends, in degrees clockwise from 12 o'clock, after `startAngle` and at most 360° on. Default: 360. */
  endAngle?: number;
  /** Where the rings sit and how wide they are, e.g. `heroLayout()`. Default: `ringsLayout()`. */
  layout?: RadialLayout;
  /** How each ring is drawn, e.g. `tickRing()`. Default: `solidRing()`. */
  painter?: RingPainter;
  /**
   * The text of the rings: `heroCenter()` or `listCenter()` in the middle, `startLabels()`
   * or `headTags()` next to each ring. Default: none; use `<PieLegend>`.
   */
  labels?: RadialLabelPainter;
  /** Ring colors in data order, before `theme.seriesColors`. An item's own `color` wins. */
  colors?: string[];
  /** Color of the ring tracks. Default: `theme.gauge.trackColor`. */
  trackColor?: string;
  /**
   * First-data sweep in milliseconds: each ring grows from 0 while the tracks fade in.
   * `0` paints at once. Default: chart animation config (900).
   */
  entryMs?: number;
  /** Glide of each ring from its value on screen to a new one, in milliseconds. `0` snaps. Default: chart animation config (500). */
  updateMs?: number;
}

/** Side of the plot area the Y axis column sits on. */
export type YAxisPosition = 'left' | 'right';

/** What a {@link YScaleTransform.ticks} generator is asked to fill. */
export interface ScaleTickArgs {
  /** Visible value range. Both bounds are plottable on the scale. */
  min: number;
  max: number;
  /** Plot height in CSS pixels. */
  height: number;
  /** Minimum pixel gap between adjacent labels. */
  minSpacing: number;
  /** Desired label count from `<YAxis labelCount>`, or `null`. */
  labelCount: number | null;
  /**
   * Linear {1,2,5}×10^k ticks already spaced for this mapping (with the axis's
   * anti-flicker hold). Return this array itself to keep them.
   */
  linear: readonly number[];
}

/**
 * A non-linear value mapping for the Y axis — pass one as `axis.y.scale`.
 * `logScale()` is the built-in one; any monotonic mapping works, e.g. a
 * square-root axis:
 *
 * ```ts
 * const sqrtScale: YScaleTransform = {
 *   forward: Math.sqrt,
 *   inverse: (s) => s * s,
 *   isPlottable: (v) => v >= 0,
 * };
 * ```
 *
 * Everything vertical runs in the transformed space: pixel positions,
 * autoscale padding and the Y animations. Keep the object stable — define it
 * outside a component, since a new object means a new scale and resets the
 * Y range.
 */
export interface YScaleTransform {
  /** Value → scale space. Must be strictly increasing over the plottable values. */
  forward(value: number): number;
  /** Scale space → value; the exact inverse of {@link forward}. */
  inverse(scaled: number): number;
  /**
   * Whether a finite value has a position on this scale — one contiguous
   * interval, e.g. `v > 0` for log. Values that fail are skipped: a gap in a
   * line, no bar or candle, left out of autoscale. Default: every finite value.
   */
  isPlottable?(value: number): boolean;
  /**
   * The scale's own tick values (e.g. powers of ten), or `args.linear` to keep
   * the linear ticks — say, on a range too narrow for its own. Omitted: linear
   * ticks, spaced so the tightest gap on this mapping clears `minSpacing`.
   */
  ticks?(args: ScaleTickArgs): readonly number[];
  /** Label format while the scale's own ticks are in use. Default: the linear formatter. */
  format?(value: number): string;
}

/** Configuration for the Y axis. */
export interface YAxisConfig {
  /**
   * Side the axis column sits on — the plot area shifts right by the axis
   * width when it's `'left'`. The default edge fade follows the axis to
   * whichever side it's on. Default: 'right'.
   */
  position?: YAxisPosition;
  /** Width in CSS pixels. Default: 55, or 0 when every series is spatial (pie, heatmap). */
  width?: number;
  /**
   * Value mapping. Omitted: linear. `logScale()` gives each power of ten equal
   * height — for series spanning orders of magnitude; `logScale({ base: 2 })`
   * puts the ticks on powers of two. Any {@link YScaleTransform} works.
   *
   * Autoscale and Y animations run in the scale's space. Values the scale
   * can't place (≤ 0 on log) are skipped — a gap in a line, no bar or candle —
   * a fixed `min` / `max` it can't place falls back to `'auto'`, and area
   * fills close to the plot floor. Percent stacking is rejected when the
   * scale has no position for 0. Live — a different scale refits the Y range.
   */
  scale?: YScaleTransform;
  /** Minimum bound. Default: 'auto'. */
  min?: AxisBound;
  /** Maximum bound. Default: 'auto'. */
  max?: AxisBound;
  /** Whether the axis is visible. Default: true. When false, width is treated as 0. */
  visible?: boolean;
}

/**
 * What the X axis maps:
 * - `'time'` — epoch-ms timestamps, points keyed by `time` (default);
 * - `'numeric'` — plain numbers, points keyed by `x: number`, linear spacing;
 * - `'category'` — names, points keyed by `x: string`, one band per category in
 *   first-seen order across the series (or the order `categories` fixes).
 */
export type XAxisType = 'time' | 'numeric' | 'category';

/** Band spacing on a category axis, in fractions of one category step. */
export interface XAxisPadding {
  /** Gap between adjacent bands. Default: `0.3`. */
  inner?: number;
  /** Space before the first band and after the last one. Default: `0.2`. */
  outer?: number;
}

/** Configuration for the X axis. */
export interface XAxisConfig {
  /**
   * What the axis maps. Default: `'time'`. Read once at construction — a later
   * change is ignored with a dev warning; remount the chart (a React `key`) to
   * switch. Line, bar and band series work on every type, candlestick on
   * `'time'` only. Navigator, EdgeLoader / `onEdgeReached` and TimeRegion are
   * time-only.
   */
  type?: XAxisType;
  /** Band spacing on a category axis. Ignored on other types. Live. */
  padding?: XAxisPadding;
  /**
   * Band order on a category axis. Listed names take the first bands in list
   * order, also a name no series has data for (an empty band); names that are
   * not listed follow in first-seen order. Default: first-seen order. Ignored
   * on other types. Live.
   */
  categories?: string[];
  /**
   * Whether drag and wheel move the X range. The crosshair works either way.
   * Default: `true`, or `false` on a category axis. Live.
   */
  panZoom?: boolean;
  /** Height in CSS pixels. Default: 30, or 0 when every series is spatial (pie, heatmap). */
  height?: number;
  /** Whether the axis is visible. Default: true. When false, height is treated as 0. */
  visible?: boolean;
}

/** Grouped axis configuration for both axes. */
export interface AxisConfig {
  /** Y-axis configuration — width, bounds, and visibility of the value axis. */
  y?: YAxisConfig;
  /** X-axis configuration — type, height and visibility of the X axis. */
  x?: XAxisConfig;
}

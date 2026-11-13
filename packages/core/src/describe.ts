import type { ChartInstance } from './chart';
import { type SeriesRenderer, type TimeSeriesRenderer, isTimeSeriesRenderer } from './series/types';
import type { XAxisType, XRange, YRange } from './types';
import { type SeriesPoint, isGapPoint, pointValue } from './utils/point';
import type { DataNote, DataNoteSeverity } from './utils/poisoned-data-reporter';

/** How much a {@link DescribeIssue} matters: `error` hides data, `warning` likely misleads, `info` is worth a look. */
export type DescribeSeverity = DataNoteSeverity;

export type DescribeIssueCode =
  | 'no-size'
  | 'no-series'
  | 'no-data'
  | 'out-of-view'
  | 'hidden'
  | 'flat'
  | 'annotation-out-of-view'
  | 'data';

/** A likely mistake in what the chart shows, written so a person or an agent can act on it. */
export interface DescribeIssue {
  readonly code: DescribeIssueCode;
  readonly severity: DescribeSeverity;
  readonly message: string;
  readonly seriesId?: string;
  readonly annotationId?: string;
  /** For `code: 'data'`: what the chart did to the input, e.g. `unsorted`, `poisoned`, `epoch-seconds`. */
  readonly topic?: string;
}

export interface SeriesDescription {
  readonly id: string;
  /** Renderer kind: `line`, `bar`, `candlestick`, `pie`, … */
  readonly kind: string;
  readonly label?: string;
  readonly visible: boolean;
  readonly scale?: string;
  readonly layers: number;
  /** Points across all layers; slices for a pie; `null` when the series cannot count them. */
  readonly points: number | null;
  /** Points of layer 0 inside the visible X range; time-axis series only. */
  readonly pointsInView?: number;
  /** Points of layer 0 in view with no finite value, drawn as breaks. */
  readonly gapsInView?: number;
  /** X span of the data; time-axis series only. */
  readonly xRange?: XRange;
  /**
   * Value span of layer 0 in view, including where a line or band crosses the
   * view's edges (linear between the two points, so close on a curve). On a
   * multi-layer series, the drawn span (stacked totals on a stack).
   */
  readonly valuesInView?: YRange;
  readonly last?: { readonly x: number; readonly value: number };
  readonly slices?: readonly { readonly label: string; readonly value: number; readonly percent: number }[];
  /** What the chart dropped, fixed or misread in this series' input; empty for clean data. */
  readonly notes: readonly DataNote[];
}

export interface AnnotationsDescription {
  readonly markers: number;
  readonly regions: number;
  readonly lines: number;
}

export interface ChartDescription {
  /** Container size in CSS pixels. */
  readonly size: { readonly width: number; readonly height: number };
  readonly x: {
    readonly type: XAxisType;
    /** `null` before data arrives. */
    readonly visible: XRange | null;
    readonly data: XRange | null;
    /** Detected step between points: ms on a time axis. */
    readonly interval: number;
    /** Whether the view moves with the newest point. */
    readonly followsLatest: boolean;
  };
  /** Default Y scale range as mapped, padding included; `null` with no time-axis series. */
  readonly y: YRange | null;
  readonly series: readonly SeriesDescription[];
  readonly annotations: AnnotationsDescription;
  /** Most severe first. */
  readonly issues: readonly DescribeIssue[];
  /** The whole description as plain text. */
  readonly text: string;
  /** One or two sentences for a screen reader: chart kind, X span, and each series' values in view. */
  readonly summary: string;
}

/** What the chart passes in from its private state. */
export interface DescribeSeriesInput {
  readonly id: string;
  readonly renderer: SeriesRenderer;
  readonly visible: boolean;
  readonly scale?: string;
  readonly notes: readonly DataNote[];
}

export interface DescribeChartArgs {
  readonly chart: ChartInstance;
  readonly xType: XAxisType;
  readonly series: readonly DescribeSeriesInput[];
  /** Whether `text` lists the issues. Default `true`; the chart's screen-reader text leaves them out in production. */
  readonly issuesInText?: boolean;
}

/** Series the summary names before it says "and N more". */
const SUMMARY_SERIES = 3;

/** Slices of a pie the summary names before it says "and N more". */
const SUMMARY_SLICES = 5;

/** Kinds that draw a segment between neighboring points, so a segment can cross the view with no point inside it. */
const CONNECTED_KINDS: ReadonlySet<string> = new Set(['line', 'band']);

const SEVERITY_ORDER: Record<DescribeSeverity, number> = { error: 0, warning: 1, info: 2 };

/** Builds {@link ChartDescription}. Called through `ChartInstance.describe()`. */
export function describeChart(args: DescribeChartArgs): ChartDescription {
  const { chart, xType, series, issuesInText = true } = args;

  const size = chart.getMediaSize();
  const dataRange = chart.getDataRange();
  const visible = dataRange === null ? null : { ...chart.getVisibleRange() };
  const hasTimeSeries = series.some((entry) => isTimeSeriesRenderer(entry.renderer));
  const y = hasTimeSeries ? { ...chart.getYRange() } : null;

  const x = {
    type: xType,
    visible,
    data: dataRange === null ? null : { ...dataRange },
    interval: chart.getDataInterval(),
    followsLatest: chart.getAutoScroll(),
  };

  const seriesDescriptions = series.map((entry) => describeSeries({ chart, entry, visible }));
  const markers = chart.getMarkers();
  const regions = chart.getRegions();
  const lines = chart.getLines();
  const annotations = { markers: markers.length, regions: regions.length, lines: lines.length };

  const formatX = makeXFormatter({ chart, xType });
  const issues: DescribeIssue[] = [];

  if (size.width <= 0 || size.height <= 0) {
    issues.push({
      code: 'no-size',
      severity: 'error',
      message: `The container is ${size.width}×${size.height} px, so nothing is visible. Give the container a width and a height.`,
    });
  }

  if (series.length === 0) {
    issues.push({ code: 'no-series', severity: 'error', message: 'The chart has no series.' });
  }

  for (const description of seriesDescriptions) {
    issues.push(...seriesIssues({ description, formatX }), ...noteIssues(description));
  }

  if (visible !== null) {
    for (const marker of markers) {
      if (inRange(marker.time, visible)) continue;

      issues.push({
        code: 'annotation-out-of-view',
        severity: 'info',
        annotationId: marker.id,
        message: `Marker "${marker.label ?? marker.id}" at ${formatX(marker.time)} is outside the visible X range.`,
      });
    }

    for (const region of regions) {
      const to = region.to ?? Number.POSITIVE_INFINITY;
      const overlaps = region.from <= visible.to && to >= visible.from;
      if (overlaps) continue;

      issues.push({
        code: 'annotation-out-of-view',
        severity: 'info',
        annotationId: region.id,
        message: `Region "${region.label ?? region.id}" is outside the visible X range.`,
      });
    }
  }

  for (const line of lines) {
    const outside = referenceLineOutside({ chart, line, visible });
    if (outside === null) continue;

    issues.push({
      code: 'annotation-out-of-view',
      severity: 'warning',
      annotationId: line.id,
      message: `Reference line "${line.label ?? line.id}" at ${outside} is outside the visible range, so it does not show.`,
    });
  }

  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const partial = { size, x, y, series: seriesDescriptions, annotations, issues };

  const textDescription = issuesInText ? partial : { ...partial, issues: [] };

  return {
    ...partial,
    text: formatDescription({ description: textDescription, formatX, issuesInText }),
    summary: formatSummary({ description: partial, formatSpan: makeSpanFormatter({ chart, xType, formatX }) }),
  };
}

function describeSeries(args: {
  chart: ChartInstance;
  entry: DescribeSeriesInput;
  visible: XRange | null;
}): SeriesDescription {
  const { chart, entry, visible } = args;
  const { renderer } = entry;

  const base = {
    id: entry.id,
    kind: renderer.kind,
    label: chart.getSeriesLabel(entry.id),
    visible: entry.visible,
    scale: entry.scale,
    layers: renderer.getLayerCount(),
    notes: entry.notes,
  };

  if (!isTimeSeriesRenderer(renderer)) {
    const slices = renderer.getSliceInfo?.(chart.getTheme()) ?? null;
    const lastValue = renderer.getLastValue?.() ?? null;

    return {
      ...base,
      // `null` only for a custom renderer that cannot count: an empty built-in reports 0.
      points: renderer.getTotalLength?.() ?? null,
      slices: slices?.map(({ label, value, percent }) => ({ label, value, percent })),
      last: lastValue === null ? undefined : { x: 0, value: lastValue },
    };
  }

  const bounds = renderer.getTimeBounds();
  const points = countPoints({ renderer, bounds });
  const lastPoint = renderer.getLastDataPoint();
  const last = lastPoint === null ? undefined : { x: lastPoint.time, value: pointValue(lastPoint) };

  if (visible === null || bounds === null) {
    return { ...base, points, last };
  }

  // The store also returns the point past each edge, so lines reach the plot edge:
  // counts read only the points inside, values also read the segments that cross in.
  const read: readonly SeriesPoint[] = renderer.getVisibleDataPoints(visible.from, visible.to);
  const inView = read.filter((point) => inRange(point.time, visible));
  const gapsInView = inView.filter((point) => isGapPoint(point)).length;

  const connected = CONNECTED_KINDS.has(renderer.kind);
  const crossing = connected ? crossingExtent({ points: read, edges: [visible.from, visible.to] }) : null;
  const pointExtent = extentOf(inView);

  let valuesInView: YRange | null = null;
  if (base.layers > 1) {
    const drawn = pointExtent !== null || crossing !== null;
    valuesInView = drawn ? renderer.getValueRange(visible.from, visible.to) : null;
  } else {
    valuesInView = mergeExtents(pointExtent, crossing);
  }

  return {
    ...base,
    points,
    pointsInView: inView.length,
    gapsInView,
    xRange: { from: bounds.first, to: bounds.last },
    valuesInView: valuesInView === null ? undefined : { ...valuesInView },
    last,
  };
}

/** A custom renderer may have no `getTotalLength`: count its whole span instead. */
function countPoints(args: { renderer: TimeSeriesRenderer; bounds: { first: number; last: number } | null }): number {
  const { renderer, bounds } = args;

  const total = renderer.getTotalLength?.();
  if (total !== undefined) return total;
  if (bounds === null) return 0;

  return renderer.getVisibleDataPoints(bounds.first, bounds.last).length;
}

/** Min and max finite value of `points`: low/high of a candle or band, `value` otherwise. */
function extentOf(points: readonly SeriesPoint[]): YRange | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    const low = lowOf(point);
    const high = highOf(point);
    if (Number.isFinite(low)) min = Math.min(min, low);
    if (Number.isFinite(high)) max = Math.max(max, high);
  }

  if (min > max) return null;

  return { min, max };
}

/** Values where a segment between two finite neighbors crosses one of `edges`; `null` when none does. */
function crossingExtent(args: { points: readonly SeriesPoint[]; edges: readonly number[] }): YRange | null {
  const { points, edges } = args;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined || isGapPoint(a) || isGapPoint(b)) continue;

    for (const edge of edges) {
      const crosses = a.time < edge && edge < b.time;
      if (!crosses) continue;

      const t = (edge - a.time) / (b.time - a.time);
      min = Math.min(min, lerp({ from: lowOf(a), to: lowOf(b), t }));
      max = Math.max(max, lerp({ from: highOf(a), to: highOf(b), t }));
    }
  }

  if (min > max) return null;

  return { min, max };
}

function mergeExtents(a: YRange | null, b: YRange | null): YRange | null {
  if (a === null) return b;
  if (b === null) return a;

  return { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) };
}

/** Low of a candle or band, the value otherwise. */
function lowOf(point: SeriesPoint): number {
  return 'low' in point ? point.low : pointValue(point);
}

/** High of a candle or band, the value otherwise. */
function highOf(point: SeriesPoint): number {
  return 'high' in point ? point.high : pointValue(point);
}

function lerp(args: { from: number; to: number; t: number }): number {
  return args.from + (args.to - args.from) * args.t;
}

function noteIssues(description: SeriesDescription): DescribeIssue[] {
  const name = seriesName(description);

  return description.notes.map((note) => ({
    code: 'data',
    severity: note.severity,
    seriesId: description.id,
    topic: note.topic,
    message: `${name}: ${note.message}`,
  }));
}

function seriesIssues(args: { description: SeriesDescription; formatX: (x: number) => string }): DescribeIssue[] {
  const { description, formatX } = args;
  const name = seriesName(description);
  const seriesId = description.id;

  if (description.points === 0) {
    return [{ code: 'no-data', severity: 'error', seriesId, message: `${name} has no data.` }];
  }

  if (!description.visible) {
    return [{ code: 'hidden', severity: 'info', seriesId, message: `${name} is hidden.` }];
  }

  const { xRange, valuesInView } = description;
  if (xRange !== undefined && valuesInView === undefined) {
    return [
      {
        code: 'out-of-view',
        severity: 'error',
        seriesId,
        message:
          `${name} has data from ${formatX(xRange.from)} to ${formatX(xRange.to)}, ` +
          'but no value of it is in the visible range.',
      },
    ];
  }

  const pointsInView = description.pointsInView ?? 0;
  const flat = valuesInView !== undefined && valuesInView.min === valuesInView.max && pointsInView > 1;
  if (flat) {
    return [
      {
        code: 'flat',
        severity: 'info',
        seriesId,
        message: `Every value of ${name} in view is ${formatNumber(valuesInView.min)}.`,
      },
    ];
  }

  return [];
}

/** The value or time of a reference line outside its range, formatted; `null` when it shows. */
function referenceLineOutside(args: {
  chart: ChartInstance;
  line: ReturnType<ChartInstance['getLines']>[number];
  visible: XRange | null;
}): string | null {
  const { chart, line, visible } = args;

  if (line.orientation === 'vertical') {
    if (visible === null || inRange(line.coord, visible)) return null;

    return makeXFormatter({ chart, xType: 'time' })(line.coord);
  }

  const range = chart.getYScale(line.scale).getRange();
  const shows = line.coord >= range.min && line.coord <= range.max;
  if (shows) return null;

  return formatNumber(line.coord);
}

function formatDescription(args: {
  description: DescriptionBody;
  formatX: (x: number) => string;
  issuesInText: boolean;
}): string {
  const { description, formatX, issuesInText } = args;
  const { size, x, y, series, annotations, issues } = description;
  const out: string[] = [];

  const kinds = [...new Set(series.map((s) => s.kind))].join(' + ') || 'empty';
  // `y` exists only with a time-axis series; a pie or a gauge has no X axis to name.
  const axis = y === null ? '' : `, ${x.type} X axis`;
  out.push(`Chart: ${kinds}, ${Math.round(size.width)}×${Math.round(size.height)} px${axis}.`);

  if (x.visible !== null && x.data !== null) {
    const follow = x.followsLatest ? ' The view follows the newest point.' : '';
    out.push(
      `X: visible ${formatX(x.visible.from)} – ${formatX(x.visible.to)}; ` +
        `data ${formatX(x.data.from)} – ${formatX(x.data.to)}; ` +
        `step ${formatInterval({ ms: x.interval, xType: x.type })}.${follow}`,
    );
  }

  if (y !== null) {
    out.push(`Y: ${formatNumber(y.min)} – ${formatNumber(y.max)}.`);
  }

  if (series.length > 0) {
    out.push('Series:');
  }

  for (const s of series) {
    out.push(`- ${seriesLine({ series: s, formatX })}`);
  }

  const annotationTotal = annotations.markers + annotations.regions + annotations.lines;
  if (annotationTotal > 0) {
    out.push(
      `Annotations: ${annotations.markers} marker(s), ${annotations.regions} region(s), ${annotations.lines} line(s).`,
    );
  }

  if (!issuesInText) return out.join('\n');

  out.push(issues.length === 0 ? 'Issues: none.' : 'Issues:');
  for (const issue of issues) {
    out.push(`- ${issue.severity}: ${issue.message}`);
  }

  return out.join('\n');
}

type DescriptionBody = Omit<ChartDescription, 'text' | 'summary'>;

function formatSummary(args: { description: DescriptionBody; formatSpan: (range: XRange) => string }): string {
  const { description, formatSpan } = args;
  const shown = description.series.filter((s) => s.visible);
  const kinds = [...new Set(shown.map((s) => s.kind))];

  const kindText = kinds.length === 0 ? 'Empty chart' : `${capitalize(kinds.join(' and '))} chart`;
  const { visible } = description.x;
  const span = visible === null ? '' : `, ${formatSpan(visible)}`;
  const sentences = [`${kindText}${span}.`];

  for (const [index, series] of shown.slice(0, SUMMARY_SERIES).entries()) {
    const name = series.label ?? `Series ${index + 1}`;
    const facts = summaryFacts(series);
    if (facts.length > 0) sentences.push(`${name}: ${facts.join(', ')}.`);
  }

  const more = shown.length - SUMMARY_SERIES;
  if (more > 0) sentences.push(`And ${more} more series.`);

  return sentences.join(' ');
}

function summaryFacts(series: SeriesDescription): string[] {
  const facts: string[] = [];

  if (series.valuesInView !== undefined) {
    const { min, max } = series.valuesInView;
    facts.push(min === max ? `${formatNumber(min)} in view` : `${formatNumber(min)} to ${formatNumber(max)} in view`);
  }

  if (series.last !== undefined && series.slices === undefined) {
    facts.push(`last ${formatNumber(series.last.value)}`);
  }

  const slices = series.slices ?? [];
  for (const slice of slices.slice(0, SUMMARY_SLICES)) {
    facts.push(`${slice.label} ${formatNumber(slice.percent)}%`);
  }

  if (slices.length > SUMMARY_SLICES) facts.push(`and ${slices.length - SUMMARY_SLICES} more`);

  return facts;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function seriesLine(args: { series: SeriesDescription; formatX: (x: number) => string }): string {
  const { series, formatX } = args;
  const parts: string[] = [];

  const label = series.label === undefined ? '' : ` "${series.label}"`;
  const head = `${series.id} (${series.kind}${label})`;

  if (series.layers > 1) parts.push(`${series.layers} layers`);
  if (!series.visible) parts.push('hidden');
  if (series.points !== null && series.slices === undefined) parts.push(`${series.points} points`);
  if (series.pointsInView !== undefined) parts.push(`${series.pointsInView} in view`);
  if (series.gapsInView !== undefined && series.gapsInView > 0) parts.push(`${series.gapsInView} gaps in view`);

  if (series.valuesInView !== undefined) {
    parts.push(`values ${formatNumber(series.valuesInView.min)} – ${formatNumber(series.valuesInView.max)}`);
  }

  const timeAxisLast = series.last !== undefined && series.xRange !== undefined;
  if (series.last !== undefined) {
    const at = timeAxisLast ? ` at ${formatX(series.last.x)}` : '';
    parts.push(`last ${formatNumber(series.last.value)}${at}`);
  }

  if (series.slices !== undefined && series.slices.length > 0) {
    const slices = series.slices
      .map((slice) => `${slice.label} ${formatNumber(slice.value)} (${formatNumber(slice.percent)}%)`)
      .join(', ');
    parts.push(`${series.slices.length} slices: ${slices}`);
  }

  return parts.length === 0 ? head : `${head}: ${parts.join(', ')}`;
}

function seriesName(series: SeriesDescription): string {
  return series.label === undefined ? `Series "${series.id}"` : `Series "${series.label}" (${series.id})`;
}

function makeXFormatter(args: { chart: ChartInstance; xType: XAxisType }): (x: number) => string {
  const { chart, xType } = args;

  if (xType === 'time') {
    return (x) => {
      if (!Number.isFinite(x)) return String(x);

      // Whole seconds: a padded view edge lands on fractions nobody needs.
      const seconds = Math.round(x / 1000) * 1000;

      return new Date(seconds).toISOString().replace(':00.000Z', 'Z').replace('.000Z', 'Z');
    };
  }

  if (xType === 'category') {
    const categories = chart.timeScale.getCategories();

    return (x) => categories[Math.round(x)] ?? formatNumber(x);
  }

  return formatNumber;
}

/** A visible X span as a screen reader should say it: dates in the chart's locale and time zone. */
function makeSpanFormatter(args: {
  chart: ChartInstance;
  xType: XAxisType;
  formatX: (x: number) => string;
}): (range: XRange) => string {
  const { chart, xType, formatX } = args;
  const plain = (range: XRange) => `${formatX(range.from)} to ${formatX(range.to)}`;

  if (xType !== 'time') return plain;

  const format = new Intl.DateTimeFormat(chart.getLocale() ?? 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: chart.getTimeZone(),
  });

  return (range) => {
    const ordered = Number.isFinite(range.from) && Number.isFinite(range.to) && range.from <= range.to;
    if (!ordered) return plain(range);

    return format.formatRange(range.from, range.to);
  };
}

const DURATIONS: readonly [string, number][] = [
  ['d', 86_400_000],
  ['h', 3_600_000],
  ['m', 60_000],
  ['s', 1_000],
];

function formatInterval(args: { ms: number; xType: XAxisType }): string {
  const { ms, xType } = args;

  if (xType !== 'time') return formatNumber(ms);

  for (const [unit, size] of DURATIONS) {
    if (ms >= size && ms % size === 0) return `${ms / size}${unit}`;
  }

  return `${formatNumber(ms)}ms`;
}

/** Six significant digits: keeps 1e-6 prices and large volumes readable without locale noise. */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);

  return String(Number(value.toPrecision(6)));
}

function inRange(value: number, range: XRange): boolean {
  return value >= range.from && value <= range.to;
}

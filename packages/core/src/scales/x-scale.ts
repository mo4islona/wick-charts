import type { XAxisPadding, XAxisType, XRange } from '../types';
import { clamp } from '../utils/math';
import { crispCenterOffset } from '../utils/pixel-grid';
import { formatTime, niceTimeIntervals } from '../utils/time';
import { AxisTickTracker } from './tick-tracker';
import { timeTicks } from './time-ticks';
import { pickNiceCeiling, pickNiceFloor } from './y-scale';

/** Hard cap on generated ticks — defence-in-depth against pathological inputs. */
const MAX_TICKS = 50;

/** Default minimum pixel gap between adjacent X labels when no config is supplied. */
const DEFAULT_MIN_LABEL_SPACING = 80;

/** Default band spacing on a category axis, in fractions of a step. */
const DEFAULT_INNER_PADDING = 0.3;
const DEFAULT_OUTER_PADDING = 0.2;

/** Custom time-tick formatter, mirroring {@link YScale}'s `ValueFormatter` contract. */
export type TimeFormatter = (timestamp: number, interval: number) => string;

/**
 * X label formatter for any axis type (`<XAxis format>`): `x` is epoch ms on a
 * time axis, the number on a numeric axis, the category name on a category
 * axis; `step` is the tick spacing in the internal coordinate.
 */
export type XAxisFormatter = (x: number | string, step: number) => string;

/** Custom tick-value generator — replaces the built-in `niceTimeIntervals` tier resolution entirely when installed. */
export type TimeTickGenerator = (range: XRange, dataInterval: number) => number[];

/** A category layout change in flight — see {@link XScale.setBandSlide}. */
export interface BandSlide {
  from: ReadonlyMap<number, number>;
  entering: ReadonlySet<number>;
  progress: number;
}

export class XScale {
  /**
   * Shared fade state for time ticks. Grid lines (canvas) and DOM tick labels
   * read opacity from the same tracker, so a tick fading in/out looks
   * identical on both surfaces.
   */
  readonly tickTracker = new AxisTickTracker();

  private type: XAxisType = 'time';
  /** Category names in band order — category `i` is centred on coordinate `i`. */
  private categories: readonly string[] = [];
  /** Category axis: bands sliding to a new index — new index → coordinate it slides from — and the bands entering. */
  private bandSlide: BandSlide | null = null;
  private bandPadding: Required<XAxisPadding> = { inner: DEFAULT_INNER_PADDING, outer: DEFAULT_OUTER_PADDING };

  private from = 0;
  private to = 0;
  private width = 1;
  private pixelRatio = 1;
  private dataInterval: number | null = null;
  /** Media px the series draw past each pane edge — see {@link getDrawRange}. */
  private overscan = { left: 0, right: 0 };

  // Label density knobs — written by <TimeAxis labelCount=… minLabelSpacing=…>.
  private labelCountHintValue: number | null = null;
  private minSpacingValue: number | null = null;

  /** Custom formatter, installed by `<XAxis format=…>`. */
  private customFormat: XAxisFormatter | null = null;
  /** Custom tick generator — bypasses tier resolution in `niceTickValues` when set. */
  private customTickGenerator: TimeTickGenerator | null = null;
  private localeValue: string | undefined;
  private timeZoneValue: string | undefined;

  private resolvedInterval: number | null = null;
  private lastInterval: number | null = null;
  /**
   * "want" (desired interval post-floor) at the time lastInterval was snapped.
   * Hysteresis band anchors to this so micro range drift back across a tier
   * boundary doesn't flip the label density — mirrors YScale, see there for
   * the full reasoning.
   */
  private lastWant: number | null = null;
  /** Identifies the dataInterval bucket whose tier list drove lastInterval. */
  private lastBucketKey: number | null = null;

  private get labelCountHint(): number | null {
    return this.labelCountHintValue;
  }

  private get minLabelSpacing(): number {
    return this.minSpacingValue ?? DEFAULT_MIN_LABEL_SPACING;
  }

  update(range: XRange, mediaWidth: number, pixelRatio: number, dataInterval?: number): void {
    this.from = range.from;
    this.to = range.to;
    this.width = mediaWidth;
    this.pixelRatio = pixelRatio;

    if (this.type === 'time' && dataInterval !== undefined && dataInterval > 0) {
      const newBucket = bucketKey(dataInterval);
      if (this.lastBucketKey !== null && this.lastBucketKey !== newBucket) {
        // Data granularity shifted tier — discard cached interval so next
        // resolve can re-select from the new niceTimeIntervals() list.
        this.resetHysteresis();
      }
      this.lastBucketKey = newBucket;
      this.dataInterval = dataInterval;
    }

    this.resolveInterval();
  }

  setLabelCount(n: number | null | undefined): void {
    this.labelCountHintValue = normalizeLabelCount(n);
    this.resetHysteresis();
    this.resolveInterval();
  }

  setMinSpacing(px: number | null | undefined): void {
    this.minSpacingValue = normalizeSpacing(px);
    this.resetHysteresis();
    this.resolveInterval();
  }

  /**
   * Install (or clear) a custom tick-label formatter. A {@link TimeFormatter}
   * fits a time axis, where every `x` is a timestamp.
   */
  setFormat(fn: XAxisFormatter | null): void;
  setFormat(fn: TimeFormatter): void;
  setFormat(fn: XAxisFormatter | TimeFormatter | null): void {
    this.customFormat = fn as XAxisFormatter | null;
  }

  /** Read back the currently installed formatter — null when the built-in is active. */
  getFormat(): XAxisFormatter | null {
    return this.customFormat;
  }

  /** What the axis maps. Set once by the chart at construction. */
  setType(type: XAxisType): void {
    this.type = type;
    this.resetHysteresis();
    this.resolveInterval();
  }

  getType(): XAxisType {
    return this.type;
  }

  /** Category names in band order (category axis). */
  setCategories(names: readonly string[]): void {
    this.categories = names;
  }

  getCategories(): readonly string[] {
    return this.categories;
  }

  /** Slide the listed bands from their old coordinate to their index as `progress` goes 0 → 1; `null` ends it. */
  setBandSlide(slide: BandSlide | null): void {
    this.bandSlide = slide;
  }

  /** Presence 0 → 1 of a band that entered with the slide; `1` for every other band. */
  bandEnterProgress(band: number): number {
    const slide = this.bandSlide;
    if (slide === null || !slide.entering.has(band)) return 1;

    return slide.progress;
  }

  /** Where a coordinate draws mid-slide — itself unless its band is sliding. */
  slidCoord(time: number): number {
    const from = this.bandSlide?.from.get(time);
    if (this.bandSlide === null || from === undefined) return time;

    return from + (time - from) * this.bandSlide.progress;
  }

  /** Band spacing on a category axis; an omitted or invalid side takes its default. */
  setBandPadding(padding: XAxisPadding | undefined): void {
    this.bandPadding = {
      inner: normalizeFraction({ value: padding?.inner, fallback: DEFAULT_INNER_PADDING, max: 1 }),
      outer: normalizeFraction({ value: padding?.outer, fallback: DEFAULT_OUTER_PADDING, max: Infinity }),
    };
  }

  getBandPadding(): Required<XAxisPadding> {
    return this.bandPadding;
  }

  /**
   * The coordinate range that fits every band with its outer padding, or
   * `null` without categories. Band `i` spans `i ± (1 - inner) / 2`.
   */
  bandRange(): XRange | null {
    const count = this.categories.length;
    if (count === 0) return null;

    const halfBand = (1 - this.bandPadding.inner) / 2;
    const outer = this.bandPadding.outer;

    return { from: -halfBand - outer, to: count - 1 + halfBand + outer };
  }

  /** Width of one category band in physical pixels — what a bar on a category axis fills. */
  bandWidthBitmap(): number {
    return Math.max(1, Math.round(this.barWidthMedia(1 - this.bandPadding.inner) * this.pixelRatio));
  }

  /**
   * The internal coordinate the pointer resolves to: the nearest band's index
   * on a category axis, `coord` itself elsewhere.
   */
  snapToBand(coord: number): number {
    const count = this.categories.length;
    if (this.type !== 'category' || count === 0) return coord;

    return clamp(Math.round(coord), 0, count - 1);
  }

  /**
   * An internal coordinate in the axis domain: the category name at that
   * band on a category axis (`''` without categories), the number itself on
   * time and numeric axes.
   */
  domainValue(coord: number): number | string {
    if (this.type !== 'category') return coord;

    return this.categories[this.snapToBand(coord)] ?? '';
  }

  /**
   * Install (or clear) a custom tick-value generator. When set, it replaces
   * `niceTimeIntervals` tier resolution entirely — `niceTickValues` calls it
   * directly with the current range and reports its own tick spacing.
   */
  setTickGenerator(fn: TimeTickGenerator | null): void {
    this.customTickGenerator = fn;
    this.resetHysteresis();
  }

  /** BCP 47 locale applied to the built-in formatter. Ignored while a custom `setFormat` is installed. */
  setLocale(locale: string | undefined): void {
    this.localeValue = locale;
  }

  getLocale(): string | undefined {
    return this.localeValue;
  }

  /** IANA timezone applied to the built-in formatter. Ignored while a custom `setFormat` is installed. */
  setTimeZone(timeZone: string | undefined): void {
    this.timeZoneValue = timeZone;
  }

  getTimeZone(): string | undefined {
    return this.timeZoneValue;
  }

  /**
   * Format an internal X coordinate for display — a tick, the crosshair, a
   * tooltip header. A custom formatter (via {@link setFormat}) gets the
   * domain value; otherwise a time axis formats the timestamp with the
   * installed locale/timezone, a numeric axis prints a locale number, and a
   * category axis prints the name.
   */
  formatX(coord: number, interval: number): string {
    const x = this.domainValue(coord);
    if (this.customFormat) return this.customFormat(x, interval);

    if (this.type === 'category') return String(x);
    if (this.type === 'numeric') return formatNumber({ value: coord, step: interval, locale: this.localeValue });

    return formatTime(coord, interval, { locale: this.localeValue, timeZone: this.timeZoneValue });
  }

  /**
   * Format a data point's X for a tooltip or info-bar header. Like
   * {@link formatX}, except a numeric axis prints the value with its own
   * decimals — `1.25` stays `1.25` where the step would round it.
   */
  formatPointX(coord: number, interval: number): string {
    if (this.type !== 'numeric' || this.customFormat) return this.formatX(coord, interval);

    return coord.toLocaleString(this.localeValue ?? 'en-US', { maximumFractionDigits: 20 });
  }

  private resetHysteresis(): void {
    this.lastInterval = null;
    this.lastWant = null;
  }

  timeToX(time: number): number {
    if (this.to <= this.from) return 0;

    const coord = this.slidCoord(time);

    return ((coord - this.from) / (this.to - this.from)) * this.width;
  }

  /** X in physical (bitmap) pixels, snapped to the pixel grid — for
   *  axis-aligned edges that have to stay crisp. */
  timeToBitmapX(time: number): number {
    return Math.round(this.timeToBitmapXExact(time));
  }

  /** Same in physical pixels, off the grid — see {@link YScale.valueToBitmapYExact}. */
  timeToBitmapXExact(time: number): number {
    return this.timeToX(time) * this.pixelRatio;
  }

  /**
   * X position in CSS pixels of the *stroke center* the canvas grid draws for
   * `time`. DOM axis labels position off this instead of raw {@link timeToX}
   * so text and gridline share one pixel grid.
   */
  timeToSnappedX(time: number): number {
    return (this.timeToBitmapX(time) + crispCenterOffset(this.pixelRatio)) / this.pixelRatio;
  }

  xToTime(x: number): number {
    if (this.to <= this.from) return this.from;

    return this.from + (x / this.width) * (this.to - this.from);
  }

  pixelDeltaToTimeDelta(pixelDelta: number): number {
    if (this.to <= this.from) return 0;

    return (pixelDelta / this.width) * (this.to - this.from);
  }

  barWidthMedia(dataInterval: number): number {
    if (this.to <= this.from) return 0;

    return (dataInterval / (this.to - this.from)) * this.width;
  }

  barWidthBitmap(dataInterval: number): number {
    return Math.max(1, Math.round(this.barWidthMedia(dataInterval) * this.pixelRatio));
  }

  /**
   * "Nice" tick values. A time axis puts them on calendar boundaries in the
   * installed time zone (Jan 1, the 1st of a month, midnight), so their gaps
   * vary; `tickInterval` is the tier's nominal span. Resolution uses the cached
   * `dataInterval` set by `update()`; callers that bypass `update()` can
   * still pass it here for back-compat.
   */
  niceTickValues(dataInterval: number): { ticks: number[]; tickInterval: number } {
    if (this.to <= this.from) return { ticks: [], tickInterval: 0 };

    if (this.customTickGenerator) {
      const ticks = this.customTickGenerator({ from: this.from, to: this.to }, dataInterval).slice(0, MAX_TICKS);
      const tickInterval = ticks.length >= 2 ? ticks[1] - ticks[0] : dataInterval;

      return { ticks, tickInterval };
    }

    if (this.type === 'category') return this.bandTicks();

    // Back-compat: if a caller hands a different dataInterval than was cached
    // via update(), re-resolve rather than returning a stale tick list.
    if (this.type === 'time' && this.dataInterval !== dataInterval) {
      const newBucket = bucketKey(dataInterval);
      if (this.lastBucketKey !== null && this.lastBucketKey !== newBucket) {
        this.resetHysteresis();
      }
      this.lastBucketKey = newBucket;
      this.dataInterval = dataInterval;
      this.resolveInterval();
    }

    if (this.resolvedInterval == null) return { ticks: [], tickInterval: 0 };

    const interval = this.resolvedInterval;
    if (this.type === 'time') {
      const ticks = timeTicks({ from: this.from, to: this.to, interval, timeZone: this.timeZoneValue, max: MAX_TICKS });

      return { ticks, tickInterval: interval };
    }

    const start = Math.ceil(this.from / interval) * interval;
    const count = Math.max(0, Math.min(MAX_TICKS, Math.floor((this.to - start) / interval) + 1));

    const ticks: number[] = [];
    for (let i = 0; i < count; i++) ticks.push(start + i * interval);

    return { ticks, tickInterval: interval };
  }

  /** One tick per category whose band centre is in view, where it draws mid-slide. */
  private bandTicks(): { ticks: number[]; tickInterval: number } {
    const ticks: number[] = [];
    for (let i = 0; i < this.categories.length; i++) {
      const coord = this.slidCoord(i);
      if (coord >= this.from && coord <= this.to) ticks.push(i);
    }

    return { ticks, tickInterval: 1 };
  }

  getRange(): XRange {
    return { from: this.from, to: this.to };
  }

  /** Media px a series draws past each pane edge: the strip the pane clip opens under a Y-axis column. */
  setOverscan(overscan: { left: number; right: number }): void {
    this.overscan = overscan;
  }

  /**
   * The range a series reads its data over: {@link getRange} plus the
   * {@link setOverscan} strips. Data sliding under a Y-axis column then melts
   * in its fade instead of ending one point past the pane edge.
   */
  getDrawRange(): XRange {
    if (this.to <= this.from || this.width <= 0) return this.getRange();

    const perPx = (this.to - this.from) / this.width;

    return { from: this.from - this.overscan.left * perPx, to: this.to + this.overscan.right * perPx };
  }

  getMediaWidth(): number {
    return this.width;
  }

  /**
   * Resolve the next tick interval. Walks `niceTimeIntervals(dataInterval)`
   * looking for the smallest tier ≥ desired spacing; retains the previous
   * tier inside a ratio band so micro pan/zoom doesn't flip label density.
   */
  private resolveInterval(): void {
    if (this.type === 'numeric') {
      this.resolveNumericInterval();

      return;
    }

    if (this.to <= this.from || this.width <= 0 || this.dataInterval == null || this.dataInterval <= 0) {
      this.resolvedInterval = null;
      return;
    }

    const intervals = niceTimeIntervals(this.dataInterval);
    const range = this.to - this.from;
    const timePerPixel = range / this.width;
    const floor = timePerPixel * this.minLabelSpacing;

    let want: number;
    if (this.labelCountHint != null) {
      // Bias gaps up by one so the ceiling snap onto `niceTimeIntervals`
      // doesn't regularly swallow a tick — mirrors YScale's hint semantics.
      const targetGaps = Math.max(1, this.labelCountHint);
      want = Math.max(range / targetGaps, floor);
    } else {
      want = floor;
    }

    if (this.lastInterval != null && this.lastWant != null && intervals.includes(this.lastInterval)) {
      const within = want >= this.lastWant * 0.8 && want <= this.lastWant * 1.25;
      // Resize guard: a width change shifts `floor` without touching
      // `lastWant`. Reusing a cached interval that no longer clears the
      // pixel floor would silently violate `minLabelSpacing`.
      const satisfiesFloor = this.lastInterval >= floor;
      if (within && satisfiesFloor) {
        this.resolvedInterval = this.lastInterval;
        return;
      }
    }

    let candidate = intervals[intervals.length - 1];
    let candidateIdx = intervals.length - 1;
    for (let i = 0; i < intervals.length; i++) {
      if (intervals[i] >= want) {
        candidate = intervals[i];
        candidateIdx = i;
        break;
      }
    }

    // If the ceiling snap leaves fewer than labelCount ticks visible, step
    // one tier down — as long as it still satisfies the pixel floor.
    if (this.labelCountHint != null && candidateIdx > 0 && this.countTicks(candidate) < this.labelCountHint) {
      const prev = intervals[candidateIdx - 1];
      if (prev >= floor) candidate = prev;
    }

    this.resolvedInterval = candidate;
    this.lastInterval = candidate;
    this.lastWant = want;
  }

  /**
   * Numeric counterpart of the time-tier walk: the {1,2,5}×10^k step that
   * clears `minLabelSpacing` and targets `labelCount`, with the same hysteresis band.
   */
  private resolveNumericInterval(): void {
    if (this.to <= this.from || this.width <= 0) {
      this.resolvedInterval = null;

      return;
    }

    const range = this.to - this.from;
    const floor = (range / this.width) * this.minLabelSpacing;
    const hinted = this.labelCountHint != null ? range / Math.max(1, this.labelCountHint) : 0;
    const want = Math.max(hinted, floor);

    if (this.lastInterval != null && this.lastWant != null) {
      const within = want >= this.lastWant * 0.8 && want <= this.lastWant * 1.25;
      const satisfiesFloor = this.lastInterval >= floor;
      if (within && satisfiesFloor) {
        this.resolvedInterval = this.lastInterval;

        return;
      }
    }

    let candidate = pickNiceCeiling(want);
    const tooFewTicks = this.labelCountHint != null && this.countTicks(candidate) < this.labelCountHint;
    if (tooFewTicks) {
      const lower = pickNiceFloor(want);
      if (lower >= floor) candidate = lower;
    }

    this.resolvedInterval = candidate;
    this.lastInterval = candidate;
    this.lastWant = want;
  }

  private countTicks(interval: number): number {
    if (!(interval > 0)) return 0;
    const start = Math.ceil(this.from / interval) * interval;

    return Math.max(0, Math.floor((this.to - start) / interval) + 1);
  }
}

/** Cheap cache key — dataInterval values that yield the same niceTimeIntervals() list. */
function bucketKey(dataInterval: number): number {
  const MINUTE = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  if (dataInterval < MINUTE) return 0;
  if (dataInterval < HOUR) return 1;
  if (dataInterval < DAY) return 2;

  return 3;
}

/** A locale number with as many decimals as `step` needs (`step` 0.5 → one). */
function formatNumber(args: { value: number; step: number; locale: string | undefined }): string {
  const { value, step, locale } = args;
  const stepDecimals = Number.isFinite(step) && step > 0 ? -Math.floor(Math.log10(step)) : 2;
  const maximumFractionDigits = clamp(stepDecimals, 0, 20);

  return value.toLocaleString(locale ?? 'en-US', { maximumFractionDigits });
}

function normalizeFraction(args: { value: number | undefined; fallback: number; max: number }): number {
  const { value, fallback, max } = args;
  if (value === undefined || !Number.isFinite(value) || value < 0) return fallback;

  return Math.min(value, max);
}

function normalizeLabelCount(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= 2 ? Math.floor(n) : null;
}

function normalizeSpacing(px: number | null | undefined): number | null {
  return typeof px === 'number' && Number.isFinite(px) && px > 0 ? px : null;
}

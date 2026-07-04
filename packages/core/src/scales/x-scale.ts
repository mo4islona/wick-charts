import type { XRange } from '../types';
import { type TimeFormatOptions, formatTime, niceTimeIntervals } from '../utils/time';
import { AxisTickTracker } from './tick-tracker';

/** Hard cap on generated ticks — defence-in-depth against pathological inputs. */
const MAX_TICKS = 50;

/** Default minimum pixel gap between adjacent X labels when no config is supplied. */
const DEFAULT_MIN_LABEL_SPACING = 80;

/** Custom time-tick formatter, mirroring {@link YScale}'s `ValueFormatter` contract. */
export type TimeFormatter = (timestamp: number, interval: number) => string;

/** Custom tick-value generator — replaces the built-in `niceTimeIntervals` tier resolution entirely when installed. */
export type TimeTickGenerator = (range: XRange, dataInterval: number) => number[];

export class XScale {
  /**
   * Shared fade state for time ticks. Grid lines (canvas) and DOM tick labels
   * read opacity from the same tracker, so a tick fading in/out looks
   * identical on both surfaces.
   */
  readonly tickTracker = new AxisTickTracker();

  private from = 0;
  private to = 0;
  private width = 1;
  private pixelRatio = 1;
  private dataInterval: number | null = null;

  // Label density knobs — written by <TimeAxis labelCount=… minLabelSpacing=…>.
  private labelCountHintValue: number | null = null;
  private minSpacingValue: number | null = null;

  /** Custom formatter (driven by `setFormat` / a future `<TimeAxis format=…>`). */
  private customFormat: TimeFormatter | null = null;
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

    if (dataInterval !== undefined && dataInterval > 0) {
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

  /** Install (or clear) a custom tick-label formatter. */
  setFormat(fn: TimeFormatter | null): void {
    this.customFormat = fn;
  }

  /** Read back the currently installed formatter — null when the built-in is active. */
  getFormat(): TimeFormatter | null {
    return this.customFormat;
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
   * Format a tick timestamp for display. A custom formatter (via
   * {@link setFormat}) wins; otherwise falls back to the built-in
   * `formatTime`, applying the installed locale/timezone.
   */
  formatX(timestamp: number, interval: number): string {
    if (this.customFormat) return this.customFormat(timestamp, interval);

    return formatTime(timestamp, interval, { locale: this.localeValue, timeZone: this.timeZoneValue });
  }

  private resetHysteresis(): void {
    this.lastInterval = null;
    this.lastWant = null;
  }

  timeToX(time: number): number {
    if (this.to <= this.from) return 0;

    return ((time - this.from) / (this.to - this.from)) * this.width;
  }

  timeToBitmapX(time: number): number {
    return Math.round(this.timeToX(time) * this.pixelRatio);
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
   * Evenly spaced "nice" tick times. Resolution uses the cached
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

    // Back-compat: if a caller hands a different dataInterval than was cached
    // via update(), re-resolve rather than returning a stale tick list.
    if (this.dataInterval !== dataInterval) {
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
    const start = Math.ceil(this.from / interval) * interval;
    const count = Math.max(0, Math.min(MAX_TICKS, Math.floor((this.to - start) / interval) + 1));

    const ticks: number[] = [];
    for (let i = 0; i < count; i++) ticks.push(start + i * interval);

    return { ticks, tickInterval: interval };
  }

  getRange(): XRange {
    return { from: this.from, to: this.to };
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

function normalizeLabelCount(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= 2 ? Math.floor(n) : null;
}

function normalizeSpacing(px: number | null | undefined): number | null {
  return typeof px === 'number' && Number.isFinite(px) && px > 0 ? px : null;
}

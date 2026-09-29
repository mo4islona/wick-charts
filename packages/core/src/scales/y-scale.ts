import type { YRange, YScaleType } from '../types';
import { type ValueFormatter, formatCompact } from '../utils/format';
import { crispCenterOffset } from '../utils/pixel-grid';
import { logDecadeTicks } from './log-ticks';
import { AxisTickTracker } from './tick-tracker';

/** Custom tick-value generator — replaces the built-in {1,2,5}×10^k resolution entirely when installed. */
export type ValueTickGenerator = (range: YRange) => number[];

/**
 * Smallest {1,2,5}×10^k tick interval that is >= `minSpacing`. Ceiling snap
 * at any magnitude (handles 1e-20 through 1e20 without a lookup table).
 * Falls back to `1` for non-positive input so a degenerate call can't
 * produce Infinity/NaN.
 */
function pickNiceCeiling(minSpacing: number): number {
  if (!Number.isFinite(minSpacing) || minSpacing <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(minSpacing));
  const normalized = minSpacing / magnitude; // in [1, 10)
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return nice * magnitude;
}

/** Largest {1,2,5}×10^k tick interval that is <= `value`. Counterpart to pickNiceCeiling. */
function pickNiceFloor(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude; // in [1, 10)
  const nice = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;

  return nice * magnitude;
}

/** Hard cap on generated ticks — defence-in-depth against pathological inputs. */
const MAX_TICKS = 50;

/** Default minimum pixel gap between adjacent Y labels when no config is supplied. */
const DEFAULT_MIN_LABEL_SPACING = 50;

/**
 * Maps values to vertical pixel positions (and vice versa).
 * Also provides tick generation and value formatting for the Y axis.
 */
export class YScale {
  /** Shared fade state for Y ticks; see {@link TimeScale.tickTracker}. */
  readonly tickTracker = new AxisTickTracker();

  private type: YScaleType = 'linear';
  private min = 0;
  private max = 0;
  /** Domain bounds in scale space — `log10` of `min` / `max` on a log scale. */
  private lo = 0;
  private hi = 0;
  private height = 1;
  private pixelRatio = 1;

  // Label density knobs — written by <YAxis labelCount=… minLabelSpacing=…>.
  private labelCountHintValue: number | null = null;
  private minSpacingValue: number | null = null;

  /** Cached {1,2,5}×10^k interval resolved at update-time; null when degenerate. */
  private resolvedInterval: number | null = null;
  /** Previous resolved interval — drives the ratio-band hysteresis. */
  private lastInterval: number | null = null;
  /**
   * rawInterval at the moment `lastInterval` was snapped. Anchoring the
   * hysteresis band to *raw-at-snap* (not `lastInterval`) is what creates
   * naturally asymmetric tier hysteresis: after an escalation the band
   * starts just above the tier boundary, so live range drift back across
   * the boundary doesn't instantly flip back.
   */
  private lastRawInterval: number | null = null;

  /** Power-of-ten ticks on a log scale; `null` when linear ticks are in use. */
  private logTicks: number[] | null = null;
  /**
   * Whether the log scale last picked linear ticks (narrow range). `null`
   * until the first pick — drives the hold that keeps a range drifting across
   * the tie from flipping the whole label set.
   */
  private logUsesLinear: boolean | null = null;

  /** Custom formatter (driven by `<YAxis format=…>`). */
  private customFormat: ValueFormatter | null = null;
  /** Custom tick generator — bypasses {1,2,5}×10^k resolution in `niceTickValues` when set. */
  private customTickGenerator: ValueTickGenerator | null = null;

  private get labelCountHint(): number | null {
    return this.labelCountHintValue;
  }

  private get minLabelSpacing(): number {
    return this.minSpacingValue ?? DEFAULT_MIN_LABEL_SPACING;
  }

  /** Recalculate the scale with a new Y range, chart height, and device pixel ratio. */
  update(range: YRange, mediaHeight: number, pixelRatio: number): void {
    this.min = range.min;
    this.max = range.max;
    this.height = mediaHeight;
    this.pixelRatio = pixelRatio;
    this.updateDomain();
    this.resolveTicks();
  }

  /** Switch between linear and log mapping. The range is kept as-is — the chart refits it. */
  setType(type: YScaleType): void {
    if (type === this.type) return;

    this.type = type;
    this.resetHysteresis();
    this.updateDomain();
    this.resolveTicks();
  }

  getType(): YScaleType {
    return this.type;
  }

  /**
   * Whether `value` has a position on this scale: finite, and positive on a
   * log scale. Renderers skip values that fail — {@link valueToY} still maps
   * them (to the plot floor on a log scale) so nothing downstream sees NaN.
   */
  isPlottable(value: number): boolean {
    if (!Number.isFinite(value)) return false;

    return this.type === 'linear' || value > 0;
  }

  /** Desired label count. Invalid values (NaN, <2, Infinity) clear the hint. */
  setLabelCount(n: number | null | undefined): void {
    this.labelCountHintValue = normalizeLabelCount(n);
    this.resetHysteresis();
    this.resolveTicks();
  }

  /** Minimum pixel gap between adjacent labels. */
  setMinSpacing(px: number | null | undefined): void {
    this.minSpacingValue = normalizeSpacing(px);
    this.resetHysteresis();
    this.resolveTicks();
  }

  private resetHysteresis(): void {
    this.lastInterval = null;
    this.lastRawInterval = null;
    this.logUsesLinear = null;
  }

  /** A log domain needs both bounds positive; anything else collapses to a flat one. */
  private updateDomain(): void {
    if (this.type === 'linear') {
      this.lo = this.min;
      this.hi = this.max;

      return;
    }

    const valid = this.min > 0 && this.max > 0;
    this.lo = valid ? Math.log10(this.min) : 0;
    this.hi = valid ? Math.log10(this.max) : 0;
  }

  /** Install (or clear) a custom formatter. */
  setFormat(fn: ValueFormatter | null): void {
    this.customFormat = fn;
  }

  /** Read back the currently installed formatter — null when the built-in is active. */
  getFormat(): ValueFormatter | null {
    return this.customFormat;
  }

  /**
   * Install (or clear) a custom tick-value generator. When set, it replaces
   * {1,2,5}×10^k resolution entirely — `niceTickValues` calls it directly
   * with the current range.
   */
  setTickGenerator(fn: ValueTickGenerator | null): void {
    this.customTickGenerator = fn;
    this.resetHysteresis();
  }

  /**
   * Convert a value to a Y position in CSS (media) pixels. On a log scale a
   * value ≤ 0 lands on the plot floor — log has no zero.
   */
  valueToY(value: number): number {
    const span = this.hi - this.lo;
    // Flat range (single-value series or zoom-collapsed) would divide by zero
    // and poison the render pipeline with NaN. Anchor at mid-height instead.
    if (span === 0) return this.height / 2;

    if (this.type === 'linear') return (1 - (value - this.lo) / span) * this.height;

    if (!(value > 0)) return this.height;

    return (1 - (Math.log10(value) - this.lo) / span) * this.height;
  }

  /** Convert a value to a Y position in physical (bitmap) pixels, snapped to
   *  the pixel grid — for axis-aligned edges that have to stay crisp. */
  valueToBitmapY(value: number): number {
    return Math.round(this.valueToBitmapYExact(value));
  }

  /**
   * Same in physical pixels, off the grid. Anti-aliased geometry reads this
   * one: snapping buys a diagonal stroke no sharpness, and during a slow
   * animation it quantises the motion into whole-pixel jumps.
   */
  valueToBitmapYExact(value: number): number {
    return this.valueToY(value) * this.pixelRatio;
  }

  /**
   * Y position in CSS pixels of the *stroke center* the canvas grid draws for
   * `value`. DOM axis labels position off this instead of raw {@link valueToY}
   * so text and gridline share one pixel grid.
   */
  valueToSnappedY(value: number): number {
    return (this.valueToBitmapY(value) + crispCenterOffset(this.pixelRatio)) / this.pixelRatio;
  }

  /** Convert a Y position in CSS pixels back to a value — the exact inverse of {@link valueToY}. */
  yToValue(y: number): number {
    const span = this.hi - this.lo;
    if (span === 0) return this.min;

    const scaled = this.hi - (y / this.height) * span;

    return this.type === 'linear' ? scaled : 10 ** scaled;
  }

  /**
   * Generate evenly spaced "nice" tick values for the current range and
   * chart height. Pure read — resolution happens in `update()`.
   */
  niceTickValues(): number[] {
    if (this.customTickGenerator) return this.customTickGenerator({ min: this.min, max: this.max }).slice(0, MAX_TICKS);

    if (this.logTicks !== null) return this.logTicks.slice(0, MAX_TICKS);

    if (this.resolvedInterval == null) return [];

    const interval = this.resolvedInterval;
    const start = Math.ceil(this.min / interval) * interval;
    const count = Math.max(0, Math.min(MAX_TICKS, Math.floor((this.max - start) / interval) + 1));

    const ticks: number[] = [];
    // Multiplicative indexing avoids cumulative fp drift of `p += interval`.
    for (let i = 0; i < count; i++) ticks.push(start + i * interval);

    return ticks;
  }

  getRange(): YRange {
    return { min: this.min, max: this.max };
  }

  getMediaHeight(): number {
    return this.height;
  }

  /**
   * Format a tick value for display. When a custom formatter is installed
   * (via {@link setFormat} or the `format` prop on `<YAxis>`), it wins;
   * otherwise decimals are driven by the resolved tick interval — so
   * ticks at step 100 never render as "42000.0" just because the visible
   * range happens to be < 1000.
   */
  formatY(value: number): string {
    if (this.customFormat) return this.customFormat(value);

    // Power-of-ten ticks share no interval to derive decimals from.
    if (this.logTicks !== null) return trimFractionZeros(formatCompact(value));

    // Kick into K/M/B/T suffixes once labels would otherwise balloon past ~7
    // characters. Keeping the threshold at ≥ 1e6 preserves readable raw
    // numbers up through "50000" / "99999" tick labels.
    if (this.max - this.min >= 1e6) return formatCompact(value);

    const interval = this.resolvedInterval;
    // Interval is always {1,2,5}×10^k, so decimals needed = max(0, -floor(log10(interval))).
    // Fall back to a single decimal only if interval isn't resolved yet
    // (e.g. degenerate range) — unlikely but keeps the call safe.
    const decimals = interval != null && interval > 0 ? Math.max(0, -Math.floor(Math.log10(interval))) : 1;

    return value.toFixed(decimals);
  }

  private resolveTicks(): void {
    if (this.type === 'log') {
      this.resolveLogTicks();

      return;
    }

    this.logTicks = null;
    this.resolveInterval(((this.max - this.min) * this.minLabelSpacing) / this.height);
  }

  /**
   * Powers of ten, unless the range is too narrow to catch enough of them —
   * then linear {1,2,5}×10^k ticks, spaced so the tightest gap (at the top,
   * where log compresses) still clears `minLabelSpacing`.
   */
  private resolveLogTicks(): void {
    const span = this.hi - this.lo;
    if (!(span > 0) || this.height <= 0) {
      this.logTicks = null;
      this.resolvedInterval = null;

      return;
    }

    const decadeTicks = logDecadeTicks({
      min: this.min,
      max: this.max,
      height: this.height,
      minSpacing: this.minLabelSpacing,
      labelCount: this.labelCountHint,
    });

    const pxPerDecade = this.height / span;
    this.resolveInterval(this.max * (1 - 10 ** (-this.minLabelSpacing / pxPerDecade)));
    const linearCount = this.resolvedInterval === null ? 0 : this.countTicks(this.resolvedInterval);

    const useLinear = this.prefersLinearTicks({ logCount: decadeTicks.length, linearCount });
    this.logUsesLinear = useLinear;
    this.logTicks = useLinear ? null : decadeTicks;
  }

  /** Pick the tick kind whose count lands closer to the target, holding the current kind on near-ties. */
  private prefersLinearTicks(args: { logCount: number; linearCount: number }): boolean {
    const { logCount, linearCount } = args;
    if (linearCount < 2) return false;
    if (logCount < 2) return true;

    const target = this.labelCountHint ?? Math.max(2, Math.floor(this.height / this.minLabelSpacing));
    const logMiss = Math.abs(logCount - target);
    const linearMiss = Math.abs(linearCount - target);

    if (this.logUsesLinear === true) return linearMiss <= logMiss + 1;
    if (this.logUsesLinear === false) return linearMiss + 1 < logMiss;

    return linearMiss < logMiss;
  }

  /**
   * Resolve the interval to a {1,2,5}×10^k tick size that satisfies the pixel
   * floor and (optionally) targets `labelCountHint` labels. `gapFloorValue` is
   * the smallest interval that clears `minLabelSpacing` anywhere on the axis.
   *
   * Hysteresis: the band [0.8×, 1.25×] is anchored to **rawInterval at last
   * snap**, not to `lastInterval`. After an escalation (e.g. 100 → 200),
   * `lastRawInterval` sits just past the tier boundary, so typical live
   * range drift back across the boundary stays inside the band and does
   * *not* de-escalate. This prevents the 2-tier flicker users see when new
   * candles nudge the Y range across a raw-interval threshold.
   */
  private resolveInterval(gapFloorValue: number): void {
    if (this.max <= this.min || this.height <= 0) {
      this.resolvedInterval = null;
      return;
    }

    const range = this.max - this.min;

    // For the hint path we use `labelCount` (not `labelCount - 1`) as the gap
    // target: the ceiling 1-2-5 snap tends to swallow a tick at boundary
    // ranges, so biasing the gap count up by one lands the realized label
    // count near the hint instead of one below it (e.g. hint=2 on range 10 →
    // interval=5 → two labels, not one).
    const targetGaps =
      this.labelCountHint != null
        ? Math.max(1, this.labelCountHint)
        : Math.max(1, Math.floor(this.height / this.minLabelSpacing));

    let rawInterval = range / targetGaps;
    if (rawInterval < gapFloorValue) rawInterval = gapFloorValue;

    if (this.lastInterval != null && this.lastRawInterval != null) {
      const within = rawInterval >= this.lastRawInterval * 0.8 && rawInterval <= this.lastRawInterval * 1.25;
      // Resize guard: a height change shifts `gapFloorValue` without touching
      // `lastRawInterval`. Reusing a cached interval that no longer clears
      // the pixel floor would silently violate `minLabelSpacing`.
      const satisfiesFloor = this.lastInterval >= gapFloorValue;
      if (within && satisfiesFloor) {
        this.resolvedInterval = this.lastInterval;
        return;
      }
    }

    let candidate = pickNiceCeiling(rawInterval);
    // When a labelCount hint is set, the ceiling snap can produce an interval
    // so large that after `ceil(min/interval)*interval` alignment only a
    // single tick fits the range (e.g. range 44500..45200 with interval 500
    // → one tick at 45000). Retry with the floor snap so the hint is
    // honored, provided the smaller interval still clears the pixel floor.
    if (this.labelCountHint != null && this.countTicks(candidate) < this.labelCountHint) {
      const floorCand = pickNiceFloor(rawInterval);
      if (floorCand >= gapFloorValue && floorCand > 0) candidate = floorCand;
    }

    this.resolvedInterval = candidate;
    this.lastInterval = candidate;
    this.lastRawInterval = rawInterval;
  }

  private countTicks(interval: number): number {
    if (!(interval > 0)) return 0;
    const start = Math.ceil(this.min / interval) * interval;

    return Math.max(0, Math.floor((this.max - start) / interval) + 1);
  }
}

/** `"1.00K"` → `"1K"`, `"2.50M"` → `"2.5M"`, `"20.00"` → `"20"`. */
function trimFractionZeros(label: string): string {
  return label.replace(/(\.\d*?)0+([KMBT]?)$/, '$1$2').replace(/\.([KMBT]?)$/, '$1');
}

function normalizeLabelCount(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= 2 ? Math.floor(n) : null;
}

function normalizeSpacing(px: number | null | undefined): number | null {
  return typeof px === 'number' && Number.isFinite(px) && px > 0 ? px : null;
}

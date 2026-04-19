import type { YRange } from '../types';
import { type ValueFormatter, formatCompact } from '../utils/format';

/**
 * Pick a "nice" 1-2-5 tick interval at any magnitude (handles 1e-20 through
 * 1e20 without a hand-maintained lookup table). Falls back to `1` for
 * non-positive input so a degenerate call can't produce Infinity/NaN.
 */
function pickNiceInterval(minSpacing: number): number {
  if (!Number.isFinite(minSpacing) || minSpacing <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(minSpacing));
  const normalized = minSpacing / magnitude; // in [1, 10)
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** Hard cap on generated ticks — defence-in-depth against pathological inputs. */
const MAX_TICKS = 50;

/**
 * Maps values to vertical pixel positions (and vice versa).
 * Also provides tick generation and value formatting for the Y axis.
 */
export class YScale {
  private min = 0;
  private max = 0;
  private height = 1;
  private pixelRatio = 1;
  /** User-supplied tick formatter. Overrides the built-in when set. */
  private customFormat: ValueFormatter | null = null;

  /** Recalculate the scale with a new Y range, chart height, and device pixel ratio. */
  update(range: YRange, mediaHeight: number, pixelRatio: number): void {
    this.min = range.min;
    this.max = range.max;
    this.height = mediaHeight;
    this.pixelRatio = pixelRatio;
  }

  /**
   * Install (or clear) a custom formatter used by `formatY`. Passing `null`
   * resets to the built-in range-adaptive behavior.
   */
  setFormat(fn: ValueFormatter | null): void {
    this.customFormat = fn;
  }

  /** Convert a value to a Y position in CSS (media) pixels. */
  valueToY(value: number): number {
    const range = this.max - this.min;
    // Flat range (single-value series or zoom-collapsed) would divide by zero
    // and poison the render pipeline with NaN. Anchor at mid-height instead.
    if (range === 0) return this.height / 2;
    return (1 - (value - this.min) / range) * this.height;
  }

  /** Convert a value to a Y position in physical (bitmap) pixels. */
  valueToBitmapY(value: number): number {
    return Math.round(this.valueToY(value) * this.pixelRatio);
  }

  /** Convert a Y position in CSS pixels back to a value. */
  yToValue(y: number): number {
    const range = this.max - this.min;
    if (range === 0) return this.min;
    return this.max - (y / this.height) * range;
  }

  /** Generate evenly spaced "nice" tick values that fit the current range and chart height. */
  niceTickValues(): number[] {
    if (this.max <= this.min || this.height <= 0) return [];
    const minPixelSpacing = 50;
    const valuePerPixel = (this.max - this.min) / this.height;
    const minValueSpacing = valuePerPixel * minPixelSpacing;

    const tickInterval = pickNiceInterval(minValueSpacing);
    if (!Number.isFinite(tickInterval) || tickInterval <= 0) return [];

    const ticks: number[] = [];
    const start = Math.ceil(this.min / tickInterval) * tickInterval;
    for (let p = start; p <= this.max && ticks.length < MAX_TICKS; p += tickInterval) {
      ticks.push(p);
    }
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
   * otherwise decimals adapt to the visible range magnitude.
   */
  formatY(value: number): string {
    if (this.customFormat) return this.customFormat(value);
    const range = this.max - this.min;
    // Kick into K/M/B/T suffixes once labels would otherwise balloon past ~7
    // characters. Keeping the threshold at ≥ 1e6 preserves readable raw
    // numbers up through "50000" / "99999" tick labels.
    if (range >= 1e6) return formatCompact(value);
    if (range < 0.01) return value.toFixed(6);
    if (range < 0.1) return value.toFixed(4);
    if (range < 10) return value.toFixed(2);
    if (range < 1000) return value.toFixed(1);
    return value.toFixed(0);
  }
}

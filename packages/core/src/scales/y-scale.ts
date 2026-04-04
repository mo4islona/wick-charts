import type { YRange } from '../types';

/** Pre-computed "nice" tick intervals following a 1-2-5 pattern for readable axis labels. */
const NICE_INTERVALS = [
  0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500,
  1000, 2000, 5000, 10000, 20000, 50000,
];

/**
 * Maps values to vertical pixel positions (and vice versa).
 * Also provides tick generation and value formatting for the Y axis.
 */
export class YScale {
  private min = 0;
  private max = 0;
  private height = 1;
  private pixelRatio = 1;

  /** Recalculate the scale with a new Y range, chart height, and device pixel ratio. */
  update(range: YRange, mediaHeight: number, pixelRatio: number): void {
    this.min = range.min;
    this.max = range.max;
    this.height = mediaHeight;
    this.pixelRatio = pixelRatio;
  }

  /** Convert a value to a Y position in CSS (media) pixels. */
  valueToY(value: number): number {
    return (1 - (value - this.min) / (this.max - this.min)) * this.height;
  }

  /** Convert a value to a Y position in physical (bitmap) pixels. */
  valueToBitmapY(value: number): number {
    return Math.round(this.valueToY(value) * this.pixelRatio);
  }

  /** Convert a Y position in CSS pixels back to a value. */
  yToValue(y: number): number {
    return this.max - (y / this.height) * (this.max - this.min);
  }

  /** Generate evenly spaced "nice" tick values that fit the current range and chart height. */
  niceTickValues(): number[] {
    if (this.max <= this.min) return [];
    const minPixelSpacing = 50;
    const valuePerPixel = (this.max - this.min) / this.height;
    const minValueSpacing = valuePerPixel * minPixelSpacing;

    let tickInterval = NICE_INTERVALS[NICE_INTERVALS.length - 1];
    for (const interval of NICE_INTERVALS) {
      if (interval >= minValueSpacing) {
        tickInterval = interval;
        break;
      }
    }

    const ticks: number[] = [];
    const start = Math.ceil(this.min / tickInterval) * tickInterval;
    for (let p = start; p <= this.max; p += tickInterval) {
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

  /** Format a value for display, adapting decimal places to the visible range magnitude. */
  formatY(value: number): string {
    const range = this.max - this.min;
    if (range < 0.01) return value.toFixed(6);
    if (range < 0.1) return value.toFixed(4);
    if (range < 10) return value.toFixed(2);
    if (range < 1000) return value.toFixed(1);
    return value.toFixed(0);
  }
}

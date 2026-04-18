import { EventEmitter } from './events';
import type { VisibleRange, YRange } from './types';
import { lerp } from './utils/math';

interface ViewportEvents {
  change: () => void;
}

/** Horizontal padding expressed as a fixed pixel offset or a number of data intervals. */
export type HorizontalPadding = number | { intervals: number };

/** Configuration options for the {@link Viewport}. */
export interface ViewportOptions {
  padding?: {
    /** Top padding in pixels. Default: 20 */
    top?: number;
    /** Bottom padding in pixels. Default: 20 */
    bottom?: number;
    /**
     * Right-side padding. Accepts pixels (`50`) or data intervals (`{ intervals: 3 }`).
     * Default: `{ intervals: 3 }` — 3 empty data points to the right of the last point.
     */
    right?: HorizontalPadding;
    /**
     * Left-side padding. Accepts pixels (`50`) or data intervals (`{ intervals: 0 }`).
     * Default: `{ intervals: 0 }`.
     */
    left?: HorizontalPadding;
  };
}

interface ResolvedPadding {
  top: number;
  bottom: number;
  right: HorizontalPadding;
  left: HorizontalPadding;
}

const DEFAULT_PADDING: ResolvedPadding = {
  top: 20,
  bottom: 20,
  right: { intervals: 3 },
  left: { intervals: 0 },
};

/**
 * Manages the visible time range and Y range of the chart.
 * Handles panning, zooming, auto-scroll, and animated transitions.
 * Emits a 'change' event whenever the visible range is updated.
 */
export class Viewport extends EventEmitter<ViewportEvents> {
  private _visibleRange: VisibleRange = { from: 0, to: 0 };
  private _yRange: YRange = { min: 0, max: 0 };
  private _autoScroll = true;
  private padding: ResolvedPadding;
  private dataInterval = 60_000;
  private _dataStart: number | null = null;
  private _dataEnd: number | null = null;

  // Animation state — no own rAF, ticked by the render loop
  private _animating = false;
  private animStartTime = 0;
  private animDuration = 0;
  private animFrom: VisibleRange = { from: 0, to: 0 };
  private animTo: VisibleRange = { from: 0, to: 0 };

  constructor({ padding }: ViewportOptions = {}) {
    super();
    this.padding = {
      top: padding?.top ?? DEFAULT_PADDING.top,
      bottom: padding?.bottom ?? DEFAULT_PADDING.bottom,
      right: padding?.right ?? DEFAULT_PADDING.right,
      left: padding?.left ?? DEFAULT_PADDING.left,
    };
  }

  /**
   * Resolve a HorizontalPadding value to a time offset.
   * - `{ intervals: N }` → N * dataInterval (zoom-independent bar count)
   * - `number` (pixels) → (px / chartWidth) * visibleRange (zoom-dependent)
   */
  private resolveHPad(pad: HorizontalPadding, range: number, chartWidth: number): number {
    if (typeof pad === 'object') {
      return pad.intervals * this.dataInterval;
    }
    if (chartWidth <= 0) return 0;
    return (pad / chartWidth) * range;
  }

  get visibleRange(): VisibleRange {
    return this._visibleRange;
  }

  get yRange(): YRange {
    return this._yRange;
  }

  get autoScroll(): boolean {
    return this._autoScroll;
  }

  get animating(): boolean {
    return this._animating;
  }

  setDataInterval(interval: number): void {
    this.dataInterval = interval;
  }

  /** Replace padding configuration. Only updates fields that are provided; others keep defaults. */
  setPadding(padding?: ViewportOptions['padding']): void {
    this.padding = {
      top: padding?.top ?? DEFAULT_PADDING.top,
      bottom: padding?.bottom ?? DEFAULT_PADDING.bottom,
      right: padding?.right ?? DEFAULT_PADDING.right,
      left: padding?.left ?? DEFAULT_PADDING.left,
    };
  }

  setDataStart(time: number): void {
    this._dataStart = time;
  }

  setDataEnd(time: number): void {
    this._dataEnd = time;
  }

  private cancelAnimation(): void {
    this._animating = false;
  }

  /** Validate and apply a new visible range. When clampToData is true, reject zoom beyond data extent. */
  private applyRange(from: number, to: number, clampToData = false): void {
    if (to <= from) return;

    const range = to - from;
    const bars = range / this.dataInterval;
    if (bars < 2) return;

    if (clampToData && this._dataStart !== null && this._dataEnd !== null) {
      const dataSpan = this._dataEnd - this._dataStart;
      const maxRange = dataSpan + this.dataInterval * 5;
      if (range > maxRange && maxRange > 0) return;
    }

    this._visibleRange = { from, to };
    this.emit('change');
  }

  /** Start animation — will be advanced by tick() calls from the render loop */
  animateTo(from: number, to: number, duration = 400): void {
    this.animFrom = { ...this._visibleRange };
    this.animTo = { from, to };
    this.animDuration = duration;
    this.animStartTime = performance.now();
    this._animating = true;
  }

  /** Called by the render loop before each frame. Returns true if still animating. */
  tick(now: number): boolean {
    if (!this._animating) return false;

    const elapsed = now - this.animStartTime;
    const t = Math.min(1, elapsed / this.animDuration);
    // Cubic ease-out for a smooth deceleration
    const ease = 1 - (1 - t) ** 3;

    const curFrom = lerp(this.animFrom.from, this.animTo.from, ease);
    const curTo = lerp(this.animFrom.to, this.animTo.to, ease);

    if (curTo > curFrom) {
      // Use applyRange for consistent clamping
      this.applyRange(curFrom, curTo);
    }

    if (t >= 1) {
      this._animating = false;
    }

    return this._animating;
  }

  /** Set the Y-axis range. Adds pixel-based padding unless a side has a fixed (explicit) bound. */
  setYRange(min: number, max: number, chartHeight: number, fixedMin = false, fixedMax = false): void {
    const dataRange = max - min;
    const padTop = chartHeight > 0 ? (this.padding.top / chartHeight) * dataRange : 0;
    const padBottom = chartHeight > 0 ? (this.padding.bottom / chartHeight) * dataRange : 0;
    this._yRange = {
      min: fixedMin ? min : min - padBottom,
      max: fixedMax ? max : max + padTop,
    };
  }

  /** Zoom in/out around a time anchor point. Factor < 1 zooms in, > 1 zooms out. */
  zoomAt(centerTime: number, factor: number): void {
    this.cancelAnimation();

    const { from, to } = this._visibleRange;
    const range = to - from;
    const newRange = range * factor;

    const ratio = (centerTime - from) / range;
    const newFrom = centerTime - ratio * newRange;
    const newTo = newFrom + newRange;

    // Prevent over-zooming past a minimum of 10 visible bars
    if (newRange / this.dataInterval < 10) return;

    // Re-enable autoScroll when zoomed out enough to see all data
    if (factor > 1 && this._dataStart !== null && this._dataEnd !== null) {
      if (newFrom <= this._dataStart && newTo >= this._dataEnd) {
        this._autoScroll = true;
        this.applyRange(newFrom, newTo, true);
        return;
      }
    }

    this._autoScroll = false;
    this.applyRange(newFrom, newTo, true);
  }

  /**
   * Shift the visible range by a time delta. Disables auto-scroll.
   * Clamps the right edge at `dataEnd + right padding` so the user cannot
   * scroll past the end of the data. `chartWidth` is only needed when the
   * right padding is pixel-based.
   */
  pan(timeDelta: number, chartWidth = 0): void {
    this.cancelAnimation();

    const { from, to } = this._visibleRange;
    const range = to - from;
    let newFrom = from + timeDelta;
    let newTo = to + timeDelta;

    // Skip the clamp when right padding is pixel-based but chartWidth is unknown:
    // resolveHPad would collapse to 0 and clamp too tightly at `dataEnd`, hiding
    // the configured padding that fitToData/scrollToEnd both honor.
    if (this._dataEnd !== null) {
      const pxBasedRight = typeof this.padding.right === 'number';
      const canResolveRightPad = !pxBasedRight || chartWidth > 0;
      if (canResolveRightPad) {
        const pr = this.resolveHPad(this.padding.right, range, chartWidth);
        const rightLimit = this._dataEnd + pr;
        if (newTo > rightLimit) {
          newTo = rightLimit;
          newFrom = rightLimit - range;
        }
      }
    }

    this._autoScroll = false;
    this.applyRange(newFrom, newTo);
  }

  /** Fit the viewport to show data from first to last timestamp, with optional animation. */
  fitToData(firstTime: number, lastTime: number, chartWidth = 0, animated = false): void {
    this._autoScroll = true;

    const maxBars = 400;
    const maxRange = maxBars * this.dataInterval;
    const dataSpan = lastTime - firstTime;

    // Compute a representative range for resolving pixel-based padding.
    // For interval-based padding this value is unused; for pixel-based it
    // must be a reasonable estimate — we use the data span as the base and
    // expand it below once we have targetFrom/targetTo.
    // For a single point, use a small multiple of dataInterval as the base range
    const estimatedRange = dataSpan > 0 ? dataSpan : this.dataInterval * 10;

    const pr = this.resolveHPad(this.padding.right, estimatedRange, chartWidth);
    const pl = this.resolveHPad(this.padding.left, estimatedRange, chartWidth);

    let targetTo = lastTime + pr;
    let targetFrom = firstTime - pl;

    // Cap to maxBars — anchor right edge and trim left
    if (targetTo - targetFrom > maxRange) {
      targetTo = lastTime + pr;
      targetFrom = targetTo - maxRange;
    }

    if (animated && this._visibleRange.from !== 0 && this._visibleRange.to !== 0) {
      this.animateTo(targetFrom, targetTo, 450);
    } else {
      this.applyRange(targetFrom, targetTo);
    }
  }

  /** Keep the right edge pinned to the latest data (real-time auto-scroll). */
  scrollToEnd(lastTime: number, chartWidth = 0): void {
    const range = this._visibleRange.to - this._visibleRange.from;
    const pr = this.resolveHPad(this.padding.right, range, chartWidth);
    const targetTo = lastTime + pr;
    const targetFrom = targetTo - range;
    this._autoScroll = true;

    if (this._animating) {
      this.animFrom = { ...this._visibleRange };
      this.animTo = { from: targetFrom, to: targetTo };
      this.animDuration = 150;
      this.animStartTime = performance.now();
    } else {
      this.animateTo(targetFrom, targetTo, 150);
    }
  }

  /** Return the number of data bars (candles/points) currently visible. */
  getVisibleBarsCount(): number {
    return (this._visibleRange.to - this._visibleRange.from) / this.dataInterval;
  }

  destroy(): void {
    this.cancelAnimation();
    this.removeAllListeners();
  }
}

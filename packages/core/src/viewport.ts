import { EventEmitter } from './events';
import type { VisibleRange, YRange } from './types';
import { lerp } from './utils/math';

interface ViewportEvents {
  change: () => void;
}

/** Configuration options for the {@link Viewport}. */
export interface ViewportOptions {
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
}

interface ResolvedPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const DEFAULT_PADDING: ResolvedPadding = {
  top: 20,
  right: 3,
  bottom: 20,
  left: 0,
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
  private dataInterval = 60;
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
      right: padding?.right ?? DEFAULT_PADDING.right,
      bottom: padding?.bottom ?? DEFAULT_PADDING.bottom,
      left: padding?.left ?? DEFAULT_PADDING.left,
    };
  }

  get visibleRange(): VisibleRange {
    return this._visibleRange;
  }

  get yRange(): YRange {
    return this._yRange;
  }

  /** Update left/right bar-count padding dynamically. */
  setHorizontalPadding(left: number, right: number): void {
    this.padding.left = left;
    this.padding.right = right;
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

  /** Shift the visible range by a time delta. Disables auto-scroll. */
  pan(timeDelta: number): void {
    this.cancelAnimation();

    const { from, to } = this._visibleRange;
    const newFrom = from + timeDelta;
    const newTo = to + timeDelta;

    this._autoScroll = false;
    this.applyRange(newFrom, newTo);
  }

  /** Fit the viewport to show data from first to last timestamp, with optional animation. */
  fitToData(firstTime: number, lastTime: number, animated = false): void {
    this._autoScroll = true;

    const maxBars = 400;
    const pl = this.dataInterval * this.padding.left;
    const pr = this.dataInterval * this.padding.right;

    const targetTo = lastTime + pr;
    const targetFrom = Math.max(firstTime - pl, targetTo - maxBars * this.dataInterval);

    if (animated && this._visibleRange.from !== 0 && this._visibleRange.to !== 0) {
      this.animateTo(targetFrom, targetTo, 450);
    } else {
      this.applyRange(targetFrom, targetTo);
    }
  }

  /** Keep the right edge pinned to the latest data (real-time auto-scroll). */
  scrollToEnd(lastTime: number): void {
    const range = this._visibleRange.to - this._visibleRange.from;
    const pr = this.dataInterval * this.padding.right;
    const targetTo = lastTime + pr;
    const targetFrom = targetTo - range;
    this._autoScroll = true;

    if (this._animating) {
      // Re-anchor from current position so the animation continues smoothly to the new target
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

  private getRightLimit(): number | null {
    if (this._dataEnd === null) return null;
    return this._dataEnd + this.dataInterval * this.padding.right;
  }

  destroy(): void {
    this.cancelAnimation();
    this.removeAllListeners();
  }
}

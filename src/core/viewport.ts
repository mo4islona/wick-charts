import { lerp } from "../utils/math";
import { EventEmitter } from "./events";
import type { PriceRange, VisibleRange } from "./types";

interface ViewportEvents {
  change: () => void;
}

export interface ViewportOptions {
  pricePadding: number;
}

const DEFAULT_OPTIONS: ViewportOptions = {
  pricePadding: 0.1,
};

export class Viewport extends EventEmitter<ViewportEvents> {
  private _visibleRange: VisibleRange = { from: 0, to: 0 };
  private _priceRange: PriceRange = { min: 0, max: 0 };
  private _autoScroll = true;
  private options: ViewportOptions;
  private dataInterval = 60;
  private _dataEnd: number | null = null;

  // Animation state — no own rAF, ticked by the render loop
  private _animating = false;
  private animStartTime = 0;
  private animDuration = 0;
  private animFrom: VisibleRange = { from: 0, to: 0 };
  private animTo: VisibleRange = { from: 0, to: 0 };

  constructor(options?: Partial<ViewportOptions>) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  get visibleRange(): VisibleRange {
    return this._visibleRange;
  }

  get priceRange(): PriceRange {
    return this._priceRange;
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

  setDataEnd(time: number): void {
    this._dataEnd = time;
  }

  private cancelAnimation(): void {
    this._animating = false;
  }

  private applyRange(from: number, to: number): void {
    if (to <= from) return;

    const bars = (to - from) / this.dataInterval;
    if (bars < 10 || bars > 400) return;

    this._visibleRange = { from, to };
    this.emit("change");
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
    const ease = 1 - (1 - t) ** 3;

    const curFrom = lerp(this.animFrom.from, this.animTo.from, ease);
    const curTo = lerp(this.animFrom.to, this.animTo.to, ease);

    if (curTo > curFrom) {
      const bars = (curTo - curFrom) / this.dataInterval;
      if (bars >= 10 && bars <= 400) {
        this._visibleRange = { from: curFrom, to: curTo };
        this.emit("change");
      }
    }

    if (t >= 1) {
      this._animating = false;
    }

    return this._animating;
  }

  setPriceRange(min: number, max: number): void {
    const padding = (max - min) * this.options.pricePadding;
    this._priceRange = { min: min - padding, max: max + padding };
  }

  zoomAt(centerTime: number, factor: number): void {
    this.cancelAnimation();

    const { from, to } = this._visibleRange;
    const range = to - from;
    const newRange = range * factor;

    const ratio = (centerTime - from) / range;
    let newFrom = centerTime - ratio * newRange;
    let newTo = newFrom + newRange;

    const rightLimit = this.getRightLimit();
    if (rightLimit !== null && newTo > rightLimit) {
      const shift = newTo - rightLimit;
      newFrom -= shift;
      newTo = rightLimit;
    }

    this._autoScroll = false;
    this.applyRange(newFrom, newTo);
  }

  pan(timeDelta: number): void {
    this.cancelAnimation();

    const { from, to } = this._visibleRange;
    let newFrom = from + timeDelta;
    let newTo = to + timeDelta;

    const rightLimit = this.getRightLimit();
    if (rightLimit !== null && newTo > rightLimit) {
      newTo = rightLimit;
      newFrom = rightLimit - (to - from);
    }

    this._autoScroll = false;
    this.applyRange(newFrom, newTo);
  }

  fitToData(firstTime: number, lastTime: number, animated = false): void {
    this._autoScroll = true;

    const maxBars = 400;
    const pad = this.dataInterval * 3;

    const targetTo = lastTime + pad;
    const targetFrom = Math.max(firstTime - pad, targetTo - maxBars * this.dataInterval);

    if (animated && this._visibleRange.from !== 0 && this._visibleRange.to !== 0) {
      this.animateTo(targetFrom, targetTo, 450);
    } else {
      this.applyRange(targetFrom, targetTo);
    }
  }

  scrollToEnd(lastTime: number): void {
    // Don't interrupt a running animation — let it finish
    if (this._animating) return;

    const range = this._visibleRange.to - this._visibleRange.from;
    const pad = this.dataInterval * 3; // same padding as fitToData
    this._autoScroll = true;
    this.applyRange(lastTime + pad - range, lastTime + pad);
  }

  getVisibleBarsCount(): number {
    return (this._visibleRange.to - this._visibleRange.from) / this.dataInterval;
  }

  private getRightLimit(): number | null {
    if (this._dataEnd === null) return null;
    return this._dataEnd + this.dataInterval;
  }

  destroy(): void {
    this.cancelAnimation();
    this.removeAllListeners();
  }
}

import { EventEmitter } from '../events';
import { binarySearch } from '../utils/math';

interface StoreEvents {
  update: () => void;
}

/** The fields that carry a point's value; `time`, `x` and `volume` are not values. */
const VALUE_FIELDS = ['value', 'open', 'high', 'low', 'close'] as const;

function hasFraction(point: object): boolean {
  for (const field of VALUE_FIELDS) {
    const value = (point as Record<string, unknown>)[field];
    if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)) return true;
  }

  return false;
}

function countFractions(points: readonly object[]): number {
  let count = 0;
  for (const point of points) {
    if (hasFraction(point)) count++;
  }

  return count;
}

export class TimeSeriesStore<T extends { time: number }> extends EventEmitter<StoreEvents> {
  private data: T[] = [];
  private _visible = true;
  private cachedRange: { from: number; to: number } | null = null;
  private cachedResult: T[] = [];
  // Points `trimStart` dropped, oldest first. A view whose left edge is older
  // than the kept head still draws them, so a rolling window slides out of view.
  private exited: T[] = [];
  // Leftmost `from` read since the last trim: older exited points are out of every view since then.
  private lowestReadFrom = Number.POSITIVE_INFINITY;
  private appendedSinceTrim = 0;
  // Stored points with a fractional value, kept in step with every mutation.
  private fractionalPoints = 0;
  // Dev-only, warn-once-per-instance: these two conditions are almost always
  // a persistent bug in the caller's feed (not a one-off), so a per-call
  // warning would just spam the console on every tick.
  private warnedUnsorted = false;
  private warnedOutOfOrderAppend = false;

  setVisible(visible: boolean): void {
    this._visible = visible;
  }

  isVisible(): boolean {
    return this._visible;
  }

  setData(data: T[]): void {
    let sorted = true;
    for (let i = 1; i < data.length; i++) {
      if (data[i].time < data[i - 1].time) {
        sorted = false;
        break;
      }
    }

    if (!sorted && process.env.NODE_ENV !== 'production' && !this.warnedUnsorted) {
      this.warnedUnsorted = true;
      console.warn(
        '[wick-charts] data is not sorted by time — re-sorting on every setData() call is wasted work. ' +
          'Sort your feed by `time` ascending before passing it in.',
      );
    }

    this.data = sorted ? data.slice() : [...data].sort((a, b) => a.time - b.time);
    this.fractionalPoints = countFractions(this.data);
    this.exited = [];
    this.appendedSinceTrim = 0;
    this.cachedRange = null;
    this.emit('update');
  }

  append(point: T): void {
    if (this.data.length > 0 && point.time <= this.data[this.data.length - 1].time) {
      if (process.env.NODE_ENV !== 'production' && !this.warnedOutOfOrderAppend) {
        this.warnedOutOfOrderAppend = true;
        console.warn(
          `[wick-charts] append() received time ${point.time}, not after the last point's time ` +
            `${this.data[this.data.length - 1].time} — treating it as an overwrite of the last point instead of ` +
            'a new one. If you meant to append, check your feed for out-of-order or duplicate timestamps.',
        );
      }
      this.updateLast(point);
      return;
    }
    this.data.push(point);
    if (hasFraction(point)) this.fractionalPoints++;
    this.appendedSinceTrim++;
    this.cachedRange = null;
    this.emit('update');
  }

  updateLast(point: T): void {
    if (this.data.length === 0) return;
    if (hasFraction(this.data[this.data.length - 1])) this.fractionalPoints--;
    if (hasFraction(point)) this.fractionalPoints++;
    this.data[this.data.length - 1] = point;
    this.cachedRange = null;
    this.emit('update');
  }

  /**
   * Insert older points at the front of the buffer (history prepend). The
   * caller guarantees `points` are sorted ascending and all strictly before
   * the current first point — the sync reconciler only routes here after
   * proving the untouched suffix matches the previous data, so the boundary
   * is already validated and no re-sort is needed here. No-op on empty input.
   */
  prepend(points: T[]): void {
    if (points.length === 0) return;

    this.data = points.concat(this.data);
    this.fractionalPoints += countFractions(points);
    this.exited = [];
    this.cachedRange = null;
    this.emit('update');
  }

  trimStart(count: number): void {
    if (count <= 0 || this.data.length === 0) return;

    // Only the newest as many as were appended since the last trim stay drawable:
    // a rolling window slides out of view, while a one-off trim still drops at once.
    const dropped = this.data.slice(0, count);
    const sliding = dropped.slice(Math.max(0, dropped.length - this.appendedSinceTrim));
    const exited = sliding.length === dropped.length ? this.exited.concat(sliding) : sliding;
    this.data = this.data.slice(count);
    this.fractionalPoints -= countFractions(dropped);
    this.exited = this.reachedByView(exited);
    this.appendedSinceTrim = 0;
    this.lowestReadFrom = Number.POSITIVE_INFINITY;
    this.cachedRange = null;
    this.emit('update');
  }

  /**
   * The exited points the leftmost view read since the last trim needs to reach its left edge.
   * None without a read, so a chart that does not paint (a hidden tab) does not pile them up.
   */
  private reachedByView(exited: T[]): T[] {
    const from = this.lowestReadFrom;
    const head = this.data[0];
    if (head === undefined || head.time <= from) return [];

    const start = Math.max(0, binarySearch(exited, from, (d) => d.time) - 1);

    return exited.slice(start);
  }

  getAll(): T[] {
    return this.data;
  }

  getVisibleData(from: number, to: number): T[] {
    if (this.data.length === 0) return [];
    if (this.cachedRange && this.cachedRange.from === from && this.cachedRange.to === to) return this.cachedResult;

    this.lowestReadFrom = Math.min(this.lowestReadFrom, from);
    const startIdx = Math.max(0, binarySearch(this.data, from, (d) => d.time) - 1);
    const endIdx = Math.min(this.data.length, binarySearch(this.data, to, (d) => d.time) + 1);
    let result = this.data.slice(startIdx, endIdx);

    // The kept head starts inside the view: the exited points carry the series out past the left edge.
    const headInView = startIdx === 0 && this.data[0].time > from;
    if (headInView && this.exited.length > 0) {
      const exitStart = Math.max(0, binarySearch(this.exited, from, (d) => d.time) - 1);
      const exitEnd = Math.min(this.exited.length, binarySearch(this.exited, to, (d) => d.time) + 1);
      result = this.exited.slice(exitStart, exitEnd).concat(result);
    }

    this.cachedResult = result;
    this.cachedRange = { from, to };

    return result;
  }

  first(): T | undefined {
    return this.data[0];
  }

  last(): T | undefined {
    return this.data[this.data.length - 1];
  }

  get length(): number {
    return this.data.length;
  }

  isEmpty(): boolean {
    return this.data.length === 0;
  }

  /** `true` when there are points and every value is a whole number. */
  hasOnlyWholeValues(): boolean {
    return this.data.length > 0 && this.fractionalPoints === 0;
  }

  findNearest(time: number, maxDist: number): T | null {
    if (this.data.length === 0) return null;
    const idx = binarySearch(this.data, time, (d) => d.time);
    let best: T | null = null;
    let bestDist = maxDist;
    for (let i = Math.max(0, idx - 1); i <= Math.min(this.data.length - 1, idx + 1); i++) {
      const dist = Math.abs(this.data[i].time - time);
      if (dist <= bestDist) {
        bestDist = dist;
        best = this.data[i];
      }
    }
    return best;
  }
}

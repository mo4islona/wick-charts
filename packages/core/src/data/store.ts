import { EventEmitter } from '../events';
import { binarySearch } from '../utils/math';
import { warnDataOnce } from '../utils/poisoned-data-reporter';

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

/** As ms, [1e8, 1e10) is 1970-01-02 to 1970-04-26; as Unix seconds it is 1973 to 2286. */
const SECONDS_LIKE_MIN = 1e8;
const SECONDS_LIKE_MAX = 1e10;

function countFractions(points: readonly object[]): number {
  let count = 0;
  for (const point of points) {
    if (hasFraction(point)) count++;
  }

  return count;
}

/** Most decimals a value is read with: a float sum such as 0.1 + 0.2 carries noise past them. */
export const MAX_VALUE_DECIMALS = 12;

/** How a series' values are written — the default Tooltip / InfoBar format reads it. */
export interface ValueStats {
  /** Most decimals any value is written with (28.2 → 1), up to {@link MAX_VALUE_DECIMALS}. */
  decimals: number;
  /** Largest absolute value. */
  maxAbs: number;
}

/** The decimals `value` is written with, counted from `known` up: only more of them matter. */
function decimalsFrom(value: number, known: number): number {
  const abs = Math.abs(value);
  for (let d = known; d < MAX_VALUE_DECIMALS; d++) {
    const scaled = abs * 10 ** d;
    if (Math.abs(scaled - Math.round(scaled)) <= scaled * 1e-9) return d;
  }

  return MAX_VALUE_DECIMALS;
}

/** `stats` widened to cover every value field of `points`. */
function widenStats(stats: ValueStats, points: readonly object[]): ValueStats {
  let { decimals, maxAbs } = stats;
  for (const point of points) {
    for (const field of VALUE_FIELDS) {
      const value = (point as Record<string, unknown>)[field];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;

      maxAbs = Math.max(maxAbs, Math.abs(value));
      if (!Number.isInteger(value) && decimals < MAX_VALUE_DECIMALS) decimals = decimalsFrom(value, decimals);
    }
  }

  return { decimals, maxAbs };
}

const NO_STATS: ValueStats = { decimals: 0, maxAbs: 0 };

/** The stats of several stores together, `null` when none holds points. */
export function mergeValueStats(stores: readonly { valueStats(): ValueStats | null }[]): ValueStats | null {
  let merged: ValueStats | null = null;
  for (const store of stores) {
    const stats = store.valueStats();
    if (stats === null) continue;

    merged =
      merged === null
        ? stats
        : { decimals: Math.max(merged.decimals, stats.decimals), maxAbs: Math.max(merged.maxAbs, stats.maxAbs) };
  }

  return merged;
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
  // The caller may edit the last point in place before updateLast reads it.
  private lastHasFraction = false;
  // Widened by every point since the last setData; a trim or an edit never narrows it.
  private stats: ValueStats = NO_STATS;
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
    this.warnIfSeconds();
    this.fractionalPoints = countFractions(this.data);
    this.stats = widenStats(NO_STATS, this.data);
    this.lastHasFraction = this.data.length > 0 && hasFraction(this.data[this.data.length - 1]);
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
    this.warnIfSeconds();
    this.lastHasFraction = hasFraction(point);
    if (this.lastHasFraction) this.fractionalPoints++;
    this.stats = widenStats(this.stats, [point]);
    this.appendedSinceTrim++;
    this.cachedRange = null;
    this.emit('update');
  }

  updateLast(point: T): void {
    if (this.data.length === 0) return;
    if (this.lastHasFraction) this.fractionalPoints--;
    this.lastHasFraction = hasFraction(point);
    if (this.lastHasFraction) this.fractionalPoints++;
    this.stats = widenStats(this.stats, [point]);
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

    if (this.data.length === 0) this.lastHasFraction = hasFraction(points[points.length - 1]);
    this.data = points.concat(this.data);
    this.warnIfSeconds();
    this.fractionalPoints += countFractions(points);
    this.stats = widenStats(this.stats, points);
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
    if (this.data.length === 0) this.lastHasFraction = false;
    this.exited = this.reachedByView(exited);
    this.appendedSinceTrim = 0;
    this.lowestReadFrom = Number.POSITIVE_INFINITY;
    this.cachedRange = null;
    this.emit('update');
  }

  /** A series wholly inside early 1970 as ms almost surely holds Unix seconds; negative (pre-1970) times never match. */
  private warnIfSeconds(): void {
    const first = this.data[0];
    const last = this.data[this.data.length - 1];
    if (first === undefined || last === undefined) return;

    // A numeric axis keys its points by `x`, where any number is a fine X.
    if ('x' in first) return;

    const secondsLike = first.time >= SECONDS_LIKE_MIN && last.time < SECONDS_LIKE_MAX;
    if (!secondsLike) return;

    warnDataOnce({
      token: this,
      topic: 'epoch-seconds',
      message:
        `series times look like Unix seconds: time ${first.time} is ${new Date(first.time).toISOString()} ` +
        'read as milliseconds. Times are epoch milliseconds: multiply seconds by 1000, or pass `Date` objects.',
    });
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

  /** How the stored values are written, `null` without points. */
  valueStats(): ValueStats | null {
    return this.data.length > 0 ? this.stats : null;
  }

  /**
   * The point a hover at `time` reads: the nearest within `maxDist`, or with
   * `bridgeGaps` the nearest anywhere between the first and last points too.
   */
  findHovered(time: number, opts: { maxDist: number; bridgeGaps?: boolean }): T | null {
    const first = this.data[0];
    const last = this.data[this.data.length - 1];
    const inSpan = first !== undefined && last !== undefined && time >= first.time && time <= last.time;
    const bridged = opts.bridgeGaps === true && inSpan;

    return this.findNearest(time, bridged ? Number.POSITIVE_INFINITY : opts.maxDist);
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

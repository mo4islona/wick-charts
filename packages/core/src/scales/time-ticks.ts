/**
 * Time-axis ticks on calendar boundaries in the display time zone. The nominal
 * `niceTimeIntervals` spans (30-day month, 365-day year) pick the tier only.
 */

const MINUTE = 60_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const QUARTER = 90 * DAY;
const YEAR = 365 * DAY;

/** Zone offsets are cached per 15-minute bucket — every modern zone transition falls on that grid. */
const OFFSET_BUCKET = 15 * MINUTE;
const MAX_CACHED_OFFSETS = 4096;

/** Wall-clock time minus UTC at instant `t`, in ms. */
type OffsetFn = (t: number) => number;

const localOffset: OffsetFn = (t) => -new Date(t).getTimezoneOffset() * MINUTE;
const utcOffset: OffsetFn = () => 0;
const zoneOffsets = new Map<string, OffsetFn>();

export interface TimeTicksArgs {
  from: number;
  to: number;
  /** A `niceTimeIntervals` tier. */
  interval: number;
  /** IANA zone name; the local zone when omitted. */
  timeZone: string | undefined;
  max: number;
}

/** Tick times in `[from, to]` for one tier, at most `max` of them. */
export function timeTicks(args: TimeTicksArgs): number[] {
  const offsetAt = offsetFnFor(args.timeZone);
  if (args.interval < DAY) return clockTicks(args, offsetAt);

  return calendarTicks(args, offsetAt);
}

/**
 * Every instant whose wall-clock time is a multiple of the tier. Each stretch
 * of one UTC offset gets its own grid, so a wall time a DST jump skips gets no
 * tick and the repeated hour of a fall-back night gets both.
 */
function clockTicks(args: TimeTicksArgs, offsetAt: OffsetFn): number[] {
  const { from, to, interval, max } = args;
  const ticks: number[] = [];
  // A NaN edge would keep the shift search below from ever leaving the loop.
  const validRange = Number.isFinite(from) && Number.isFinite(to) && from <= to;
  if (!validRange) return ticks;

  let offset = offsetAt(from);
  // Latest instant known to hold `offset`.
  let held = from;
  let t = alignedAfter({ start: from, offset, interval });
  while (ticks.length < max) {
    // Past `to`, a shift before `to` can still pull the next boundary into view.
    const probe = Math.min(t, to);
    if (offsetAt(probe) !== offset) {
      const shift = offsetShift({ from: held, to: probe, offsetAt });
      offset = offsetAt(shift);
      held = shift;
      t = alignedAfter({ start: shift, offset, interval });

      continue;
    }

    if (t > to) break;

    ticks.push(t);
    held = t;
    t += interval;
  }

  return ticks;
}

/** The first instant at or after `start` whose wall time under `offset` is a multiple of `interval`. */
function alignedAfter(args: { start: number; offset: number; interval: number }): number {
  const { start, offset, interval } = args;

  return Math.ceil((start + offset) / interval) * interval - offset;
}

/** The first instant in `(from, to]` whose offset differs from the one at `from`. */
function offsetShift(args: { from: number; to: number; offsetAt: OffsetFn }): number {
  const { offsetAt } = args;
  const before = offsetAt(args.from);
  let low = args.from;
  let high = args.to;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (offsetAt(mid) === before) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return high;
}

function calendarTicks(args: TimeTicksArgs, offsetAt: OffsetFn): number[] {
  const { from, to, interval, max } = args;
  const boundaryAt = calendarBoundaries(interval, new Date(from + offsetAt(from)));
  const ticks: number[] = [];

  for (let i = 0; ticks.length < max; i++) {
    const t = wallToInstant(boundaryAt(i), offsetAt);
    // NaN past the Date range ends the walk too.
    if (!(t <= to)) break;

    if (t >= from) ticks.push(t);
  }

  return ticks;
}

/**
 * Wall-clock time of the `i`-th boundary of the tier, counted from the one at
 * or before `start`. `start` holds wall-clock time and is read through the UTC getters.
 */
function calendarBoundaries(interval: number, start: Date): (i: number) => number {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();

  if (interval >= YEAR) {
    const step = Math.round(interval / YEAR);
    const firstYear = Math.floor(year / step) * step;

    return (i) => wallDate({ year: firstYear + i * step, month: 0, day: 1 });
  }

  if (interval >= MONTH) {
    const step = interval >= QUARTER ? 3 : 1;
    const firstMonth = Math.floor(month / step) * step;

    return (i) => wallDate({ year, month: firstMonth + i * step, day: 1 });
  }

  if (interval >= WEEK) {
    const sinceMonday = (start.getUTCDay() + 6) % 7;

    return (i) => wallDate({ year, month, day: day - sinceMonday + i * 7 });
  }

  return (i) => wallDate({ year, month, day: day + i });
}

/** Midnight of a wall-clock date as a UTC number; months and days overflow into the next unit. */
function wallDate(args: { year: number; month: number; day: number }): number {
  // `setUTCFullYear`, not `Date.UTC`, which maps years 0–99 to 1900–1999.
  const date = new Date(0);
  date.setUTCFullYear(args.year, args.month, args.day);

  return date.getTime();
}

/**
 * The instant whose wall-clock time in the zone is `wall`. A repeated
 * fall-back time resolves to its first occurrence; a time that a DST jump
 * skips moves forward by the jump.
 */
function wallToInstant(wall: number, offsetAt: OffsetFn): number {
  // The offsets a day either side bracket any shift near `wall`.
  const early = wall - offsetAt(wall - DAY);
  const late = wall - offsetAt(wall + DAY);
  const earlyHolds = early + offsetAt(early) === wall;
  const lateHolds = late + offsetAt(late) === wall;
  if (earlyHolds && lateHolds) return Math.min(early, late);
  if (lateHolds) return late;

  // `early` holds, or a jump skips `wall` and the pre-jump offset carries it past the gap.
  return early;
}

function offsetFnFor(timeZone: string | undefined): OffsetFn {
  if (timeZone === undefined) return localOffset;
  if (timeZone === 'UTC') return utcOffset;

  let offsetAt = zoneOffsets.get(timeZone);
  if (offsetAt === undefined) {
    offsetAt = zoneOffsetFn(timeZone);
    zoneOffsets.set(timeZone, offsetAt);
  }

  return offsetAt;
}

/** Intl is the only source for a named zone; the cache keeps it off the per-frame path. */
function zoneOffsetFn(timeZone: string): OffsetFn {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const cache = new Map<number, number>();

  return (t) => {
    const bucket = Math.floor(t / OFFSET_BUCKET);
    let offset = cache.get(bucket);
    if (offset === undefined) {
      if (cache.size >= MAX_CACHED_OFFSETS) cache.clear();

      offset = readOffset(format, bucket * OFFSET_BUCKET);
      cache.set(bucket, offset);
    }

    return offset;
  };
}

function readOffset(format: Intl.DateTimeFormat, t: number): number {
  const fields = { year: 0, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  for (const part of format.formatToParts(t)) {
    if (part.type in fields) {
      fields[part.type as keyof typeof fields] = Number(part.value);
    }
  }

  const midnight = wallDate({ year: fields.year, month: fields.month - 1, day: fields.day });
  const wall = midnight + ((fields.hour * 60 + fields.minute) * 60 + fields.second) * 1000;

  return wall - t;
}

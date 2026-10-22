import type { OHLCData, OHLCInput, TimePoint, TimePointInput, TimeValue } from '../types';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const YEAR = 365 * DAY;

/** Convert a {@link TimeValue} (number ms or Date) to a millisecond timestamp. */
export function normalizeTime(t: TimeValue): number {
  return t instanceof Date ? t.getTime() : t;
}

/** Normalize the `time` field of every element in an {@link OHLCInput} array to produce {@link OHLCData}. */
export function normalizeOHLCArray(data: OHLCInput[]): OHLCData[] {
  if (data.length === 0) return data as OHLCData[];
  // Check every item: TimeValue is declared per-entry, so mixed arrays must
  // normalize the Date items even when earlier ones are already numbers.
  if (!data.some((d) => d.time instanceof Date)) return data as OHLCData[];
  return data.map((d) => ({ ...d, time: normalizeTime(d.time) }));
}

/** Normalize the `time` field of every element in a {@link TimePointInput} array to produce {@link TimePoint}. */
export function normalizeTimePointArray(data: TimePointInput[]): TimePoint[] {
  // A `null` value passes through: renderers read any non-finite value as a gap.
  if (data.length === 0) return data as TimePoint[];
  if (!data.some((d) => d.time instanceof Date)) return data as TimePoint[];
  return data.map((d) => ({ ...d, time: normalizeTime(d.time) }) as TimePoint);
}

/** Steps per window: a median over 19 shrugs off a few glitches but follows a run of finer steps. */
const INTERVAL_WINDOW = 19;

/**
 * The bar step of an ascending time array: the smallest median step over any
 * run of 20 points, so a series that switches to a finer resolution part-way
 * through is sized for its finest part. `DAY` without two distinct times.
 */
export function detectInterval(times: readonly number[]): number {
  const steps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const step = times[i] - times[i - 1];
    if (step > 0) steps.push(step);
  }

  if (steps.length === 0) return DAY;
  if (steps.length <= INTERVAL_WINDOW) return medianOf(steps);

  // Windows overlap by half, and the last one ends on the last step.
  const stride = Math.ceil(INTERVAL_WINDOW / 2);
  let finest = Number.POSITIVE_INFINITY;
  for (let end = INTERVAL_WINDOW; ; end = Math.min(end + stride, steps.length)) {
    finest = Math.min(finest, medianOf(steps.slice(end - INTERVAL_WINDOW, end)));
    if (end === steps.length) break;
  }

  return finest;
}

/** The first, or with `'end'` the last, `maxCount` items: the window a renderer's `sampleTimes` reads. */
export function sliceSample<T>(items: readonly T[], opts: { maxCount: number; from: 'start' | 'end' }): T[] {
  const { maxCount, from } = opts;
  if (from === 'start') return items.slice(0, maxCount);

  return items.slice(Math.max(0, items.length - maxCount));
}

/** Upper median; sorts `values` in place. */
function medianOf(values: number[]): number {
  values.sort((a, b) => a - b);

  return values[Math.floor(values.length / 2)];
}

/** Locale / timezone override for {@link formatTime} / {@link formatDate}. Any field omitted keeps the built-in default. */
export interface TimeFormatOptions {
  /** BCP 47 locale tag (e.g. `'de-DE'`). Default: `'en-US'`. */
  locale?: string;
  /** IANA timezone name (e.g. `'America/New_York'`). Default: the browser's local timezone. */
  timeZone?: string;
  /** 12-hour clock. Default: `false` (24-hour), preserved from the original hardcoded behavior. */
  hour12?: boolean;
}

export function formatTime(timestamp: number, interval: number, opts?: TimeFormatOptions): string {
  const d = new Date(timestamp);
  const locale = opts?.locale ?? 'en-US';
  const timeZone = opts?.timeZone;
  const hour12 = opts?.hour12 ?? false;
  if (interval >= YEAR) {
    return d.toLocaleDateString(locale, { year: 'numeric', timeZone });
  }
  if (interval >= DAY) {
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone });
  }
  // Seconds only when the step has them: minute candles read `06:15`, not `06:15:00`.
  const wholeMinutes = interval >= HOUR || (interval >= MINUTE && interval % MINUTE === 0);
  if (wholeMinutes) {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12, timeZone });
  }

  return d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12,
    timeZone,
  });
}

export function formatDate(timestamp: number, opts?: TimeFormatOptions): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString(opts?.locale ?? 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: opts?.timeZone,
  });
}

const newYearFormats = new Map<string, Intl.DateTimeFormat>();

/** Whether `timestamp` falls on January 1 in `timeZone`, the local zone when omitted. */
export function isNewYearsDay(timestamp: number, timeZone: string | undefined): boolean {
  if (timeZone === undefined) {
    const date = new Date(timestamp);

    return date.getMonth() === 0 && date.getDate() === 1;
  }

  // Built once per zone: the axis asks on every animation frame.
  let format = newYearFormats.get(timeZone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, month: 'numeric', day: 'numeric' });
    newYearFormats.set(timeZone, format);
  }

  return format.format(timestamp) === '1/1';
}

export function niceTimeIntervals(interval: number): number[] {
  const sub_minute = [1_000, 5_000, 10_000, 15_000, 30_000];
  const sub_hour = [MINUTE, 2 * MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE];
  const sub_day = [HOUR, 2 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR];
  // Day-of-month steps (2, 3, 14 days) and a half-year fill the gaps between week, month and year.
  const days = [DAY, 2 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 90 * DAY, 180 * DAY];
  const years = [YEAR, 2 * YEAR, 5 * YEAR, 10 * YEAR, 25 * YEAR, 50 * YEAR, 100 * YEAR];

  // Always include all larger interval tiers so zoomed-out views
  // can escalate beyond the data interval's native granularity
  if (interval < MINUTE) return [...sub_minute, ...sub_hour, ...sub_day, ...days, ...years];
  if (interval < HOUR) return [...sub_hour, ...sub_day, ...days, ...years];
  if (interval < DAY) return [...sub_day, ...days, ...years];
  if (interval < YEAR) return [...days, ...years];

  return years;
}

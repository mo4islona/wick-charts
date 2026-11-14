import { pickNiceCeiling } from '../scales/y-scale';
import type { HistogramBin } from '../types';

/** Options of {@link binSamples}. */
export interface BinSamplesOptions {
  /** Target bin count; the width rounds to 1, 2 or 5 × 10ⁿ. Default: Sturges' rule. */
  bins?: number;
  /** Bin width in X units. Wins over `bins`. */
  binWidth?: number;
  /** An X every bin edge steps from. Default: `0`. */
  binOrigin?: number;
}

/** How a set of samples is cut into bins: `count` bins of `width`, the first starting at `start`. */
export interface BinLayout {
  start: number;
  width: number;
  count: number;
}

/** More bins than this read as noise and cost a frame, so a finer width is widened to fit. */
export const MAX_HISTOGRAM_BINS = 2000;

/** Slack for a sample that lands on an edge through float error (`0.3 / 0.1 = 2.9999…`). */
const EDGE_EPSILON = 1e-9;

/** Sturges' rule: `⌈log₂ n⌉ + 1` bins for `n` samples. */
export function sturgesBinCount(sampleCount: number): number {
  if (sampleCount <= 1) return 1;

  return Math.ceil(Math.log2(sampleCount)) + 1;
}

/** The 1, 2 or 5 × 10ⁿ step nearest to `step` on a log scale. */
export function niceBinWidth(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 1;

  const power = Math.floor(Math.log10(step));
  const error = step / 10 ** power;

  let factor = 1;
  if (error >= Math.sqrt(50)) factor = 10;
  else if (error >= Math.sqrt(10)) factor = 5;
  else if (error >= Math.sqrt(2)) factor = 2;

  // A negative power divides, so 0.1 stays 0.1 instead of 0.1000…01.
  return power < 0 ? factor / 10 ** -power : factor * 10 ** power;
}

/** `value` rounded to 12 significant digits, which drops the float noise of `origin + i × width`. */
export function cleanEdge(value: number): number {
  return Number.parseFloat(value.toPrecision(12));
}

/**
 * The bins that cover `[min, max]`: a fixed `binWidth`, else a nice width near
 * `span / bins` (Sturges' rule on `sampleCount` without `bins`). Edges step from
 * `binOrigin`. Widened to at most {@link MAX_HISTOGRAM_BINS} bins.
 */
export function binLayout(args: { min: number; max: number; sampleCount: number } & BinSamplesOptions): BinLayout {
  const { min, max } = args;
  const origin = Number.isFinite(args.binOrigin) ? (args.binOrigin as number) : 0;
  const span = max - min;

  let width = validWidth(args.binWidth);
  if (width === null) {
    const target = validCount(args.bins) ?? sturgesBinCount(args.sampleCount);
    const fallback = Math.abs(min) / 10 || 1;
    width = niceBinWidth(span > 0 ? span / target : fallback);
  }

  if (span / width > MAX_HISTOGRAM_BINS) width = pickNiceCeiling(span / MAX_HISTOGRAM_BINS);

  const start = cleanEdge(origin + Math.floor((min - origin) / width + EDGE_EPSILON) * width);
  const count = Math.max(1, Math.ceil((max - start) / width - EDGE_EPSILON));

  return { start, width, count };
}

/** Count `samples` into the bins of `layout`. A sample past the last edge lands in the last bin. */
export function countIntoBins(samples: readonly number[], layout: BinLayout): HistogramBin[] {
  const { start, width, count } = layout;
  const counts = new Array<number>(count).fill(0);

  for (const sample of samples) {
    if (!Number.isFinite(sample)) continue;

    const index = Math.floor((sample - start) / width + EDGE_EPSILON);
    const clamped = Math.min(count - 1, Math.max(0, index));
    counts[clamped]++;
  }

  const bins: HistogramBin[] = [];
  for (let i = 0; i < count; i++) {
    bins.push({ x0: cleanEdge(start + i * width), x1: cleanEdge(start + (i + 1) * width), count: counts[i] });
  }

  return bins;
}

/** The finite min and max of `samples`, or `null` when none is finite. */
export function sampleExtent(samples: readonly number[]): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) continue;

    if (sample < min) min = sample;
    if (sample > max) max = sample;
  }

  return min <= max ? { min, max } : null;
}

/**
 * Bin raw samples into contiguous bins of one width — the binning a histogram
 * series applies to `number[]` data. Non-finite samples are skipped; with none
 * left the result is empty. Bins with no samples in the middle stay, at count 0.
 *
 * ```ts
 * binSamples([12, 18, 25, 31], { binWidth: 10 });
 * // [{ x0: 10, x1: 20, count: 2 }, { x0: 20, x1: 30, count: 1 }, { x0: 30, x1: 40, count: 1 }]
 * ```
 */
export function binSamples(samples: readonly number[], options: BinSamplesOptions = {}): HistogramBin[] {
  const extent = sampleExtent(samples);
  if (extent === null) return [];

  const layout = binLayout({ ...extent, sampleCount: samples.length, ...options });

  return countIntoBins(samples, layout);
}

/** Quantile `q` of ascending `sorted` samples, interpolated between the two nearest ranks; `null` when empty. */
export function quantileOfSorted(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;

  const position = clampUnit(q) * (sorted.length - 1);
  const below = Math.floor(position);
  const above = Math.min(sorted.length - 1, below + 1);
  const t = position - below;

  return sorted[below] + (sorted[above] - sorted[below]) * t;
}

/** Quantile `q` of binned data, spread evenly inside its bin; `null` without samples. */
export function quantileOfBins(bins: readonly HistogramBin[], q: number): number | null {
  let total = 0;
  for (const bin of bins) {
    total += Math.max(0, bin.count);
  }
  if (total <= 0) return null;

  const target = clampUnit(q) * total;
  let before = 0;
  for (const bin of bins) {
    const count = Math.max(0, bin.count);
    if (count === 0) continue;

    const after = before + count;
    if (target <= after) {
      const t = (target - before) / count;

      return bin.x0 + (bin.x1 - bin.x0) * t;
    }

    before = after;
  }

  const last = bins[bins.length - 1];

  return last.x1;
}

function clampUnit(q: number): number {
  if (!Number.isFinite(q)) return 0.5;

  return Math.min(1, Math.max(0, q));
}

function validWidth(width: number | undefined): number | null {
  return width !== undefined && Number.isFinite(width) && width > 0 ? width : null;
}

function validCount(count: number | undefined): number | null {
  return count !== undefined && Number.isFinite(count) && count >= 1 ? Math.floor(count) : null;
}

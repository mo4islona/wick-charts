import { describe, expect, it } from 'vitest';

import {
  MAX_HISTOGRAM_BINS,
  binSamples,
  niceBinWidth,
  quantileOfBins,
  quantileOfSorted,
  sturgesBinCount,
} from '../series/histogram-bins';

describe('binSamples', () => {
  it('cuts samples into bins of a fixed width with edges on multiples of it', () => {
    const bins = binSamples([12, 18, 25, 31], { binWidth: 10 });

    expect(bins).toEqual([
      { x0: 10, x1: 20, count: 2 },
      { x0: 20, x1: 30, count: 1 },
      { x0: 30, x1: 40, count: 1 },
    ]);
  });

  it('keeps empty bins in the middle, so the bars stay contiguous', () => {
    const bins = binSamples([1, 2, 41], { binWidth: 10 });

    expect(bins.map((bin) => bin.count)).toEqual([2, 0, 0, 0, 1]);
  });

  it('puts a sample on the last edge into the last bin', () => {
    const bins = binSamples([0, 50, 100], { binWidth: 50 });

    expect(bins).toEqual([
      { x0: 0, x1: 50, count: 1 },
      { x0: 50, x1: 100, count: 2 },
    ]);
  });

  it('steps edges from binOrigin', () => {
    const bins = binSamples([3, 14], { binWidth: 10, binOrigin: 5 });

    expect(bins.map((bin) => bin.x0)).toEqual([-5, 5]);
  });

  it('counts a sample on an edge into the bin that starts there, despite float error', () => {
    const bins = binSamples([0.3], { binWidth: 0.1 });

    expect(bins).toEqual([{ x0: 0.3, x1: 0.4, count: 1 }]);
  });

  it('defaults to Sturges’ rule with a 1-2-5 width', () => {
    const samples = Array.from({ length: 1000 }, (_, i) => i / 10);
    const bins = binSamples(samples);

    expect(sturgesBinCount(1000)).toBe(11);
    expect(bins[0].x1 - bins[0].x0).toBe(10);
    expect(bins.length).toBe(10);
  });

  it('takes a target bin count', () => {
    const bins = binSamples([0, 100], { bins: 20 });

    expect(bins[0].x1 - bins[0].x0).toBe(5);
  });

  it('skips non-finite samples and returns nothing without a finite one', () => {
    expect(binSamples([Number.NaN, Number.POSITIVE_INFINITY])).toEqual([]);
    expect(binSamples([1, Number.NaN], { binWidth: 1 })).toEqual([{ x0: 1, x1: 2, count: 1 }]);
  });

  it('widens a width that would make too many bins', () => {
    const bins = binSamples([0, 1_000_000], { binWidth: 1 });

    expect(bins.length).toBeLessThanOrEqual(MAX_HISTOGRAM_BINS + 1);
  });

  it('makes one bin for samples that are all equal', () => {
    expect(binSamples([5, 5, 5], { binWidth: 2 })).toEqual([{ x0: 4, x1: 6, count: 3 }]);
  });
});

describe('niceBinWidth', () => {
  it('rounds to 1, 2 or 5 × 10ⁿ', () => {
    expect(niceBinWidth(13)).toBe(10);
    expect(niceBinWidth(17)).toBe(20);
    expect(niceBinWidth(40)).toBe(50);
    expect(niceBinWidth(0.03)).toBe(0.02);
  });
});

describe('quantiles', () => {
  it('interpolates between the ranks of sorted samples', () => {
    expect(quantileOfSorted([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantileOfSorted([1, 2, 3, 4], 1)).toBe(4);
    expect(quantileOfSorted([], 0.5)).toBeNull();
  });

  it('spreads samples evenly inside a bin', () => {
    const bins = [
      { x0: 0, x1: 10, count: 50 },
      { x0: 10, x1: 20, count: 50 },
    ];

    expect(quantileOfBins(bins, 0.5)).toBe(10);
    expect(quantileOfBins(bins, 0.75)).toBe(15);
    expect(quantileOfBins([], 0.5)).toBeNull();
  });
});

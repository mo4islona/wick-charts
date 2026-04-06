import { describe, expect, it, vi } from 'vitest';

import type { ChartInstance } from '../chart';
import { syncSeriesData } from '../data/sync';

/** Minimal mock — only the methods syncSeriesData calls. */
function mockChart() {
  return {
    setSeriesData: vi.fn(),
    updateData: vi.fn(),
    appendData: vi.fn(),
  } as unknown as ChartInstance;
}

const point = (time: number) => ({ time, value: time });

describe('syncSeriesData', () => {
  it('full replace on first load (prevLen === 0)', () => {
    const chart = mockChart();
    const data = [point(1), point(2), point(3)];
    const next = syncSeriesData(chart, 'a', data, 0);
    expect(chart.setSeriesData).toHaveBeenCalledWith('a', data);
    expect(next).toBe(3);
  });

  it('updates last point when length unchanged', () => {
    const chart = mockChart();
    const data = [point(1), point(2), point(3)];
    const next = syncSeriesData(chart, 'a', data, 3);
    expect(chart.updateData).toHaveBeenCalledWith('a', point(3));
    expect(next).toBe(3);
  });

  it('appends when 1-5 new points added', () => {
    const chart = mockChart();
    const data = [point(1), point(2), point(3), point(4)];
    const next = syncSeriesData(chart, 'a', data, 3);
    expect(chart.appendData).toHaveBeenCalledWith('a', point(4));
    expect(next).toBe(4);
  });

  it('clears series and resets prevLen on empty data', () => {
    const chart = mockChart();
    const next = syncSeriesData(chart, 'a', [], 10);
    expect(chart.setSeriesData).toHaveBeenCalledWith('a', []);
    expect(next).toBe(0);
  });

  it('full replace after clear → refill (no stale index)', () => {
    const chart = mockChart();
    // Load initial data
    const data1 = [point(1), point(2), point(3)];
    let prev = syncSeriesData(chart, 'a', data1, 0);
    expect(prev).toBe(3);

    // Clear
    prev = syncSeriesData(chart, 'a', [], prev);
    expect(prev).toBe(0);

    // Refill with similar count — should do full replace, not append from stale index
    const data2 = [point(10), point(20), point(30)];
    prev = syncSeriesData(chart, 'a', data2, prev);
    expect(chart.setSeriesData).toHaveBeenLastCalledWith('a', data2);
    expect(prev).toBe(3);
  });
});

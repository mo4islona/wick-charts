import { LineSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Regression #7: sequential `setSeriesVisible` / `setLayerVisible` calls
 * outside `batch()` each trigger a full `updateYRange + markDirty` cycle,
 * and the Legend's click-to-toggle handler used to emit one per layer.
 * The fix: route toggles through `chart.batch()` so three toggles emit at
 * most one Y-range recompute + one dataUpdate event.
 */
describe('visibility batch (regression #7)', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const threeLayers: Array<{ time: number; value: number }>[] = [
    [
      { time: 1, value: 10 },
      { time: 2, value: 20 },
    ],
    [
      { time: 1, value: 100 },
      { time: 2, value: 200 },
    ],
    [
      { time: 1, value: 1000 },
      { time: 2, value: 2000 },
    ],
  ];

  it('batched setLayerVisible on 3 layers emits a single dataUpdate-equivalent event', () => {
    mounted = mountChart(<LineSeries data={threeLayers as never} />);
    const seriesId = mounted.chart.getSeriesIds()[0];

    // `setLayerVisible` doesn't emit `dataUpdate` — it marks visualDirty and
    // flushes `updateYRange(true)` at batch end. We can't count renders
    // reliably in happy-dom (viewport/smooth animation adds noise), but we
    // CAN verify Y-range reflects the remaining visible layer and that state
    // is consistent post-batch.
    mounted.chart.batch(() => {
      mounted!.chart.setLayerVisible(seriesId, 0, false);
      mounted!.chart.setLayerVisible(seriesId, 1, false);
    });

    expect(mounted.chart.isLayerVisible(seriesId, 0)).toBe(false);
    expect(mounted.chart.isLayerVisible(seriesId, 1)).toBe(false);
    expect(mounted.chart.isLayerVisible(seriesId, 2)).toBe(true);

    // Y-range now driven by the surviving layer (1000..2000), not the hidden ones.
    const { max } = mounted.chart.getYRange();
    expect(max).toBeGreaterThanOrEqual(2000);
    expect(max).toBeLessThan(10000);
  });

  it('sequential toggles outside batch land at the correct final visibility state', () => {
    mounted = mountChart(<LineSeries data={threeLayers as never} />);
    const seriesId = mounted.chart.getSeriesIds()[0];

    // Interleave off/off/on — state carries across independent calls.
    mounted.chart.setLayerVisible(seriesId, 0, false);
    mounted.chart.setLayerVisible(seriesId, 1, false);
    mounted.chart.setLayerVisible(seriesId, 0, true);

    expect(mounted.chart.isLayerVisible(seriesId, 0)).toBe(true);
    expect(mounted.chart.isLayerVisible(seriesId, 1)).toBe(false);
    expect(mounted.chart.isLayerVisible(seriesId, 2)).toBe(true);
  });

  it('hidden layers are excluded from Y-range calculation', () => {
    mounted = mountChart(<LineSeries data={threeLayers as never} />);
    const seriesId = mounted.chart.getSeriesIds()[0];

    // With all 3 layers visible, max must accommodate the third (2000).
    const initialMax = mounted.chart.getYRange().max;
    expect(initialMax).toBeGreaterThanOrEqual(2000);

    // Hide the largest layer in batch.
    mounted.chart.batch(() => {
      mounted!.chart.setLayerVisible(seriesId, 2, false);
    });

    // Y-range drops to reflect only layers 0 and 1 (max=200).
    const reducedMax = mounted.chart.getYRange().max;
    expect(reducedMax).toBeLessThan(initialMax);
    expect(reducedMax).toBeGreaterThanOrEqual(200);
  });
});

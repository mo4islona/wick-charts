// @vitest-environment happy-dom
/**
 * Two contracts behind how the grid is formed:
 *
 * 1. A tween never leaves the pane visibly short of gridlines.
 * 2. Label and gridline resolve a value to the same device pixel.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';
import { crispCenterOffset } from '../utils/pixel-grid';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const INTERVAL = 60_000;
const PANE_WIDTH = 800;

function makeChart(): { chart: ChartInstance; container: HTMLElement } {
  const container = makeChartContainer();

  return { chart: new ChartInstance(container, { interactive: false }), container };
}

/** Gridlines the viewer can actually see: faded in, and inside the pane. */
function visibleXTicks(chart: ChartInstance): number[] {
  return chart.timeScale.tickTracker
    .snapshot()
    .entries.filter((e) => e.opacity > 0.01)
    .map((e) => chart.timeScale.timeToX(e.value))
    .filter((x) => x >= 0 && x <= PANE_WIDTH);
}

function seedLine(chart: ChartInstance, count: number): string {
  const id = chart.addSeries('line');
  chart.setSeriesData(
    id,
    Array.from({ length: count }, (_, i) => ({ time: 1_000_000 + i * INTERVAL, value: 50 + (i % 20) * 3 })),
  );

  return id;
}

describe('the grid stays populated across a viewport tween', () => {
  let chart: ChartInstance;
  let container: HTMLElement;
  let raf: ReturnType<typeof installRaf>;

  beforeEach(() => {
    raf = installRaf();
  });

  afterEach(() => {
    chart?.destroy();
    container?.remove();
    raf.uninstall();
  });

  it('keeps gridlines inside the pane through a zoom-in tween', () => {
    ({ chart, container } = makeChart());
    seedLine(chart, 200);
    raf.flush(80);

    chart.setVisibleRange({ from: 1_000_000 + 40 * INTERVAL, to: 1_000_000 + 60 * INTERVAL }, { gesture: true });

    for (let i = 0; i < 12; i++) {
      raf.flush(1);
      // Counted on screen, not in the tracker: a tracker entry positioned off
      // the pane is a line the viewer never sees, so `entries.length` would
      // pass on a grid that has visibly emptied.
      expect(visibleXTicks(chart).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('never shows fewer gridlines mid-zoom-out than the window it started from', () => {
    // Zooming out only ever adds room for ticks, so the count must not dip.
    // It did when membership resolved against the viewport target: the incoming
    // coarse set mapped outside the still-narrow window and the pane went down
    // to a single line for the opening frames.
    ({ chart, container } = makeChart());
    seedLine(chart, 200);
    raf.flush(80);

    chart.setVisibleRange({ from: 1_000_000 + 40 * INTERVAL, to: 1_000_000 + 50 * INTERVAL });
    raf.flush(80);
    const settled = visibleXTicks(chart).length;
    expect(settled).toBeGreaterThanOrEqual(2);

    chart.setVisibleRange({ from: 1_000_000, to: 1_000_000 + 199 * INTERVAL }, { gesture: true });

    for (let i = 0; i < 12; i++) {
      raf.flush(1);
      expect(visibleXTicks(chart).length).toBeGreaterThanOrEqual(settled);
    }
  });

  it('has ticks on the first frame after data lands', () => {
    ({ chart, container } = makeChart());
    seedLine(chart, 20);
    raf.flush(1);

    expect(chart.yScale.niceTickValues().length).toBeGreaterThan(0);
  });
});

describe('axis labels share the gridline pixel grid', () => {
  let chart: ChartInstance;
  let container: HTMLElement;
  let raf: ReturnType<typeof installRaf>;

  beforeEach(() => {
    raf = installRaf();
  });

  afterEach(() => {
    chart?.destroy();
    container?.remove();
    raf.uninstall();
  });

  it('snaps the Y label to the stroke center the canvas draws', () => {
    ({ chart, container } = makeChart());
    seedLine(chart, 40);
    raf.flush(60);

    const ticks = chart.yScale.niceTickValues();
    expect(ticks.length).toBeGreaterThan(0);

    const ratio = window.devicePixelRatio || 1;
    for (const value of ticks) {
      const lineCenterDevice = chart.yScale.valueToBitmapY(value) + crispCenterOffset(ratio);
      expect(chart.yScale.valueToSnappedY(value) * ratio).toBeCloseTo(lineCenterDevice, 10);
    }
  });

  it('snaps the X label to the stroke center the canvas draws', () => {
    ({ chart, container } = makeChart());
    seedLine(chart, 40);
    raf.flush(60);

    const ticks = chart.timeScale.niceTickValues(chart.getDataInterval()).ticks;
    expect(ticks.length).toBeGreaterThan(0);

    const ratio = window.devicePixelRatio || 1;
    for (const time of ticks) {
      const lineCenterDevice = chart.timeScale.timeToBitmapX(time) + crispCenterOffset(ratio);
      expect(chart.timeScale.timeToSnappedX(time) * ratio).toBeCloseTo(lineCenterDevice, 10);
    }
  });

  it('lands on the device grid rather than a fractional CSS pixel', () => {
    ({ chart, container } = makeChart());
    seedLine(chart, 40);
    raf.flush(60);

    // DPR 1 in happy-dom: a 1px stroke needs the half-pixel center, so every
    // snapped position is exactly `integer + 0.5`.
    for (const value of chart.yScale.niceTickValues()) {
      const snapped = chart.yScale.valueToSnappedY(value);
      expect(snapped - Math.floor(snapped)).toBeCloseTo(0.5, 10);
    }
  });
});

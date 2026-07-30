// @vitest-environment happy-dom
/**
 * Two contracts behind how the grid is formed.
 *
 * 1. Membership resolves against the viewport's *target*, positions against
 *    its eased current range. A retarget is therefore one cross-fade held for
 *    the whole tween — the outgoing set keeps painting at a falling opacity —
 *    instead of per-frame churn as the eased range sweeps past each tick
 *    boundary, which is what made the grid look jittery.
 *
 * 2. The DOM axis label and the canvas gridline resolve a value to the same
 *    device pixel. Positioning the label off the unrounded value left it up to
 *    half a CSS pixel above or below the line it names.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import { crispCenterOffset } from '../utils/pixel-grid';

const INTERVAL = 60_000;

function installRaf(): { flush: (frames?: number) => void; uninstall: () => void } {
  let nextId = 1;
  let now = 0;
  let queue: Array<{ id: number; cb: FrameRequestCallback }> = [];
  const origRaf = globalThis.requestAnimationFrame;
  const origCancel = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = nextId++;
    queue.push({ id, cb });

    return id;
  };
  globalThis.cancelAnimationFrame = (id: number) => {
    queue = queue.filter((f) => f.id !== id);
  };

  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);

  return {
    flush: (frames = 50) => {
      for (let i = 0; i < frames; i++) {
        if (queue.length === 0) return;
        const pending = queue;
        queue = [];
        now += 16;
        for (const f of pending) f.cb(now);
      }
    },
    uninstall: () => {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.cancelAnimationFrame = origCancel;
      spy.mockRestore();
      queue = [];
    },
  };
}

function makeChart(): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  const rect: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 400,
    right: 800,
    width: 800,
    height: 400,
    toJSON: () => ({}),
  };
  container.getBoundingClientRect = () => rect;
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, { interactive: false }), container };
}

function seedLine(chart: ChartInstance, count: number): string {
  const id = chart.addSeries('line');
  chart.setSeriesData(
    id,
    Array.from({ length: count }, (_, i) => ({ time: 1_000_000 + i * INTERVAL, value: 50 + (i % 20) * 3 })),
  );

  return id;
}

describe('grid tick membership resolves against the viewport target', () => {
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

  it('holds one X tick set for the whole zoom tween while the visual range still moves', () => {
    ({ chart, container } = makeChart());
    seedLine(chart, 200);
    raf.flush(80);

    const interval = chart.getDataInterval();
    chart.setVisibleRange({ from: 1_000_000 + 40 * INTERVAL, to: 1_000_000 + 60 * INTERVAL }, { gesture: true });

    // `getVisibleRange` reports the committed target, so read the eased visual
    // range through the scale instead: where a fixed timestamp lands on screen.
    const probe = 1_000_000 + 50 * INTERVAL;
    const sets: string[] = [];
    const positions: number[] = [];
    for (let i = 0; i < 12; i++) {
      raf.flush(1);
      sets.push(chart.timeScale.niceTickValues(interval).ticks.join(','));
      positions.push(chart.timeScale.timeToX(probe));
    }

    // The visual range is genuinely easing across these frames...
    expect(new Set(positions).size).toBeGreaterThan(3);
    // ...while the tick set the grid draws never restages mid-flight.
    expect(new Set(sets).size).toBe(1);
  });

  it('keeps painting the outgoing set during the tween so the pane never empties', () => {
    ({ chart, container } = makeChart());
    seedLine(chart, 200);
    raf.flush(80);

    chart.setVisibleRange({ from: 1_000_000 + 40 * INTERVAL, to: 1_000_000 + 60 * INTERVAL }, { gesture: true });

    for (let i = 0; i < 12; i++) {
      raf.flush(1);
      // Entering and leaving values are both alive in the tracker, so there is
      // always something to draw — a zoom that coarsens the interval cannot
      // blank the grid while the viewport is in flight.
      expect(chart.timeScale.tickTracker.snapshot().entries.length).toBeGreaterThan(0);
    }
  });

  it('falls back to the visual range before a target exists', () => {
    // Fresh mount: the engine's target is still the degenerate seed range, so
    // resolving ticks against it would yield an empty set and no grid at all.
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

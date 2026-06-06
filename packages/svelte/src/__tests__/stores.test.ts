import { ChartInstance } from '@wick-charts/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLastYValue } from '../stores';

/**
 * Svelte `createLastYValue` — pixel-Y tracking parity with React.
 *
 * The store must re-emit when a pan/zoom/resize moves the value's pixel Y even
 * though the numeric value (and `isLive`) are unchanged — otherwise a
 * consumer-positioned badge freezes mid-gesture. The store is a plain svelte
 * `readable`, so it's exercised directly against a headless core chart (no
 * component harness needed).
 */

function seedRect(el: HTMLElement, width: number, height: number): void {
  const rect: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: height,
    right: width,
    width,
    height,
    toJSON: () => ({}),
  };
  el.getBoundingClientRect = () => rect;
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
}

// `emit` is protected; reach it via cast to drive a `viewportChange` without
// the side effects of a real pan (the core suite uses this same escape hatch).
function emit(chart: ChartInstance, event: string): void {
  (chart as unknown as { emit: (e: string) => void }).emit(event);
}

describe('Svelte createLastYValue — pixel-Y tracking', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    seedRect(container, 800, 400);
    document.body.appendChild(container);
    chart = new ChartInstance(container, { interactive: false });
    const id = chart.addSeries('line', { id: 'line-id' });
    chart.setSeriesData(
      id,
      Array.from({ length: 30 }, (_, i) => ({ time: i + 1, value: i * 10 + 5 })),
    );
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    vi.restoreAllMocks();
  });

  it('re-emits when the pixel Y drifts even though the value is unchanged', () => {
    const store = createLastYValue(chart, 'line-id');
    const seen: Array<{ value: number; isLive: boolean } | null> = [];
    const unsub = store.subscribe((v) => seen.push(v));

    // Freeze the reported value/isLive so only the pixel Y can change, and
    // drive `valueToY` so a `viewportChange` reads a drifted pixel.
    vi.spyOn(chart, 'getLastValue').mockImplementation(() => ({ value: 295, isLive: true }));
    let pixelY = 100;
    vi.spyOn(chart.yScale, 'valueToY').mockImplementation(() => pixelY);

    // Sync the store onto the frozen baseline (first emit after the spies).
    emit(chart, 'viewportChange');
    const countAfterSync = seen.length;

    // Pixel Y moves; value/isLive are identical — must still re-emit.
    pixelY = 260;
    emit(chart, 'viewportChange');
    expect(seen.length).toBe(countAfterSync + 1);

    // Pixel Y unchanged — must NOT re-emit (early-return guard holds).
    emit(chart, 'viewportChange');
    expect(seen.length).toBe(countAfterSync + 1);

    unsub();
  });
});

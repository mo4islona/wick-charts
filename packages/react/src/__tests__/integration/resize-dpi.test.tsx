import { CandlestickSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Regression #6 (black flash on resize): the resize path runs `renderMain()`
 * synchronously (not via the RAF scheduler) so that the freshly-zeroed canvas
 * is repainted in the same tick. Tests lock in:
 *   - ResizeObserver callback triggers a redraw
 *   - `clearRect` → draw-primitives sequence on the SAME frame (no interim blank)
 *   - Bitmap width/height reflect media × DPR
 */
describe('resize / DPI handling (regression #6)', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const data = [
    { time: 1, open: 10, high: 12, low: 9, close: 11 },
    { time: 2, open: 11, high: 13, low: 10, close: 12 },
  ];

  it('resize triggers a synchronous redraw: clearRect then fills in one sequence', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400 });

    mounted.mainSpy.reset();
    mounted.triggerResize(1000, 500);

    // clearRect opens the frame, fillRects follow — assert the order holds.
    expect(mounted.mainSpy.countOf('clearRect')).toBeGreaterThanOrEqual(1);
    expect(mounted.mainSpy.countOf('fillRect')).toBeGreaterThan(0);
    expect(mounted.mainSpy.matchesSequence(['clearRect', 'fillRect'])).toBe(true);
  });

  it('canvas bitmap size tracks media × devicePixelRatio', () => {
    // DPR = 2 → 800×400 CSS canvas becomes 1600×800 bitmap.
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400, dpr: 2 });
    mounted.triggerResize(800, 400);

    expect(mounted.mainCanvas.width).toBe(1600);
    expect(mounted.mainCanvas.height).toBe(800);
  });

  it('resize to a new size updates canvas bitmap dimensions accordingly', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400 });
    const initialWidth = mounted.mainCanvas.width;

    mounted.triggerResize(1000, 500);

    expect(mounted.mainCanvas.width).toBeGreaterThan(initialWidth);
    expect(mounted.mainCanvas.height).toBe(500);
  });
});

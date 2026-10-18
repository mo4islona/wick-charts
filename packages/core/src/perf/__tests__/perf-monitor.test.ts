import { describe, expect, it } from 'vitest';

import { PerfMonitor } from '../perf-monitor';

describe('PerfMonitor', () => {
  it('getStats returns zeroed stats before any frame is recorded', () => {
    const m = new PerfMonitor();
    const stats = m.getStats();

    expect(stats.mainRendersPerSec).toBe(0);
    expect(stats.overlayRendersPerSec).toBe(0);
    expect(stats.mainFrameMs).toEqual({ last: 0, p50: 0, p95: 0 });
    expect(stats.overlayFrameMs).toEqual({ last: 0, p50: 0, p95: 0 });
    expect(stats.frameCount).toEqual({ main: 0, overlay: 0 });
    expect(stats.drawCalls.main).toEqual({});
    expect(stats.drawCalls.overlay).toEqual({});
    expect(stats.perSeries).toEqual({});
  });

  it('increments frameCount per layer', () => {
    const m = new PerfMonitor();
    m.recordFrame('main', 1, 0);
    m.recordFrame('main', 1, 16);
    m.recordFrame('overlay', 1, 8);

    expect(m.getStats().frameCount).toEqual({ main: 2, overlay: 1 });
  });

  it('computes p50/p95 from recorded main frames', () => {
    const m = new PerfMonitor();
    // Ten samples, 1..10 ms. p50 at index 5 → 6, p95 at index 9 → 10.
    for (let i = 1; i <= 10; i++) m.recordFrame('main', i, i * 16);

    const { mainFrameMs } = m.getStats();
    expect(mainFrameMs.p50).toBe(6);
    expect(mainFrameMs.p95).toBe(10);
  });

  it('derives FPS from the span between first and last main-frame timestamps', () => {
    const m = new PerfMonitor();
    // Four frames across 48ms (16ms apart) → 3 gaps of 16ms → 62.5 fps.
    m.recordFrame('main', 1, 0);
    m.recordFrame('main', 1, 16);
    m.recordFrame('main', 1, 32);
    m.recordFrame('main', 1, 48);

    const stats = m.getStats();
    expect(stats.mainRendersPerSec).toBeCloseTo(62.5, 2);
  });

  it('reports the trailing continuous run rate, not the window average, after an idle stretch', () => {
    const m = new PerfMonitor();
    // A stray frame, two seconds of idle, then a 62.5fps burst. The window
    // average (~1.3/s) would make the readout slowly ramp up to the true rate;
    // the trailing run reports it immediately.
    m.recordFrame('main', 1, 0);
    m.recordFrame('main', 1, 2000);
    m.recordFrame('main', 1, 2016);
    m.recordFrame('main', 1, 2032);

    expect(m.getStats().mainRendersPerSec).toBeCloseTo(62.5, 2);
  });

  it('falls back to the window-wide average for sparse on-demand renders', () => {
    const m = new PerfMonitor();
    // One render per second — slower than the continuous-run gap, so the
    // trailing run is a single frame and the window average (1/s) applies.
    m.recordFrame('main', 1, 0);
    m.recordFrame('main', 1, 1000);
    m.recordFrame('main', 1, 2000);

    expect(m.getStats().mainRendersPerSec).toBeCloseTo(1, 2);
  });

  it('tracks overlay renders/sec separately from main', () => {
    const m = new PerfMonitor();
    // Main: 2 frames across 100ms → 10/s. Overlay: 5 frames across 100ms → 40/s.
    m.recordFrame('main', 1, 0);
    m.recordFrame('main', 1, 100);
    m.recordFrame('overlay', 1, 0);
    m.recordFrame('overlay', 1, 25);
    m.recordFrame('overlay', 1, 50);
    m.recordFrame('overlay', 1, 75);
    m.recordFrame('overlay', 1, 100);

    const stats = m.getStats();
    expect(stats.mainRendersPerSec).toBeCloseTo(10, 2);
    expect(stats.overlayRendersPerSec).toBeCloseTo(40, 2);
  });

  it('exposes the last frame time alongside percentiles', () => {
    const m = new PerfMonitor();
    m.recordFrame('main', 2, 0);
    m.recordFrame('main', 8, 16);
    m.recordFrame('main', 3, 32);

    expect(m.getStats().mainFrameMs.last).toBe(3);
  });

  it('buckets main- and overlay-frame samples separately', () => {
    const m = new PerfMonitor();
    m.recordFrame('main', 5, 0);
    m.recordFrame('overlay', 2, 0);
    m.recordFrame('overlay', 4, 16);

    const stats = m.getStats();
    expect(stats.mainFrameMs.p50).toBe(5);
    expect(stats.overlayFrameMs.p50).toBe(4);
  });

  it('records per-series samples under the series id', () => {
    const m = new PerfMonitor();
    m.recordSeries('candle', 2, 16);
    m.recordSeries('candle', 4, 32);
    m.recordSeries('line', 1, 32);

    const stats = m.getStats();
    expect(stats.perSeries.candle).toEqual({ last: 4, p50: 4, p95: 4 });
    expect(stats.perSeries.line).toEqual({ last: 1, p50: 1, p95: 1 });
  });

  it('merges paints that share a timestamp into one frame sample', () => {
    const m = new PerfMonitor();
    // Two charts on one monitor, two rAF frames: each frame gets one paint per chart.
    m.recordFrame('main', 3, 16);
    m.recordFrame('main', 2, 16);
    m.recordFrame('main', 3, 32);
    m.recordFrame('main', 2, 32);

    const stats = m.getStats();
    expect(stats.frameCount.main).toBe(2);
    expect(stats.mainFrameMs.last).toBe(5);
    expect(stats.mainRendersPerSec).toBe(62.5);
  });

  it('merges per-series samples that share a timestamp', () => {
    const m = new PerfMonitor();
    m.recordSeries('candle', 2, 16);
    m.recordSeries('candle', 3, 16);

    expect(m.getStats().perSeries.candle).toEqual({ last: 5, p50: 5, p95: 5 });
  });

  it('keeps the draw-call tally when a second chart paints the same frame', () => {
    const m = new PerfMonitor();

    m.resetDrawCalls('main', 16);
    m.drawCallsMain.set('fillRect', 3);
    m.recordFrame('main', 1, 16);

    m.resetDrawCalls('main', 16);
    m.drawCallsMain.set('fillRect', (m.drawCallsMain.get('fillRect') ?? 0) + 2);
    m.recordFrame('main', 1, 16);

    expect(m.getStats().drawCalls.main).toEqual({ fillRect: 5 });

    m.resetDrawCalls('main', 32);
    expect(m.drawCallsMain.size).toBe(0);
  });

  it('resetDrawCalls clears the tally Map in place, keeping the same reference', () => {
    const m = new PerfMonitor();
    const mainMap = m.drawCallsMain;
    mainMap.set('fillRect', 3);
    mainMap.set('stroke', 1);

    m.resetDrawCalls('main');

    expect(m.drawCallsMain).toBe(mainMap);
    expect(mainMap.size).toBe(0);
  });

  it('drops samples older than the time window', () => {
    const m = new PerfMonitor({ windowMs: 1000 });
    // A slow frame at t=0 that will fall out of the window once t advances past 1000.
    m.recordFrame('main', 100, 0);
    m.recordFrame('main', 2, 16);
    m.recordFrame('main', 2, 500);
    m.recordFrame('main', 2, 1200); // 1200 - 1000 = 200 cutoff — the 100ms outlier at t=0 drops.

    const { mainFrameMs } = m.getStats();
    expect(mainFrameMs.p95).toBe(2);
  });

  it('enforces a hard cap on retained samples', () => {
    const m = new PerfMonitor({ windowMs: 10_000_000, maxSamples: 3 });
    // All within the (huge) window, so only the maxSamples cap trims.
    m.recordFrame('main', 10, 1);
    m.recordFrame('main', 1, 2);
    m.recordFrame('main', 1, 3);
    m.recordFrame('main', 1, 4); // cap is 3 — the 10 falls out.

    expect(m.getStats().mainFrameMs.p95).toBe(1);
  });

  it('trims per-series samples by the same window', () => {
    const m = new PerfMonitor({ windowMs: 1000 });
    m.recordFrame('main', 1, 0);
    m.recordSeries('candle', 50, 0);
    m.recordFrame('main', 1, 500);
    m.recordSeries('candle', 2, 500);
    m.recordFrame('main', 1, 1200); // Pushes the t=0 'candle' sample out.
    m.recordSeries('candle', 2, 1200);

    expect(m.getStats().perSeries.candle.p95).toBe(2);
  });

  it('emits stats to onFrame subscribers on each recordFrame', () => {
    const m = new PerfMonitor();
    const received: number[] = [];
    m.onFrame((stats) => received.push(stats.mainFrameMs.p50));

    m.recordFrame('main', 4, 0);
    m.recordFrame('main', 8, 16);

    expect(received).toHaveLength(2);
    expect(received[1]).toBe(8);
  });

  it('onFrame returns an unsubscribe that stops further deliveries', () => {
    const m = new PerfMonitor();
    let calls = 0;
    const off = m.onFrame(() => {
      calls++;
    });

    m.recordFrame('main', 1, 0);
    off();
    m.recordFrame('main', 1, 16);

    expect(calls).toBe(1);
  });
});

import { CandlestickSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { CanvasRecorder, RecordedCall } from '../../../../core/src/testing/recording-context';
import { mountChart } from '../helpers/mount-chart';

/**
 * The crosshair hairlines melt at the pane edges in step with the main-layer
 * content: the vertical line overruns the pane floor and tapers toward the
 * time-axis labels exactly like a gridline stub, and the horizontal line
 * rides under the Y-axis column through the shared right-fade ramp instead
 * of stopping dead at the pane edge. All erases are alpha
 * (`destination-out`) on the overlay layer, applied while the crosshair is
 * the only content there.
 *
 * Geometry at the default 800×400 / dpr 1 mount: pane = 745×370, right ramp
 * = [697, 757), gridline tail = 9px, so the crosshair clip spans 757×379.
 */
describe('crosshair edge melt', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const data = Array.from({ length: 30 }, (_, i) => ({
    time: 1_000_000 + i * 60_000,
    open: 100 + i,
    high: 105 + i,
    low: 95 + i,
    close: 102 + i,
  }));

  function overlayEraseRects(spy: CanvasRecorder): RecordedCall[] {
    return spy.callsOf('fillRect').filter((c) => c.globalCompositeOperation === 'destination-out');
  }

  /** The below-pane taper: the one erase anchored at the pane floor. */
  function tailTaperRects(spy: CanvasRecorder): RecordedCall[] {
    return overlayEraseRects(spy).filter((c) => c.args[1] === 370);
  }

  function showCrosshair(chart: ReturnType<typeof mountChart>['chart']): void {
    chart.setCrosshair({ time: 1_000_000 + 15 * 60_000, y: 110 });
  }

  it('overruns the pane floor and tapers toward the time-axis labels', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400 });

    mounted.overlaySpy.reset();
    showCrosshair(mounted.chart);
    mounted.flushScheduler();

    // Clip widens past the pane by the right-fade intrusion (12px) and the
    // gridline-tail overrun (9px) so the hairlines can reach the melt zones.
    const clips = mounted.overlaySpy.callsOf('rect');
    expect(clips.some((c) => c.args[0] === 0 && c.args[1] === 0 && c.args[2] === 757 && c.args[3] === 379)).toBe(true);

    // The overrun dissolves through the same ramp the gridline stubs use:
    // nothing erased at the pane floor, total at the strip's bottom edge.
    const tapers = tailTaperRects(mounted.overlaySpy);
    expect(tapers.length).toBeGreaterThan(0);
    const taper = tapers[tapers.length - 1];
    expect(taper.args).toEqual([0, 370, 800, 9]);
    expect(taper.fillStyle).toContain('0:rgba(0, 0, 0, 0)');
    expect(taper.fillStyle).toContain('1:rgba(0, 0, 0, 1)');
  });

  it('rides under the Y-axis column through the shared right-fade ramp', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400 });

    mounted.overlaySpy.reset();
    showCrosshair(mounted.chart);
    mounted.flushScheduler();

    const rightMasks = overlayEraseRects(mounted.overlaySpy).filter((c) => (c.args[0] as number) > 0);
    expect(rightMasks.length).toBeGreaterThan(0);
    expect(rightMasks[rightMasks.length - 1].args).toEqual([697, 0, 60, 400]);
  });

  it('melts under a configured top fade zone too', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400, fade: { top: 80 } });

    mounted.overlaySpy.reset();
    showCrosshair(mounted.chart);
    mounted.flushScheduler();

    const topMasks = overlayEraseRects(mounted.overlaySpy).filter((c) => c.args[1] === 0 && c.args[0] === 0);
    expect(topMasks.some((c) => c.args[2] === 800 && c.args[3] === 80)).toBe(true);
  });

  it('fade={false} keeps the floor taper but drops the X masks', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400, fade: false });

    mounted.overlaySpy.reset();
    showCrosshair(mounted.chart);
    mounted.flushScheduler();

    // No intrusion with the X fade off — the clip widens only by the tail.
    const clips = mounted.overlaySpy.callsOf('rect');
    expect(clips.some((c) => c.args[2] === 745 && c.args[3] === 379)).toBe(true);

    // The floor taper matches the gridline stubs, which also stay when the
    // masks are off; the edge masks themselves are gone.
    expect(tailTaperRects(mounted.overlaySpy).length).toBeGreaterThan(0);
    expect(overlayEraseRects(mounted.overlaySpy).filter((c) => c.args[1] === 0)).toHaveLength(0);
  });

  it('a pointer parked over an axis strip keeps only the in-pane hairline', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400 });

    // Over the time-axis row: the vertical line still points at its time
    // label, the horizontal line has no in-pane anchor and is skipped.
    mounted.overlaySpy.reset();
    mounted.dispatchMouse('mousemove', { clientX: 300, clientY: 385 }, mounted.overlayCanvas);

    let lineTos = mounted.overlaySpy.callsOf('lineTo');
    expect(lineTos.some((c) => c.args[0] === 300.5 && c.args[1] === 400)).toBe(true);
    expect(lineTos.some((c) => c.args[0] === 800)).toBe(false);

    // Back inside the pane: both hairlines return.
    mounted.overlaySpy.reset();
    mounted.dispatchMouse('mousemove', { clientX: 300, clientY: 200 }, mounted.overlayCanvas);

    lineTos = mounted.overlaySpy.callsOf('lineTo');
    expect(lineTos.some((c) => c.args[0] === 300.5 && c.args[1] === 400)).toBe(true);
    expect(lineTos.some((c) => c.args[0] === 800 && c.args[1] === 200.5)).toBe(true);
  });
});

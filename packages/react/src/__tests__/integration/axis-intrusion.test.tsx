import { LineSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Content panned toward a right Y-axis column slides 12px under it, where the
 * axis fade dissolves it. The line keeps its points out to that clip edge, and
 * the pulse rides the same clip and fades out across the strip instead of being
 * cut flat at the pane edge.
 *
 * Geometry at the default 800×400 / dpr 1 mount: pane = 745×370, intrusion =
 * 12px, so the series clip spans 757×370.
 */
describe('series under the right Y-axis column', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const STEP = 60_000;
  const T0 = 1_000_000;
  const data = Array.from({ length: 300 }, (_, i) => ({ time: T0 + i * STEP, value: 100 + (i % 7) }));

  it('draws a panned line out to the clip edge, not one point past the pane', () => {
    mounted = mountChart(<LineSeries data={data} />, { width: 800, height: 400 });

    // 200 steps over 745px: ~3.7px a step, so the 12px strip holds three points.
    mounted.chart.setVisibleRange({ from: T0, to: T0 + 200 * STEP });
    mounted.flushScheduler();
    mounted.mainSpy.reset();
    mounted.chart.setVisibleRange({ from: T0 + STEP, to: T0 + 201 * STEP });
    mounted.flushScheduler();

    const xs = mounted.mainSpy.callsOf('lineTo').map((c) => c.args[0] as number);
    const underColumn = xs.filter((x) => x > 745 && x <= 757);
    expect(underColumn.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...xs)).toBeGreaterThan(757);
  });

  it('clips the pulse with the series and fades it out across the strip', () => {
    mounted = mountChart(<LineSeries data={data} />, { width: 800, height: 400 });

    // The last point lands 2px past the pane edge; its widest halo (7px) reaches 9px into the strip.
    const span = 200 * STEP;
    const last = data[data.length - 1].time;
    const to = last - (2 / 745) * span;
    mounted.chart.setVisibleRange({ from: to - span, to });
    mounted.flushScheduler();
    mounted.overlaySpy.reset();
    mounted.flushScheduler();

    const clips = mounted.overlaySpy.callsOf('rect').map((c) => c.args);
    expect(clips).toContainEqual([0, 0, 757, 370]);

    const dots = mounted.overlaySpy.callsOf('arc').filter((c) => c.args[2] === 3);
    expect(dots.length).toBeGreaterThan(0);
    const dot = dots[dots.length - 1];
    expect(dot.args[0] as number).toBeCloseTo(747, 0);
    expect(dot.globalAlpha).toBeCloseTo(1 - (9 / 12) ** 2, 2);
  });

  it('leaves the faded crosshair alone: no overlay erase over the strip', () => {
    mounted = mountChart(<LineSeries data={data} />, { width: 800, height: 400 });
    mounted.overlaySpy.reset();
    mounted.chart.setCrosshair({ time: data[data.length - 1].time, y: 103 });
    mounted.flushScheduler();

    const stripErases = mounted.overlaySpy
      .callsOf('fillRect')
      .filter((c) => c.globalCompositeOperation === 'destination-out' && c.args[0] === 745);
    expect(stripErases).toEqual([]);
  });
});

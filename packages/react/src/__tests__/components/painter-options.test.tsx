import { BarSeries, LineSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Regression for §8 #22: the PR added `cornerRadius` / `curve` / `*Painter` to
 * the `<BarSeries>` / `<LineSeries>` / `<CandlestickSeries>` useEffect dep
 * arrays. Without those entries a live toggle in the playground would never
 * re-fire `updateSeriesOptions`, so the visual knob would silently do nothing
 * (the exact bug `pie-series-options.test.tsx` guards for `sliceLabels`).
 *
 * Strategy mirrors that suite: assert the observable canvas side effect of the
 * option flip rather than reaching into private internals.
 */
describe('<BarSeries> / <LineSeries> painter-option live-toggles reach the renderer (#22)', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const bars = [
    [
      { time: 1, value: 50 },
      { time: 2, value: 80 },
      { time: 3, value: 60 },
    ],
  ];
  const lineData = [
    [
      { time: 1, value: 10 },
      { time: 2, value: 40 },
      { time: 3, value: 20 },
      { time: 4, value: 50 },
    ],
  ];

  it('flipping BarSeries cornerRadius 0 → 8 starts rounding (arcTo reaches the canvas)', () => {
    mounted = mountChart(<BarSeries id="bar" data={bars} options={{ cornerRadius: 0 }} />);
    mounted.flushScheduler();
    // Square bars: no rounded-corner arcs.
    expect(mounted.mainSpy.countOf('arcTo')).toBe(0);

    mounted.rerender(<BarSeries id="bar" data={bars} options={{ cornerRadius: 8 }} />);
    mounted.flushScheduler();
    // The new cornerRadius reached the renderer → bars now round.
    expect(mounted.mainSpy.countOf('arcTo')).toBeGreaterThan(0);
  });

  it('flipping LineSeries curve straight → smooth starts curving (bezierCurveTo reaches the canvas)', () => {
    mounted = mountChart(<LineSeries id="line" data={lineData} options={{ curve: 'straight' }} />);
    mounted.flushScheduler();
    expect(mounted.mainSpy.countOf('bezierCurveTo')).toBe(0);

    mounted.rerender(<LineSeries id="line" data={lineData} options={{ curve: 'smooth' }} />);
    mounted.flushScheduler();
    expect(mounted.mainSpy.countOf('bezierCurveTo')).toBeGreaterThan(0);
  });

  it('flipping LineSeries points visible/radius/color reaches the renderer (arc reaches the canvas)', () => {
    mounted = mountChart(<LineSeries id="line" data={lineData} options={{ points: { visible: false } }} />);
    mounted.flushScheduler();
    expect(mounted.mainSpy.countOf('arc')).toBe(0);

    mounted.rerender(
      <LineSeries id="line" data={lineData} options={{ points: { visible: true, radius: 5, color: '#ff8800' } }} />,
    );
    mounted.flushScheduler();
    const arcs = mounted.mainSpy.callsOf('arc');
    expect(arcs.length).toBeGreaterThan(0);
    expect(arcs.every((c) => c.args[2] === 5)).toBe(true);
    expect(mounted.mainSpy.callsOf('fill').some((c) => c.fillStyle === '#ff8800')).toBe(true);
  });
});

import { LineSeries, YAxis } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

describe('YAxis', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const data: [Array<{ time: number; value: number }>] = [
    [
      { time: 1, value: 0 },
      { time: 2, value: 25 },
      { time: 3, value: 50 },
      { time: 4, value: 75 },
      { time: 5, value: 100 },
    ],
  ];

  it('renders a positive number of tick labels inside the Y axis slot', () => {
    mounted = mountChart(
      <>
        <LineSeries data={data} />
        <YAxis />
      </>,
    );

    const yAxisHost = mounted.container.querySelector('div[style*="right: 0px"][style*="width: 55px"]');
    expect(yAxisHost).not.toBeNull();
    const labels = yAxisHost!.querySelectorAll('span');
    expect(labels.length).toBeGreaterThan(0);
  });

  it('tick count is in a reasonable range (niceTickValues returns ~3-10 ticks)', () => {
    mounted = mountChart(
      <>
        <LineSeries data={data} />
        <YAxis />
      </>,
    );

    const yAxisHost = mounted.container.querySelector('div[style*="right: 0px"][style*="width: 55px"]');
    const labels = yAxisHost!.querySelectorAll('span');
    // Nice-tick heuristic yields 3-10 ticks for typical ranges — lenient bounds.
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(labels.length).toBeLessThanOrEqual(12);
  });

  it('tick labels update after data range widens', () => {
    mounted = mountChart(
      <>
        <LineSeries data={data} />
        <YAxis />
      </>,
    );
    const before = mounted.container
      .querySelector('div[style*="right: 0px"][style*="width: 55px"]')!
      .querySelectorAll('span').length;
    expect(before).toBeGreaterThan(0);

    // Grow the Y range 10x.
    const wider: [Array<{ time: number; value: number }>] = [
      [
        { time: 1, value: 0 },
        { time: 2, value: 500 },
        { time: 3, value: 1000 },
      ],
    ];
    mounted.rerender(
      <>
        <LineSeries data={wider} />
        <YAxis />
      </>,
    );

    const host = mounted.container.querySelector('div[style*="right: 0px"][style*="width: 55px"]');
    const labels = Array.from(host!.querySelectorAll('span')) as HTMLSpanElement[];
    // After a range change, at least one new tick covers the new high end
    // (>100). The new labels may still be fading in (opacity < 1) — that's
    // expected behavior of the shared tick tracker — so we don't filter on
    // opacity, just on the value.
    const numbers = labels.map((s) => parseFloat(s.textContent ?? '')).filter((n) => Number.isFinite(n));
    const max = Math.max(...numbers, 0);
    expect(max).toBeGreaterThan(100);
  });

  it('hides when axis.y.visible=false (width collapses to 0)', () => {
    mounted = mountChart(
      <>
        <LineSeries data={data} />
        <YAxis />
      </>,
      { axis: { y: { visible: false } } },
    );

    // With visible=false, chart.yAxisWidth returns 0; the YAxis host <div>
    // receives `width: 0px` inline styling.
    const host = mounted.container.querySelector('div[style*="right: 0px"][style*="width: 0px"]');
    expect(host).not.toBeNull();
  });

  it('recolors tick labels when the theme changes (regression: stale cached span color)', () => {
    // Regression: tick-label <span>s are cached by tick value and reused across
    // renders. On a theme change the reused spans kept their old inline color
    // (only text + opacity were refreshed), so axis text didn't follow the
    // theme. The fix re-applies the theme-derived styles when the theme changes.
    mounted = mountChart(
      <>
        <LineSeries data={data} />
        <YAxis />
      </>,
    );

    const host = mounted.container.querySelector('div[style*="right: 0px"][style*="width: 55px"]');
    expect(host).not.toBeNull();
    if (host === null) return;

    const spanBefore = host.querySelector('span');
    expect(spanBefore).not.toBeNull();
    if (spanBefore === null) return;
    const before = spanBefore.style.color;

    // Normalize the target color through the DOM so the assertion survives the
    // environment's color serialization (hex vs rgb, spacing).
    const probe = document.createElement('span');
    probe.style.color = 'rgb(1, 2, 3)';
    const target = probe.style.color;
    expect(target).not.toBe(before);

    // Push a recolored theme through the same entry point the React
    // <ChartContainer> theme effect uses. Ticks are unchanged, so the visible
    // label spans are REUSED — the exact branch that used to keep the old color.
    const base = mounted.chart.getTheme();
    mounted.chart.setTheme({
      ...base,
      axis: { ...base.axis, textColor: 'rgb(1, 2, 3)', y: { ...base.axis.y, textColor: 'rgb(1, 2, 3)' } },
    });

    const spanAfter = host.querySelector('span');
    expect(spanAfter).not.toBeNull();
    if (spanAfter === null) return;
    expect(spanAfter.style.color).toBe(target);
    expect(spanAfter.style.color).not.toBe(before);
  });

  describe('labelCount / minLabelSpacing props', () => {
    it('<YAxis labelCount> live-updates interval', () => {
      const m = mountChart(
        <>
          <LineSeries data={data} />
          <YAxis labelCount={4} />
        </>,
      );
      mounted = m;

      const intervalOf = (chart: typeof m.chart) => {
        const t = chart.yScale.niceTickValues();
        return t.length >= 2 ? t[1] - t[0] : Number.NaN;
      };

      const low = intervalOf(m.chart);

      m.rerender(
        <>
          <LineSeries data={data} />
          <YAxis labelCount={12} />
        </>,
      );
      const high = intervalOf(m.chart);

      // Asking for more labels shrinks the tick interval (or keeps it at the
      // pixel-floor cap). It must never grow.
      expect(high).toBeLessThanOrEqual(low);
    });

    it('unmounting <YAxis labelCount> clears the hint', () => {
      // labelCount=2 forces a coarser interval than auto. Unmounting the
      // prop should restore the auto density (strictly more labels).
      mounted = mountChart(
        <>
          <LineSeries data={data} />
          <YAxis labelCount={2} />
        </>,
      );
      const withHint = mounted.chart.yScale.niceTickValues().length;

      mounted.rerender(
        <>
          <LineSeries data={data} />
          <YAxis />
        </>,
      );
      const withoutHint = mounted.chart.yScale.niceTickValues().length;

      expect(withoutHint).toBeGreaterThan(withHint);
    });
  });
});

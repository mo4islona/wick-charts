import { HistogramSeries, Legend, Tooltip } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

const STILL = { introMs: 0, entryMs: 0, smoothMs: 0 } as const;
const NUMERIC = { x: { type: 'numeric' as const } };

/** Samples 0…99 once each: ten bins of ten at `binWidth: 10`. */
const UNIFORM = Array.from({ length: 100 }, (_, i) => i);

function floatingTooltip(root: HTMLElement): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>('div')) {
    if (el.style.position === 'absolute' && el.style.zIndex === '10') return el;
  }

  return null;
}

describe('<HistogramSeries>', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('bins raw samples into contiguous bars', () => {
    mounted = mountChart(<HistogramSeries id="h" data={UNIFORM} options={{ ...STILL, binWidth: 10, gap: 0 }} />, {
      axis: NUMERIC,
    });
    mounted.flushScheduler();

    // Every frame repaints the same bars; keep one of each.
    const drawn = mounted.mainSpy
      .callsOf('fillRect')
      .filter((call) => call.fillStyle === mounted?.chart.getSeriesColor('h'))
      .map((call) => (call.args as number[]).join(','));
    const bars = [...new Set(drawn)].map((key) => key.split(',').map(Number));
    expect(bars).toHaveLength(10);

    const sorted = [...bars].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) {
      const prevRight = sorted[i - 1][0] + sorted[i - 1][2];
      expect(Math.abs(sorted[i][0] - prevRight)).toBeLessThanOrEqual(1);
    }
  });

  it('shows the bin range, count and share in the tooltip', () => {
    mounted = mountChart(
      <>
        <HistogramSeries data={UNIFORM} options={{ ...STILL, binWidth: 10 }} />
        <Tooltip />
      </>,
      { axis: NUMERIC },
    );
    mounted.flushScheduler();

    const x = mounted.chart.timeScale.timeToX(45) + mounted.chart.plotLeft;
    mounted.dispatchMouse('mousemove', { clientX: x, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    const text = floatingTooltip(mounted.container)?.textContent ?? '';
    expect(text).toContain('40 – 50');
    expect(text).toContain('10 · 10%');
  });

  it('lists overlaid layers in the legend by their names', () => {
    mounted = mountChart(
      <>
        <HistogramSeries
          id="h"
          data={[
            { label: 'API', data: [10, 12, 14] },
            { label: 'DB', color: '#ff0000', data: [11, 30] },
          ]}
          options={STILL}
        />
        <Legend />
      </>,
      { axis: NUMERIC },
    );
    mounted.flushScheduler();

    expect(mounted.container.textContent).toContain('API');
    expect(mounted.container.textContent).toContain('DB');
    expect(mounted.chart.getSeriesLayers('h')?.[1].color).toBe('#ff0000');
  });

  it('keeps its data when a new id re-creates the series', () => {
    const data = [5, 15, 15];
    mounted = mountChart(<HistogramSeries id="a" data={data} options={{ ...STILL, binWidth: 10 }} />, {
      axis: NUMERIC,
    });
    mounted.flushScheduler();

    mounted.rerender(<HistogramSeries id="b" data={data} options={{ ...STILL, binWidth: 10 }} />);
    mounted.flushScheduler();

    expect(mounted.chart.getSeriesIds()).toEqual(['b']);
    expect(mounted.chart.getDataAtTime('b', 12)).toMatchObject({ count: 2 });
  });

  it('re-bins new samples on the same series', () => {
    mounted = mountChart(<HistogramSeries id="h" data={[5, 15]} options={{ ...STILL, binWidth: 10 }} />, {
      axis: NUMERIC,
    });
    mounted.flushScheduler();

    mounted.rerender(<HistogramSeries id="h" data={[5, 15, 15, 15]} options={{ ...STILL, binWidth: 10 }} />);
    mounted.flushScheduler();

    expect(mounted.chart.getSeriesIds()).toEqual(['h']);
    expect(mounted.chart.getDataAtTime('h', 12)).toMatchObject({ x0: 10, x1: 20, count: 3, share: 75 });
  });
});

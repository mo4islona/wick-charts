import { BarSeries, Crosshair, LineSeries, Tooltip, XAxis } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

const REGIONS = [
  { x: 'EU', value: 50 },
  { x: 'Asia', value: 40 },
  { x: 'Amer.', value: 30 },
];

const CONCURRENCY = [1, 2, 4, 8, 16, 32, 48, 64].map((x) => ({ x, value: Math.log2(x) * 100 }));

const formatRequests = (x: number | string) => `${Math.round(Number(x))} req`;

describe('numeric and category X axes', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  function hoverAt(coord: number): void {
    if (mounted === null) throw new Error('not mounted');

    const clientX = mounted.chart.plotLeft + mounted.chart.timeScale.timeToX(coord);
    mounted.dispatchMouse('mousemove', { clientX, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();
  }

  it('shows the category name in the axis, crosshair and tooltip of a bar chart', () => {
    mounted = mountChart(
      <>
        <BarSeries data={REGIONS} />
        <XAxis format={(x) => `${x}!`} />
        <Crosshair />
        <Tooltip />
      </>,
      { axis: { x: { type: 'category' } } },
    );
    mounted.flushScheduler();

    const text = mounted.container.textContent ?? '';
    expect(text).toContain('EU!');
    expect(text).toContain('Asia!');
    expect(text).toContain('Amer.!');

    hoverAt(1.2);

    expect(mounted.chart.getCrosshairPosition()).toMatchObject({ time: 1, x: 'Asia' });
    // Axis label, crosshair label and tooltip header.
    expect((mounted.container.textContent ?? '').split('Asia!')).toHaveLength(4);
    expect(mounted.container.textContent).toContain('40');
  });

  it('formats the numeric x with <XAxis format> in the axis, crosshair and tooltip of a line chart', () => {
    mounted = mountChart(
      <>
        <LineSeries data={CONCURRENCY} />
        <XAxis format={formatRequests} />
        <Crosshair />
        <Tooltip />
      </>,
      { axis: { x: { type: 'numeric' } }, padding: { right: 0 } },
    );
    mounted.flushScheduler();

    expect(mounted.container.textContent).toContain('20 req');

    hoverAt(48);

    expect(mounted.chart.getCrosshairPosition()?.x).toBeCloseTo(48);
    const text = mounted.container.textContent ?? '';
    // Crosshair label and tooltip header; no date on a numeric axis.
    expect(text.split('48 req').length).toBeGreaterThanOrEqual(3);
    expect(text).not.toContain('1970');
    expect(text).toContain('558.50');
  });
});

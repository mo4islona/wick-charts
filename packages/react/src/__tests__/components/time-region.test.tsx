import { LineSeries, TimeRegion } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

const DATA: [Array<{ time: number; value: number }>] = [
  [
    { time: 1, value: 10 },
    { time: 2, value: 30 },
    { time: 3, value: 50 },
    { time: 4, value: 70 },
    { time: 5, value: 90 },
  ],
];

describe('<TimeRegion>', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('registers a region and paints its label on the main canvas', () => {
    mounted = mountChart(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <TimeRegion from={2} to={4} fill="rgba(240, 85, 106, 0.08)" label="anomaly window" />
      </>,
      { width: 400, height: 240 },
    );
    mounted.flushScheduler();

    const regions = mounted.chart.getRegions();
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({ from: 2, to: 4, fill: 'rgba(240, 85, 106, 0.08)', label: 'anomaly window' });

    const labels = mounted.mainSpy.callsOf('fillText').map((c) => c.args[0]);
    expect(labels).toContain('anomaly window');
  });

  it('treats an omitted end as open-ended (to: null)', () => {
    mounted = mountChart(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <TimeRegion from={3} />
      </>,
      { width: 400, height: 240 },
    );
    mounted.flushScheduler();

    expect(mounted.chart.getRegions()[0]).toMatchObject({ from: 3, to: null });
  });

  it('updates the region in place when props change', () => {
    mounted = mountChart(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <TimeRegion from={2} to={4} />
      </>,
      { width: 400, height: 240 },
    );
    mounted.flushScheduler();

    mounted.rerender(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <TimeRegion from={2} to="now" label="firing" />
      </>,
    );
    mounted.flushScheduler();

    const regions = mounted.chart.getRegions();
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({ from: 2, to: null, label: 'firing' });
  });

  it('removes the region when its element unmounts', () => {
    mounted = mountChart(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <TimeRegion from={2} to={4} />
      </>,
      { width: 400, height: 240 },
    );
    mounted.flushScheduler();
    expect(mounted.chart.getRegions()).toHaveLength(1);

    mounted.rerender(<LineSeries id="m" data={DATA} options={{ pulse: false }} />);
    mounted.flushScheduler();

    expect(mounted.chart.getRegions()).toHaveLength(0);
  });
});

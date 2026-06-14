import { LineSeries, ReferenceLine } from '@wick-charts/react';
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

describe('<ReferenceLine>', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('registers a horizontal line at a value and paints its label on the overlay', () => {
    mounted = mountChart(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <ReferenceLine value={50} label="alert" color="#f0556a" />
      </>,
      { width: 400, height: 240 },
    );
    mounted.flushScheduler();

    const lines = mounted.chart.getLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ orientation: 'horizontal', coord: 50, label: 'alert', color: '#f0556a' });

    const labels = mounted.overlaySpy.callsOf('fillText').map((c) => c.args[0]);
    expect(labels).toContain('alert');
  });

  it('registers a vertical line when given a time', () => {
    mounted = mountChart(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <ReferenceLine time={3} label="deploy" />
      </>,
      { width: 400, height: 240 },
    );
    mounted.flushScheduler();

    expect(mounted.chart.getLines()[0]).toMatchObject({ orientation: 'vertical', coord: 3, label: 'deploy' });
  });

  it('updates the line in place when props change', () => {
    mounted = mountChart(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <ReferenceLine value={50} />
      </>,
      { width: 400, height: 240 },
    );
    mounted.flushScheduler();

    mounted.rerender(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <ReferenceLine value={30} style="solid" />
      </>,
    );
    mounted.flushScheduler();

    const lines = mounted.chart.getLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ orientation: 'horizontal', coord: 30, style: 'solid' });
  });

  it('removes the line when its element unmounts', () => {
    mounted = mountChart(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <ReferenceLine value={50} />
      </>,
      { width: 400, height: 240 },
    );
    mounted.flushScheduler();
    expect(mounted.chart.getLines()).toHaveLength(1);

    mounted.rerender(<LineSeries id="m" data={DATA} options={{ pulse: false }} />);
    mounted.flushScheduler();

    expect(mounted.chart.getLines()).toHaveLength(0);
  });
});

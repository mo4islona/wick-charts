import { LineSeries, Marker } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

// Pulse off on the line so the only overlay arc/text comes from the marker.
const DATA: [Array<{ time: number; value: number }>] = [
  [
    { time: 1, value: 10 },
    { time: 2, value: 30 },
    { time: 3, value: 50 },
    { time: 4, value: 70 },
    { time: 5, value: 90 },
  ],
];

describe('<Marker>', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('registers a marker and paints its label on the overlay canvas', () => {
    mounted = mountChart(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <Marker time={3} value={50} label="broke" color="#f0556a" />
      </>,
      { width: 400, height: 240 },
    );
    mounted.flushScheduler();

    const markers = mounted.chart.getMarkers();
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ time: 3, value: 50, label: 'broke', color: '#f0556a' });

    const labels = mounted.overlaySpy.callsOf('fillText').map((c) => c.args[0]);
    expect(labels).toContain('broke');
  });

  it('snaps Y to the series value at `time` when only seriesId is given', () => {
    mounted = mountChart(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <Marker seriesId="m" time={3} />
      </>,
      { width: 400, height: 240 },
    );
    mounted.flushScheduler();

    const snap = mounted.chart.getDataAtTime('m', 3);
    expect(snap).not.toBeNull();
    const value = snap && 'value' in snap ? snap.value : Number.NaN;
    expect(value).toBe(50);

    // The marker dot (pulse off everywhere → arcs are marker-only) lands at the
    // snapped value. The overlay spy accumulates across frames, so check the
    // most recent arc rather than a fixed count.
    const arcs = mounted.overlaySpy.callsOf('arc');
    expect(arcs.length).toBeGreaterThanOrEqual(1);

    const dot = arcs.at(-1);
    expect(dot?.args[0]).toBeCloseTo(mounted.chart.timeScale.timeToBitmapX(3), 0);
    expect(dot?.args[1]).toBeCloseTo(mounted.chart.yScale.valueToBitmapY(50), 0);
  });

  it('updates the marker in place when props change', () => {
    mounted = mountChart(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <Marker time={3} value={50} />
      </>,
      { width: 400, height: 240 },
    );
    mounted.flushScheduler();

    mounted.rerender(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <Marker time={3} value={20} shape="arrow-up" />
      </>,
    );
    mounted.flushScheduler();

    const markers = mounted.chart.getMarkers();
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ value: 20, shape: 'arrow-up' });
  });

  it('removes the marker when its element unmounts', () => {
    mounted = mountChart(
      <>
        <LineSeries id="m" data={DATA} options={{ pulse: false }} />
        <Marker time={3} value={50} />
      </>,
      { width: 400, height: 240 },
    );
    mounted.flushScheduler();
    expect(mounted.chart.getMarkers()).toHaveLength(1);

    mounted.rerender(<LineSeries id="m" data={DATA} options={{ pulse: false }} />);
    mounted.flushScheduler();

    expect(mounted.chart.getMarkers()).toHaveLength(0);
  });
});

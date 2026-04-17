import { LineSeries, TimeAxis } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

describe('TimeAxis', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  function buildSeries(count: number, intervalMs: number, start: number) {
    return Array.from({ length: count }, (_, i) => ({ time: start + i * intervalMs, value: i }));
  }

  it('renders tick labels for a series spanning multiple days', () => {
    // 10 days of daily data starting at 2024-01-01.
    const start = Date.UTC(2024, 0, 1);
    const data: [Array<{ time: number; value: number }>] = [buildSeries(10, 86_400_000, start)];
    mounted = mountChart(
      <>
        <LineSeries data={data} />
        <TimeAxis />
      </>,
    );

    const host = mounted.container.querySelector('div[style*="bottom: 0px"][style*="height: 30px"]');
    expect(host).not.toBeNull();
    const labels = host!.querySelectorAll('span');
    expect(labels.length).toBeGreaterThan(0);
  });

  it('tick count is within niceTickValues heuristic bounds', () => {
    const start = Date.UTC(2024, 0, 1);
    const data: [Array<{ time: number; value: number }>] = [buildSeries(24, 3_600_000, start)];
    mounted = mountChart(
      <>
        <LineSeries data={data} />
        <TimeAxis />
      </>,
    );

    const host = mounted.container.querySelector('div[style*="bottom: 0px"][style*="height: 30px"]');
    const labels = host!.querySelectorAll('span');
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(labels.length).toBeLessThanOrEqual(20);
  });

  it('hides (height: 0) when axis.x.visible=false', () => {
    const start = Date.UTC(2024, 0, 1);
    const data: [Array<{ time: number; value: number }>] = [buildSeries(5, 3_600_000, start)];
    mounted = mountChart(
      <>
        <LineSeries data={data} />
        <TimeAxis />
      </>,
      { axis: { x: { visible: false } } },
    );

    const host = mounted.container.querySelector('div[style*="bottom: 0px"][style*="height: 0px"]');
    expect(host).not.toBeNull();
  });

  it('label format shifts from day-level to hour-level based on interval', () => {
    // Hour interval — labels should contain colons for HH:MM style.
    const start = Date.UTC(2024, 5, 15, 8, 0, 0);
    const data: [Array<{ time: number; value: number }>] = [buildSeries(12, 3_600_000, start)];
    mounted = mountChart(
      <>
        <LineSeries data={data} />
        <TimeAxis />
      </>,
    );

    const host = mounted.container.querySelector('div[style*="bottom: 0px"][style*="height: 30px"]');
    const labelText = Array.from(host!.querySelectorAll('span'))
      .map((s) => s.textContent ?? '')
      .join(' ');
    // Hour-interval formatting includes "HH:" somewhere across the rendered ticks.
    expect(labelText).toMatch(/\d{1,2}:\d{2}/);
  });
});

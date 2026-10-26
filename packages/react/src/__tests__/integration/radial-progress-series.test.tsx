import { PieLegend, RadialProgressSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

describe('<RadialProgressSeries>', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const rings = [
    { label: 'CPU', value: 72 },
    { label: 'Memory', value: 54 },
    { label: 'Disk', value: 31 },
  ];

  it('draws one track and one progress arc per ring', () => {
    mounted = mountChart(<RadialProgressSeries data={rings} options={{ trackColor: '#123456' }} />);
    mounted.flushScheduler();

    const arcs = mounted.mainSpy.callsOf('arc');
    expect(arcs.filter((call) => call.strokeStyle === '#123456')).toHaveLength(3);
    expect(arcs.filter((call) => call.strokeStyle !== '#123456')).toHaveLength(3);
  });

  it('is listed by a <PieLegend> without a seriesId', () => {
    mounted = mountChart(
      <>
        <RadialProgressSeries data={rings} />
        <PieLegend mode="percent" />
      </>,
    );
    mounted.flushScheduler();

    const legend = mounted.container.querySelector('[data-chart-pie-legend]');
    expect(legend?.textContent).toBe('CPU72.0%Memory54.0%Disk31.0%');
  });
});

describe('<RadialProgressSeries> + <PieLegend> after an options change', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const rings = [
    { label: 'CPU', value: 72 },
    { label: 'Disk', value: 30 },
  ];

  const tree = (options: { max?: number; colors?: string[] }) => (
    <>
      <RadialProgressSeries id="rings" data={rings} options={options} />
      <PieLegend mode="percent" />
    </>
  );

  function legendText(): string {
    return mounted?.container.querySelector('[data-chart-pie-legend]')?.textContent ?? '';
  }

  it('shows the new percentages when `max` changes', () => {
    mounted = mountChart(tree({ max: 100 }));
    mounted.flushScheduler();
    expect(legendText()).toBe('CPU72.0%Disk30.0%');

    let overlayChanges = 0;
    mounted.chart.on('overlayChange', () => {
      overlayChanges++;
    });
    mounted.rerender(tree({ max: 200 }));
    mounted.flushScheduler();

    expect(overlayChanges).toBeGreaterThan(0);
    expect(legendText()).toBe('CPU36.0%Disk15.0%');
  });

  it('shows the new color of a ring past the first', () => {
    mounted = mountChart(tree({ colors: ['#aa0000', '#00aa00'] }));
    mounted.flushScheduler();

    let overlayChanges = 0;
    mounted.chart.on('overlayChange', () => {
      overlayChanges++;
    });
    mounted.rerender(tree({ colors: ['#aa0000', '#0000aa'] }));
    mounted.flushScheduler();

    expect(overlayChanges).toBeGreaterThan(0);
    expect(mounted.chart.getSliceInfo('rings')?.map((slice) => slice.color)).toEqual(['#aa0000', '#0000aa']);
    const swatches = mounted.container.querySelectorAll<HTMLElement>(
      '[data-chart-pie-legend] span[style*="border-radius: 50%"]',
    );
    expect(swatches[1]?.style.background).toBe('#0000aa');
  });
});

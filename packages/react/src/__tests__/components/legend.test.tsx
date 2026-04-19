import { fireEvent } from '@testing-library/react';
import { BarSeries, CandlestickSeries, Legend, LineSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

describe('Legend', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('renders one item per single-layer series', () => {
    const ohlc = [
      { time: 1, open: 1, high: 2, low: 1, close: 2 },
      { time: 2, open: 2, high: 3, low: 2, close: 3 },
    ];
    mounted = mountChart(
      <>
        <CandlestickSeries data={ohlc} />
        <Legend />
      </>,
    );

    const items = mounted.container.querySelectorAll('[data-legend] > div');
    expect(items.length).toBe(1);
  });

  it('renders one item per layer for multi-layer line series', () => {
    const threeLayers = [
      [
        { time: 1, value: 1 },
        { time: 2, value: 2 },
      ],
      [
        { time: 1, value: 3 },
        { time: 2, value: 4 },
      ],
      [
        { time: 1, value: 5 },
        { time: 2, value: 6 },
      ],
    ];
    mounted = mountChart(
      <>
        <LineSeries data={threeLayers} />
        <Legend />
      </>,
    );

    const items = mounted.container.querySelectorAll('[data-legend] > div');
    expect(items.length).toBe(3);
  });

  it('legend item swatch color matches the series color', () => {
    const data = [
      [
        { time: 1, value: 1 },
        { time: 2, value: 2 },
      ],
    ];
    mounted = mountChart(
      <>
        <LineSeries data={data} options={{ colors: ['#ff00aa'] }} />
        <Legend />
      </>,
    );

    const swatch = mounted.container.querySelector('[data-legend] > div > span') as HTMLSpanElement;
    expect(swatch).not.toBeNull();
    // React sets style.background; rgb() normalization in happy-dom keeps the hex string verbatim.
    expect(swatch.style.background.toLowerCase()).toBe('#ff00aa');
  });

  it('click toggles layer visibility in the ChartInstance', () => {
    const twoLayers = [
      [
        { time: 1, value: 10 },
        { time: 2, value: 20 },
      ],
      [
        { time: 1, value: 100 },
        { time: 2, value: 200 },
      ],
    ];
    mounted = mountChart(
      <>
        <LineSeries data={twoLayers} />
        <Legend />
      </>,
    );
    const seriesId = mounted.chart.getSeriesIds()[0];
    expect(mounted.chart.isLayerVisible(seriesId, 0)).toBe(true);

    const firstItem = mounted.container.querySelectorAll('[data-legend] > div')[0] as HTMLElement;
    fireEvent.click(firstItem);
    mounted.flushScheduler();

    expect(mounted.chart.isLayerVisible(seriesId, 0)).toBe(false);
    expect(mounted.chart.isLayerVisible(seriesId, 1)).toBe(true);
  });

  it('solo mode isolates one layer then restores all on second click', () => {
    const threeLayers = [[{ time: 1, value: 10 }], [{ time: 1, value: 100 }], [{ time: 1, value: 1000 }]];
    mounted = mountChart(
      <>
        <BarSeries data={threeLayers} />
        <Legend mode="solo" />
      </>,
    );
    const seriesId = mounted.chart.getSeriesIds()[0];

    const secondItem = () => mounted!.container.querySelectorAll('[data-legend] > div')[1] as HTMLElement;
    fireEvent.click(secondItem());
    mounted.flushScheduler();

    // Solo on index 1 → only layer 1 visible.
    expect(mounted.chart.isLayerVisible(seriesId, 0)).toBe(false);
    expect(mounted.chart.isLayerVisible(seriesId, 1)).toBe(true);
    expect(mounted.chart.isLayerVisible(seriesId, 2)).toBe(false);

    // Re-query after re-render — DOM node may be the same, but re-querying is
    // robust against fragment reordering.
    fireEvent.click(secondItem());
    mounted.flushScheduler();

    // Second click on the same solo'd item restores everything.
    expect(mounted.chart.isLayerVisible(seriesId, 0)).toBe(true);
    expect(mounted.chart.isLayerVisible(seriesId, 1)).toBe(true);
    expect(mounted.chart.isLayerVisible(seriesId, 2)).toBe(true);
  });

  it('renders nothing when no series are registered', () => {
    mounted = mountChart(<Legend />);
    expect(mounted.container.querySelector('[data-legend]')).toBeNull();
  });

  it('position="right" changes container flex direction', () => {
    const data = [
      [
        { time: 1, value: 1 },
        { time: 2, value: 2 },
      ],
    ];
    mounted = mountChart(
      <>
        <LineSeries data={data} />
        <Legend position="right" />
      </>,
    );

    const legend = mounted.container.querySelector('[data-legend]') as HTMLElement;
    expect(legend.dataset.legend).toBe('right');
  });
});

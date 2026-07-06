import { BarSeries, CandlestickSeries, HeatmapSeries, LineSeries, PieSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * `visible` on a series component maps to `chart.setSeriesVisible` — hides
 * the series (and excludes it from the Y-range fit / tooltip) without
 * unmounting it, live-updatable across renders.
 */
describe('series `visible` prop', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const lineData = [
    [
      { time: 1, value: 10 },
      { time: 2, value: 40 },
    ],
  ];
  const candles = [
    { time: 1, open: 10, high: 15, low: 8, close: 12 },
    { time: 2, open: 12, high: 18, low: 11, close: 16 },
  ];
  const cells = [
    { x: 'a', y: '1', value: 5 },
    { x: 'b', y: '1', value: 9 },
  ];
  const slices = [
    { label: 'a', value: 5 },
    { label: 'b', value: 9 },
  ];

  it('LineSeries: defaults to visible, `visible={false}` hides it, a later `visible={true}` restores it', () => {
    mounted = mountChart(<LineSeries id="line" data={lineData} />);
    const id = mounted.chart.getSeriesIds()[0];
    expect(mounted.chart.isSeriesVisible(id)).toBe(true);

    mounted.rerender(<LineSeries id="line" data={lineData} visible={false} />);
    expect(mounted.chart.isSeriesVisible('line')).toBe(false);

    mounted.rerender(<LineSeries id="line" data={lineData} visible={true} />);
    expect(mounted.chart.isSeriesVisible('line')).toBe(true);
  });

  it('CandlestickSeries: `visible={false}` hides it', () => {
    mounted = mountChart(<CandlestickSeries id="ohlc" data={candles} visible={false} />);
    expect(mounted.chart.isSeriesVisible('ohlc')).toBe(false);
  });

  it('HeatmapSeries: `visible={false}` hides it', () => {
    mounted = mountChart(<HeatmapSeries id="hm" data={cells} visible={false} />);
    expect(mounted.chart.isSeriesVisible('hm')).toBe(false);
  });

  it('PieSeries: `visible={false}` hides it', () => {
    mounted = mountChart(<PieSeries id="pie" data={slices} visible={false} />);
    expect(mounted.chart.isSeriesVisible('pie')).toBe(false);
  });

  it('re-applies visibility against a freshly (re)created series after an id change', () => {
    mounted = mountChart(<LineSeries id="a" data={lineData} visible={false} />);
    expect(mounted.chart.isSeriesVisible('a')).toBe(false);

    mounted.rerender(<LineSeries id="b" data={lineData} visible={false} />);
    expect(mounted.chart.isSeriesVisible('b')).toBe(false);
  });

  // A `data` shape flip (flat single-layer ↔ multi-layer) changes `layerCount`,
  // which remounts the series and resets it to the default visibility. The
  // visibility effect must re-run and re-hide it — otherwise a `visible={false}`
  // series silently reappears on screen.
  const flatLine = [
    { time: 1, value: 10 },
    { time: 2, value: 40 },
  ];
  const twoLayerLine = [
    [
      { time: 1, value: 10 },
      { time: 2, value: 40 },
    ],
    [
      { time: 1, value: 5 },
      { time: 2, value: 20 },
    ],
  ];

  it('LineSeries: stays hidden when the data shape flips flat↔multi-layer', () => {
    mounted = mountChart(<LineSeries id="line" data={flatLine} visible={false} />);
    expect(mounted.chart.isSeriesVisible('line')).toBe(false);

    mounted.rerender(<LineSeries id="line" data={twoLayerLine} visible={false} />);
    expect(mounted.chart.isSeriesVisible('line')).toBe(false);
  });

  it('BarSeries: stays hidden when the data shape flips flat↔multi-layer', () => {
    mounted = mountChart(<BarSeries id="bar" data={flatLine} visible={false} />);
    expect(mounted.chart.isSeriesVisible('bar')).toBe(false);

    mounted.rerender(<BarSeries id="bar" data={twoLayerLine} visible={false} />);
    expect(mounted.chart.isSeriesVisible('bar')).toBe(false);
  });
});

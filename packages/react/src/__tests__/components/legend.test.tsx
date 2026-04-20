import { fireEvent } from '@testing-library/react';
import type { LegendItem } from '@wick-charts/core';
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

  it('children render-prop replaces the default UI and receives LegendItems with toggle/isolate closures', () => {
    const twoLayers = [[{ time: 1, value: 1 }], [{ time: 1, value: 2 }]];
    let captured: readonly LegendItem[] | null = null;

    mounted = mountChart(
      <>
        <LineSeries data={twoLayers} />
        <Legend>
          {({ items }) => {
            captured = items;

            return (
              <div data-testid="custom-legend">
                {items.map((item) => (
                  <span key={item.id} data-id={item.id} data-disabled={item.isDisabled ? 'y' : 'n'}>
                    {item.label}
                  </span>
                ))}
              </div>
            );
          }}
        </Legend>
      </>,
    );

    const custom = mounted.container.querySelector('[data-testid="custom-legend"]');
    expect(custom).not.toBeNull();
    expect(captured).not.toBeNull();
    expect(captured!.length).toBe(2);
    expect(captured![0].id).toBe(`${mounted.chart.getSeriesIds()[0]}_layer0`);
    // Default UI markers (dot swatch divs) should be absent — the slot fully
    // replaces the built-in layout.
    expect(mounted.container.querySelectorAll('[data-legend] > div[style*="cursor"]').length).toBe(0);
  });

  it('LegendItem.toggle() from the slot flips visibility', () => {
    const twoLayers = [[{ time: 1, value: 1 }], [{ time: 1, value: 2 }]];
    let items: readonly LegendItem[] = [];

    mounted = mountChart(
      <>
        <LineSeries data={twoLayers} />
        <Legend>
          {(ctx) => {
            items = ctx.items;

            return <div data-testid="t" />;
          }}
        </Legend>
      </>,
    );

    const sid = mounted.chart.getSeriesIds()[0];
    expect(mounted.chart.isLayerVisible(sid, 0)).toBe(true);
    items[0].toggle();
    mounted.flushScheduler();
    expect(mounted.chart.isLayerVisible(sid, 0)).toBe(false);
    expect(mounted.chart.isLayerVisible(sid, 1)).toBe(true);
  });

  it('LegendItem.isolate() hides all other layers, calling again restores everything', () => {
    const threeLayers = [[{ time: 1, value: 10 }], [{ time: 1, value: 100 }], [{ time: 1, value: 1000 }]];
    let itemsRef: readonly LegendItem[] = [];

    mounted = mountChart(
      <>
        <BarSeries data={threeLayers} />
        <Legend>
          {(ctx) => {
            itemsRef = ctx.items;

            return <div data-testid="t" />;
          }}
        </Legend>
      </>,
    );

    const sid = mounted.chart.getSeriesIds()[0];
    itemsRef[1].isolate();
    mounted.flushScheduler();
    expect(mounted.chart.isLayerVisible(sid, 0)).toBe(false);
    expect(mounted.chart.isLayerVisible(sid, 1)).toBe(true);
    expect(mounted.chart.isLayerVisible(sid, 2)).toBe(false);

    // Second click (by id) on the isolated item restores everything. The slot
    // re-ran after the visibility change, so `itemsRef` points at a fresh
    // closure that sees `isolatedId` set.
    itemsRef[1].isolate();
    mounted.flushScheduler();
    expect(mounted.chart.isLayerVisible(sid, 0)).toBe(true);
    expect(mounted.chart.isLayerVisible(sid, 1)).toBe(true);
    expect(mounted.chart.isLayerVisible(sid, 2)).toBe(true);
  });

  it('items-prop override renders a static non-interactive legend', () => {
    const data = [
      [
        { time: 1, value: 1 },
        { time: 2, value: 2 },
      ],
    ];
    mounted = mountChart(
      <>
        <LineSeries data={data} />
        <Legend
          items={[
            { label: 'Custom A', color: '#f00' },
            { label: 'Custom B', color: '#0f0' },
          ]}
        />
      </>,
    );
    const divs = mounted.container.querySelectorAll('[data-legend] > div');
    expect(divs.length).toBe(2);
    // No cursor:pointer on override items — they're non-interactive.
    const first = divs[0] as HTMLElement;
    expect(first.style.cursor).toBe('');
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

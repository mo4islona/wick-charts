import { BarSeries, Legend, LineSeries, Tooltip } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * 0.5 API: line/bar `data` carries per-layer `{ label, color }`. Each layer
 * gets its OWN name in the tooltip and legend (previously one series `label`
 * was repeated across every layer in the tooltip while the legend suffixed
 * `1/2/3` — they now agree), and a per-layer `color` overrides the palette.
 */
describe('named layers — per-layer label + color (0.5)', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const revenue = Array.from({ length: 20 }, (_, i) => ({ time: i + 1, value: 10 + i }));
  const costs = Array.from({ length: 20 }, (_, i) => ({ time: i + 1, value: 5 + i * 0.5 }));

  function findLineTooltip(root: HTMLElement, mustContain: string[]): HTMLElement | null {
    for (const el of root.querySelectorAll<HTMLElement>('div')) {
      const txt = el.textContent ?? '';
      if (el.style.position === 'absolute' && mustContain.every((s) => txt.includes(s))) return el;
    }
    return null;
  }

  it('stores each layer label and color on the chart', () => {
    mounted = mountChart(
      <LineSeries
        id="m"
        data={[
          { label: 'Revenue', color: '#ff0000', data: revenue },
          { label: 'Costs', color: '#00ff00', data: costs },
        ]}
      />,
    );

    expect(mounted.chart.getLayerLabel('m', 0)).toBe('Revenue');
    expect(mounted.chart.getLayerLabel('m', 1)).toBe('Costs');
    expect(mounted.chart.getSeriesLayers('m')).toEqual([{ color: '#ff0000' }, { color: '#00ff00' }]);
  });

  it('shows BOTH distinct layer names in the tooltip on hover', () => {
    mounted = mountChart(
      <>
        <LineSeries
          id="m"
          data={[
            { label: 'Revenue', data: revenue },
            { label: 'Costs', data: costs },
          ]}
        />
        <Tooltip />
      </>,
    );

    mounted.dispatchMouse('mousemove', { clientX: 200, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    const tooltip = findLineTooltip(mounted.container, ['Revenue', 'Costs']);
    expect(tooltip, 'tooltip should list both layer names').not.toBeNull();
  });

  it('shows the same per-layer names in the legend (legend ⇄ tooltip agree)', () => {
    mounted = mountChart(
      <>
        <LineSeries
          data={[
            { label: 'Revenue', data: revenue },
            { label: 'Costs', data: costs },
          ]}
        />
        <Legend />
      </>,
    );

    const text = mounted.container.textContent ?? '';
    expect(text).toContain('Revenue');
    expect(text).toContain('Costs');
  });

  it('auto-names unnamed multi-layer data Series 1 / Series 2', () => {
    mounted = mountChart(<LineSeries id="m" data={[revenue, costs]} />);

    expect(mounted.chart.getLayerLabel('m', 0)).toBe('Series 1');
    expect(mounted.chart.getLayerLabel('m', 1)).toBe('Series 2');
  });

  it('leaves a single unnamed layer without an auto-name (reads as "Value")', () => {
    mounted = mountChart(<LineSeries id="m" data={revenue} />);

    expect(mounted.chart.getLayerLabel('m', 0)).toBeUndefined();
  });

  it('a per-layer color overrides the palette; an unnamed-color layer keeps the theme palette', () => {
    mounted = mountChart(<LineSeries id="m" data={[{ color: '#123456', data: revenue }, { data: costs }]} />);

    const palette = mounted.chart.getTheme().seriesColors;
    const layers = mounted.chart.getSeriesLayers('m');
    expect(layers?.[0].color).toBe('#123456'); // data color wins
    expect(layers?.[1].color).toBe(palette[1]); // unnamed layer falls back to the theme palette
  });

  it('a function color paints a bar per value (sign coloring)', () => {
    mounted = mountChart(
      <BarSeries
        id="b"
        data={{ color: (v: number) => (v >= 0 ? '#00ff00' : '#ff0000'), data: [{ time: 1, value: 5 }] }}
      />,
    );

    // getSeriesLayers is multi-layer only; a single bar's color comes via getSeriesColor.
    expect(mounted.chart.getSeriesColor('b')).toBe('#00ff00');
  });
});

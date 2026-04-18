import { CandlestickSeries, Title, TooltipLegend } from '@wick-charts/react';
import { describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

const bars = [
  { time: 1_000_000, open: 100, high: 101, low: 99, close: 100.5, volume: 10 },
  { time: 1_005_000, open: 100.5, high: 102, low: 100, close: 101, volume: 12 },
];

describe('<Title> hoisting + grid layering', () => {
  it('renders Title + TooltipLegend stacked inside the canvas block', () => {
    const mounted = mountChart(
      <>
        <Title sub="Live Candlestick">BTC/USD</Title>
        <TooltipLegend />
        <CandlestickSeries data={bars} />
      </>,
      { width: 400, height: 240 },
    );

    const title = mounted.container.querySelector('[data-chart-title]') as HTMLElement;
    const bar = mounted.container.querySelector('[data-tooltip-legend]') as HTMLElement;
    expect(title).toBeTruthy();
    expect(bar).toBeTruthy();

    // Title and TooltipLegend share the same top-overlay wrapper and it is
    // positioned absolutely (an overlay on top of the canvas, not a flex row
    // above it). This lets the grid render full-height behind them.
    const wrapper = title.parentElement as HTMLElement;
    expect(wrapper.hasAttribute('data-chart-top-overlay')).toBe(true);
    expect(wrapper.style.position).toBe('absolute');
    expect(wrapper.contains(bar)).toBe(true);

    mounted.unmount();
  });

  it('omits the primary span when children is absent so `gap` does not leak a leading space', () => {
    const mounted = mountChart(
      <>
        <Title sub="1m" />
        <CandlestickSeries data={bars} />
      </>,
      { width: 400, height: 240 },
    );

    const title = mounted.container.querySelector('[data-chart-title]') as HTMLElement | null;
    expect(title).toBeTruthy();
    expect(title?.children.length).toBe(1);
    expect(title?.textContent).toBe('1m');

    mounted.unmount();
  });

  it('canvas spans the full container so the grid renders behind Title/TooltipLegend', () => {
    const mounted = mountChart(
      <>
        <Title>BTC</Title>
        <TooltipLegend />
        <CandlestickSeries data={bars} />
      </>,
      { width: 400, height: 240 },
    );

    const canvas = mounted.container.querySelector('canvas') as HTMLCanvasElement;
    const title = mounted.container.querySelector('[data-chart-title]') as HTMLElement;
    const bar = mounted.container.querySelector('[data-tooltip-legend]') as HTMLElement;
    expect(canvas).toBeTruthy();

    // Canvas and the Title/TooltipLegend overlay share the same canvas-block
    // container — i.e. the overlays are *inside* the canvas's parent, so the
    // canvas visually extends under them rather than the other way around.
    const canvasBlock = canvas.parentElement as HTMLElement;
    expect(canvasBlock.contains(title)).toBe(true);
    expect(canvasBlock.contains(bar)).toBe(true);

    mounted.unmount();
  });

  it('top overlay wrapper is removed entirely when Title and TooltipLegend are both absent', () => {
    // When neither overlay is declared the wrapper is not rendered at all;
    // combined with the effect's `setTopOverlayHeight(0)` reset, padding.top
    // drops back to the user's configured value instead of carrying stale
    // height from a previous render.
    const mounted = mountChart(<CandlestickSeries data={bars} />, { width: 400, height: 240 });
    expect(mounted.container.querySelector('[data-chart-top-overlay]')).toBeNull();
    mounted.unmount();
  });

  it('floating tooltip overlay has a higher z-index than Title/TooltipLegend', () => {
    // When the cursor hovers over the top of the chart, the floating <Tooltip>
    // glass panel should appear *above* Title / TooltipLegend — otherwise the
    // header strip covers the tooltip content.
    const mounted = mountChart(
      <>
        <Title>BTC</Title>
        <TooltipLegend />
        <CandlestickSeries data={bars} />
      </>,
      { width: 400, height: 240 },
    );

    const topOverlay = mounted.container.querySelector('[data-chart-top-overlay]') as HTMLElement;
    const seriesOverlay = mounted.container.querySelector('[data-chart-series-overlay]') as HTMLElement;
    expect(topOverlay).toBeTruthy();
    expect(seriesOverlay).toBeTruthy();

    const topZ = Number.parseInt(topOverlay.style.zIndex || '0', 10);
    const seriesZ = Number.parseInt(seriesOverlay.style.zIndex || '0', 10);
    expect(seriesZ).toBeGreaterThan(topZ);

    mounted.unmount();
  });
});

import { ChartInstance } from '@wick-charts/core';
import { CandlestickSeries, Legend, Title, TooltipLegend } from '@wick-charts/react';
import { describe, expect, it, vi } from 'vitest';

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

  it('folds the measured header height into padding.top in overlay mode but not in inline', () => {
    // Overlay folds `topOverlayHeight` into `padding.top` so series data
    // clears the absolute-positioned strip. Inline must skip that fold — the
    // browser already reserved the header height via flex layout, and folding
    // would double-shift the data. Spy on the prototype so we capture every
    // `setPadding` call from both mounts, including the initial ones.
    const spy = vi.spyOn(ChartInstance.prototype, 'setPadding');

    const overlayMount = mountChart(
      <>
        <Title sub="Live">BTC</Title>
        <TooltipLegend />
        <CandlestickSeries data={bars} />
      </>,
      { width: 400, height: 240, headerLayout: 'overlay', padding: { top: 20 } },
    );
    // The last setPadding call in overlay mode must include the measured
    // header height on top of the user's configured `top` (20).
    const overlayTop = spy.mock.calls.at(-1)?.[0]?.top ?? 0;
    expect(overlayTop).toBeGreaterThan(20);
    overlayMount.unmount();

    spy.mockClear();

    const inlineMount = mountChart(
      <>
        <Title sub="Live">BTC</Title>
        <TooltipLegend />
        <CandlestickSeries data={bars} />
      </>,
      { width: 400, height: 240, headerLayout: 'inline', padding: { top: 20 } },
    );
    // Inline mode must pass the user's raw top (20) — never `20 + measured`.
    // Every call to setPadding in inline mode must keep top === 20, so no
    // matter which call we inspect we should see the unfolded value.
    for (const call of spy.mock.calls) {
      expect(call[0]?.top).toBe(20);
    }
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    inlineMount.unmount();

    spy.mockRestore();
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

describe('<Title> + <TooltipLegend> with headerLayout="inline"', () => {
  it('renders Title/TooltipLegend as flex siblings above the canvas container (not absolute overlays)', () => {
    const mounted = mountChart(
      <>
        <Title sub="Live">BTC</Title>
        <TooltipLegend />
        <CandlestickSeries data={bars} />
      </>,
      { width: 400, height: 240, headerLayout: 'inline' },
    );

    const title = mounted.container.querySelector('[data-chart-title]') as HTMLElement;
    const bar = mounted.container.querySelector('[data-tooltip-legend]') as HTMLElement;
    const header = title.parentElement as HTMLElement;
    expect(header.hasAttribute('data-chart-header')).toBe(true);
    // Absolute positioning is the overlay contract — inline must avoid it.
    expect(header.style.position).not.toBe('absolute');
    expect(header.style.flexShrink).toBe('0');
    expect(header.contains(bar)).toBe(true);

    // The old overlay marker must be absent — overlay detectors downstream
    // (custom CSS, docs pages) should know this is a different layout mode.
    expect(header.hasAttribute('data-chart-top-overlay')).toBe(false);
    expect(mounted.container.querySelector('[data-chart-top-overlay]')).toBeNull();

    mounted.unmount();
  });

  it('shifts canvas below the header — canvas is not a sibling of the header', () => {
    // The whole point of inline mode: the canvas (and therefore the grid)
    // starts *below* the header, so nothing renders behind the title text.
    const mounted = mountChart(
      <>
        <Title>BTC</Title>
        <TooltipLegend />
        <CandlestickSeries data={bars} />
      </>,
      { width: 400, height: 240, headerLayout: 'inline' },
    );

    const canvas = mounted.container.querySelector('canvas') as HTMLCanvasElement;
    const title = mounted.container.querySelector('[data-chart-title]') as HTMLElement;
    const canvasInner = canvas.parentElement as HTMLElement;
    // Canvas's direct parent must NOT contain the title (it's a sibling of
    // the header, one level up in the flex column).
    expect(canvasInner.contains(title)).toBe(false);

    const canvasBlock = canvasInner.parentElement as HTMLElement;
    expect(canvasBlock.hasAttribute('data-chart-canvas-block')).toBe(true);
    expect(canvasBlock.contains(title)).toBe(true);
    // Header renders *before* the chart-inner in the flex column, so flex
    // layout naturally pushes the canvas down.
    expect(canvasBlock.children[0]?.getAttribute('data-chart-header')).toBe('');
    expect(canvasBlock.children[1]).toBe(canvasInner);

    mounted.unmount();
  });

  it('background gradient still spans the full container', () => {
    // Inline mode must not accidentally move the gradient onto a sub-region;
    // users expect the framed-chart look even when the canvas is shorter.
    const mounted = mountChart(
      <>
        <Title>BTC</Title>
        <CandlestickSeries data={bars} />
      </>,
      { width: 400, height: 240, headerLayout: 'inline' },
    );
    const outer = mounted.container.firstElementChild as HTMLElement;
    expect(outer.style.background).toContain('linear-gradient');
    mounted.unmount();
  });

  it('coexists with right-side <Legend>: header sits above canvas, legend stays in the horizontal row', () => {
    const mounted = mountChart(
      <>
        <Title>BTC</Title>
        <TooltipLegend />
        <CandlestickSeries data={bars} />
        <Legend position="right" />
      </>,
      { width: 400, height: 240, headerLayout: 'inline' },
    );

    const outer = mounted.container.firstElementChild as HTMLElement;
    const row = outer.children[0] as HTMLElement;
    expect(row.style.flexDirection).toBe('row');
    // The canvas-block (with the inline header stack inside it) shares the
    // row with the right-legend, so the header never extends over the legend.
    const canvasBlock = row.children[0] as HTMLElement;
    expect(canvasBlock.hasAttribute('data-chart-canvas-block')).toBe(true);
    const title = mounted.container.querySelector('[data-chart-title]');
    expect(canvasBlock.contains(title)).toBe(true);

    mounted.unmount();
  });

  it('switches between overlay and inline at runtime without stranding DOM markers', () => {
    const mounted = mountChart(
      <>
        <Title>BTC</Title>
        <TooltipLegend />
        <CandlestickSeries data={bars} />
      </>,
      { width: 400, height: 240, headerLayout: 'overlay' },
    );

    // Overlay → overlay marker exists, inline canvas-block does not.
    expect(mounted.container.querySelector('[data-chart-top-overlay]')).not.toBeNull();
    expect(mounted.container.querySelector('[data-chart-canvas-block]')).toBeNull();

    mounted.rerender(
      <>
        <Title>BTC</Title>
        <TooltipLegend />
        <CandlestickSeries data={bars} />
      </>,
      { headerLayout: 'inline' },
    );

    // After switch: the overlay marker is gone (no stale element from the
    // previous mode) and the inline canvas-block wrapper appears.
    expect(mounted.container.querySelector('[data-chart-top-overlay]')).toBeNull();
    expect(mounted.container.querySelector('[data-chart-canvas-block]')).not.toBeNull();

    mounted.unmount();
  });

  it('does not render a header wrapper when Title and TooltipLegend are both absent', () => {
    // No header → no wrapper either mode; prevents empty flex rows adding
    // phantom whitespace above the canvas.
    const mounted = mountChart(<CandlestickSeries data={bars} />, {
      width: 400,
      height: 240,
      headerLayout: 'inline',
    });
    expect(mounted.container.querySelector('[data-chart-header]')).toBeNull();
    mounted.unmount();
  });
});

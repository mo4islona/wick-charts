// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { CandlestickSeries, ChartContainer, Tooltip, TooltipLegend, darkTheme } from '@wick-charts/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Cell } from '../components/Cell';

const OHLC = [
  { time: 1_700_000_000_000, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
  { time: 1_700_000_060_000, open: 105, high: 115, low: 100, close: 108, volume: 1200 },
  { time: 1_700_000_120_000, open: 108, high: 120, low: 104, close: 117, volume: 1500 },
];

describe('Cell layout — title coexisting with TooltipLegend', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the title in normal flow (not absolute) so it cannot overlap the hoisted TooltipLegend row', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <Cell label="ETH/USD" sub="Live Area · Bands" theme={darkTheme}>
        <ChartContainer theme={darkTheme}>
          <TooltipLegend />
          <CandlestickSeries data={OHLC} />
          <Tooltip />
        </ChartContainer>
      </Cell>,
    );

    const cell = container.querySelector<HTMLElement>('[data-cell]');
    const title = container.querySelector<HTMLElement>('[data-cell-title]');
    const legend = container.querySelector<HTMLElement>('[data-tooltip-legend]');

    expect(cell, 'Cell root must render').not.toBeNull();
    expect(title, 'Cell title must render').not.toBeNull();
    expect(legend, 'TooltipLegend bar must render').not.toBeNull();

    // Title must NOT be absolutely positioned — that's the regression.
    // An absolute-positioned title overlays the chart's top-left corner,
    // colliding with the hoisted TooltipLegend's first item.
    expect(title!.style.position).not.toBe('absolute');

    // Title must come before the chart container in DOM source order so
    // the browser's flex column lays them out as separate vertical rows.
    const cellChildren = Array.from(cell!.children) as HTMLElement[];
    const titleIndex = cellChildren.findIndex((c) => c === title || c.contains(title!));
    const legendIndex = cellChildren.findIndex((c) => c === legend || c.contains(legend!));
    expect(titleIndex).toBeGreaterThanOrEqual(0);
    expect(legendIndex).toBeGreaterThanOrEqual(0);
    expect(titleIndex).toBeLessThan(legendIndex);

    // And the Cell itself must be a flex column so the rows actually stack.
    expect(cell!.style.display).toBe('flex');
    expect(cell!.style.flexDirection).toBe('column');

    warnSpy.mockRestore();
  });

  it('still renders the title when no TooltipLegend is present (chart-only Cells unaffected)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <Cell label="BTC/USD" sub="Standard · 1m" theme={darkTheme}>
        <ChartContainer theme={darkTheme}>
          <CandlestickSeries data={OHLC} />
        </ChartContainer>
      </Cell>,
    );
    const title = container.querySelector<HTMLElement>('[data-cell-title]');
    expect(title?.textContent).toContain('BTC/USD');
    expect(title?.textContent).toContain('Standard · 1m');
    warnSpy.mockRestore();
  });
});

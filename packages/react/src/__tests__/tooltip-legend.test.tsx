import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CandlestickSeries } from '../CandlestickSeries';
import { ChartContainer } from '../ChartContainer';
import { Legend } from '../ui/Legend';
import { Tooltip } from '../ui/Tooltip';
import { TooltipLegend } from '../ui/TooltipLegend';

const OHLC = [
  { time: 1_700_000_000_000, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
  { time: 1_700_000_060_000, open: 105, high: 115, low: 100, close: 108, volume: 1200 },
  { time: 1_700_000_120_000, open: 108, high: 120, low: 104, close: 117, volume: 1500 },
];

describe('<TooltipLegend> integration', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    warnSpy.mockRestore();
  });

  it('hoists TooltipLegend into its own flex row above the canvas and suppresses the legacy overlay', () => {
    const { container } = render(
      <ChartContainer>
        <TooltipLegend />
        <CandlestickSeries data={OHLC} />
        <Tooltip />
      </ChartContainer>,
    );

    const bar = container.querySelector('[data-tooltip-legend]');
    expect(bar, 'TooltipLegend should be in the DOM').not.toBeNull();

    // Confirm it's a sibling of the canvas container (not nested inside it).
    // ChartContainer outer flex column:
    //   [0] TooltipLegend row  [1] canvas wrapper  [2] Legend (optional)
    const outer = container.firstElementChild as HTMLElement | null;
    expect(outer).not.toBeNull();
    expect(outer?.children[0].contains(bar!)).toBe(true);

    // Canvas wrapper is the second child and should NOT contain the TooltipLegend.
    const canvasWrapper = outer?.children[1] as HTMLElement | undefined;
    expect(canvasWrapper?.contains(bar!)).toBe(false);

    // No legacy absolute-positioned legend rendered by Tooltip.
    const legacyOverlays = canvasWrapper?.querySelectorAll('[style*="position: absolute"][style*="top: 24"]');
    expect(legacyOverlays?.length ?? 0).toBe(0);

    // No deprecation warn when the user is doing the right thing.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to legacy absolute overlay and warns once when TooltipLegend is absent', () => {
    const { container, rerender, unmount } = render(
      <ChartContainer>
        <CandlestickSeries data={OHLC} />
        <Tooltip />
      </ChartContainer>,
    );

    const legacy = container.querySelector<HTMLElement>('div[style*="top: 24"]');
    expect(legacy, 'legacy overlay should render as fallback').not.toBeNull();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('TooltipLegend');

    // Re-render the SAME chart instance — warn should NOT fire again.
    rerender(
      <ChartContainer>
        <CandlestickSeries data={OHLC} />
        <Tooltip />
      </ChartContainer>,
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('emits at most one warn per chart instance (separate <ChartContainer>s each warn once)', () => {
    render(
      <>
        <ChartContainer>
          <CandlestickSeries data={OHLC} />
          <Tooltip />
        </ChartContainer>
        <ChartContainer>
          <CandlestickSeries data={OHLC} />
          <Tooltip />
        </ChartContainer>
      </>,
    );
    // One warn per chart instance.
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('suppresses the legacy overlay on every Tooltip in a container when TooltipLegend is present', () => {
    const { container } = render(
      <ChartContainer>
        <TooltipLegend />
        <CandlestickSeries data={OHLC} />
        <Tooltip />
        <Tooltip />
      </ChartContainer>,
    );
    const legacyLegends = container.querySelectorAll('div[style*="top: 24"]');
    expect(legacyLegends.length).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('coexists with right-side <Legend>: top bar spans full width, canvas and legend share a row', () => {
    const { container } = render(
      <ChartContainer>
        <TooltipLegend />
        <CandlestickSeries data={OHLC} />
        <Legend position="right" />
      </ChartContainer>,
    );
    const outer = container.firstElementChild as HTMLElement;
    // Outer container is a flex column; TooltipLegend is its first child.
    expect(outer.style.flexDirection).toBe('column');
    const top = outer.children[0] as HTMLElement;
    expect(top.hasAttribute('data-tooltip-legend') || top.querySelector('[data-tooltip-legend]')).toBeTruthy();

    // Second child is the row holding canvas + right-legend.
    const row = outer.children[1] as HTMLElement;
    expect(row.style.flexDirection).toBe('row');
    expect(row.children.length).toBe(2);
  });
});

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CandlestickSeries } from '../CandlestickSeries';
import { ChartContainer } from '../ChartContainer';
import { InfoBar } from '../ui/InfoBar';
import { Legend } from '../ui/Legend';
import { Tooltip } from '../ui/Tooltip';

const OHLC = [
  { time: 1_700_000_000_000, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
  { time: 1_700_000_060_000, open: 105, high: 115, low: 100, close: 108, volume: 1200 },
  { time: 1_700_000_120_000, open: 108, high: 120, low: 104, close: 117, volume: 1500 },
];

describe('<InfoBar> integration', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders InfoBar as an absolute overlay at the top of the canvas block', () => {
    // Post-grid-fix layout: Title / InfoBar stack as absolute overlays
    // at the top of the canvas container (not flex siblings above it), so the
    // canvas — and the grid — fill the whole container.
    const { container } = render(
      <ChartContainer>
        <InfoBar />
        <CandlestickSeries data={OHLC} />
        <Tooltip />
      </ChartContainer>,
    );

    const bar = container.querySelector('[data-tooltip-legend]');
    expect(bar, 'InfoBar should be in the DOM').not.toBeNull();

    // Its parent is the stacked overlay wrapper; that wrapper is positioned
    // absolute inside the canvas block.
    const parent = bar?.parentElement as HTMLElement;
    expect(parent.style.position).toBe('absolute');
    expect(parent.style.top).toBe('0px');

    // Canvas element exists in the same subtree as the InfoBar — i.e.
    // the two share a container, letting the grid render behind the bar.
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    const canvasBlock = canvas!.parentElement as HTMLElement;
    expect(canvasBlock.contains(bar!)).toBe(true);
  });

  it('Tooltip on its own renders no top-left info overlay (floating-only contract)', () => {
    // Post-0.2: <Tooltip> is floating-only. Without hover/crosshair it renders
    // nothing. An absolute-positioned info strip at top-left would mean the
    // legacy overlay leaked back in.
    const { container } = render(
      <ChartContainer>
        <CandlestickSeries data={OHLC} />
        <Tooltip />
      </ChartContainer>,
    );
    const legacy = container.querySelectorAll('div[style*="top: 24"]');
    expect(legacy.length).toBe(0);
  });

  it('coexists with right-side <Legend>: legend shares a row with the canvas block', () => {
    const { container } = render(
      <ChartContainer>
        <InfoBar />
        <CandlestickSeries data={OHLC} />
        <Legend position="right" />
      </ChartContainer>,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.style.flexDirection).toBe('column');

    // First (and only) outer child is the horizontal row holding canvas + right-legend.
    const row = outer.children[0] as HTMLElement;
    expect(row.style.flexDirection).toBe('row');
    expect(row.children.length).toBe(2);

    // InfoBar still exists inside the canvas block (as a top overlay),
    // not as a sibling above it.
    const canvasBlock = row.children[0] as HTMLElement;
    const bar = canvasBlock.querySelector('[data-tooltip-legend]');
    expect(bar).not.toBeNull();
  });
});

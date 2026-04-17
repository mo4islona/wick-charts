import { CandlestickSeries, LineSeries, Tooltip } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { computeTooltipPosition } from '../../ui/Tooltip';
import { mountChart } from '../helpers/mount-chart';

describe('computeTooltipPosition', () => {
  const box = { tooltipWidth: 160, tooltipHeight: 140, chartWidth: 800, chartHeight: 400 };

  it('places the tooltip right/below the cursor when both sides fit', () => {
    const { left, top } = computeTooltipPosition({ ...box, x: 100, y: 100 });
    expect(left).toBe(116);
    expect(top).toBe(116);
  });

  it('flips to the left side when the right side would overflow', () => {
    const { left } = computeTooltipPosition({ ...box, x: 780, y: 100 });
    expect(left).toBe(780 - 16 - 160);
  });

  it('flips to above when the lower side would overflow', () => {
    const { top } = computeTooltipPosition({ ...box, x: 100, y: 380 });
    expect(top).toBe(380 - 16 - 140);
  });

  it('clamps to 0 when the flipped left goes negative because the tooltip is about as wide as the chart', () => {
    const { left } = computeTooltipPosition({ ...box, x: 785, y: 10, tooltipWidth: 800 });
    expect(left).toBe(0);
  });

  it('clamps to 0 when the flipped top still overflows (cursor near top)', () => {
    // y is small, but the tooltip is taller than the chart, so the preferred
    // below placement overflows and the implementation flips above first.
    // That flipped top is still negative, so the result should clamp to 0.
    const { top } = computeTooltipPosition({ ...box, x: 100, y: 5, tooltipHeight: 500 });
    expect(top).toBe(0);
  });

  it('never returns a left that lets the tooltip extend past chartWidth', () => {
    const { left } = computeTooltipPosition({ ...box, x: 795, y: 10 });
    expect(left + box.tooltipWidth).toBeLessThanOrEqual(box.chartWidth);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it('never returns a top that lets the tooltip extend past chartHeight', () => {
    const { top } = computeTooltipPosition({ ...box, x: 10, y: 395 });
    expect(top + box.tooltipHeight).toBeLessThanOrEqual(box.chartHeight);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  it('falls back to 0 when the tooltip is wider than the chart', () => {
    const { left } = computeTooltipPosition({ ...box, x: 100, y: 100, tooltipWidth: 2000 });
    expect(left).toBe(0);
  });
});

describe('Tooltip (floating) overlay positioning', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  // Dense fixture so nearest-data lookup lands on a candle anywhere in the plot.
  const ohlc = Array.from({ length: 40 }, (_, i) => ({
    time: i + 1,
    open: 10 + i * 0.1,
    high: 12 + i * 0.1,
    low: 9 + i * 0.1,
    close: 11 + i * 0.1,
  }));

  function findFloatingTooltip(root: HTMLElement): HTMLElement | null {
    // The floating tooltip is the only z-indexed absolute element containing
    // the "Open" / "Close" row labels (legend strip has no such labels).
    const candidates = root.querySelectorAll<HTMLElement>('div');
    for (const el of candidates) {
      const txt = el.textContent ?? '';
      if (el.style.position === 'absolute' && txt.includes('Open') && txt.includes('Close')) return el;
    }
    return null;
  }

  function parsePx(value: string): number {
    return Number.parseFloat(value.replace('px', '')) || 0;
  }

  it('keeps the floating tooltip inside the plot area when hovering near the top-left', () => {
    mounted = mountChart(
      <>
        <CandlestickSeries data={ohlc} />
        <Tooltip />
      </>,
      { width: 800, height: 400 },
    );
    // Hover close to the top-left corner — the naive "x + 16, y + 16" position fits
    // fine; what we're asserting is simply "no negative coordinates ever".
    mounted.dispatchMouse('mousemove', { clientX: 4, clientY: 4 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    const tooltip = findFloatingTooltip(mounted.container);
    expect(tooltip, 'floating tooltip should render on hover').not.toBeNull();
    expect(parsePx(tooltip!.style.left)).toBeGreaterThanOrEqual(0);
    expect(parsePx(tooltip!.style.top)).toBeGreaterThanOrEqual(0);
  });

  it('flips the tooltip to the left of the cursor when hovering near the right edge', () => {
    mounted = mountChart(
      <>
        <CandlestickSeries data={ohlc} />
        <Tooltip />
      </>,
      { width: 800, height: 400 },
    );
    // Derive the hover X from the actual plot width so this still exercises
    // the flip when yAxisWidth changes with theme/axis options. 80% puts us
    // past the flip threshold (plotWidth − offsetX − tooltipWidth, about 76%
    // for default constants) AND inside the data range (viewport has 3
    // intervals of right padding, so the data ends well before plotWidth).
    const plotWidth = mounted.container.clientWidth - mounted.chart.yAxisWidth;
    const hoverX = Math.floor(plotWidth * 0.8);
    mounted.dispatchMouse('mousemove', { clientX: hoverX, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    const tooltip = findFloatingTooltip(mounted.container);
    expect(tooltip).not.toBeNull();
    const left = parsePx(tooltip!.style.left);
    // Flipped side sits strictly left of the cursor and well clear of the chart edges.
    expect(left).toBeLessThan(hoverX);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it('never lets the floating tooltip top go negative when hovering at the top edge', () => {
    const lineData = [Array.from({ length: 20 }, (_, i) => ({ time: i + 1, value: 10 + i }))];
    mounted = mountChart(
      <>
        <LineSeries data={lineData} />
        <Tooltip />
      </>,
      { width: 800, height: 400 },
    );
    // Hover at the very top edge. The preferred "below" placement yields a
    // positive top; the assertion locks in that no geometry path lets the
    // tooltip escape above the plot area — that's the reported bug.
    mounted.dispatchMouse('mousemove', { clientX: 400, clientY: 0 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    const candidates = mounted.container.querySelectorAll<HTMLElement>('div');
    let tooltip: HTMLElement | null = null;
    for (const el of candidates) {
      if (el.style.position === 'absolute' && el.style.zIndex === '10') {
        tooltip = el;
        break;
      }
    }
    expect(tooltip, 'floating tooltip should render on hover').not.toBeNull();
    expect(parsePx(tooltip!.style.top)).toBeGreaterThanOrEqual(0);
  });
});

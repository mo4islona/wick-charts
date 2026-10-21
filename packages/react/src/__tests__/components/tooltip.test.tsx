import { act } from '@testing-library/react';
import { CandlestickSeries, LineSeries, Tooltip } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MockResizeObserver } from '../../../test-setup';
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

  /** Gives every `[data-chart-tooltip]` box a layout size; happy-dom has no layout. */
  function stubTooltipBox(width: number, height: number): () => void {
    const proto = HTMLElement.prototype;
    const widthDesc = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
    const heightDesc = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
    const sized = (el: HTMLElement, size: number) => (el.hasAttribute('data-chart-tooltip') ? size : 0);
    Object.defineProperty(proto, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return sized(this, width);
      },
    });
    Object.defineProperty(proto, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return sized(this, height);
      },
    });

    return () => {
      if (widthDesc) Object.defineProperty(proto, 'offsetWidth', widthDesc);
      if (heightDesc) Object.defineProperty(proto, 'offsetHeight', heightDesc);
    };
  }

  it('sizes the box to a long label and keeps it inside the plot by its measured size', () => {
    const restore = stubTooltipBox(300, 60);
    try {
      const layer = Array.from({ length: 20 }, (_, i) => ({ time: i + 1, value: 10 + i }));
      mounted = mountChart(
        <>
          <LineSeries data={[{ label: 'Fri 10 May', data: layer }]} />
          <Tooltip />
        </>,
        { width: 800, height: 400 },
      );
      const chartWidth = mounted.chart.getLayout().chartArea.width;
      // Room on the right for the 160 px estimate, not for the 300 px box.
      mounted.dispatchMouse('mousemove', { clientX: chartWidth - 200, clientY: 200 }, mounted.overlayCanvas);
      mounted.flushScheduler();

      const tooltip = mounted.container.querySelector<HTMLElement>('[data-chart-tooltip]');
      const crosshair = mounted.chart.getCrosshairPosition();
      if (!tooltip || !crosshair) throw new Error('tooltip did not render');

      const expected = computeTooltipPosition({
        x: crosshair.mediaX,
        y: crosshair.mediaY,
        chartLeft: mounted.chart.plotLeft,
        chartWidth,
        chartHeight: mounted.chart.getMediaSize().height - mounted.chart.xAxisHeight,
        tooltipWidth: 300,
        tooltipHeight: 60,
      });

      expect(tooltip.style.width).toBe('max-content');
      expect(tooltip.style.maxWidth).toBe(`${chartWidth}px`);
      expect(parsePx(tooltip.style.left)).toBe(expected.left);
      expect(parsePx(tooltip.style.top)).toBe(expected.top);
      expect(parsePx(tooltip.style.left) + 300).toBeLessThanOrEqual(mounted.chart.plotLeft + chartWidth);
    } finally {
      restore();
    }
  });

  it('keeps a custom render-prop box inside the plot near the right edge by its border-box size', () => {
    const restore = stubTooltipBox(300, 60);
    try {
      const layer = Array.from({ length: 20 }, (_, i) => ({ time: i + 1, value: 10 + i }));
      mounted = mountChart(
        <>
          <LineSeries data={[layer]} />
          <Tooltip>{() => <div>custom</div>}</Tooltip>
        </>,
        { width: 800, height: 400 },
      );
      const chartWidth = mounted.chart.getLayout().chartArea.width;
      const chartObservers = new Set(MockResizeObserver.callbacks);
      // Room on the right for the 270 px content box, not for the 300 px border box.
      mounted.dispatchMouse('mousemove', { clientX: chartWidth - 300, clientY: 200 }, mounted.overlayCanvas);
      mounted.flushScheduler();

      const tooltip = mounted.container.querySelector<HTMLElement>('[data-chart-tooltip]');
      const crosshair = mounted.chart.getCrosshairPosition();
      if (!tooltip || !crosshair) throw new Error('tooltip did not render');

      // A browser reports the content box: 300 × 60 less the 14/10 px padding and 1 px border.
      const contentBox = { target: tooltip, contentRect: { width: 270, height: 38 } } as unknown as ResizeObserverEntry;
      const observers = Array.from(MockResizeObserver.callbacks).filter((cb) => !chartObservers.has(cb));
      act(() => {
        for (const cb of observers) {
          cb([contentBox], {} as ResizeObserver);
        }
      });

      const expected = computeTooltipPosition({
        x: crosshair.mediaX,
        y: crosshair.mediaY,
        chartLeft: mounted.chart.plotLeft,
        chartWidth,
        chartHeight: mounted.chart.getMediaSize().height - mounted.chart.xAxisHeight,
        tooltipWidth: 300,
        tooltipHeight: 60,
      });

      expect(tooltip.style.visibility).toBe('visible');
      expect(parsePx(tooltip.style.left) + 300).toBeLessThanOrEqual(mounted.chart.plotLeft + chartWidth);
      expect(parsePx(tooltip.style.left)).toBe(expected.left);
      expect(parsePx(tooltip.style.top)).toBe(expected.top);
    } finally {
      restore();
    }
  });

  it('sizes the box to its content for percent-stack rows, which carry a share and a value', () => {
    const layer = (values: number[]) => values.map((value, i) => ({ time: (i + 1) * 60_000, value }));
    mounted = mountChart(
      <>
        <LineSeries
          data={[
            { label: 'react', data: layer([4425172, 4500000, 4600000]) },
            { label: '@angular/core', data: layer([1546000, 1600000, 1650000]) },
          ]}
          options={{ stacking: 'percent' }}
        />
        <Tooltip />
      </>,
      { width: 800, height: 400 },
    );
    mounted.dispatchMouse('mousemove', { clientX: 400, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    // The innermost absolute box holding a share row is the tooltip itself.
    const boxes = Array.from(mounted.container.querySelectorAll<HTMLElement>('div')).filter(
      (el) => el.style.position === 'absolute' && (el.textContent ?? '').includes('% ·'),
    );
    expect(boxes.at(-1)?.style.width).toBe('max-content');
  });

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

describe('Tooltip rows on a monthly and a daily series', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const DAY = 86_400_000;
  const monthly = Array.from({ length: 12 }, (_, month) => ({ time: Date.UTC(2020, month, 1), value: 4 + month }));
  const daily = Array.from({ length: 366 }, (_, day) => ({
    time: Date.UTC(2020, 0, 1) + day * DAY,
    value: 1 + (day % 3),
  }));

  it('names the date of a row whose point is not the header date', () => {
    mounted = mountChart(
      <>
        <LineSeries
          data={[
            { label: 'Monthly', data: monthly },
            { label: 'Daily', data: daily },
          ]}
        />
        <Tooltip />
      </>,
      { width: 800, height: 400 },
    );

    const chart = mounted.chart;
    act(() => {
      chart.setCrosshair({ time: Date.UTC(2020, 2, 20), y: 5 });
    });
    mounted.flushScheduler();

    const tooltip = Array.from(mounted.container.querySelectorAll<HTMLElement>('[data-chart-tooltip]')).at(-1);
    const rows = Array.from(tooltip?.children ?? []).map((row) => row.textContent ?? '');

    expect(rows[0]).toMatch(/Mar 20/);
    expect(rows.find((row) => row.startsWith('Monthly'))).toMatch(/Apr 1/);
    expect(rows.find((row) => row.startsWith('Daily'))).not.toMatch(/Mar|Apr/);
  });
});

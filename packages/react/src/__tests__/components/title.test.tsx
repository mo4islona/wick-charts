import { CandlestickSeries, Title, TooltipLegend } from '@wick-charts/react';
import { describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

const bars = [
  { time: 1_000_000, open: 100, high: 101, low: 99, close: 100.5, volume: 10 },
  { time: 1_005_000, open: 100.5, high: 102, low: 100, close: 101, volume: 12 },
];

describe('<Title> hoisting', () => {
  it('renders as a flex sibling above the canvas and above <TooltipLegend>', () => {
    const mounted = mountChart(
      <>
        <Title sub="Live Candlestick">BTC/USD</Title>
        <TooltipLegend />
        <CandlestickSeries data={bars} />
      </>,
      { width: 400, height: 240 },
    );

    const title = mounted.container.querySelector('[data-chart-title]');
    expect(title).toBeTruthy();
    expect(title?.textContent).toContain('BTC/USD');
    expect(title?.textContent).toContain('Live Candlestick');

    // Title must not be absolutely positioned (that was the pre-hoist bug
    // that let it collide with TooltipLegend).
    const computed = window.getComputedStyle(title as HTMLElement);
    expect(['static', 'relative', '']).toContain(computed.position);

    // Stacking order: Title → TooltipLegend → canvas-owning container.
    const all = Array.from(mounted.container.querySelectorAll('*'));
    const titleIdx = all.findIndex((el) => el.hasAttribute('data-chart-title'));
    const legendIdx = all.findIndex((el) => el.hasAttribute('data-tooltip-legend'));
    const canvasIdx = all.findIndex((el) => el.tagName === 'CANVAS');
    expect(titleIdx).toBeGreaterThan(-1);
    expect(legendIdx).toBeGreaterThan(titleIdx);
    expect(canvasIdx).toBeGreaterThan(legendIdx);

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
    // Exactly one child span — the muted sub-label. No leading empty span.
    expect(title?.children.length).toBe(1);
    expect(title?.textContent).toBe('1m');

    mounted.unmount();
  });

  it('renders without <TooltipLegend> and still sits above the canvas', () => {
    const mounted = mountChart(
      <>
        <Title>Portfolio</Title>
        <CandlestickSeries data={bars} />
      </>,
      { width: 400, height: 240 },
    );

    const title = mounted.container.querySelector('[data-chart-title]');
    const canvas = mounted.container.querySelector('canvas');
    expect(title).toBeTruthy();
    expect(canvas).toBeTruthy();
    // compareDocumentPosition: FOLLOWING (4) means `canvas` comes after `title` in document order.
    expect((title as HTMLElement).compareDocumentPosition(canvas as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    mounted.unmount();
  });
});

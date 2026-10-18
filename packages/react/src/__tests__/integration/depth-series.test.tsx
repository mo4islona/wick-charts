import { type DepthLevel, DepthSeries, Tooltip } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

const BIDS: DepthLevel[] = [
  [99, 1],
  [97, 2],
  [94, 3],
];
const ASKS: DepthLevel[] = [
  [101, 1],
  [102, 2],
  [104, 4],
];

const NUMERIC = { axis: { x: { type: 'numeric' as const } } };

function floatingTooltip(root: HTMLElement): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>('div')) {
    if (el.style.position === 'absolute' && el.style.zIndex === '10') return el;
  }

  return null;
}

describe('<DepthSeries>', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  function hoverAt(price: number): void {
    if (mounted === null) throw new Error('not mounted');

    const clientX = mounted.chart.plotLeft + mounted.chart.timeScale.timeToX(price);
    mounted.dispatchMouse('mousemove', { clientX, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();
  }

  it('draws both walls and the mid label, centered on mid', () => {
    mounted = mountChart(<DepthSeries bids={BIDS} asks={ASKS} />, NUMERIC);
    mounted.flushScheduler();

    expect(mounted.mainSpy.countOf('fill')).toBeGreaterThanOrEqual(2);
    expect(mounted.mainSpy.callsOf('fillText').map((call) => call.args[0])).toContain('mid 100 · spread 2');

    const { from, to } = mounted.chart.getVisibleRange();
    expect((from + to) / 2).toBeCloseTo(100);
  });

  it('follows a new book from props', () => {
    mounted = mountChart(<DepthSeries bids={BIDS} asks={ASKS} options={{ span: 0.05 }} />, NUMERIC);
    mounted.flushScheduler();

    const shift = (levels: DepthLevel[]): DepthLevel[] => levels.map(([price, size]) => [price + 20, size]);
    mounted.rerender(<DepthSeries bids={shift(BIDS)} asks={shift(ASKS)} options={{ span: 0.05 }} />);
    mounted.flushScheduler();

    const { from, to } = mounted.chart.getVisibleRange();
    expect((from + to) / 2).toBeCloseTo(120);
    expect(to - from).toBeCloseTo(2 * 0.05 * 120);
  });

  it('shows the side, the level price and the cumulative size in the tooltip', () => {
    mounted = mountChart(
      <>
        <DepthSeries bids={BIDS} asks={ASKS} />
        <Tooltip />
      </>,
      NUMERIC,
    );
    mounted.flushScheduler();

    hoverAt(102.5);

    const tooltip = floatingTooltip(mounted.container);
    expect(tooltip?.textContent).toBe('102Asks3.0000');
    expect(mounted.overlaySpy.countOf('arc')).toBeGreaterThan(0);
  });
});

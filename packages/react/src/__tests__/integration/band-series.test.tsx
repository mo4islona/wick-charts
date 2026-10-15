import { act } from '@testing-library/react';
import { BandSeries, InfoBar, LineSeries, Tooltip, YLabel } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

const T0 = 1_000_000;
const STEP = 60_000;

function bandData(count: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    time: T0 + i * STEP,
    low: 40 + offset + (i % 3),
    high: 60 + offset + (i % 4),
  }));
}

function floatingTooltip(root: HTMLElement): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>('div')) {
    if (el.style.position === 'absolute' && el.style.zIndex === '10') return el;
  }

  return null;
}

describe('<BandSeries>', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('fills the band and draws both edges', () => {
    mounted = mountChart(<BandSeries data={bandData(20)} />, { width: 800, height: 400 });

    expect(mounted.mainSpy.countOf('fill')).toBeGreaterThan(0);
    expect(mounted.mainSpy.countOf('stroke')).toBeGreaterThan(0);
  });

  it('a synced crosshair shows every band as a low – high tooltip row', () => {
    const outer = { label: 'p5–p95', data: bandData(20) };
    const inner = { label: 'p25–p75', data: bandData(20, 5) };
    mounted = mountChart(
      <>
        <BandSeries data={[outer, inner]} />
        <Tooltip />
      </>,
      { width: 800, height: 400 },
    );

    // `setCrosshair` is the path a multi-chart sync drives from another pane.
    const chart = mounted.chart;
    act(() => {
      chart.setCrosshair({ time: T0 + 4 * STEP, y: 100 });
    });
    mounted.flushScheduler();

    const tooltip = floatingTooltip(mounted.container);
    expect(tooltip).not.toBeNull();

    const text = tooltip?.textContent ?? '';
    expect(text).toContain('p5–p95');
    expect(text).toContain('p25–p75');
    expect(text).toMatch(/41(\.0+)? – 60(\.0+)?/);
    expect(text).toMatch(/46(\.0+)? – 65(\.0+)?/);
  });

  it('the info bar shows the last band range', () => {
    mounted = mountChart(
      <>
        <BandSeries data={bandData(3)} />
        <InfoBar />
      </>,
      { width: 800, height: 400 },
    );

    const bar = mounted.container.querySelector('[data-tooltip-legend]');
    expect(bar?.textContent ?? '').toMatch(/42(\.0+)? – 62(\.0+)?/);
  });

  it('streams appended points into the same series', () => {
    const initial = bandData(10);
    mounted = mountChart(<BandSeries data={initial} />, { width: 800, height: 400 });
    const [id] = mounted.chart.getSeriesIds();

    const next = [...initial, { time: T0 + 10 * STEP, low: 30, high: 90 }];
    mounted.rerender(<BandSeries data={next} />);

    expect(mounted.chart.getSeriesIds()).toEqual([id]);
    expect(mounted.chart.getLastData(id)).toEqual({ time: T0 + 10 * STEP, low: 30, high: 90 });
    expect(mounted.chart.getYRange().max).toBeGreaterThanOrEqual(90);
  });

  it('YLabel binds the line, not the band declared before it', () => {
    const line = Array.from({ length: 20 }, (_, i) => ({ time: T0 + i * STEP, value: 50 }));
    let badgeValue: number | null = null;
    mounted = mountChart(
      <>
        <BandSeries data={bandData(20)} />
        <LineSeries data={line} />
        <YLabel>
          {({ value }) => {
            badgeValue = value;

            return null;
          }}
        </YLabel>
      </>,
      { width: 800, height: 400 },
    );

    expect(badgeValue).toBe(50);
  });
});

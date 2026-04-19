import type { ReactNode } from 'react';

import { LineSeries, Title, TooltipLegend, YLabel } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

const seriesId = 'line';
const data: [Array<{ time: number; value: number }>] = [
  [
    { time: 1, value: 0 },
    { time: 2, value: 50 },
    { time: 3, value: 100 },
  ],
];

const tree: ReactNode = (
  <>
    <Title>BTC</Title>
    <TooltipLegend />
    <LineSeries id={seriesId} data={data} />
    <YLabel seriesId={seriesId} />
  </>
);

function getYLabelTop(mounted: ReturnType<typeof mountChart>): number {
  const overlay = mounted.container.querySelector('[data-chart-series-overlay]') as HTMLElement;
  if (!overlay) throw new Error('series-overlay not found');

  const divs = Array.from(overlay.querySelectorAll<HTMLElement>('div'));
  const badge = divs.find((el) => el.style.transform.includes('translateY(-50%)'));
  if (!badge) throw new Error('YLabel badge not found — did the hook deliver a snapshot?');

  return Number.parseFloat(badge.style.top);
}

describe('<YLabel> positioning vs headerLayout', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('in inline mode the badge top equals chart.yScale.valueToY(lastValue)', () => {
    mounted = mountChart(tree, { width: 400, height: 240, headerLayout: 'inline' });

    const last = mounted.chart.getLastValue(seriesId);
    expect(last).not.toBeNull();

    const expected = mounted.chart.yScale.valueToY(last!.value);
    expect(getYLabelTop(mounted)).toBeCloseTo(expected, 1);
  });

  it('in overlay mode the badge top equals chart.yScale.valueToY(lastValue)', () => {
    mounted = mountChart(tree, { width: 400, height: 240, headerLayout: 'overlay' });

    const last = mounted.chart.getLastValue(seriesId);
    expect(last).not.toBeNull();

    const expected = mounted.chart.yScale.valueToY(last!.value);
    expect(getYLabelTop(mounted)).toBeCloseTo(expected, 1);
  });

  it('overlay pushes the badge down by the measured header offset — inline does not', () => {
    // In overlay mode padding.top folds in the measured header height, so the
    // same data value maps to a y below the header strip. In inline mode the
    // canvas itself is shifted down by flex layout, so valueToY on the
    // (shorter) canvas reports a smaller y — the header's offset is absorbed
    // by the parent wrapper instead.
    const inlineMount = mountChart(tree, { width: 400, height: 240, headerLayout: 'inline' });
    const inlineTop = getYLabelTop(inlineMount);
    inlineMount.unmount();

    const overlayMount = mountChart(tree, { width: 400, height: 240, headerLayout: 'overlay' });
    const overlayTop = getYLabelTop(overlayMount);
    overlayMount.unmount();

    expect(overlayTop).toBeGreaterThan(inlineTop);
  });

  it('switching overlay → inline at runtime re-reads yScale so the badge tracks the new padding', () => {
    // Regression: `useLastYValue` used to compare pre/post pixel-Y against the
    // *same* (already-updated) yScale, so padding-driven viewport changes
    // never bubbled up and the badge sat at its old overlay-mode y.
    mounted = mountChart(tree, { width: 400, height: 240, headerLayout: 'overlay' });
    const beforeTop = getYLabelTop(mounted);

    mounted.rerender(tree, { headerLayout: 'inline' });

    const afterTop = getYLabelTop(mounted);
    const last = mounted.chart.getLastValue(seriesId);
    const expected = mounted.chart.yScale.valueToY(last!.value);

    expect(afterTop).toBeCloseTo(expected, 1);
    // The overlay position folded in the measured header height, so the
    // inline position must be strictly smaller.
    expect(afterTop).toBeLessThan(beforeTop);
  });

  it('switching inline → overlay at runtime re-reads yScale so the badge tracks the new padding', () => {
    mounted = mountChart(tree, { width: 400, height: 240, headerLayout: 'inline' });
    const beforeTop = getYLabelTop(mounted);

    mounted.rerender(tree, { headerLayout: 'overlay' });

    const afterTop = getYLabelTop(mounted);
    const last = mounted.chart.getLastValue(seriesId);
    const expected = mounted.chart.yScale.valueToY(last!.value);

    expect(afterTop).toBeCloseTo(expected, 1);
    expect(afterTop).toBeGreaterThan(beforeTop);
  });

  it('after toggling, the badge top matches a fresh mount in the same mode (no stale offset carried over)', () => {
    // Direct regression test for "lastY label is positioned incorrectly after
    // toggling header layout — the offset is not accounted for". A toggled
    // chart should be indistinguishable from one mounted in the target mode
    // from the start; any divergence means stale state leaked across the
    // layout switch.
    const toggled = mountChart(tree, { width: 400, height: 240, headerLayout: 'overlay' });
    toggled.rerender(tree, { headerLayout: 'inline' });
    const toggledTop = getYLabelTop(toggled);
    toggled.unmount();

    const fresh = mountChart(tree, { width: 400, height: 240, headerLayout: 'inline' });
    const freshTop = getYLabelTop(fresh);
    fresh.unmount();

    expect(toggledTop).toBeCloseTo(freshTop, 1);
  });
});

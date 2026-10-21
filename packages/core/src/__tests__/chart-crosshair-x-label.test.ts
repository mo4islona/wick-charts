// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import type { ChartOptions } from '../chart/options';
import { buildHoverSnapshots, formatTooltipHeader } from '../snapshots';
import type { CrosshairPosition, TimePointInput, XPointInput } from '../types';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const MINUTE = 60_000;
const DAY = 86_400_000;

describe('crosshair X label', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;
  let seriesId: string;

  beforeEach(() => {
    raf = installRaf();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    chart?.destroy();
    container?.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  function makeChart(args: { options: ChartOptions; type: 'line' | 'bar'; points: TimePointInput[] | XPointInput[] }) {
    container = makeChartContainer();
    chart = new ChartInstance(container, { animations: false, ...args.options });
    seriesId = args.type === 'line' ? chart.addSeries('line') : chart.addSeries('bar');
    chart.setSeriesData(seriesId, args.points);
    raf.flush();
  }

  function hover(time: number): CrosshairPosition {
    chart.setCrosshair({ time });
    const pos = chart.getCrosshairPosition();
    if (pos === null) throw new Error('no crosshair');

    return pos;
  }

  function tooltipHeader(time: number): string {
    const snapshots = buildHoverSnapshots(chart, { time, cacheKey: 'test-tooltip' });

    return formatTooltipHeader(chart, { time, snapshots, interval: chart.getDataInterval() });
  }

  it('names the daily point the tooltip snaps to, not the day under the pointer', () => {
    const start = Date.UTC(2026, 8, 1);
    const points = Array.from({ length: 30 }, (_, i) => ({ time: start + i * DAY, value: i }));
    makeChart({ options: { timeZone: 'UTC' }, type: 'line', points });

    // Sep 19, 18:00 is nearer to the Sep 20 point.
    const time = Date.UTC(2026, 8, 19, 18);
    const label = chart.getCrosshairXLabel(hover(time)).text;

    expect(label).toBe('Sep 20');
    expect(tooltipHeader(time)).toBe('Sep 20, 2026');
  });

  it('names the minute point the tooltip snaps to, not the pointer second', () => {
    const start = Date.UTC(2026, 9, 21, 2, 50);
    const points = Array.from({ length: 20 }, (_, i) => ({ time: start + i * MINUTE, value: i }));
    makeChart({ options: { timeZone: 'UTC' }, type: 'line', points });

    const time = Date.UTC(2026, 9, 21, 2, 58, 26);
    const label = chart.getCrosshairXLabel(hover(time)).text;

    expect(label).toBe('02:58');
    expect(tooltipHeader(time)).toBe('Oct 21, 2026 02:58');
  });

  it('keeps the seconds of 5-second data under minute ticks', () => {
    const start = Date.UTC(2026, 9, 21, 2, 50);
    const points = Array.from({ length: 120 }, (_, i) => ({ time: start + i * 5_000, value: i }));
    makeChart({ options: { timeZone: 'UTC' }, type: 'line', points });

    const time = Date.UTC(2026, 9, 21, 2, 55, 6);

    expect(chart.timeScale.niceTickValues(chart.getDataInterval()).tickInterval).toBeGreaterThanOrEqual(MINUTE);
    expect(chart.getCrosshairXLabel(hover(time)).text).toBe('02:55:05');
  });

  it('prints a numeric X with the digits of the point, not of the tick step', () => {
    const points = [4.5, 4.52, 4.56, 4.6, 4.7].map((x, i) => ({ x: x * 1e-6, value: i }));
    makeChart({ options: { axis: { x: { type: 'numeric' } } }, type: 'line', points });

    expect(chart.getCrosshairXLabel(hover(4.57e-6)).text).toBe('0.00000456');
  });

  it('prints large numeric X values with their decimals', () => {
    const points = [82_950, 82_953.64, 82_960, 82_990].map((x, i) => ({ x, value: i }));
    makeChart({ options: { axis: { x: { type: 'numeric' } } }, type: 'line', points });

    expect(chart.getCrosshairXLabel(hover(82_953)).text).toBe('82,953.64');
  });

  it('prints the pointer to one pixel of precision when no point is shown', () => {
    const points = [4.5, 4.6, 4.7].map((x, i) => ({ x: x * 1e-6, value: i }));
    makeChart({ options: { axis: { x: { type: 'numeric' } } }, type: 'line', points });
    chart.setSeriesVisible(seriesId, false);
    raf.flush();

    const label = chart.getCrosshairXLabel(hover(4.563_219e-6)).text;

    // A pixel spans under 1e-9 here; the tick step would round to 0.00000456.
    expect(Number(label)).toBeCloseTo(4.563_219e-6, 9);
  });

  it('keeps a long category name inside the chart at the first band', () => {
    const points = ['Hydro pumped storage consumption', 'Wind', 'Solar'].map((x, i) => ({ x, value: i + 1 }));
    makeChart({ options: { axis: { x: { type: 'category' } } }, type: 'bar', points });

    const pos = hover(0);
    const label = chart.getCrosshairXLabel(pos);
    const width = chart.getMediaSize().width;

    expect(label.text).toBe('Hydro pumped storage consumption');
    expect(label.left).toBe(pos.mediaX);
    // Centred on the pointer, but never left of 0 or right of the chart's width.
    expect(label.transform).toBe(`translate(clamp(${-pos.mediaX}px, -50%, calc(${width - pos.mediaX}px - 100%)), 50%)`);
  });
});

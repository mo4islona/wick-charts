// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import { buildHoverSnapshots } from '../snapshots';
import type { CanvasRecorder } from '../testing/recording-context';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const HOT = '#f0556a';
const CALM = '#26a69a';
const UP = '#00ff00';
const DOWN = '#ff0000';
const MINUTE = 60_000;

describe('hover colour of a point', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  beforeEach(() => {
    raf = installRaf();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    container = makeChartContainer();
    chart = new ChartInstance(container, { animations: false });
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  function overlaySpy(): CanvasRecorder {
    const canvases = container.querySelectorAll('canvas');
    const spy = canvases[canvases.length - 1]?.__spy;
    if (!spy) throw new Error('recording canvas not installed');

    return spy;
  }

  /** Values 50 → 90 → 50: the middle points rise above a threshold at 70. */
  const values = [50, 60, 90, 80, 60, 50];

  function thresholdLine(layers: 1 | 2): string {
    const threshold = { value: 70, above: HOT, below: CALM };
    const id = chart.addSeries('line', { layers, threshold });
    for (let layer = 0; layer < layers; layer++) {
      chart.setSeriesData(
        id,
        values.map((value, i) => ({ time: i * MINUTE, value: value + layer })),
        layer,
      );
    }
    raf.flush();

    return id;
  }

  it('paints the hover dot of a threshold line in the colour of its side', () => {
    thresholdLine(1);
    const spy = overlaySpy();

    const dotColor = (time: number) => {
      spy.reset();
      chart.setCrosshair({ time, y: 70 });
      raf.flush();

      return spy.callsOf('fill').at(-1)?.fillStyle;
    };

    expect(dotColor(2 * MINUTE)).toBe(HOT);
    expect(dotColor(5 * MINUTE)).toBe(CALM);
  });

  it('lists each layer of a threshold line in the colour of its side', () => {
    const id = thresholdLine(2);

    const colors = (time: number) =>
      buildHoverSnapshots(chart, { time, cacheKey: 'test' })
        .filter((row) => row.seriesId === id)
        .map((row) => row.color);

    expect(colors(2 * MINUTE)).toEqual([HOT, HOT]);
    expect(colors(0)).toEqual([CALM, CALM]);
  });

  it('lists a single-layer threshold line in the colour of its side', () => {
    const id = thresholdLine(1);

    const color = (time: number) =>
      buildHoverSnapshots(chart, { time, cacheKey: 'test' }).find((row) => row.seriesId === id)?.color;

    expect(color(2 * MINUTE)).toBe(HOT);
    expect(color(0)).toBe(CALM);
  });

  it('paints a value-fn line in the colour of its last value, as its stroke', () => {
    const id = chart.addSeries('line');
    chart.setLayerColors(id, [(value: number) => (value >= 0 ? UP : DOWN)]);
    chart.setSeriesData(id, [
      { time: 0, value: -5 },
      { time: MINUTE, value: 3 },
    ]);
    raf.flush();
    const spy = overlaySpy();

    spy.reset();
    chart.setCrosshair({ time: 0, y: -5 });
    raf.flush();

    expect(buildHoverSnapshots(chart, { time: 0, cacheKey: 'test' })[0]?.color).toBe(UP);
    expect(spy.callsOf('fill').at(-1)?.fillStyle).toBe(UP);
  });

  it('lists a single-layer sign-coloured bar series in the colour of the hovered bar', () => {
    const id = chart.addSeries('bar');
    chart.setLayerColors(id, [(value: number) => (value >= 0 ? UP : DOWN)]);
    chart.setSeriesData(id, [
      { time: 0, value: -5 },
      { time: MINUTE, value: 3 },
      { time: 2 * MINUTE, value: 4 },
    ]);
    raf.flush();

    // The last bar is positive, so a last-value colour would read UP for the first one.
    expect(buildHoverSnapshots(chart, { time: 0, cacheKey: 'test' })[0]?.color).toBe(DOWN);
    expect(buildHoverSnapshots(chart, { time: MINUTE, cacheKey: 'test' })[0]?.color).toBe(UP);
  });

  it('lists sign-coloured bar layers in the colour of the hovered bar', () => {
    const sign = (value: number) => (value >= 0 ? UP : DOWN);
    const id = chart.addSeries('bar', { layers: 2 });
    chart.setLayerColors(id, [sign, sign]);
    for (let layer = 0; layer < 2; layer++) {
      chart.setSeriesData(
        id,
        [
          { time: 0, value: -5 },
          { time: MINUTE, value: 3 },
          { time: 2 * MINUTE, value: 4 },
        ],
        layer,
      );
    }
    raf.flush();

    const rows = buildHoverSnapshots(chart, { time: 0, cacheKey: 'test' });

    expect(rows.map((row) => row.color)).toEqual([DOWN, DOWN]);
  });
});

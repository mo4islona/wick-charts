// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountAxisLabels } from '../axis/dom-labels';
import { ChartInstance, type PointClickInfo } from '../chart';
import type { ChartOptions } from '../chart/options';
import { EMPTY_SYNC_STATE, syncSeriesLayer } from '../data/sync';
import type { SeriesDefinition } from '../series/definition';
import { LineSeriesDef } from '../series/line';
import { buildHoverSnapshots, formatHeaderX } from '../snapshots';
import type { CanvasRecorder } from '../testing/recording-context';
import { catppuccin } from '../theme/themes/catppuccin';
import type { CrosshairPosition, XPointInput } from '../types';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const LINE_COLOR = '#00ff00';
const BAR_COLOR = '#ff0000';
const CONCURRENCY = [1, 2, 4, 8, 16, 32, 48, 64];

function curve(): XPointInput[] {
  return CONCURRENCY.map((x) => ({ x, value: Math.log2(x) + 1 }));
}

/** The overlay canvas owns the pointer listeners. */
function pointerAt(args: { container: HTMLElement; type: string; offsetX: number; offsetY?: number }): void {
  const canvases = args.container.querySelectorAll('canvas');
  const overlay = canvases[canvases.length - 1];
  const event =
    args.type === 'wheel'
      ? new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -300 })
      : new MouseEvent(args.type, { bubbles: true, clientX: args.offsetX, clientY: args.offsetY ?? 100 });
  Object.defineProperty(event, 'offsetX', { value: args.offsetX });
  Object.defineProperty(event, 'offsetY', { value: args.offsetY ?? 100 });
  overlay.dispatchEvent(event);
}

describe('ChartInstance X axis types', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;
  let spy: CanvasRecorder;
  let warn: ReturnType<typeof vi.spyOn>;

  function makeChart(options: ChartOptions): ChartInstance {
    container = makeChartContainer();
    chart = new ChartInstance(container, { animations: false, ...options });
    const recorder = container.querySelector('canvas')?.__spy;
    if (!recorder) throw new Error('recording canvas not installed');
    spy = recorder;

    return chart;
  }

  /** Bitmap X of every vertex in the paths stroked in {@link LINE_COLOR}. */
  function lineVertices(): number[] {
    const vertices: number[] = [];
    let path: number[] = [];
    for (const call of spy.calls) {
      if (call.method === 'beginPath') path = [];
      if (call.method === 'moveTo' || call.method === 'lineTo') path.push(Number(call.args[0]));
      if (call.method === 'stroke' && call.strokeStyle === LINE_COLOR) vertices.push(...path);
    }

    return vertices;
  }

  /** `[x, width]` of every bar painted in {@link BAR_COLOR}. */
  function bars(): Array<[number, number]> {
    return spy
      .callsOf('fillRect')
      .filter((call) => call.fillStyle === BAR_COLOR)
      .map((call) => [Number(call.args[0]), Number(call.args[2])]);
  }

  /** Bitmap X of every vertical gridline — the ones starting at the top edge. */
  function verticalGridlines(): number[] {
    return spy
      .callsOf('moveTo')
      .filter((call) => call.args[1] === 0 && call.strokeStyle === catppuccin.theme.grid.color)
      .map((call) => Number(call.args[0]));
  }

  beforeEach(() => {
    raf = installRaf();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    chart?.destroy();
    container?.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  describe('numeric', () => {
    function lineChart(options: ChartOptions = {}): string {
      makeChart({ axis: { x: { type: 'numeric' } }, padding: { right: 0 }, ...options });
      const id = chart.addSeries('line', { area: { visible: false } });
      chart.setLayerColors(id, [LINE_COLOR]);
      chart.setSeriesData(id, curve());
      raf.flush(5);

      return id;
    }

    it('draws an irregularly spaced line at its x positions', () => {
      lineChart();
      spy.reset();
      chart.fitContent();
      raf.flush(5);

      const expected = CONCURRENCY.map((x) => chart.timeScale.timeToBitmapX(x));
      for (const x of expected) {
        expect(lineVertices().some((vertex) => Math.abs(vertex - x) <= 1)).toBe(true);
      }
      expect(verticalGridlines().length).toBeGreaterThan(0);
    });

    it('fits the range to the data and sizes slots by the median spacing', () => {
      lineChart();

      expect(chart.getVisibleRange()).toEqual({ from: 1, to: 64 });
      // Spacings 1, 2, 4, 8, 16, 16, 16 — the median is 8.
      expect(chart.getDataInterval()).toBe(8);
    });

    it('snaps the crosshair and tooltip to the nearest point anywhere in the range', () => {
      const id = lineChart();

      expect(chart.getDataAtTime(id, 20)).toMatchObject({ x: 16 });
      expect(chart.getDataAtTime(id, 39)).toMatchObject({ x: 32 });
      expect(chart.getDataAtTime(id, 41)).toMatchObject({ x: 48 });
      expect(chart.getDataAtTime(id, 60)).toMatchObject({ x: 64 });
      expect(chart.getDataAtTime(id, 60)).toMatchObject({ x: 64, value: 7 });
    });

    it('reports the number as `x` in crosshair and pointClick payloads', () => {
      lineChart();
      const moves: (CrosshairPosition | null)[] = [];
      const clicks: PointClickInfo[] = [];
      chart.on('crosshairMove', (pos) => moves.push(pos));
      chart.on('pointClick', (info) => clicks.push(info));

      const offsetX = chart.timeScale.timeToX(16);
      pointerAt({ container, type: 'mousemove', offsetX });
      pointerAt({ container, type: 'click', offsetX });

      expect(moves.at(-1)?.x).toBeCloseTo(16);
      expect(clicks[0]?.x).toBeCloseTo(16);
      expect(clicks[0]?.time).toBeCloseTo(16);
    });

    it('skips a string x and warns once for the series', () => {
      makeChart({ axis: { x: { type: 'numeric' } } });
      const id = chart.addSeries('line');
      chart.setSeriesData(id, [
        { x: 1, value: 1 },
        { x: 'two', value: 2 },
        { x: 'three', value: 3 },
        { x: 4, value: 4 },
      ]);

      expect(chart.getDataRange()).toEqual({ from: 1, to: 4 });
      expect(chart.getDataAtTime(id, 2)).toMatchObject({ x: 1 });
      const misfits = warn.mock.calls.filter(([message]) => String(message).includes("doesn't fit"));
      expect(misfits).toHaveLength(1);
      expect(String(misfits[0][0])).toContain("'numeric'");
    });

    it('finds the nearest point across a gap wider than the median spacing', () => {
      makeChart({ axis: { x: { type: 'numeric' } } });
      const id = chart.addSeries('line');
      chart.setSeriesData(
        id,
        [1, 2, 3, 4, 100].map((x) => ({ x, value: x })),
      );
      raf.flush(5);

      expect(chart.getDataAtTime(id, 50)).toMatchObject({ x: 4 });
      expect(chart.getDataAtTime(id, 60)).toMatchObject({ x: 100 });

      pointerAt({ container, type: 'mousemove', offsetX: chart.plotLeft + chart.timeScale.timeToX(50) });
      const time = chart.getCrosshairPosition()?.time ?? Number.NaN;
      expect(buildHoverSnapshots(chart, { time, cacheKey: 'gap' })[0]?.data).toMatchObject({ x: 4 });
    });

    it("heads the tooltip with the point's own x, ticks with the step's decimals", () => {
      makeChart({ axis: { x: { type: 'numeric' } } });
      const id = chart.addSeries('line');
      chart.setSeriesData(
        id,
        [0.5, 1.5, 2.5].map((x) => ({ x, value: x })),
      );
      raf.flush(5);
      const interval = chart.getDataInterval();
      const snapshots = buildHoverSnapshots(chart, { time: 1.37, cacheKey: 'header' });

      expect(interval).toBe(1);
      expect(formatHeaderX(chart, { time: 1.37, snapshots, interval })).toBe('1.5');
      expect(chart.timeScale.formatX(1.37, interval)).toBe('1');
    });

    it('breaks a header tie toward the later point in either sort order', () => {
      makeChart({ axis: { x: { type: 'numeric' } } });
      chart.setSeriesData(chart.addSeries('line'), [{ x: 0, value: 1 }]);
      chart.setSeriesData(chart.addSeries('line'), [{ x: 10, value: 2 }]);
      const interval = chart.getDataInterval();

      for (const sort of ['asc', 'desc'] as const) {
        const snapshots = buildHoverSnapshots(chart, { time: 5, sort, cacheKey: sort });
        expect(formatHeaderX(chart, { time: 5, snapshots, interval })).toBe('10');
      }
    });

    it('warns when one series mixes x and time', () => {
      makeChart({ axis: { x: { type: 'numeric' } } });
      const id = chart.addSeries('line');
      chart.setSeriesData(id, [{ x: 1, value: 1 }]);
      chart.appendData(id, { time: 2, value: 2 });

      expect(warn.mock.calls.some(([message]) => String(message).includes('mixes `x` and `time`'))).toBe(true);
    });
  });

  describe('category', () => {
    const REGIONS = ['EU', 'Asia', 'Amer.', 'Africa', 'Oce.'];

    function barChart(options: ChartOptions = {}): string {
      makeChart({ axis: { x: { type: 'category', padding: { inner: 0.3, outer: 0.2 } } }, ...options });
      const id = chart.addSeries('bar', { cornerRadius: 0 });
      chart.setLayerColors(id, [BAR_COLOR]);
      chart.setSeriesData(
        id,
        REGIONS.map((x, i) => ({ x, value: 50 - i * 10 })),
      );
      raf.flush(5);

      return id;
    }

    it('fits every band and fills each band with its bar', () => {
      barChart();
      spy.reset();
      chart.fitContent();
      raf.flush(5);

      expect(chart.timeScale.getCategories()).toEqual(REGIONS);
      expect(chart.getVisibleRange()).toEqual({ from: -0.55, to: 4.55 });

      const bandWidth = chart.timeScale.bandWidthBitmap();
      const drawn = bars();
      expect(drawn).toHaveLength(REGIONS.length);
      for (const [i, [x, width]] of drawn.entries()) {
        expect(width).toBe(bandWidth);
        expect(Math.abs(x + width / 2 - chart.timeScale.timeToBitmapX(i))).toBeLessThanOrEqual(1);
      }
    });

    it('draws no vertical gridlines through the bands', () => {
      barChart();
      spy.reset();
      chart.fitContent();
      raf.flush(5);

      expect(verticalGridlines()).toEqual([]);
    });

    it('labels one tick per band and truncates a name wider than its step', () => {
      makeChart({ axis: { x: { type: 'category' } } });
      const id = chart.addSeries('bar');
      chart.setSeriesData(id, [
        { x: 'EU', value: 1 },
        { x: 'Australia and Oceania', value: 2 },
      ]);
      raf.flush(5);

      const strip = document.createElement('div');
      container.appendChild(strip);
      const unmount = mountAxisLabels({ chart, container: strip, axis: 'x' });
      const spans = [...strip.querySelectorAll('span')];
      const step = chart.timeScale.barWidthMedia(1);

      expect(spans.map((span) => span.textContent)).toEqual(['EU', 'Australia and Oceania']);
      for (const span of spans) {
        expect(span.style.maxWidth).toBe(`${step}px`);
        expect(span.style.textOverflow).toBe('ellipsis');
        expect(span.style.overflow).toBe('hidden');
      }

      unmount();
    });

    it('re-maps a series when a category disappears', () => {
      makeChart({ axis: { x: { type: 'category' } } });
      const first = chart.addSeries('bar');
      const second = chart.addSeries('bar');
      chart.setSeriesData(first, [
        { x: 'EU', value: 1 },
        { x: 'Asia', value: 2 },
        { x: 'US', value: 3 },
      ]);
      chart.setSeriesData(second, [
        { x: 'Asia', value: 20 },
        { x: 'US', value: 30 },
      ]);

      chart.setSeriesData(first, [
        { x: 'Asia', value: 2 },
        { x: 'US', value: 3 },
      ]);

      expect(chart.timeScale.getCategories()).toEqual(['Asia', 'US']);
      expect(chart.getDataAtTime(second, 0)).toMatchObject({ x: 'Asia', value: 20 });
      expect(chart.getDataAtTime(second, 1)).toMatchObject({ x: 'US', value: 30 });
      expect(chart.getVisibleRange()).toEqual(chart.timeScale.bandRange());
    });

    it('re-maps every series when the order changes', () => {
      makeChart({ axis: { x: { type: 'category' } } });
      const first = chart.addSeries('bar');
      const second = chart.addSeries('line');
      chart.setSeriesData(first, [
        { x: 'EU', value: 1 },
        { x: 'Asia', value: 2 },
      ]);
      chart.setSeriesData(second, [
        { x: 'EU', value: 10 },
        { x: 'Asia', value: 20 },
      ]);

      chart.setSeriesData(first, [
        { x: 'Asia', value: 2 },
        { x: 'EU', value: 1 },
      ]);

      expect(chart.timeScale.getCategories()).toEqual(['Asia', 'EU']);
      expect(chart.getDataAtTime(first, 0)).toMatchObject({ x: 'Asia', value: 2 });
      expect(chart.getDataAtTime(second, 0)).toMatchObject({ x: 'Asia', value: 20 });
      expect(chart.getDataAtTime(second, 1)).toMatchObject({ x: 'EU', value: 10 });
    });

    it('drops a category when the only series holding it is removed', () => {
      makeChart({ axis: { x: { type: 'category' } } });
      const first = chart.addSeries('bar');
      const second = chart.addSeries('bar');
      chart.setSeriesData(first, [{ x: 'EU', value: 1 }]);
      chart.setSeriesData(second, [
        { x: 'Asia', value: 2 },
        { x: 'EU', value: 3 },
      ]);

      chart.removeSeries(first);

      expect(chart.timeScale.getCategories()).toEqual(['Asia', 'EU']);
      expect(chart.getDataAtTime(second, 0)).toMatchObject({ x: 'Asia', value: 2 });
    });

    it('refits the bands when the last category goes', () => {
      makeChart({ axis: { x: { type: 'category' } } });
      const first = chart.addSeries('bar');
      const second = chart.addSeries('bar');
      chart.setSeriesData(first, [
        { x: 'EU', value: 1 },
        { x: 'Asia', value: 2 },
      ]);
      chart.setSeriesData(second, [{ x: 'Oceania', value: 3 }]);

      chart.removeSeries(second);

      expect(chart.timeScale.getCategories()).toEqual(['EU', 'Asia']);
      expect(chart.getVisibleRange()).toEqual(chart.timeScale.bandRange());
    });

    describe('streaming onto a series whose order differs from the bands', () => {
      function twoSeries(): { second: string } {
        makeChart({ axis: { x: { type: 'category' } } });
        const first = chart.addSeries('bar');
        const second = chart.addSeries('bar');
        chart.setSeriesData(first, [
          { x: 'A', value: 1 },
          { x: 'B', value: 2 },
          { x: 'C', value: 3 },
        ]);

        return { second };
      }

      it('updates the last input point without touching the others', () => {
        const { second } = twoSeries();
        const data = [
          { x: 'B', value: 20 },
          { x: 'A', value: 10 },
        ];
        const synced = syncSeriesLayer({ chart, id: second, data, prev: EMPTY_SYNC_STATE });

        syncSeriesLayer({ chart, id: second, data: [data[0], { x: 'A', value: 11 }], prev: synced });

        expect(chart.getDataAtTime(second, 0)).toMatchObject({ x: 'A', value: 11 });
        expect(chart.getDataAtTime(second, 1)).toMatchObject({ x: 'B', value: 20 });
      });

      it('appends a lower band without overwriting the last point', () => {
        const { second } = twoSeries();
        chart.setSeriesData(second, [{ x: 'B', value: 20 }]);

        chart.appendData(second, { x: 'A', value: 10 });

        expect(chart.getDataAtTime(second, 0)).toMatchObject({ x: 'A', value: 10 });
        expect(chart.getDataAtTime(second, 1)).toMatchObject({ x: 'B', value: 20 });
      });

      it('prepends a higher band and keeps the store in band order', () => {
        const { second } = twoSeries();
        chart.setSeriesData(second, [{ x: 'A', value: 10 }]);

        chart.prependData(second, [{ x: 'C', value: 30 }]);

        expect(chart.timeScale.getCategories()).toEqual(['A', 'B', 'C']);
        expect(chart.getDataAtTime(second, 0)).toMatchObject({ x: 'A', value: 10 });
        expect(chart.getLastData(second)).toMatchObject({ x: 'C', value: 30 });
      });
    });

    describe('a replace that keeps the bands', () => {
      /** The value each bar painted in {@link BAR_COLOR} reaches, read back through the Y scale. */
      function barValues(): number[] {
        return spy
          .callsOf('fillRect')
          .filter((call) => call.fillStyle === BAR_COLOR)
          .map((call) => {
            const y = Number(call.args[1]);
            const height = Number(call.args[3]);

            return chart.yScale.yToValue(Math.min(y, y + height));
          });
      }

      function liveBars(): string {
        makeChart({ animations: true, axis: { x: { type: 'category' } } });
        const id = chart.addSeries('bar', { cornerRadius: 0 });
        chart.setLayerColors(id, [BAR_COLOR]);
        chart.setSeriesData(id, [
          { x: 'A', value: 10 },
          { x: 'B', value: 20 },
          { x: 'C', value: 30 },
        ]);
        raf.flush(200);

        return id;
      }

      it('eases a middle bar to its new value, and the Y range with it', () => {
        const id = liveBars();

        chart.setSeriesData(id, [
          { x: 'A', value: 10 },
          { x: 'B', value: 40 },
          { x: 'C', value: 30 },
        ]);
        expect(chart.yScale.getRange().max).toBeLessThan(40);

        spy.reset();
        raf.flush(2);
        const middle = barValues().slice(-3)[1];
        expect(middle).toBeGreaterThan(21);
        expect(middle).toBeLessThan(39);

        spy.reset();
        raf.flush(200);
        const settled = barValues().slice(-3);
        expect(settled[1]).toBeCloseTo(40, 0);
        expect(chart.yScale.getRange().max).toBeGreaterThan(40);
      });

      it('re-seeds without easing when a category moves band', () => {
        const id = liveBars();

        chart.setSeriesData(id, [
          { x: 'B', value: 20 },
          { x: 'A', value: 40 },
          { x: 'C', value: 30 },
        ]);
        spy.reset();
        raf.flush(1);

        expect(chart.timeScale.getCategories()).toEqual(['B', 'A', 'C']);
        const drawn = barValues().slice(-3);
        expect(drawn[1]).toBeCloseTo(40, 0);
      });
    });

    it('labels every category past fifty', () => {
      makeChart({ axis: { x: { type: 'category' } } });
      const id = chart.addSeries('bar');
      chart.setSeriesData(
        id,
        Array.from({ length: 60 }, (_, i) => ({ x: `c${i}`, value: i })),
      );
      raf.flush(5);

      expect(chart.timeScale.niceTickValues(1).ticks).toHaveLength(60);
    });

    it('renames a still crosshair when the categories reorder', () => {
      const id = barChart();
      pointerAt({ container, type: 'mousemove', offsetX: chart.timeScale.timeToX(0) });
      expect(chart.getCrosshairPosition()).toMatchObject({ time: 0, x: 'EU' });

      chart.setSeriesData(
        id,
        [...REGIONS].reverse().map((x, i) => ({ x, value: i })),
      );
      raf.flush(5);

      expect(chart.getCrosshairPosition()).toMatchObject({ time: 0, x: 'Oce.' });
    });

    it('adds a new category at the end on append', () => {
      const id = barChart();
      chart.appendData(id, { x: 'Antarctica', value: 1 });

      expect(chart.timeScale.getCategories()).toEqual([...REGIONS, 'Antarctica']);
      expect(chart.getDataAtTime(id, 5)).toMatchObject({ x: 'Antarctica', value: 1 });
    });

    it('finds only the point in the hovered band', () => {
      makeChart({ axis: { x: { type: 'category' } } });
      const full = chart.addSeries('bar');
      const sparse = chart.addSeries('bar');
      chart.setSeriesData(full, [
        { x: 'EU', value: 1 },
        { x: 'Asia', value: 2 },
      ]);
      chart.setSeriesData(sparse, [{ x: 'Asia', value: 5 }]);

      expect(chart.getDataAtTime(sparse, 0)).toBeNull();
      expect(chart.getDataAtTime(sparse, 1)).toMatchObject({ x: 'Asia' });
    });

    for (const type of ['line', 'bar'] as const) {
      it(`gives a sparse ${type} layer no row in a band it lacks`, () => {
        makeChart({ axis: { x: { type: 'category' } } });
        const id = type === 'line' ? chart.addSeries('line', { layers: 2 }) : chart.addSeries('bar', { layers: 2 });
        chart.setSeriesData(id, [{ x: 'A', value: 10 }], 0);
        chart.setSeriesData(id, [{ x: 'B', value: 20 }], 1);

        expect(chart.getLayerSnapshots(id, 0)).toEqual([expect.objectContaining({ layerIndex: 0, x: 'A', value: 10 })]);
        expect(chart.getLayerSnapshots(id, 1)).toEqual([expect.objectContaining({ layerIndex: 1, x: 'B', value: 20 })]);
      });
    }

    it('reports the category name as `x` in crosshair and pointClick payloads', () => {
      barChart();
      const moves: (CrosshairPosition | null)[] = [];
      const clicks: PointClickInfo[] = [];
      chart.on('crosshairMove', (pos) => moves.push(pos));
      chart.on('pointClick', (info) => clicks.push(info));

      const offsetX = chart.timeScale.timeToX(1.3);
      pointerAt({ container, type: 'mousemove', offsetX });
      pointerAt({ container, type: 'click', offsetX });

      expect(moves.at(-1)).toMatchObject({ time: 1, x: 'Asia' });
      expect(clicks[0]).toMatchObject({ time: 1, x: 'Asia' });
      expect(chart.timeScale.formatX(1, 1)).toBe('Asia');
    });

    it('skips a point whose x is not a string and warns once', () => {
      makeChart({ axis: { x: { type: 'category' } } });
      const id = chart.addSeries('bar');
      chart.setSeriesData(id, [{ x: 'EU', value: 1 }, { x: 2, value: 2 }, { time: 3, value: 3 } as never]);

      expect(chart.timeScale.getCategories()).toEqual(['EU']);
      const misfits = warn.mock.calls.filter(([message]) => String(message).includes("doesn't fit"));
      expect(misfits).toHaveLength(1);
      expect(String(misfits[0][0])).toContain("'category'");
    });
  });

  describe('series support', () => {
    it('throws for a candlestick on a numeric axis, naming both types', () => {
      makeChart({ axis: { x: { type: 'numeric' } } });

      expect(() => chart.addSeries('candlestick')).toThrow(/'candlestick'.*'numeric'.*'time'/);
    });

    it('throws for a custom series without xTypes on a category axis', () => {
      makeChart({ axis: { x: { type: 'category' } } });
      const custom: SeriesDefinition = { type: 'scatter', create: LineSeriesDef.create as SeriesDefinition['create'] };

      expect(() => chart.addSeries(custom)).toThrow(/'scatter'.*'category'.*'time'/);
      expect(chart.getSeriesIds()).toEqual([]);
    });

    it('accepts a custom series that lists the axis type, and pie on any axis', () => {
      makeChart({ axis: { x: { type: 'category' } } });
      const custom: SeriesDefinition = {
        type: 'scatter',
        xTypes: ['numeric', 'category'],
        create: LineSeriesDef.create as SeriesDefinition['create'],
      };

      expect(() => chart.addSeries(custom)).not.toThrow();
      expect(() => chart.addSeries('pie')).not.toThrow();
    });
  });

  describe('time-only features', () => {
    it('disables TimeRegion and edge loading with one warning each', () => {
      const onEdgeReached = vi.fn();
      makeChart({ axis: { x: { type: 'numeric' } }, onEdgeReached });
      const id = chart.addSeries('line');
      chart.setSeriesData(id, curve());

      chart.addRegion({ from: 2, to: 8 });
      chart.addRegion({ from: 16, to: 32 });
      chart.setEdgeState('left', 'loading');
      chart.setEdgeState('right', 'loading');
      chart.pan(-1000);

      expect(chart.getRegions()).toEqual([]);
      expect(chart.getEdgeState('left')).toBe('idle');
      expect(onEdgeReached).not.toHaveBeenCalled();

      const messages = warn.mock.calls.map(([message]) => String(message));
      for (const feature of ['TimeRegion', 'EdgeLoader', 'onEdgeReached']) {
        expect(messages.filter((message) => message.startsWith(`[wick-charts] ${feature} works`))).toHaveLength(1);
      }
    });

    it('lets Navigator check the axis', () => {
      makeChart({ axis: { x: { type: 'category' } } });

      expect(chart.checkTimeOnlyFeature('Navigator')).toBe(false);
      expect(chart.checkTimeOnlyFeature('Navigator')).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('panZoom', () => {
    it('keeps the range on wheel and drag when off, with the crosshair still live', () => {
      makeChart({ axis: { x: { type: 'numeric', panZoom: false } } });
      const id = chart.addSeries('line');
      chart.setSeriesData(id, curve());
      raf.flush(5);
      const before = chart.getVisibleRange();
      const moves = vi.fn();
      chart.on('crosshairMove', moves);

      pointerAt({ container, type: 'wheel', offsetX: 300 });
      pointerAt({ container, type: 'mousedown', offsetX: 300 });
      pointerAt({ container, type: 'mousemove', offsetX: 100 });
      pointerAt({ container, type: 'mouseup', offsetX: 100 });

      expect(chart.getVisibleRange()).toEqual(before);
      expect(moves).toHaveBeenCalled();
    });

    it('defaults to off on a category axis and turns on live', () => {
      makeChart({ axis: { x: { type: 'category' } } });
      const id = chart.addSeries('bar');
      chart.setSeriesData(id, [
        { x: 'EU', value: 1 },
        { x: 'Asia', value: 2 },
      ]);

      expect(chart.canPanZoom()).toBe(false);

      chart.setAxis({ x: { type: 'category', panZoom: true } });
      expect(chart.canPanZoom()).toBe(true);
    });
  });

  describe('axis.x.type', () => {
    it("draws a time chart the same with and without type: 'time'", () => {
      const data = Array.from({ length: 30 }, (_, i) => ({ time: i * 60_000, value: 100 + Math.sin(i) * 5 }));
      const draw = (options: ChartOptions) => {
        makeChart(options);
        chart.addSeries('line');
        chart.addSeries('bar');
        for (const id of chart.getSeriesIds()) {
          chart.setSeriesData(id, data);
        }
        raf.flush(10);
        const calls = spy.calls.map((call) => ({ method: call.method, args: call.args }));
        chart.destroy();
        container.remove();

        return calls;
      };

      expect(draw({ axis: { x: { type: 'time' } } })).toEqual(draw({}));
    });

    it('ignores a later type change with one warning', () => {
      makeChart({ axis: { x: { type: 'numeric' } } });

      chart.setAxis({ x: { type: 'category' } });
      chart.setAxis({ x: { type: 'time' } });

      expect(chart.timeScale.getType()).toBe('numeric');
      expect(warn.mock.calls.filter(([message]) => String(message).includes('axis.x.type changed'))).toHaveLength(1);
    });
  });
});

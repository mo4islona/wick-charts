// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountAxisLabels } from '../axis/dom-labels';
import { ChartInstance } from '../chart';
import type { ChartOptions } from '../chart/options';
import type { SeriesDefinition } from '../series/definition';
import { LineSeriesDef } from '../series/line';
import type { BarPainter, CornerMask } from '../series/painters/types';
import type { CanvasRecorder, RecordedCall } from '../testing/recording-context';
import { catppuccin } from '../theme/themes/catppuccin';
import type { BarSeriesOptions, XPointInput } from '../types';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const FIRST = '#ff0000';
const SECOND = '#0000ff';
const HOVER = catppuccin.theme.bar?.hoverBackground ?? '';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
}

function toRect(call: RecordedCall): Rect {
  const [x, y, width, height] = call.args.map(Number);

  return { x, y, width, height, alpha: call.globalAlpha };
}

/** The overlay canvas owns the pointer listeners. */
function pointerMove(container: HTMLElement, offsetX: number): void {
  const canvases = container.querySelectorAll('canvas');
  const overlay = canvases[canvases.length - 1];
  const event = new MouseEvent('mousemove', { bubbles: true, clientX: offsetX, clientY: 100 });
  Object.defineProperty(event, 'offsetX', { value: offsetX });
  Object.defineProperty(event, 'offsetY', { value: 100 });
  overlay.dispatchEvent(event);
}

describe('bars on a category axis', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;
  let spy: CanvasRecorder;

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

  function makeChart(options: ChartOptions = {}): ChartInstance {
    container = makeChartContainer();
    chart = new ChartInstance(container, {
      animations: false,
      axis: { x: { type: 'category', padding: { inner: 0.2, outer: 0.2 } } },
      ...options,
    });
    const recorder = container.querySelector('canvas')?.__spy;
    if (!recorder) throw new Error('recording canvas not installed');
    spy = recorder;

    return chart;
  }

  /** A two-layer bar series in {@link FIRST} / {@link SECOND}. */
  function twoLayers(args: { layers: XPointInput[][]; options?: Partial<BarSeriesOptions> }): string {
    const id = chart.addSeries('bar', { layers: 2, cornerRadius: 0, ...args.options });
    chart.setLayerColors(id, [FIRST, SECOND]);
    for (const [layer, points] of args.layers.entries()) {
      chart.setSeriesData(id, points, layer);
    }

    return id;
  }

  /** Repaint and return the bars each color painted, left to right. */
  function paint(): { first: Rect[]; second: Rect[]; calls: readonly RecordedCall[] } {
    spy.reset();
    chart.fitContent();
    raf.flush(5);

    const rects = (color: string) =>
      spy
        .callsOf('fillRect')
        .filter((call) => call.fillStyle === color)
        .map(toRect)
        .sort((a, b) => a.x - b.x);

    return { first: rects(FIRST), second: rects(SECOND), calls: spy.calls };
  }

  /** Bitmap X range `[left, right]` of band `index`. */
  function band(index: number): [number, number] {
    const width = chart.timeScale.bandWidthBitmap();
    const left = chart.timeScale.timeToBitmapX(index) - width / 2;

    return [left, left + width];
  }

  const zeroY = () => chart.yScale.valueToBitmapY(0);

  describe('grouped layers', () => {
    const LAYERS: XPointInput[][] = [
      [
        { x: 'EU', value: 30 },
        { x: 'Asia', value: 20 },
        { x: 'US', value: 10 },
      ],
      [
        { x: 'EU', value: 15 },
        { x: 'Asia', value: 25 },
        { x: 'US', value: 35 },
      ],
    ];

    it('draws the layers side by side inside each band, in layer order', () => {
      makeChart();
      twoLayers({ layers: LAYERS });
      const { first, second } = paint();

      expect(first).toHaveLength(3);
      expect(second).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        const [left, right] = band(i);

        expect(first[i].x).toBeGreaterThanOrEqual(left - 1);
        expect(first[i].x + first[i].width).toBeLessThanOrEqual(second[i].x);
        expect(second[i].x + second[i].width).toBeLessThanOrEqual(right + 1);
        expect(first[i].width).toBe(second[i].width);
        expect(first[i].width).toBeGreaterThan((right - left) / 2 - 4);
      }
    });

    it('keeps overlapping layers on a time axis', () => {
      makeChart({ axis: {} });
      const id = chart.addSeries('bar', { layers: 2, cornerRadius: 0 });
      chart.setLayerColors(id, [FIRST, SECOND]);
      chart.setSeriesData(
        id,
        [1, 2, 3].map((time) => ({ time: time * 1000, value: 10 + time })),
        0,
      );
      chart.setSeriesData(
        id,
        [1, 2, 3].map((time) => ({ time: time * 1000, value: 5 + time })),
        1,
      );
      const { first, second } = paint();

      expect(first.map((bar) => bar.x)).toEqual(second.map((bar) => bar.x));
    });

    it('grows a negative bar down from zero and rounds its outer end', () => {
      const corners: Array<{ color: string; corners: CornerMask; y: number; height: number }> = [];
      const painter: BarPainter = (env, args) => {
        corners.push({ color: args.color, corners: { ...args.corners }, y: args.geom.y, height: args.geom.height });
        env.ctx.fillStyle = args.color;
        env.ctx.fillRect(args.geom.x, args.geom.y, args.geom.width, args.geom.height);
      };
      makeChart();
      twoLayers({
        layers: [
          [
            { x: 'EU', value: 30 },
            { x: 'Asia', value: 20 },
          ],
          [
            { x: 'EU', value: -15 },
            { x: 'Asia', value: -25 },
          ],
        ],
        options: { barPainter: painter },
      });
      const { first, second } = paint();

      for (const bar of second) {
        expect(bar.y).toBeCloseTo(zeroY(), 0);
        expect(bar.height).toBeGreaterThan(1);
      }
      for (const bar of first) {
        expect(bar.y + bar.height).toBeCloseTo(zeroY(), 0);
      }

      const negative = corners.filter((entry) => entry.color === SECOND);
      const positive = corners.filter((entry) => entry.color === FIRST);
      expect(negative.length).toBeGreaterThan(0);
      for (const entry of negative) expect(entry.corners).toEqual({ tl: false, tr: false, br: true, bl: true });
      for (const entry of positive) expect(entry.corners).toEqual({ tl: true, tr: true, br: false, bl: false });
    });

    it('narrows the other slots while a toggled layer fades out', () => {
      makeChart({ animations: true });
      const id = twoLayers({ layers: LAYERS });
      raf.flush(200);

      chart.setLayerVisible(id, 1, false);
      raf.flush(200);
      const { first, second } = paint();
      const [left, right] = band(0);

      expect(second).toHaveLength(0);
      expect(first[0].width).toBeGreaterThan(right - left - 4);
    });
  });

  describe('stacking', () => {
    const LAYERS: XPointInput[][] = [
      [
        { x: 'A', value: 10 },
        { x: 'B', value: 20 },
      ],
      [
        { x: 'A', value: 30 },
        { x: 'B', value: -10 },
      ],
    ];

    it("stacks 'normal' layers into one column per band", () => {
      makeChart();
      twoLayers({ layers: LAYERS, options: { stacking: 'normal' } });
      const { first, second } = paint();
      const bandWidth = chart.timeScale.bandWidthBitmap();

      expect(first).toHaveLength(2);
      expect(second).toHaveLength(2);
      for (let i = 0; i < 2; i++) {
        expect(first[i].x).toBe(second[i].x);
        expect(first[i].width).toBe(bandWidth);
      }

      // A: the second segment sits on the first; B: the negative one hangs below zero.
      expect(second[0].y + second[0].height).toBeCloseTo(first[0].y, 0);
      expect(chart.yScale.yToValue(second[0].y)).toBeCloseTo(40, 0);
      expect(second[1].y).toBeCloseTo(zeroY(), 0);
    });

    it("fills each 'percent' column to 100%", () => {
      makeChart();
      twoLayers({
        layers: [
          [
            { x: 'A', value: 10 },
            { x: 'B', value: 20 },
          ],
          [
            { x: 'A', value: 30 },
            { x: 'B', value: 20 },
          ],
        ],
        options: { stacking: 'percent' },
      });
      const { first, second } = paint();

      expect(chart.yScale.yToValue(second[0].y)).toBeCloseTo(100, 0);
      expect(chart.yScale.yToValue(first[0].y)).toBeCloseTo(25, 0);
      expect(chart.yScale.yToValue(second[1].y)).toBeCloseTo(100, 0);
      expect(chart.yScale.yToValue(first[1].y)).toBeCloseTo(50, 0);
    });
  });

  describe('percent stacking with negative values', () => {
    it('splits a column by the absolute sum: +3 and -1 give +75% up and -25% down', () => {
      makeChart();
      const id = twoLayers({
        layers: [[{ x: 'A', value: 3 }], [{ x: 'A', value: -1 }]],
        options: { stacking: 'percent' },
      });
      const { first, second } = paint();

      expect(chart.yScale.yToValue(first[0].y)).toBeCloseTo(75, 0);
      expect(first[0].y + first[0].height).toBeCloseTo(zeroY(), 0);
      expect(second[0].y).toBeCloseTo(zeroY(), 0);
      expect(chart.yScale.yToValue(second[0].y + second[0].height)).toBeCloseTo(-25, 0);
      expect(chart.getLayerSnapshots(id, 0)?.map((row) => row.share)).toEqual([75, -25]);
    });

    it('fits an all-negative column down to -100%', () => {
      makeChart();
      twoLayers({
        layers: [[{ x: 'A', value: -1 }], [{ x: 'A', value: -3 }]],
        options: { stacking: 'percent' },
      });
      paint();

      expect(chart.yScale.getRange().min).toBeLessThanOrEqual(-100);
    });
  });

  describe('value labels', () => {
    function labels(): Array<{ text: string; x: number; y: number; baseline: string; color: string }> {
      return spy.callsOf('fillText').map((call) => ({
        text: String(call.args[0]),
        x: Number(call.args[1]),
        y: Number(call.args[2]),
        baseline: call.textBaseline,
        color: call.fillStyle,
      }));
    }

    it('labels each grouped bar past its free end, below a negative one', () => {
      makeChart();
      twoLayers({
        layers: [[{ x: 'A', value: 40 }], [{ x: 'A', value: -20 }]],
        options: { valueLabels: { format: (value) => `${value}` } },
      });
      const { first, second } = paint();

      const drawn = labels();
      expect(drawn.map((label) => label.text)).toEqual(['40', '-20']);

      const [above, below] = drawn;
      expect(above.baseline).toBe('bottom');
      expect(above.y).toBeLessThan(first[0].y);
      expect(above.x).toBeCloseTo(first[0].x + first[0].width / 2, 5);
      expect(below.baseline).toBe('top');
      expect(below.y).toBeGreaterThan(second[0].y + second[0].height);
      expect(above.color).toBe(catppuccin.theme.bar?.labelColor);
    });

    it('skips a label wider than its bar', () => {
      makeChart();
      twoLayers({
        layers: [[{ x: 'A', value: 40 }], [{ x: 'A', value: 20 }]],
        options: { valueLabels: { format: (value) => (value > 30 ? 'x'.repeat(200) : 'ok') } },
      });
      paint();

      expect(labels().map((label) => label.text)).toEqual(['ok']);
    });

    it('formats with the Y axis format by default', () => {
      makeChart();
      const id = chart.addSeries('bar', { cornerRadius: 0, valueLabels: true });
      chart.setYAxisFormat({ format: (value) => `$${value}` });
      chart.setSeriesData(id, [
        { x: 'A', value: 4 },
        { x: 'B', value: 7 },
      ]);
      paint();

      expect(labels().map((label) => label.text)).toEqual(['$4', '$7']);
    });

    it('repaints the labels of a settled chart when the Y axis format changes', () => {
      makeChart();
      const id = chart.addSeries('bar', { cornerRadius: 0, valueLabels: true });
      chart.setSeriesData(id, [{ x: 'A', value: 4 }]);
      raf.flush(20);

      spy.reset();
      chart.setYAxisFormat({ format: (value) => `${value}%` });
      raf.flush(5);

      expect(labels().map((label) => label.text)).toEqual(['4%']);
    });

    it("labels a 'normal' stack with each signed total at its outer end", () => {
      makeChart();
      twoLayers({
        layers: [
          [{ x: 'A', value: 10 }],
          [
            { x: 'A', value: 30 },
            { x: 'B', value: -5 },
          ],
        ],
        options: { stacking: 'normal', valueLabels: { format: (value) => `${value}` } },
      });
      const { second } = paint();

      const drawn = labels();
      expect(drawn.map((label) => label.text).sort()).toEqual(['-5', '40']);

      const total = drawn.find((label) => label.text === '40');
      const top = second.find((bar) => bar.y < zeroY());
      expect(total?.baseline).toBe('bottom');
      expect(total?.y).toBeLessThan(top?.y ?? 0);
      expect(drawn.find((label) => label.text === '-5')?.baseline).toBe('top');
    });

    it("draws no labels on a 'percent' stack", () => {
      makeChart();
      twoLayers({
        layers: [[{ x: 'A', value: 10 }], [{ x: 'A', value: 30 }]],
        options: { stacking: 'percent', valueLabels: true },
      });
      paint();

      expect(labels()).toEqual([]);
    });
  });

  describe('hover backdrop', () => {
    const LAYERS: XPointInput[][] = [
      [
        { x: 'A', value: 10 },
        { x: 'B', value: 20 },
        { x: 'C', value: 30 },
      ],
      [
        { x: 'A', value: 5 },
        { x: 'B', value: 15 },
        { x: 'C', value: 25 },
      ],
    ];

    function backdrops(): Rect[] {
      return spy
        .callsOf('fillRect')
        .filter((call) => call.fillStyle === HOVER)
        .map(toRect);
    }

    it('shades the hovered band behind its bars', () => {
      makeChart();
      twoLayers({ layers: LAYERS });
      paint();

      spy.reset();
      pointerMove(container, chart.timeScale.timeToX(1.2));
      raf.flush(5);

      const [backdrop] = backdrops();
      const step = chart.timeScale.barWidthMedia(1);
      expect(backdrops()).toHaveLength(1);
      expect(Math.abs(backdrop.x + backdrop.width / 2 - chart.timeScale.timeToBitmapX(1))).toBeLessThanOrEqual(1);
      expect(backdrop.width).toBeCloseTo(step, 0);

      const fills = spy.callsOf('fillRect');
      const backdropAt = fills.findIndex((call) => call.fillStyle === HOVER);
      const firstBarAt = fills.findIndex((call) => call.fillStyle === FIRST);
      expect(backdropAt).toBeLessThan(firstBarAt);
    });

    it('follows the band under a still pointer after a refit', () => {
      makeChart();
      const id = twoLayers({ layers: LAYERS });
      paint();
      const pointerX = chart.timeScale.timeToX(2);
      pointerMove(container, pointerX);
      raf.flush(5);

      chart.setSeriesData(id, [...LAYERS[0], ...['D', 'E', 'F'].map((x) => ({ x, value: 1 }))], 0);
      spy.reset();
      raf.flush(10);

      const hovered = chart.timeScale.snapToBand(chart.timeScale.xToTime(pointerX));
      expect(hovered).not.toBe(2);
      const [backdrop] = backdrops().slice(-1);
      expect(Math.abs(backdrop.x + backdrop.width / 2 - chart.timeScale.timeToBitmapX(hovered))).toBeLessThanOrEqual(1);
    });

    it('draws no backdrop on a time axis', () => {
      makeChart({ axis: {} });
      const id = chart.addSeries('bar', { cornerRadius: 0 });
      chart.setSeriesData(
        id,
        [1, 2, 3].map((time) => ({ time: time * 1000, value: time })),
      );
      paint();

      spy.reset();
      pointerMove(container, 300);
      raf.flush(5);

      expect(backdrops()).toEqual([]);
    });
  });

  describe('entering and leaving categories', () => {
    const SEED = [
      { x: 'A', value: 10 },
      { x: 'B', value: 20 },
      { x: 'C', value: 30 },
      { x: 'D', value: 40 },
    ];

    function liveBars(): string {
      makeChart({ animations: true });
      const id = chart.addSeries('bar', { cornerRadius: 0 });
      chart.setLayerColors(id, [FIRST]);
      chart.setSeriesData(id, SEED);
      raf.flush(200);

      return id;
    }

    /** One frame's bars — a theme swap asks for a paint once the chart has settled. */
    function barsNow(): Rect[] {
      chart.setTheme(chart.getTheme());
      spy.reset();
      raf.flush(1);

      return spy
        .callsOf('fillRect')
        .filter((call) => call.fillStyle === FIRST)
        .map(toRect)
        .sort((a, b) => a.x - b.x);
    }

    it('fades in a category inserted in the middle', () => {
      const id = liveBars();

      chart.setSeriesData(id, [SEED[0], { x: 'X', value: 25 }, ...SEED.slice(1)]);
      const entering = barsNow();

      expect(chart.timeScale.getCategories()).toEqual(['A', 'X', 'B', 'C', 'D']);
      expect(entering).toHaveLength(5);
      expect(entering[1].alpha).toBeLessThan(1);
      for (const i of [0, 2, 3, 4]) expect(entering[i].alpha).toBe(1);

      raf.flush(30);
      expect(barsNow()[1].alpha).toBe(1);
    });

    it('fades out a leaving category at its own band, then closes the gap', () => {
      const id = liveBars();
      const bandC = chart.timeScale.timeToBitmapX(2);

      chart.setSeriesData(id, [SEED[0], SEED[2], SEED[3]]);
      const leaving = barsNow();

      expect(chart.timeScale.getCategories()).toEqual(['A', 'B', 'C', 'D']);
      expect(leaving).toHaveLength(4);
      expect(leaving[1].alpha).toBeLessThan(1);
      expect(leaving[2].x + leaving[2].width / 2).toBeCloseTo(bandC, 0);
      expect(leaving[2].alpha).toBe(1);

      raf.flush(60);
      const settled = barsNow();
      expect(chart.timeScale.getCategories()).toEqual(['A', 'C', 'D']);
      expect(settled).toHaveLength(3);
      expect(chart.getDataAtTime(id, 1)).toMatchObject({ x: 'C', value: 30 });
    });

    it('holds the band when every layer of a grouped series drops the category in one batch', () => {
      makeChart({ animations: true });
      const id = twoLayers({ layers: [SEED, SEED] });
      raf.flush(200);

      // The framework wrappers sync the layers one by one inside a batch.
      const without = [SEED[0], SEED[2], SEED[3]];
      chart.batch(() => {
        chart.setSeriesData(id, without, 0);
        chart.setSeriesData(id, without, 1);
      });
      raf.flush(2);

      expect(chart.timeScale.getCategories()).toEqual(['A', 'B', 'C', 'D']);

      raf.flush(60);
      expect(chart.timeScale.getCategories()).toEqual(['A', 'C', 'D']);
      expect(chart.getLayerSnapshots(id, 1)).toEqual([
        expect.objectContaining({ layerIndex: 0, x: 'C' }),
        expect.objectContaining({ layerIndex: 1, x: 'C' }),
      ]);
    });

    it('fades out a leaving category in its band while another enters in the same update', () => {
      const id = liveBars();

      chart.setSeriesData(id, [{ x: 'X', value: 25 }, SEED[0], SEED[2], SEED[3]]);
      const bars = barsNow();

      expect(chart.timeScale.getCategories()).toEqual(['X', 'A', 'B', 'C', 'D']);
      expect(bars).toHaveLength(5);
      expect(bars[0].alpha).toBeLessThan(1);
      expect(bars[2].alpha).toBeLessThan(1);
      expect(bars[2].x + bars[2].width / 2).toBeCloseTo(chart.timeScale.timeToBitmapX(2), 0);
      expect(bars[3].alpha).toBe(1);

      raf.flush(60);
      expect(chart.timeScale.getCategories()).toEqual(['X', 'A', 'C', 'D']);
    });

    it('keeps a fading category fading in its band when a category enters meanwhile', () => {
      const id = liveBars();
      chart.setSeriesData(id, [SEED[0], SEED[2], SEED[3]]);
      raf.flush(3);

      chart.setSeriesData(id, [{ x: 'X', value: 25 }, SEED[0], SEED[2], SEED[3]]);
      const bars = barsNow();

      expect(chart.timeScale.getCategories()).toEqual(['X', 'A', 'B', 'C', 'D']);
      expect(bars).toHaveLength(5);
      expect(bars[2].alpha).toBeLessThan(1);
      expect(bars[2].x + bars[2].width / 2).toBeCloseTo(chart.timeScale.timeToBitmapX(2), 0);

      raf.flush(60);
      expect(chart.timeScale.getCategories()).toEqual(['X', 'A', 'C', 'D']);
    });

    it("keeps another layer's fading bar in its band when an insert shifts the bands", () => {
      makeChart({ animations: true });
      const id = twoLayers({
        layers: [
          [
            { x: 'A', value: 10 },
            { x: 'C', value: 30 },
          ],
          [{ x: 'B', value: 20 }],
        ],
      });
      raf.flush(200);

      chart.setSeriesData(id, [], 1);
      raf.flush(3);
      chart.setSeriesData(
        id,
        [
          { x: 'X', value: 5 },
          { x: 'A', value: 10 },
          { x: 'C', value: 30 },
        ],
        0,
      );
      chart.setTheme(chart.getTheme());
      spy.reset();
      raf.flush(1);
      const second = spy
        .callsOf('fillRect')
        .filter((call) => call.fillStyle === SECOND)
        .map(toRect);
      const [left, right] = band(3);

      expect(chart.timeScale.getCategories()).toEqual(['X', 'A', 'C', 'B']);
      expect(second).toHaveLength(1);
      expect(second[0].alpha).toBeLessThan(1);
      expect(second[0].x).toBeGreaterThanOrEqual(left - 1);
      expect(second[0].x + second[0].width).toBeLessThanOrEqual(right + 1);
    });

    const centre = (bar: Rect) => bar.x + bar.width / 2;
    const between = (args: { value: number; a: number; b: number }) =>
      args.value > Math.min(args.a, args.b) + 1 && args.value < Math.max(args.a, args.b) - 1;

    it('slides the later bars to their new bands on a middle insert', () => {
      const id = liveBars();
      const before = centre(barsNow()[3]);

      chart.setSeriesData(id, [SEED[0], { x: 'X', value: 25 }, ...SEED.slice(1)]);
      raf.flush(3);
      const mid = centre(barsNow()[4]);
      raf.flush(60);
      const after = centre(barsNow()[4]);

      expect(between({ value: mid, a: before, b: after })).toBe(true);
      expect(Math.abs(after - chart.timeScale.timeToBitmapX(4))).toBeLessThanOrEqual(1);
    });

    it('slides the later bars back when a left band is released', () => {
      const id = liveBars();
      const before = centre(barsNow()[2]);

      chart.setSeriesData(id, [SEED[0], SEED[2], SEED[3]]);
      for (let i = 0; i < 60 && chart.timeScale.getCategories().length > 3; i++) raf.flush(1);
      const mid = centre(barsNow()[1]);
      raf.flush(60);
      const after = centre(barsNow()[1]);

      expect(chart.timeScale.getCategories()).toEqual(['A', 'C', 'D']);
      expect(between({ value: mid, a: before, b: after })).toBe(true);
      expect(Math.abs(after - chart.timeScale.timeToBitmapX(1))).toBeLessThanOrEqual(1);
    });

    it('draws every bar and tick through a slide that pushes bands past the range', () => {
      const id = liveBars();

      chart.setSeriesData(id, [{ x: 'X', value: 5 }, { x: 'Y', value: 6 }, ...SEED]);
      for (let frame = 0; frame < 20; frame++) {
        spy.reset();
        raf.flush(1);
        const settled = spy.callsOf('fillRect').filter((call) => call.fillStyle === FIRST && call.globalAlpha === 1);
        const { ticks } = chart.timeScale.niceTickValues(1);

        expect(settled.length).toBeGreaterThanOrEqual(SEED.length);
        expect(ticks).toContain(5);
      }
    });

    it('shows no tick label for a band past the last category', () => {
      const id = liveBars();
      const strip = document.createElement('div');
      container.appendChild(strip);
      const unmount = mountAxisLabels({ chart, container: strip, axis: 'x' });
      const texts = () => [...strip.querySelectorAll('span')].map((span) => span.textContent);

      chart.setSeriesData(id, SEED.slice(0, 3));
      for (let i = 0; i < 60 && chart.timeScale.getCategories().length > 3; i++) raf.flush(1);
      raf.flush(2);

      expect(texts()).toEqual(['A', 'B', 'C']);
      unmount();
    });

    it('drops a leaving band at once without animations', () => {
      makeChart();
      const id = chart.addSeries('bar');
      chart.setSeriesData(id, SEED);

      chart.setSeriesData(id, [SEED[0], SEED[2]]);

      expect(chart.timeScale.getCategories()).toEqual(['A', 'C']);
    });
  });

  describe('explicit category order', () => {
    const DATA = [
      { x: 'A', value: 1 },
      { x: 'B', value: 2 },
      { x: 'C', value: 3 },
    ];

    it('puts the listed names first, empty ones included, then the rest in first-seen order', () => {
      makeChart({ axis: { x: { type: 'category', categories: ['C', 'Z', 'A'] } } });
      const id = chart.addSeries('bar');
      chart.setSeriesData(id, DATA);

      expect(chart.timeScale.getCategories()).toEqual(['C', 'Z', 'A', 'B']);
      expect(chart.getDataAtTime(id, 0)).toMatchObject({ x: 'C' });
      expect(chart.getDataAtTime(id, 1)).toBeNull();
      expect(chart.getDataAtTime(id, 3)).toMatchObject({ x: 'B' });
    });

    it('lays out the listed bands before any data arrives', () => {
      makeChart({ axis: { x: { type: 'category', categories: ['A', 'Z'] } } });
      raf.flush(5);

      expect(chart.timeScale.getCategories()).toEqual(['A', 'Z']);
      expect(chart.getVisibleRange()).toEqual(chart.timeScale.bandRange());
      expect(chart.timeScale.niceTickValues(1).ticks).toEqual([0, 1]);
    });

    it('hands every point to a custom series without morphData', () => {
      makeChart();
      const plain: SeriesDefinition = {
        type: 'plain',
        xTypes: ['category'],
        create: (env, options) => {
          const renderer = LineSeriesDef.create(env, options as never);
          Object.defineProperty(renderer, 'morphData', { value: undefined });

          return renderer;
        },
      };
      const id = chart.addSeries(plain);

      chart.setSeriesData(id, [{ x: 'A', value: 10 }]);
      chart.setSeriesData(id, [
        { x: 'X', value: 5 },
        { x: 'A', value: 10 },
      ]);

      expect(chart.getDataAtTime(id, 0)).toMatchObject({ x: 'X', value: 5 });
      expect(chart.getDataAtTime(id, 1)).toMatchObject({ x: 'A', value: 10 });
    });

    it('keeps first-seen order without the option', () => {
      makeChart();
      const id = chart.addSeries('bar');
      chart.setSeriesData(id, DATA);

      expect(chart.timeScale.getCategories()).toEqual(['A', 'B', 'C']);
    });

    it('re-orders live through setAxis', () => {
      makeChart();
      const id = chart.addSeries('bar');
      chart.setSeriesData(id, DATA);

      chart.setAxis({ x: { type: 'category', categories: ['B'] } });

      expect(chart.timeScale.getCategories()).toEqual(['B', 'A', 'C']);
      expect(chart.getDataAtTime(id, 0)).toMatchObject({ x: 'B', value: 2 });
      expect(chart.getVisibleRange()).toEqual(chart.timeScale.bandRange());
    });
  });
});

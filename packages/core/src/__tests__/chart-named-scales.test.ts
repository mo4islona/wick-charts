// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { ChartInstance } from '../chart';
import type { ChartOptions } from '../chart/options';
import { logScale } from '../scales/log-scale';
import type { CanvasRecorder } from '../testing/recording-context';
import { catppuccin } from '../theme/themes/catppuccin';
import type { TimePoint } from '../types';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const INTERVAL = 60_000;
const START = 1_000_000;
// 400px container minus the 30px X axis.
const PLOT_HEIGHT = 370;
const BAR_COLOR = '#ff0000';

function series(values: number[]): TimePoint[] {
  return values.map((value, i) => ({ time: START + i * INTERVAL, value }));
}

/** Bitmap Y of a value on a pinned `[min, max]` scale filling the plot height (DPR 1). */
function pinnedY(value: number, min: number, max: number): number {
  return (1 - (value - min) / (max - min)) * PLOT_HEIGHT;
}

describe('ChartInstance with named Y scales', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;
  let spy: CanvasRecorder;

  function makeChart(options: ChartOptions): ChartInstance {
    container = makeChartContainer();
    chart = new ChartInstance(container, { interactive: false, animations: false, ...options });
    const recorder = container.querySelector('canvas')?.__spy;
    if (!recorder) throw new Error('recording canvas not installed');
    spy = recorder;

    return chart;
  }

  /** Top-edge Y of every bar path painted in {@link BAR_COLOR}. */
  function barTops(): number[] {
    return spy
      .callsOf('moveTo')
      .filter((call) => call.fillStyle === BAR_COLOR)
      .map((call) => Number(call.args[1]));
  }

  /** Bitmap Y of every horizontal gridline (they run to the canvas's right edge). */
  function gridRows(): number[] {
    return spy
      .callsOf('lineTo')
      .filter((call) => call.strokeStyle === catppuccin.theme.grid.color && call.args[0] === 800)
      .map((call) => Number(call.args[1]));
  }

  beforeEach(() => {
    raf = installRaf();
  });

  afterEach(() => {
    chart?.destroy();
    container?.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  it('draws a series through its own scale and the grid through the default scale only', () => {
    makeChart({ scales: { rsi: { position: 'left', min: 0, max: 100 } } });
    const price = chart.addSeries('line');
    chart.setSeriesData(price, series([1000, 1025, 1050, 1075, 1100]));
    const rsi = chart.addSeries('bar', { scale: 'rsi' });
    chart.setLayerColors(rsi, [BAR_COLOR]);
    chart.setSeriesData(rsi, series([30, 40, 50, 60, 70]));

    spy.reset();
    raf.flush(3);

    const expectedTops = [30, 40, 50, 60, 70].map((v) => Math.round(pinnedY(v, 0, 100)));
    expect(barTops()).toEqual(expectedTops);

    const defaultRows = chart.yScale.niceTickValues().map((v) => Math.round(chart.yScale.valueToBitmapY(v)) + 0.5);
    expect(gridRows()).toEqual(defaultRows);

    const rsiRows = chart
      .getYScale('rsi')
      .niceTickValues()
      .map((v) => Math.round(chart.getYScale('rsi').valueToBitmapY(v)) + 0.5);
    expect(gridRows()).not.toEqual(rsiRows);
  });

  it('autoscales each scale from its own series and honours fixed bounds', () => {
    makeChart({ scales: { rate: { visible: false }, rsi: { position: 'left', min: 0, max: 100 } } });
    const price = chart.addSeries('line');
    chart.setSeriesData(price, series([1000, 1025, 1050, 1075, 1100]));
    const rate = chart.addSeries('line', { scale: 'rate' });
    chart.setSeriesData(rate, series([0.01, 0.02, 0.05, 0.03, 0.02]));
    const rsi = chart.addSeries('line', { scale: 'rsi' });
    chart.setSeriesData(rsi, series([30, 40, 50, 60, 70]));

    const priceRange = chart.yScale.getRange();
    expect(priceRange.min).toBeLessThan(1000);
    expect(priceRange.min).toBeGreaterThan(900);
    expect(priceRange.max).toBeGreaterThan(1100);
    expect(priceRange.max).toBeLessThan(1200);

    const rateRange = chart.getYScale('rate').getRange();
    expect(rateRange.min).toBeLessThan(0.01);
    expect(rateRange.max).toBeGreaterThan(0.05);
    expect(rateRange.max).toBeLessThan(0.1);

    expect(chart.getYScale('rsi').getRange()).toEqual({ min: 0, max: 100 });
  });

  it('refits every scale on a zoom and a visibility toggle', () => {
    makeChart({ scales: { rate: { visible: false } } });
    const price = chart.addSeries('line');
    chart.setSeriesData(price, series([1000, 1010, 1020, 1030, 1040, 1050, 1060, 1070]));
    const rate = chart.addSeries('line', { scale: 'rate' });
    chart.setSeriesData(rate, series([90, 80, 5, 6, 7, 6, 5, 6]));
    expect(chart.getYScale('rate').getRange().max).toBeGreaterThan(90);

    const zoomedIn = { from: START + 3 * INTERVAL, to: START + 7 * INTERVAL };
    chart.setVisibleRange(zoomedIn);
    raf.flush();
    expect(chart.getYScale('rate').getRange().max).toBeLessThan(10);

    const other = chart.addSeries('line', { scale: 'rate' });
    chart.setSeriesData(other, series([0, 0, 0, 0, 0, 0, 0, 500]));
    // A bulk replace refits X to the whole data; zoom back in past the spike at the start.
    chart.setVisibleRange(zoomedIn);
    raf.flush();
    expect(chart.getYScale('rate').getRange().max).toBeGreaterThan(500);

    chart.setSeriesVisible(other, false);
    raf.flush();
    expect(chart.getYScale('rate').getRange().max).toBeLessThan(10);
  });

  it('shrinks the plot by an axis column on each side', () => {
    makeChart({ scales: { rsi: {} } });
    chart.addSeries('line');

    expect(chart.getAxisColumnWidth('right')).toBe(55);
    expect(chart.getAxisColumnWidth('left')).toBe(55);
    expect(chart.plotLeft).toBe(55);
    expect(chart.getYScaleColumn('rsi')).toEqual({ position: 'left', width: 55 });
    expect(chart.getLayout().chartArea).toEqual({ x: 55, y: 0, width: 690, height: PLOT_HEIGHT });

    const id = chart.addSeries('line', { scale: 'rsi' });
    chart.setSeriesData(id, series([1, 2, 3]));
    expect(chart.timeScale.getMediaWidth()).toBe(690);

    spy.reset();
    raf.flush(1);
    expect(spy.callsOf('translate').map((call) => call.args)).toContainEqual([55, 0]);
  });

  it('renders a scale whose side is taken as an overlay and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeChart({ scales: { a: { position: 'left' }, b: { position: 'left' }, c: { position: 'right' } } });
    chart.addSeries('line');

    expect(chart.getYScaleColumn('a')).toEqual({ position: 'left', width: 55 });
    expect(chart.getYScaleColumn('b')).toBeNull();
    expect(chart.getYScaleColumn('c')).toBeNull();
    expect(chart.getAxisColumnWidth('left')).toBe(55);
    expect(chart.getAxisColumnWidth('right')).toBe(55);

    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.filter((m) => m.includes("Scale 'b'"))).toHaveLength(1);
    expect(messages.filter((m) => m.includes("Scale 'c'"))).toHaveLength(1);
  });

  it('falls back to the default scale for an unknown id and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeChart({ scales: { rsi: { min: 0, max: 100 } } });
    const id = chart.addSeries('line', { scale: 'nope' });
    chart.setSeriesData(id, series([1000, 1100]));
    raf.flush(3);
    chart.appendData(id, { time: START + 2 * INTERVAL, value: 1050 });
    raf.flush(3);

    expect(chart.getSeriesScale(id)).toBeUndefined();
    expect(chart.yScale.getRange().max).toBeGreaterThan(1100);
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.filter((m) => m.includes("scale 'nope'"))).toHaveLength(1);
  });

  it('a chart without scales keeps a single right column', () => {
    makeChart({});
    chart.addSeries('line');

    expect(chart.getYScaleIds()).toEqual([]);
    expect(chart.getAxisColumnWidth('right')).toBe(55);
    expect(chart.getAxisColumnWidth('left')).toBe(0);
    expect(chart.plotLeft).toBe(0);
  });

  it('applies added, edited and removed scales live, and moves a series by its scale option', () => {
    makeChart({});
    const price = chart.addSeries('line');
    chart.setSeriesData(price, series([1000, 1100]));
    const rsi = chart.addSeries('line', { scale: 'rsi' });
    chart.setSeriesData(rsi, series([30, 70]));
    expect(chart.yScale.getRange().min).toBeLessThan(30);

    chart.setScales({ rsi: { position: 'left', min: 0, max: 100 } });
    expect(chart.plotLeft).toBe(55);
    expect(chart.getSeriesScale(rsi)).toBe('rsi');
    expect(chart.getYScale('rsi').getRange()).toEqual({ min: 0, max: 100 });
    expect(chart.yScale.getRange().min).toBeGreaterThan(900);

    chart.setScales({ rsi: { position: 'left', min: 0, max: 200 } });
    expect(chart.getYScale('rsi').getRange()).toEqual({ min: 0, max: 200 });

    chart.updateSeriesOptions(rsi, { scale: undefined });
    expect(chart.getSeriesScale(rsi)).toBeUndefined();
    expect(chart.yScale.getRange().min).toBeLessThan(30);

    chart.updateSeriesOptions(rsi, { scale: 'rsi' });
    expect(chart.yScale.getRange().min).toBeGreaterThan(900);

    chart.setScales({});
    expect(chart.plotLeft).toBe(0);
    expect(chart.getSeriesScale(rsi)).toBeUndefined();
    expect(chart.yScale.getRange().min).toBeLessThan(30);
  });

  it('applies an in-place edit of the scales object passed back to setScales', () => {
    const scales = { rsi: { min: 0, max: 100 } };
    makeChart({ scales });
    const id = chart.addSeries('line', { scale: 'rsi' });
    chart.setSeriesData(id, series([30, 70]));

    scales.rsi.max = 200;
    chart.setScales(scales);

    expect(chart.getYScale('rsi').getRange()).toEqual({ min: 0, max: 200 });
  });

  it('re-emits a still crosshair when only a named scale refits', () => {
    makeChart({ scales: { rate: { visible: false } } });
    const price = chart.addSeries('line');
    chart.setSeriesData(price, series([1000, 1100, 1050]));
    const rate = chart.addSeries('line', { scale: 'rate' });
    chart.setSeriesData(rate, series([10, 20, 15]));
    chart.setCrosshair({ time: START + INTERVAL, y: 1050 });
    raf.flush();

    const moves: unknown[] = [];
    chart.on('crosshairMove', (pos) => moves.push(pos));
    chart.setSeriesData(rate, series([100, 200, 150]));
    raf.flush();

    expect(moves.length).toBeGreaterThan(0);
    expect(chart.getCrosshairPosition()).toMatchObject({ time: START + INTERVAL, y: 1050 });
  });

  it('signals a formatter change and a column swap through overlayChange, not crosshairMove', () => {
    makeChart({ axis: { y: { visible: false } }, scales: { a: { position: 'left' } } });
    chart.addSeries('line');
    chart.setCrosshair({ time: START, y: 10 });

    let moves = 0;
    let overlayChanges = 0;
    chart.on('crosshairMove', () => moves++);
    chart.on('overlayChange', () => overlayChanges++);

    chart.setYAxisFormat({ format: (v) => `${v}%`, scale: 'a' });
    chart.setScales({ a: { position: 'right' } });

    expect(overlayChanges).toBe(2);
    expect(moves).toBe(0);
  });

  it('snaps a named scale to its new ticks on a bulk data replace, like the default axis', () => {
    // The global setup reports reduced motion, which would snap every tick fade anyway.
    const reducedMotion = globalThis.matchMedia;
    globalThis.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList) as typeof globalThis.matchMedia;
    onTestFinished(() => {
      globalThis.matchMedia = reducedMotion;
    });
    makeChart({ animations: true, scales: { rsi: { position: 'left' } } });
    // An intro in flight holds the trackers unarmed past the flush below.
    const id = chart.addSeries('line', { scale: 'rsi', introMs: false });
    chart.setSeriesData(id, series([10, 15, 20]));
    raf.flush();
    const tracker = chart.getYScale('rsi').tickTracker;
    expect(tracker.isArmed).toBe(true);

    chart.setSeriesData(id, series([1000, 1500, 2000]));
    raf.flush(1);

    const ticks = chart.getYScale('rsi').niceTickValues();
    const visible = tracker
      .snapshot()
      .entries.filter((entry) => entry.opacity >= 1)
      .map((entry) => entry.value);
    expect(ticks.length).toBeGreaterThan(0);
    expect(visible).toEqual(ticks);
  });

  it('sizes the time scale for a left column handed from a dropped scale to an overlaid one', () => {
    makeChart({ scales: { a: { position: 'left' }, b: { position: 'left' } } });
    const id = chart.addSeries('line', { scale: 'b' });
    chart.setSeriesData(id, series([1, 2, 3]));
    expect(chart.getYScaleColumn('b')).toBeNull();

    chart.setScales({ b: { position: 'left' } });

    expect(chart.getYScaleColumn('b')).toEqual({ position: 'left', width: 55 });
    expect(chart.timeScale.getMediaWidth()).toBe(690);
  });

  it('moves a percent stack onto a scale turning log to linear in the same pass, without a throw or warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeChart({ scales: { b: { scale: logScale() } } });
    const id = chart.addSeries('bar', { stacking: 'percent' });
    chart.setSeriesData(id, series([1, 2, 3]));

    // Wrapper order: the series moves before the container installs the new config.
    expect(() => chart.updateSeriesOptions(id, { scale: 'b' })).not.toThrow();
    chart.setScales({ b: {} });
    raf.flush(3);

    expect(chart.getSeriesScale(id)).toBe('b');
    expect(warn).not.toHaveBeenCalled();
  });

  it('checks a stacking change against the scale the same update moves to', () => {
    makeChart({ scales: { log: { scale: logScale() }, lin: {} } });
    const id = chart.addSeries('bar', { stacking: 'normal', scale: 'log' });

    expect(() => chart.updateSeriesOptions(id, { stacking: 'percent', scale: 'lin' })).not.toThrow();
    expect(chart.getSeriesScale(id)).toBe('lin');
  });

  it('maps reference lines and markers through their scale', () => {
    makeChart({ scales: { rsi: { position: 'left', min: 0, max: 100 } } });
    const price = chart.addSeries('line');
    chart.setSeriesData(price, series([1000, 1100]));
    const rsi = chart.addSeries('line', { scale: 'rsi' });
    chart.setSeriesData(rsi, series([30, 70]));
    chart.addLine({ value: 50, scale: 'rsi', color: '#00ff00' });
    chart.addMarker({ time: START, seriesId: rsi, color: '#0000ff' });

    const overlaySpy = container.querySelectorAll('canvas')[1]?.__spy;
    if (!overlaySpy) throw new Error('recording overlay canvas not installed');
    overlaySpy.reset();
    raf.flush(3);

    const lineYs = overlaySpy
      .callsOf('moveTo')
      .filter((call) => call.strokeStyle === '#00ff00')
      .map((call) => Number(call.args[1]));
    expect(lineYs.length).toBeGreaterThan(0);
    expect(lineYs[0]).toBeCloseTo(pinnedY(50, 0, 100), -0.5);

    // The dot sets its fill after tracing the arc, so pair each fill with the arc before it.
    const calls = overlaySpy.calls;
    const dotFill = calls.findIndex((call) => call.method === 'fill' && call.fillStyle === '#0000ff');
    const dotArc = calls
      .slice(0, dotFill)
      .filter((call) => call.method === 'arc')
      .pop();
    expect(Number(dotArc?.args[1])).toBeCloseTo(pinnedY(30, 0, 100), 0);
  });

  describe('with a transform on a named scale', () => {
    it('autoscales in that scale and reports values', () => {
      makeChart({ scales: { vol: { scale: logScale() } } });
      const id = chart.addSeries('line', { scale: 'vol' });
      chart.setSeriesData(id, series([1, 10, 100, 1000, 10_000]));

      const vol = chart.getYScale('vol');
      expect(vol.niceTickValues()).toEqual([1, 10, 100, 1000, 10_000]);
      expect(vol.getRange().min).toBeGreaterThan(0);
      expect(vol.getRange().min).toBeLessThan(1);
      expect(chart.yScale.getTransform()).toBeNull();
    });

    it('warns once per series for a percent stack on that scale, on add, a move and a transform change', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      makeChart({ scales: { vol: { scale: logScale() }, lin: {}, other: {} } });
      const percentWarnings = (seriesId: string) =>
        warn.mock.calls.filter((call) => String(call[0]).includes(`Series '${seriesId}' uses stacking: 'percent'`));

      expect(() => chart.addSeries('bar', { id: 'added', stacking: 'percent', scale: 'vol' })).not.toThrow();
      const moved = chart.addSeries('bar', { id: 'moved', stacking: 'percent', scale: 'lin' });
      chart.updateSeriesOptions(moved, { scale: 'vol' });
      const remapped = chart.addSeries('bar', { id: 'remapped', stacking: 'percent', scale: 'other' });
      chart.setScales({ vol: { scale: logScale() }, lin: {}, other: { scale: logScale() } });
      raf.flush(3);
      raf.flush(3);

      expect(percentWarnings(moved)).toHaveLength(1);
      expect(percentWarnings('added')).toHaveLength(1);
      expect(percentWarnings(remapped)).toHaveLength(1);
      expect(() => chart.setAxis({ y: { scale: logScale() } })).not.toThrow();
    });

    it('still throws for a percent stack on a log default scale', () => {
      makeChart({ axis: { y: { scale: logScale() } }, scales: { lin: {} } });

      expect(() => chart.addSeries('bar', { stacking: 'percent' })).toThrow(/percent/);

      const id = chart.addSeries('bar', { stacking: 'percent', scale: 'lin' });
      expect(() => chart.updateSeriesOptions(id, { scale: undefined })).toThrow(/percent/);
    });

    it('warns about bounds and values it cannot place, naming the right scale', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      makeChart({ scales: { vol: { scale: logScale(), min: 0 } } });
      expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([expect.stringContaining('scales.vol.min')]);
      warn.mockClear();

      const linear = chart.addSeries('line', { id: 'linear' });
      chart.setSeriesData(linear, series([-5, -1, 3]));
      expect(warn).not.toHaveBeenCalled();

      const logged = chart.addSeries('line', { id: 'logged', scale: 'vol' });
      chart.setSeriesData(logged, series([0, 10, 100]));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain("Series 'logged'");
    });

    it('resets that scale and refits it when its transform changes', () => {
      makeChart({ scales: { vol: {} } });
      const id = chart.addSeries('line', { scale: 'vol' });
      chart.setSeriesData(id, series([1, 10, 100, 1000, 10_000]));
      expect(chart.getYScale('vol').niceTickValues()).not.toEqual([1, 10, 100, 1000, 10_000]);

      chart.setScales({ vol: { scale: logScale() } });
      expect(chart.getYScale('vol').niceTickValues()).toEqual([1, 10, 100, 1000, 10_000]);
      expect(chart.getYScale('vol').getRange().min).toBeGreaterThan(0);
    });
  });
});

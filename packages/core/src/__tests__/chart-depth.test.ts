// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import type { ChartOptions } from '../chart/options';
import { DepthSeriesDef } from '../series/depth';
import { LineSeriesDef } from '../series/line';
import { buildHoverSnapshots } from '../snapshots';
import type { CanvasRecorder, RecordedCall } from '../testing/recording-context';
import type { DepthBook } from '../types';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

// Mid 100, spread 2; the nearer outermost level (asks, 104) sits 4 from mid.
const BOOK: DepthBook = {
  bids: [
    [99, 1],
    [97, 2],
    [94, 3],
  ],
  asks: [
    [101, 1],
    [102, 2],
    [104, 4],
  ],
};

/** The overlay canvas owns the pointer listeners. */
function pointerAt(args: { container: HTMLElement; type: string; offsetX: number; deltaY?: number }): void {
  const canvases = args.container.querySelectorAll('canvas');
  const overlay = canvases[canvases.length - 1];
  const event =
    args.type === 'wheel'
      ? new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: args.deltaY ?? -300 })
      : new MouseEvent(args.type, { bubbles: true, button: 0, clientX: args.offsetX, clientY: 100 });
  Object.defineProperty(event, 'offsetX', { value: args.offsetX });
  Object.defineProperty(event, 'offsetY', { value: 100 });
  overlay.dispatchEvent(event);
}

describe('ChartInstance with a depth series', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  function makeChart(options: ChartOptions = {}): ChartInstance {
    container = makeChartContainer();
    chart = new ChartInstance(container, { animations: false, axis: { x: { type: 'numeric' } }, ...options });

    return chart;
  }

  function center(): number {
    const { from, to } = chart.getVisibleRange();

    return (from + to) / 2;
  }

  function halfWidth(): number {
    const { from, to } = chart.getVisibleRange();

    return (to - from) / 2;
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

  it('fails fast on a time axis', () => {
    makeChart({ axis: { x: { type: 'time' } } });

    expect(() => chart.addSeries('depth')).toThrow(/'depth'.*'time'.*'numeric'/);
    expect(chart.getSeriesIds()).toEqual([]);
  });

  it('centers the view on mid, fit to the nearer outermost level', () => {
    makeChart();
    const id = chart.addSeries(DepthSeriesDef);
    chart.setSeriesData(id, BOOK);

    expect(center()).toBeCloseTo(100);
    expect(halfWidth()).toBeCloseTo(4);
  });

  it('takes the half-width from span × mid', () => {
    makeChart();
    const id = chart.addSeries('depth', { span: 0.1 });
    chart.setSeriesData(id, BOOK);

    expect(halfWidth()).toBeCloseTo(10);
  });

  it('fits the Y axis from 0 to the deepest visible cumulative size', () => {
    makeChart({ padding: { top: 0, bottom: 0 } });
    const id = chart.addSeries(DepthSeriesDef);
    chart.setSeriesData(id, BOOK);

    // The window is 96–104: the bids' 94 level is out of view.
    expect(chart.getYRange()).toEqual({ min: 0, max: 7 });
  });

  it('follows mid when a snapshot moves it', () => {
    makeChart();
    const id = chart.addSeries(DepthSeriesDef);
    chart.setSeriesData(id, BOOK);

    const shifted: DepthBook = {
      bids: BOOK.bids.map(([price, size]) => [price + 10, size]),
      asks: BOOK.asks.map(([price, size]) => [price + 10, size]),
    };
    chart.setSeriesData(id, shifted);
    raf.flush(5);

    expect(center()).toBeCloseTo(110);
    expect(halfWidth()).toBeCloseTo(4);
  });

  it('merges level deltas through updateData', () => {
    makeChart();
    const id = chart.addSeries(DepthSeriesDef);
    chart.setSeriesData(id, BOOK);
    chart.updateData(id, {
      asks: [
        [101, 0],
        [103, 5],
      ],
    });
    raf.flush(5);

    // Best ask 102 → mid 100.5.
    expect(center()).toBeCloseTo(100.5);
    expect(chart.getLayerSnapshots(id, 103.5)?.[0]).toMatchObject({ layerIndex: 1, time: 103, value: 7 });
  });

  it('zooms around mid, not around the pointer', () => {
    makeChart({ padding: { left: 0, right: 0 } });
    const id = chart.addSeries(DepthSeriesDef);
    chart.setSeriesData(id, BOOK);

    pointerAt({ container, type: 'wheel', offsetX: 50, deltaY: -100 });
    raf.flush(5);

    expect(center()).toBeCloseTo(100);
    expect(halfWidth()).toBeLessThan(4);

    const zoomed = halfWidth();
    // Past the short lock-out that keeps a stream tick from fighting the wheel.
    vi.spyOn(performance, 'now').mockImplementation(() => 60_000);
    chart.setSeriesData(id, { bids: [[109, 1]], asks: [[111, 1]] });
    raf.flush(5);
    expect(center()).toBeCloseTo(110);
    expect(halfWidth()).toBeCloseTo(zoomed);

    chart.fitContent();
    chart.setSeriesData(id, BOOK);
    raf.flush(5);
    expect(halfWidth()).toBeCloseTo(4);
  });

  it('never widens the view on a zoom-in narrower than one price step', () => {
    makeChart();
    const id = chart.addSeries(DepthSeriesDef);
    chart.setSeriesData(id, { bids: [[99, 1]], asks: [[101, 1]] });
    const before = halfWidth();

    chart.zoomAt(100, 0.8);

    expect(halfWidth()).toBeLessThanOrEqual(before);
  });

  it('keeps narrowing on zoom-in when the price step is wider than the view', () => {
    makeChart();
    const id = chart.addSeries(DepthSeriesDef, { span: 0.01 });
    chart.setSeriesData(id, {
      bids: [
        [99.9, 1],
        [99.8, 1],
        [90, 1],
        [50, 1],
      ],
      asks: [
        [100.1, 1],
        [100.2, 1],
        [110, 1],
        [150, 1],
      ],
    });
    expect(chart.getVisibleRange()).toEqual({ from: 99, to: 101 });

    for (let i = 0; i < 4; i++) {
      const before = halfWidth();
      chart.zoomAt(100, 0.8);
      expect(halfWidth()).toBeLessThan(before);
      expect(center()).toBeCloseTo(100);
    }
  });

  it('eases to a new span at once on a static book, over a user zoom too', () => {
    makeChart();
    const id = chart.addSeries(DepthSeriesDef, { span: 0.04 });
    chart.setSeriesData(id, BOOK);
    expect(chart.getVisibleRange()).toEqual({ from: 96, to: 104 });

    chart.updateSeriesOptions(id, { span: 0.1 });
    expect(chart.getVisibleRange()).toEqual({ from: 90, to: 110 });

    chart.zoomAt(100, 0.5);
    expect(halfWidth()).toBeCloseTo(5);
    chart.updateSeriesOptions(id, { span: 0.04 });
    expect(chart.getVisibleRange()).toEqual({ from: 96, to: 104 });
  });

  it('keeps the view on a replayed, unchanged span after a user zoom', () => {
    makeChart();
    const id = chart.addSeries(DepthSeriesDef, { span: 0.1 });
    chart.setSeriesData(id, BOOK);
    chart.zoomAt(100, 0.5);

    chart.updateSeriesOptions(id, { span: 0.1 });

    expect(halfWidth()).toBeCloseTo(5);
  });

  it('ignores a drag-pan', () => {
    makeChart();
    const id = chart.addSeries(DepthSeriesDef);
    chart.setSeriesData(id, BOOK);
    const before = chart.getVisibleRange();

    pointerAt({ container, type: 'mousedown', offsetX: 400 });
    pointerAt({ container, type: 'mousemove', offsetX: 200 });
    pointerAt({ container, type: 'mouseup', offsetX: 200 });
    chart.pan(5);

    expect(chart.getVisibleRange()).toEqual(before);
    expect(chart.canDragPan()).toBe(false);
  });

  it('lists the hovered side, price and cumulative size in the hover snapshots', () => {
    makeChart();
    const id = chart.addSeries(DepthSeriesDef);
    chart.setSeriesData(id, BOOK);

    const [row] = buildHoverSnapshots(chart, { time: 97.5, cacheKey: 'depth' });
    expect(row.label).toBe('Bids');
    expect(row.data).toMatchObject({ time: 99, value: 1 });

    const [ask] = buildHoverSnapshots(chart, { time: 103, cacheKey: 'depth' });
    expect(ask.label).toBe('Asks');
    expect(ask.data).toMatchObject({ time: 102, value: 3 });
  });
});

/** The highest `rgba()` alpha in a fill style: the color itself, or the full stop of an edge-faded gradient. */
function peakAlpha(fillStyle: string): number {
  const alphas = [...fillStyle.matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map((match) => Number(match[1]));

  return alphas.length > 0 ? Math.max(...alphas) : Number.NaN;
}

describe('ChartInstance depth series motion', () => {
  const reducedMotionStub = globalThis.matchMedia;
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  function canvasSpy(index: 'main' | 'overlay'): CanvasRecorder {
    const canvases = container.querySelectorAll('canvas');
    const canvas = index === 'main' ? canvases[0] : canvases[canvases.length - 1];
    const spy = canvas?.__spy;
    if (!spy) throw new Error('recording canvas not installed');

    return spy;
  }

  beforeEach(() => {
    globalThis.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof globalThis.matchMedia;
    raf = installRaf();
    container = makeChartContainer();
    chart = new ChartInstance(container, {
      axis: { x: { type: 'numeric' } },
      animations: { series: { depth: { intro: 0 } } },
    });
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
    globalThis.matchMedia = reducedMotionStub;
    vi.restoreAllMocks();
  });

  it('keeps the drawn mid at the pane center on every frame of a morph', () => {
    const id = chart.addSeries(DepthSeriesDef);
    const book: DepthBook = {
      bids: [
        [99, 1],
        [95, 1],
      ],
      asks: [
        [101, 1],
        [105, 1],
      ],
    };
    chart.setSeriesData(id, book);
    raf.flush(30);

    const main = canvasSpy('main');
    const center = chart.getLayout().chartArea.width / 2;
    chart.setSeriesData(id, {
      bids: book.bids.map(([price, size]) => [price + 10, size]),
      asks: book.asks.map(([price, size]) => [price + 10, size]),
    });

    const pillXs: number[] = [];
    for (let frame = 0; frame < 25; frame++) {
      main.reset();
      raf.flush(1);
      const pill = main.callsOf('fillText').find((call) => String(call.args[0]).startsWith('mid'));
      if (pill) pillXs.push(Number(pill.args[1]));
    }

    expect(pillXs.length).toBeGreaterThan(10);
    for (const x of pillXs) {
      expect(Math.abs(x - center)).toBeLessThanOrEqual(1);
    }
    expect(halfWidthOf(chart)).toBeCloseTo(5);
  });

  it('keeps painting the overlay after one mousemove until the hover glow settles', () => {
    const id = chart.addSeries(DepthSeriesDef);
    chart.setSeriesData(id, BOOK);
    raf.flush(30);

    const overlay = canvasSpy('overlay');
    overlay.reset();
    pointerAt({ container, type: 'mousemove', offsetX: chart.timeScale.timeToX(97.5) });
    raf.flush(60);

    const glowAlphas = overlay
      .callsOf('fill')
      .map((call) => peakAlpha(call.fillStyle))
      .filter((alpha) => alpha > 0.05 && alpha <= 0.22);
    expect(Math.max(...glowAlphas)).toBeCloseTo(0.22);

    // Settled: the overlay goes quiet until something changes.
    overlay.reset();
    raf.flush(10);
    expect(overlay.calls.length).toBe(0);
  });

  it('fades the hover glow out after mouseleave, then stops painting', () => {
    const id = chart.addSeries(DepthSeriesDef);
    chart.setSeriesData(id, BOOK);
    raf.flush(30);
    pointerAt({ container, type: 'mousemove', offsetX: chart.timeScale.timeToX(97.5) });
    raf.flush(60);

    const overlay = canvasSpy('overlay');
    overlay.reset();
    pointerAt({ container, type: 'mouseleave', offsetX: 0 });

    const glowPerFrame: number[] = [];
    for (let frame = 0; frame < 60; frame++) {
      const before = overlay.calls.length;
      raf.flush(1);
      const frameCalls = overlay.calls.slice(before);
      const glow = frameCalls
        .filter((call) => call.method === 'fill')
        .map((call) => peakAlpha(call.fillStyle))
        .filter((alpha) => alpha > 0 && alpha < 0.22);
      if (glow.length > 0) glowPerFrame.push(Math.max(...glow));
    }

    // Several frames of a shrinking glow, not a single cut.
    expect(glowPerFrame.length).toBeGreaterThan(3);
    for (let i = 1; i < glowPerFrame.length; i++) {
      expect(glowPerFrame[i]).toBeLessThan(glowPerFrame[i - 1]);
    }

    // Faded out: the last pass cleared the layer and nothing paints after it.
    const lastClear = overlay.calls.map((call) => call.method).lastIndexOf('clearRect');
    expect(overlay.calls.slice(lastClear + 1).filter((call) => call.method === 'fill')).toHaveLength(0);
    overlay.reset();
    raf.flush(10);
    expect(overlay.calls.length).toBe(0);
  });

  it('reports the drawn view in the animation state mid-morph', () => {
    const id = chart.addSeries(DepthSeriesDef);
    const book: DepthBook = {
      bids: [
        [99, 1],
        [95, 1],
      ],
      asks: [
        [101, 1],
        [105, 1],
      ],
    };
    chart.setSeriesData(id, book);
    raf.flush(30);

    chart.setSeriesData(id, {
      bids: book.bids.map(([price, size]) => [price + 10, size]),
      asks: book.asks.map(([price, size]) => [price + 10, size]),
    });
    raf.flush(4);

    const { from, to } = chart.getAnimationState().xRange;
    const drawn = chart.timeScale.getRange();
    expect((from + to) / 2).toBeGreaterThan(100.5);
    expect((from + to) / 2).toBeLessThan(109.5);
    expect(from).toBeCloseTo(drawn.from);
    expect(to).toBeCloseTo(drawn.to);
  });
});

describe('ChartInstance with a hidden depth series', () => {
  const reducedMotionStub = globalThis.matchMedia;
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;
  let requested = 0;

  beforeEach(() => {
    globalThis.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof globalThis.matchMedia;
    raf = installRaf();
    const fakeRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      requested++;

      return fakeRaf(cb);
    };
    container = makeChartContainer();
    chart = new ChartInstance(container, { axis: { x: { type: 'numeric' } } });
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
    globalThis.matchMedia = reducedMotionStub;
    vi.restoreAllMocks();
  });

  /** Frames requested over `frames` more frames, once the hidden series had time to settle. */
  function framesAfterSettling(): number {
    raf.flush(200);
    requested = 0;
    raf.flush(5);

    return requested;
  }

  it('stops the render loop when hidden during the intro', () => {
    const id = chart.addSeries(DepthSeriesDef);
    chart.setSeriesData(id, BOOK);
    raf.flush(2);

    chart.setSeriesVisible(id, false);

    expect(framesAfterSettling()).toBe(0);
  });

  it('stops the render loop when hidden during a morph', () => {
    const id = chart.addSeries(DepthSeriesDef, { introMs: 0 });
    chart.setSeriesData(id, BOOK);
    raf.flush(30);

    chart.setSeriesData(id, { bids: [[98, 2]], asks: [[103, 2]] });
    raf.flush(1);
    chart.setSeriesVisible(id, false);

    expect(framesAfterSettling()).toBe(0);
  });
});

function halfWidthOf(chart: ChartInstance): number {
  const { from, to } = chart.getVisibleRange();

  return (to - from) / 2;
}

describe('overlay after mouseleave', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  beforeEach(() => {
    raf = installRaf();
    container = makeChartContainer();
    chart = new ChartInstance(container, { animations: false });
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  it('leaves no stale crosshair pixels on a line chart', () => {
    const id = chart.addSeries(LineSeriesDef);
    chart.setSeriesData(
      id,
      Array.from({ length: 20 }, (_, i) => ({ time: 1_000_000 + i * 60_000, value: 10 + (i % 5) })),
    );
    raf.flush(10);
    pointerAt({ container, type: 'mousemove', offsetX: 400 });
    raf.flush(5);

    const canvases = container.querySelectorAll('canvas');
    const overlay = canvases[canvases.length - 1].__spy;
    if (!overlay) throw new Error('recording canvas not installed');
    expect(overlay.countOf('arc')).toBeGreaterThan(0);

    pointerAt({ container, type: 'mouseleave', offsetX: 0 });
    raf.flush(10);

    const methods = overlay.calls.map((call) => call.method);
    const afterLastClear = methods.slice(methods.lastIndexOf('clearRect') + 1);
    const drawing = ['arc', 'stroke', 'fill', 'fillRect', 'fillText'];
    expect(afterLastClear.filter((method) => drawing.includes(method))).toEqual([]);

    overlay.reset();
    raf.flush(10);
    expect(overlay.calls.length).toBe(0);
  });
});

describe('X edge fade on an order book', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  beforeEach(() => {
    raf = installRaf();
  });

  afterEach(() => {
    chart?.destroy();
    container?.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  /** The full-height erase rects the main layer paints for its edge fades; `setup` adds the series. */
  function fadeRects(args: { options?: ChartOptions; setup?: (target: ChartInstance) => void } = {}): RecordedCall[] {
    container = makeChartContainer();
    chart = new ChartInstance(container, { animations: false, axis: { x: { type: 'numeric' } }, ...args.options });
    const spy = container.querySelector('canvas')?.__spy;
    if (!spy) throw new Error('recording canvas not installed');

    const setup = args.setup ?? addBook;
    setup(chart);
    raf.flush();

    const fullHeight = (call: RecordedCall) => call.args[1] === 0;

    return spy
      .callsOf('fillRect')
      .filter((call) => call.globalCompositeOperation === 'destination-out' && fullHeight(call));
  }

  function addBook(target: ChartInstance): string {
    const id = target.addSeries(DepthSeriesDef);
    target.setSeriesData(id, BOOK);

    return id;
  }

  /** A line across the book's price range, which a drag can pan under the axis. */
  function addLine(target: ChartInstance): void {
    const id = target.addSeries(LineSeriesDef);
    target.setSeriesData(
      id,
      Array.from({ length: 21 }, (_, i) => ({ time: 90 + i, value: 1 + (i % 3) })),
    );
  }

  it('fades neither wall by default: the book never scrolls under the axis', () => {
    expect(fadeRects()).toEqual([]);
  });

  it('turns the auto fade off for a line beside a book on its mid, as drag-pan is', () => {
    const rects = fadeRects({
      setup: (target) => {
        addBook(target);
        addLine(target);
      },
    });

    expect(chart.canDragPan()).toBe(false);
    expect(rects).toEqual([]);
  });

  it('keeps the auto fade for a line while the book is empty', () => {
    const rects = fadeRects({
      setup: (target) => {
        target.addSeries(DepthSeriesDef);
        addLine(target);
      },
    });

    expect(chart.canDragPan()).toBe(true);
    expect(rects.length).toBeGreaterThan(0);
  });

  it('keeps the auto fade for a line while the book is hidden', () => {
    const rects = fadeRects({
      setup: (target) => {
        const book = addBook(target);
        addLine(target);
        target.setSeriesVisible(book, false);
      },
    });

    expect(chart.canDragPan()).toBe(true);
    expect(rects.length).toBeGreaterThan(0);
  });

  it('keeps a fade that is set explicitly', () => {
    const rects = fadeRects({ options: { fade: { right: 40 } } });

    expect(rects.some((call) => call.args[2] === 40)).toBe(true);
  });
});

describe('Order book fill fade', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  beforeEach(() => {
    raf = installRaf();
  });

  afterEach(() => {
    chart?.destroy();
    container?.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  function mount(args: { width?: number; fillFade?: number } = {}): { main: CanvasRecorder; overlay: CanvasRecorder } {
    container = makeChartContainer(args.width);
    chart = new ChartInstance(container, { animations: false, axis: { x: { type: 'numeric' } } });
    const canvases = container.querySelectorAll('canvas');
    const main = canvases[0]?.__spy;
    const overlay = canvases[canvases.length - 1]?.__spy;
    if (!main || !overlay) throw new Error('recording canvas not installed');

    const id = chart.addSeries(DepthSeriesDef, args.fillFade === undefined ? {} : { fillFade: args.fillFade });
    chart.setSeriesData(id, BOOK);
    raf.flush();

    return { main, overlay };
  }

  /** The first frame on the layer the main pass copied in: its fills and the alpha mask over them. */
  function layerFrame(main: CanvasRecorder): { fills: number; stops: Array<{ offset: number; alpha: number }> } {
    const copied = main.callsOf('drawImage')[0]?.args[0];
    const calls = copied instanceof HTMLCanvasElement ? copied.__spy?.calls : undefined;
    if (!calls) throw new Error('no layer was copied in');

    const maskAt = calls.findIndex(
      (call) => call.method === 'fillRect' && call.globalCompositeOperation === 'destination-in',
    );
    const fills = calls.slice(0, maskAt).filter((call) => call.method === 'fill').length;
    const stops = [...String(calls[maskAt]?.fillStyle).matchAll(/([\d.]+):rgba\([^)]*,\s*([\d.]+)\)/g)].map(
      (match) => ({ offset: Number(match[1]), alpha: Number(match[2]) }),
    );

    return { fills, stops };
  }

  it('fades the fills toward both side edges on a layer, then strokes the lines unfaded', () => {
    const { main } = mount();
    const { fills, stops } = layerFrame(main);
    const paneWidth = chart.getLayout().chartArea.width;

    expect(fills).toBe(2);
    expect(main.matchesSequence(['drawImage', 'stroke', 'stroke'])).toBe(true);
    expect(stops).toContainEqual({ offset: 0, alpha: 0 });
    expect(stops).toContainEqual({ offset: 1, alpha: 0 });
    expect(stops.find((stop) => stop.alpha === 1)?.offset).toBeCloseTo(140 / paneWidth);
  });

  it('caps the fade at a third of a narrow plot', () => {
    const { main } = mount({ width: 300 });
    const { stops } = layerFrame(main);

    expect(stops.find((stop) => stop.alpha === 1)?.offset).toBeCloseTo(1 / 3);
  });

  it('fades the hover glow with the fill', () => {
    const { overlay } = mount();
    pointerAt({ container, type: 'mousemove', offsetX: chart.timeScale.timeToX(97.5) });
    raf.flush(60);

    const glow = overlay.callsOf('fill').find((call) => call.fillStyle.startsWith('gradient('));

    expect(glow?.fillStyle).toMatch(/^gradient\(linear;0:rgba\([^)]*, 0\)/);
  });

  it('paints the fills straight on the main canvas with `fillFade: 0`', () => {
    const { main } = mount({ fillFade: 0 });

    expect(main.countOf('drawImage')).toBe(0);
    expect(main.matchesSequence(['fill', 'fill', 'stroke', 'stroke'])).toBe(true);
  });
});

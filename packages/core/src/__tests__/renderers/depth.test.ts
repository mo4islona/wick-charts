import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DepthRenderer, blendShapes, cumulativeShape } from '../../series/depth';
import type { RecordedCall } from '../../testing/recording-context';
import { resolveCandlestickBodyColor } from '../../theme/resolve';
import { catppuccin } from '../../theme/themes/catppuccin';
import type { DepthBook, DepthSeriesOptions } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

// Default context: price p lands at x = 8p, size v at y = 400 - 4v.
const xOf = (price: number): number => price * 8;
const yOf = (value: number): number => 400 - value * 4;

const BID_COLOR = resolveCandlestickBodyColor(catppuccin.theme.candlestick.up.body);
const ASK_COLOR = resolveCandlestickBodyColor(catppuccin.theme.candlestick.down.body);

// Mid 50, spread 2. Cumulative bids: 49 → 2, 48 → 5, 45 → 10; asks: 51 → 1, 53 → 5.
const BOOK: DepthBook = {
  bids: [
    [48, 3],
    [45, 5],
    [49, 2],
  ],
  asks: [
    [53, 4],
    [51, 1],
  ],
};

const STILL: Partial<DepthSeriesOptions> = { introMs: 0, updateMs: 0 };

/** The global test setup reports `prefers-reduced-motion: reduce`; tween tests swap in a motion-allowing one. */
const reducedMotionStub = globalThis.matchMedia;

function allowMotion(): void {
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
}

function makeRenderer(options: Partial<DepthSeriesOptions> = STILL): DepthRenderer {
  return new DepthRenderer({ options, theme: catppuccin.theme });
}

function render(renderer: DepthRenderer) {
  const built = buildRenderContext();
  renderer.render(built.ctx);

  return built;
}

/** Vertices of the last path stroked in `color`. */
function strokedPath(calls: readonly RecordedCall[], color: string): Array<{ x: number; y: number }> {
  let path: Array<{ x: number; y: number }> = [];
  let stroked: Array<{ x: number; y: number }> = [];
  for (const call of calls) {
    if (call.method === 'beginPath') path = [];
    if (call.method === 'moveTo' || call.method === 'lineTo') {
      path.push({ x: Number(call.args[0]), y: Number(call.args[1]) });
    }
    if (call.method === 'stroke' && call.strokeStyle === color) stroked = path;
  }

  return stroked;
}

/** The drawn wall height at `price` — the Y of the stroked step over it. */
function drawnYAt(calls: readonly RecordedCall[], args: { color: string; price: number }): number {
  const path = strokedPath(calls, args.color);
  const x = xOf(args.price);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const horizontal = a.y === b.y;
    if (horizontal && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x)) return a.y;
  }

  throw new Error(`no horizontal step over ${args.price}`);
}

describe('depth cumulative math', () => {
  it('accumulates bids from the best bid down and asks from the best ask up, whatever the input order', () => {
    const bids = cumulativeShape({ levels: new Map(BOOK.bids), side: 0 });
    const asks = cumulativeShape({ levels: new Map(BOOK.asks), side: 1 });

    expect(bids.keys).toEqual([-49, -48, -45]);
    expect(bids.values).toEqual([2, 5, 10]);
    expect(asks.keys).toEqual([51, 53]);
    expect(asks.values).toEqual([1, 5]);
  });

  it('blends two step functions on the union of their breakpoints', () => {
    const from = { keys: [51, 53], values: [1, 5] };
    const to = { keys: [52, 53], values: [3, 7] };

    expect(blendShapes({ from, to, t: 0 })).toEqual(from);
    expect(blendShapes({ from, to, t: 1 })).toEqual(to);
    expect(blendShapes({ from, to, t: 0.5 })).toEqual({ keys: [51, 52, 53], values: [0.5, 2, 6] });
  });
});

describe('DepthRenderer geometry', () => {
  it('draws each wall as steps from mid out to the pane edge', () => {
    const renderer = makeRenderer();
    renderer.setData(BOOK);
    const { spy } = render(renderer);

    const asks = strokedPath(spy.calls, ASK_COLOR);
    expect(asks.slice(0, 6)).toEqual([
      { x: xOf(50), y: yOf(0) },
      { x: xOf(51), y: yOf(0) },
      { x: xOf(51), y: yOf(1) },
      { x: xOf(53), y: yOf(1) },
      { x: xOf(53), y: yOf(5) },
      { x: expect.any(Number), y: yOf(5) },
    ]);
    expect(asks[5].x).toBeGreaterThanOrEqual(800);

    const bids = strokedPath(spy.calls, BID_COLOR);
    expect(bids.map((p) => p.y)).toEqual([yOf(0), yOf(0), yOf(2), yOf(2), yOf(5), yOf(5), yOf(10), yOf(10)]);
    expect(bids[bids.length - 1].x).toBeLessThanOrEqual(0);
  });

  it('fills each wall with a vertical gradient before stroking it', () => {
    const renderer = makeRenderer();
    renderer.setData(BOOK);
    const { spy } = render(renderer);

    expect(spy.countOf('createLinearGradient')).toBe(2);
    expect(spy.matchesSequence(['fill', 'stroke', 'fill', 'stroke'])).toBe(true);
  });

  it('marks mid with a dashed line and a mid · spread label', () => {
    const renderer = makeRenderer();
    renderer.setData(BOOK);
    const { spy } = render(renderer);

    const dash = spy.callsOf('setLineDash').find((call) => (call.args[0] as number[]).length > 0);
    expect(dash).toBeDefined();
    expect(spy.callsOf('fillText').map((call) => call.args[0])).toEqual(['mid 50 · spread 2']);

    const midLine = spy.callsOf('moveTo').find((call) => call.args[0] === xOf(50) + 0.5);
    expect(midLine).toBeDefined();
  });

  it('prints a fractional mid with one decimal more than the prices', () => {
    const renderer = makeRenderer();
    renderer.setData({ bids: [[49.5, 1]], asks: [[50.25, 1]] });
    const { spy } = render(renderer);

    expect(spy.callsOf('fillText')[0].args[0]).toBe('mid 49.875 · spread 0.75');
  });

  it('takes per-side color overrides', () => {
    const renderer = makeRenderer({ ...STILL, bidColor: '#00ff00', askColor: '#ff00ff' });
    renderer.setData(BOOK);
    const { spy } = render(renderer);

    expect(strokedPath(spy.calls, '#00ff00').length).toBeGreaterThan(0);
    expect(strokedPath(spy.calls, '#ff00ff').length).toBeGreaterThan(0);
    expect(renderer.getLayerColors()).toEqual(['#00ff00', '#ff00ff']);
  });

  it('draws nothing without data', () => {
    const renderer = makeRenderer();
    renderer.setData({ bids: [], asks: [] });
    const { spy } = render(renderer);

    expect(spy.calls.length).toBe(0);
  });
});

describe('DepthRenderer queries', () => {
  it('reports the price bounds, the price steps and the visible depth', () => {
    const renderer = makeRenderer();
    renderer.setData(BOOK);

    expect(renderer.getTimeBounds()).toEqual({ first: 45, last: 53 });
    expect(renderer.sampleTimes(10)).toEqual([45, 48, 49, 51, 53]);
    expect(renderer.getValueRange(46, 52)).toEqual({ min: 0, max: 5 });
    expect(renderer.getValueRange(40, 60)).toEqual({ min: 0, max: 10 });
  });

  it('centers its focus on mid, fit to the nearer outermost level or to the span', () => {
    const fit = makeRenderer();
    fit.setData(BOOK);
    expect(fit.getXFocus()).toEqual({ center: 50, drawnCenter: 50, halfWidth: 3 });

    const spanned = makeRenderer({ ...STILL, span: 0.1 });
    spanned.setData(BOOK);
    expect(spanned.getXFocus()).toEqual({ center: 50, drawnCenter: 50, halfWidth: 5 });
  });

  it('snapshots the hovered side: its level price and cumulative size', () => {
    const renderer = makeRenderer();
    renderer.setData(BOOK);

    expect(renderer.getLayerSnapshots(46)).toEqual([{ layerIndex: 0, time: 48, value: 5, color: BID_COLOR, x: 48 }]);
    expect(renderer.getLayerSnapshots(54)).toEqual([{ layerIndex: 1, time: 53, value: 5, color: ASK_COLOR, x: 53 }]);
    expect(renderer.getLayerSnapshots(50.5)).toBeNull();
  });

  it('leaves a hidden side out of the snapshot and the Y range', () => {
    const renderer = makeRenderer();
    renderer.setData(BOOK);
    renderer.setLayerVisible(0, false);

    expect(renderer.getLayerSnapshots(46)).toBeNull();
    expect(renderer.getValueRange(40, 52)).toEqual({ min: 0, max: 1 });
  });

  it('reports the top of the book as the last snapshots', () => {
    const renderer = makeRenderer();
    renderer.setData(BOOK);

    expect(renderer.getLayerLastSnapshots()?.map((s) => [s.layerIndex, s.time, s.value])).toEqual([
      [0, 49, 2],
      [1, 51, 1],
    ]);
  });
});

describe('DepthRenderer level deltas', () => {
  afterEach(() => {
    globalThis.matchMedia = reducedMotionStub;
  });

  it('merges levels and removes one whose size is 0', () => {
    const renderer = makeRenderer();
    renderer.setData(BOOK);
    renderer.updateLastPoint({
      asks: [
        [51, 0],
        [52, 2],
      ],
    });

    expect(renderer.getLayerSnapshots(60)).toEqual([{ layerIndex: 1, time: 53, value: 6, color: ASK_COLOR, x: 53 }]);
    expect(renderer.getXFocus()?.center).toBe(50.5);

    const { spy } = render(renderer);
    expect(spy.callsOf('fillText')[0].args[0]).toBe('mid 50.5 · spread 3');
  });

  it('ignores a fresh snapshot of the same book, so a re-render replays no morph', () => {
    allowMotion();
    const renderer = makeRenderer({ introMs: 0, updateMs: 300 });
    const listener = vi.fn();
    renderer.onDataChanged(listener);

    renderer.setData(BOOK);
    renderer.setData({ bids: BOOK.bids.map((level) => [...level]), asks: [...BOOK.asks].reverse() });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(renderer.needsAnimation).toBe(false);

    renderer.setData({ bids: BOOK.bids, asks: [...BOOK.asks, [60, 1]] });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(renderer.needsAnimation).toBe(true);
  });

  it('notifies its data listeners on a snapshot and on a delta', () => {
    const renderer = makeRenderer();
    const listener = vi.fn();
    renderer.onDataChanged(listener);

    renderer.setData(BOOK);
    renderer.updateLastPoint({ bids: [[47, 1]] });

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('DepthRenderer input validation', () => {
  // The raw Binance `/api/v3/depth` payload: levels are decimal strings.
  const STRING_BOOK = {
    lastUpdateId: 1,
    bids: [
      ['83025.91000000', '1.06184000'],
      ['83025.90000000', '0.00012000'],
    ],
    asks: [['83025.92000000', '2.50000000']],
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns once, naming the first rejected level, when a book carries string levels', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const renderer = makeRenderer();

    renderer.setData(STRING_BOOK);
    renderer.setData(STRING_BOOK);
    renderer.updateLastPoint({ asks: [['83026', '1']] });

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('depth: skipping 3 levels');
    expect(message).toContain('["83025.91000000", "1.06184000"]');
    expect(message).toContain('Number(price)');
    expect(renderer.getTotalLength()).toBe(0);
  });

  it('keeps the valid levels of a book and a delta, warning about the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const renderer = makeRenderer();

    renderer.setData({ bids: [[49, 2], [48, Number.NaN], { price: 47, size: 1 }], asks: [[51, 1]] });
    renderer.updateLastPoint({
      asks: [
        [52, Number.POSITIVE_INFINITY],
        [53, 4],
      ],
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('skipping 2 levels');
    expect(renderer.getTotalLength()).toBe(3);
    expect(renderer.getTimeBounds()).toEqual({ first: 49, last: 53 });
  });

  it('stays silent for a numeric book, an empty book and zero-size levels', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const renderer = makeRenderer();

    renderer.setData(BOOK);
    renderer.setData({ bids: [], asks: [] });
    renderer.setData(null);
    renderer.updateLastPoint({ bids: [[49, 0]] });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('DepthRenderer animation', () => {
  let now = 1000;

  beforeEach(() => {
    allowMotion();
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    globalThis.matchMedia = reducedMotionStub;
    vi.restoreAllMocks();
  });

  it('grows both walls out from mid behind a reveal front, fading the mid marker in', () => {
    const renderer = makeRenderer({ introMs: 500, updateMs: 300 });
    renderer.setData(BOOK);

    let built = render(renderer);
    expect(renderer.getIntroFront()).toBe(0);
    expect(strokedPath(built.spy.calls, ASK_COLOR).every((p) => p.x === xOf(50))).toBe(true);
    expect(built.spy.countOf('fillText')).toBe(0);

    now += 500;
    built = render(renderer);
    const front = renderer.getIntroFront();
    expect(front).toBeCloseTo(0.5);
    // Each wall ends at the front, 400 * front px out from mid.
    const asks = strokedPath(built.spy.calls, ASK_COLOR);
    const bids = strokedPath(built.spy.calls, BID_COLOR);
    expect(asks[asks.length - 1].x).toBeCloseTo(xOf(50) + 400 * front);
    expect(bids[bids.length - 1].x).toBeCloseTo(xOf(50) - 400 * front);
    // The wave reaches the inner levels first.
    expect(drawnYAt(built.spy.calls, { color: ASK_COLOR, price: 52 })).toBeLessThan(yOf(0.5));

    now += 500;
    built = render(renderer);
    expect(renderer.getIntroFront()).toBe(1);
    expect(renderer.needsAnimation).toBe(false);
    expect(built.spy.countOf('rect')).toBe(0);
    expect(drawnYAt(built.spy.calls, { color: ASK_COLOR, price: 54 })).toBe(yOf(5));
  });

  it('puts no path vertex beyond the reveal front during the intro', () => {
    const renderer = makeRenderer({ introMs: 500, updateMs: 300 });
    renderer.setData(BOOK);

    for (let frame = 0; frame <= 12; frame++) {
      const { spy } = render(renderer);
      const reach = 400 * renderer.getIntroFront();
      const walls = [...strokedPath(spy.calls, ASK_COLOR), ...strokedPath(spy.calls, BID_COLOR)];
      expect(walls.length).toBeGreaterThan(0);
      for (const { x } of walls) {
        expect(Math.abs(x - xOf(50))).toBeLessThanOrEqual(reach + 1e-9);
      }

      now += 80;
    }
  });

  it('never draws the cumulative lower further out from mid during the intro', () => {
    const renderer = makeRenderer({ introMs: 500, updateMs: 300 });
    // A big level by mid and a small one far out: the far one's rise lags the near one's.
    renderer.setData({
      bids: [
        [49, 4],
        [20, 1],
      ],
      asks: [
        [51, 4],
        [80, 1],
      ],
    });

    for (let frame = 0; frame <= 12; frame++) {
      const { spy } = render(renderer);
      // Canvas Y grows downward: deeper is a smaller y.
      const asks = strokedPath(spy.calls, ASK_COLOR).map((p) => p.y);
      const bids = strokedPath(spy.calls, BID_COLOR).map((p) => p.y);
      for (let i = 1; i < asks.length; i++) {
        expect(asks[i]).toBeLessThanOrEqual(asks[i - 1]);
      }
      for (let i = 1; i < bids.length; i++) {
        expect(bids[i]).toBeLessThanOrEqual(bids[i - 1]);
      }

      now += 80;
    }
  });

  it('morphs the drawn steps to a new snapshot over updateMs, growing new levels in', () => {
    const renderer = makeRenderer({ introMs: 0, updateMs: 300 });
    renderer.setData(BOOK);
    render(renderer);

    renderer.setData({ ...BOOK, asks: [...BOOK.asks, [55, 2]] });
    expect(renderer.needsAnimation).toBe(true);
    expect(drawnYAt(render(renderer).spy.calls, { color: ASK_COLOR, price: 56 })).toBe(yOf(5));

    now += 150;
    const midway = drawnYAt(render(renderer).spy.calls, { color: ASK_COLOR, price: 56 });
    expect(midway).toBeLessThan(yOf(5));
    expect(midway).toBeGreaterThan(yOf(7));

    now += 150;
    expect(drawnYAt(render(renderer).spy.calls, { color: ASK_COLOR, price: 56 })).toBe(yOf(7));
    expect(renderer.needsAnimation).toBe(false);
  });

  it('retargets from the shape on screen when an update lands mid-morph', () => {
    const renderer = makeRenderer({ introMs: 0, updateMs: 300 });
    renderer.setData(BOOK);
    render(renderer);

    renderer.setData({ ...BOOK, asks: [[51, 9]] });
    now += 100;
    const before = drawnYAt(render(renderer).spy.calls, { color: ASK_COLOR, price: 52 });

    renderer.setData({ ...BOOK, asks: [[51, 1]] });
    const after = drawnYAt(render(renderer).spy.calls, { color: ASK_COLOR, price: 52 });
    expect(after).toBeCloseTo(before);

    now += 300;
    expect(drawnYAt(render(renderer).spy.calls, { color: ASK_COLOR, price: 52 })).toBe(yOf(1));
  });

  it('keeps no breakpoint of a level that faded out over a chain of updates', () => {
    const renderer = makeRenderer({ introMs: 0, updateMs: 300 });
    const shifted = (offset: number): DepthBook => ({
      bids: BOOK.bids.map(([price, size]) => [price + offset, size]),
      asks: BOOK.asks.map(([price, size]) => [price + offset, size]),
    });
    renderer.setData(BOOK);
    render(renderer);

    for (let i = 1; i <= 60; i++) {
      now += 100;
      renderer.setData(shifted(i * 0.25));
    }

    // 2 vertices per step: the 2 live levels plus the handful still fading, not one per past update.
    const asks = strokedPath(render(renderer).spy.calls, ASK_COLOR);
    expect(asks.length).toBeLessThan(40);
  });

  it('pins a level fading out across mid to mid, so each wall stays on its side', () => {
    const renderer = makeRenderer({ introMs: 0, updateMs: 300 });
    renderer.setData(BOOK);
    render(renderer);

    // The book moves up 4: the old asks at 51 and 53 now sit at or below the new mid 54.
    renderer.setData({
      bids: BOOK.bids.map(([price, size]) => [price + 4, size]),
      asks: BOOK.asks.map(([price, size]) => [price + 4, size]),
    });
    now += 100;
    const { spy } = render(renderer);

    // Both walls start from the gliding mid on the baseline.
    const asks = strokedPath(spy.calls, ASK_COLOR);
    const bids = strokedPath(spy.calls, BID_COLOR);
    const midX = asks[0].x;
    expect(midX).toBeGreaterThan(xOf(50));
    expect(bids[0]).toEqual({ x: midX, y: yOf(0) });
    expect(Math.min(...asks.map((p) => p.x))).toBeGreaterThanOrEqual(midX);
    expect(Math.max(...bids.map((p) => p.x))).toBeLessThanOrEqual(midX);
    // The ask that faded across mid rises at mid instead of left of it.
    expect(asks[1].x).toBe(midX);
    expect(asks[2].x).toBe(midX);
  });

  it('glides the mid marker to the new mid', () => {
    const renderer = makeRenderer({ introMs: 0, updateMs: 300 });
    renderer.setData(BOOK);
    render(renderer);

    renderer.setData({ bids: [[51, 1]], asks: [[53, 1]] });
    now += 150;
    const midX = (spy: ReturnType<typeof render>['spy']) =>
      Number(spy.callsOf('moveTo').find((call) => call.strokeStyle !== BID_COLOR && call.args[1] !== yOf(0))?.args[0]);
    const gliding = midX(render(renderer).spy);
    expect(gliding).toBeGreaterThan(xOf(50) + 0.5);
    expect(gliding).toBeLessThan(xOf(52) + 0.5);

    now += 150;
    expect(midX(render(renderer).spy)).toBe(xOf(52) + 0.5);
  });

  it('snaps to the final frame with animations off', () => {
    const renderer = makeRenderer(STILL);
    renderer.setData(BOOK);
    render(renderer);

    renderer.setData({ ...BOOK, asks: [[51, 9]] });
    expect(renderer.needsAnimation).toBe(false);
    expect(drawnYAt(render(renderer).spy.calls, { color: ASK_COLOR, price: 52 })).toBe(yOf(9));
  });

  it('snaps to the final frame under prefers-reduced-motion', () => {
    globalThis.matchMedia = reducedMotionStub;
    const renderer = makeRenderer({ introMs: 500, updateMs: 300 });
    renderer.setData(BOOK);
    expect(renderer.getIntroFront()).toBe(1);
    render(renderer);

    renderer.setData({ ...BOOK, asks: [[51, 9]] });
    expect(renderer.needsAnimation).toBe(false);
    expect(drawnYAt(render(renderer).spy.calls, { color: ASK_COLOR, price: 52 })).toBe(yOf(9));
  });
});

describe('DepthRenderer hover', () => {
  let now = 1000;

  beforeEach(() => {
    allowMotion();
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    globalThis.matchMedia = reducedMotionStub;
    vi.restoreAllMocks();
  });

  function hover(renderer: DepthRenderer, price: number | null) {
    const built = buildRenderContext();
    const crosshair = price === null ? null : { mediaX: price * 8, mediaY: 0, time: price, y: 0 };
    renderer.drawOverlay(built.overlayCtx(crosshair));

    return built;
  }

  it('snaps a dot onto the level of the step under the pointer and brightens the area back to mid', () => {
    const renderer = makeRenderer({ introMs: 0, updateMs: 300 });
    renderer.setData(BOOK);
    render(renderer);

    const { spy } = hover(renderer, 46);
    const dot = spy.callsOf('arc').at(-1);
    // At 46 the bids from 49 down to 48 are counted: the step tops out at level 48.
    expect(dot?.args.slice(0, 2)).toEqual([xOf(48), yOf(5)]);
    expect(spy.callsOf('fill').at(-1)?.fillStyle).toBe(BID_COLOR);

    const clip = spy.callsOf('rect')[0].args;
    expect(clip.slice(0, 3)).toEqual([xOf(46), 0, xOf(50) - xOf(46)]);
    expect(renderer.overlayNeedsAnimation).toBe(true);
  });

  it('eases the highlight in while hovered and out after the pointer leaves', () => {
    const renderer = makeRenderer({ introMs: 0, updateMs: 300 });
    renderer.setData(BOOK);
    render(renderer);

    const highlightAlpha = (spy: ReturnType<typeof hover>['spy']) =>
      spy.callsOf('stroke').find((call) => call.strokeStyle === BID_COLOR)?.globalAlpha ?? 0;

    const first = highlightAlpha(hover(renderer, 46).spy);
    now += 16;
    const second = highlightAlpha(hover(renderer, 46).spy);
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);

    for (let i = 0; i < 30; i++) {
      now += 16;
      hover(renderer, 46);
    }
    now += 16;
    const leaving = highlightAlpha(hover(renderer, null).spy);
    expect(leaving).toBeGreaterThan(0);
    expect(leaving).toBeLessThan(1);

    for (let i = 0; i < 60; i++) {
      now += 16;
      hover(renderer, null);
    }
    expect(renderer.overlayNeedsAnimation).toBe(false);
  });

  it('shows no dot and no glow ahead of the intro reveal', () => {
    const renderer = makeRenderer({ introMs: 500, updateMs: 300 });
    renderer.setData(BOOK);
    render(renderer);

    const { spy } = hover(renderer, 46);
    expect(spy.calls.length).toBe(0);
    expect(renderer.overlayNeedsAnimation).toBe(false);
  });

  it("keeps the dot on its wall's side of the drawn mid when a level fades across it", () => {
    const renderer = makeRenderer({ introMs: 0, updateMs: 300 });
    renderer.setData(BOOK);
    render(renderer);

    // The book moves up 4; 100 ms in, the drawn mid is past the old best ask at 51.
    renderer.setData({
      bids: BOOK.bids.map(([price, size]) => [price + 4, size]),
      asks: BOOK.asks.map(([price, size]) => [price + 4, size]),
    });
    now += 100;
    const midX = strokedPath(render(renderer).spy.calls, ASK_COLOR)[0].x;
    const midPrice = midX / 8;

    // Just right of mid the step under the pointer tops out at the fading 51.
    const { spy } = hover(renderer, midPrice + 0.05);
    const dot = spy.callsOf('arc').at(-1);
    expect(Number(dot?.args[0])).toBeCloseTo(midX);
  });

  it('rests the glow at 0 when the book empties while it fades out', () => {
    const renderer = makeRenderer({ introMs: 0, updateMs: 300 });
    renderer.setData(BOOK);
    render(renderer);

    for (let i = 0; i < 30; i++) {
      now += 16;
      hover(renderer, 46);
    }
    now += 16;
    hover(renderer, null);
    expect(renderer.overlayNeedsAnimation).toBe(true);

    renderer.setData({ bids: [], asks: [] });
    now += 400;
    render(renderer);
    now += 16;
    hover(renderer, null);

    expect(renderer.overlayNeedsAnimation).toBe(false);
  });

  it('shows no dot in the spread', () => {
    const renderer = makeRenderer();
    renderer.setData(BOOK);
    render(renderer);

    expect(hover(renderer, 50.5).spy.countOf('arc')).toBe(0);
  });
});

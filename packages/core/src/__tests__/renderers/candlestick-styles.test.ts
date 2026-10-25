import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimeSeriesStore } from '../../data/store';
import { CandlestickRenderer } from '../../series/candlestick';
import { wickBodyIntro } from '../../series/candlestick-intro';
import { hollowCandle, ohlcBar } from '../../series/painters/builtins';
import type { CandlePainter } from '../../series/painters/types';
import type { CandlestickSeriesOptions, OHLCData } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

/**
 * The shipped candle styles ride the same transforms as the default fill:
 * entry, intro, history reveal and live smoothing. The global test setup
 * reports `prefers-reduced-motion: reduce`, which turns the intro and the
 * history reveal off, so this suite allows motion like the intro suite does.
 */
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

const OHLC = { open: 6, high: 9, low: 3, close: 8 };

interface PaintCall {
  element: 'wick' | 'body';
  time: number;
  alpha: number;
  closeY: number;
}

/** Wraps a style to log what the renderer handed it — which element, under
 *  which alpha — keyed by the candle the call drew (its body center X). */
function recording(painter: CandlePainter, timeAtX: (x: number) => number) {
  const calls: PaintCall[] = [];
  const wrapped: CandlePainter = (env, args) => {
    calls.push({
      element: args.element,
      time: timeAtX(args.body.x + args.body.width / 2),
      alpha: env.ctx.globalAlpha,
      closeY: args.closeY,
    });
    painter(env, args);
  };

  return { calls, wrapped };
}

describe.each([
  ['hollowCandle', hollowCandle],
  ['ohlcBar', ohlcBar],
])('candle style %s', (_name, style) => {
  let now = 0;
  beforeEach(() => {
    allowMotion();
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    globalThis.matchMedia = reducedMotionStub;
    vi.restoreAllMocks();
  });

  // The 0..100 window spans 800 bitmap px.
  const timeAtX = (x: number) => Math.round(x / 8);

  function make(data: OHLCData[], options: Partial<CandlestickSeriesOptions> = {}) {
    const store = new TimeSeriesStore<OHLCData>();
    store.setData(data);
    const log = recording(style, timeAtX);
    const renderer = new CandlestickRenderer(store, { introMs: false, ...options, candlePainter: log.wrapped });

    return { renderer, calls: log.calls };
  }

  function renderFrame(r: CandlestickRenderer) {
    const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
    r.render(built.ctx);

    return built;
  }

  it('fades an appended candle in through the entry animation', () => {
    const { renderer, calls } = make([{ time: 30, ...OHLC }], { entryAnimation: 'fade', entryMs: 250 });
    renderer.appendPoint({ time: 60, ...OHLC });
    now += 100;
    renderFrame(renderer);

    const entering = calls.filter((c) => c.time === 60);
    const settled = calls.filter((c) => c.time === 30);
    expect(entering.map((c) => c.element)).toEqual(['wick', 'body']);
    for (const call of entering) {
      expect(call.alpha).toBeGreaterThan(0);
      expect(call.alpha).toBeLessThan(1);
    }
    expect(settled.every((c) => c.alpha === 1)).toBe(true);
  });

  it('plays the wick phase of wickBodyIntro before the body', () => {
    const { renderer, calls } = make([], { introMs: 500, introAnimation: wickBodyIntro() });
    renderer.setData([{ time: 10, ...OHLC }]);
    renderFrame(renderer);
    calls.length = 0;

    now += 100;
    const { spy } = renderFrame(renderer);

    expect(calls.find((c) => c.element === 'wick')?.alpha).toBe(1);
    expect(calls.find((c) => c.element === 'body')?.alpha).toBe(0);
    // The style drew in both passes.
    expect(spy.calls.some((c) => c.globalAlpha === 1 && c.method === 'fillRect')).toBe(true);
    expect(spy.calls.some((c) => c.globalAlpha === 0 && (c.method === 'fillRect' || c.method === 'fill'))).toBe(true);
  });

  it('reveals prepended history from the boundary', () => {
    const { renderer, calls } = make([
      { time: 60, ...OHLC },
      { time: 80, ...OHLC },
    ]);
    renderer.prependPoints([
      { time: 20, ...OHLC },
      { time: 40, ...OHLC },
    ]);
    renderFrame(renderer);

    const prepended = calls.filter((c) => c.time < 60);
    const old = calls.filter((c) => c.time >= 60);
    expect(prepended).toHaveLength(4);
    expect(prepended.every((c) => c.alpha < 1)).toBe(true);
    expect(old.every((c) => c.alpha === 1)).toBe(true);
  });

  it('glides the live candle toward an updated close', () => {
    const { renderer, calls } = make([{ time: 50, ...OHLC }]);
    renderFrame(renderer);
    const before = calls.filter((c) => c.element === 'body').at(-1)?.closeY ?? Number.NaN;

    renderer.updateLastPoint({ time: 50, open: 6, high: 9.5, low: 3, close: 9.5 });
    now += 16;
    renderFrame(renderer);
    const midway = calls.filter((c) => c.element === 'body').at(-1)?.closeY ?? Number.NaN;

    for (let frame = 0; frame < 120; frame++) {
      now += 16;
      renderFrame(renderer);
    }
    const settled = calls.filter((c) => c.element === 'body').at(-1)?.closeY ?? Number.NaN;

    // Canvas Y grows downward: a higher close moves up, and not in one jump.
    expect(midway).toBeLessThan(before);
    expect(midway).toBeGreaterThan(settled);
  });

  it('leaves the volume histogram as the default fill draws it', () => {
    const data: OHLCData[] = [
      { time: 30, ...OHLC, volume: 500 },
      { time: 60, open: 8, high: 9, low: 3, close: 4, volume: 900 },
    ];
    const volumeCalls = (options: Partial<CandlestickSeriesOptions>) => {
      const store = new TimeSeriesStore<OHLCData>();
      store.setData(data);
      const { spy } = renderFrame(new CandlestickRenderer(store, { introMs: false, ...options }));

      // The candle pass opens with a save that still carries the volume fill.
      return spy.calls
        .filter((c) => c.method !== 'save' && String(c.fillStyle).startsWith('rgba'))
        .map((c) => ({ method: c.method, args: c.args, fillStyle: c.fillStyle }));
    };

    const styled = volumeCalls({ candlePainter: style });
    expect(styled.length).toBeGreaterThan(0);
    expect(styled).toEqual(volumeCalls({}));
  });
});

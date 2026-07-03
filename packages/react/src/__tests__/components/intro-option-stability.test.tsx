import { BarSeries, CandlestickSeries, LineSeries, type LineSeriesOptions } from '@wick-charts/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * The global test setup reports `prefers-reduced-motion: reduce`, which keeps
 * `IntroWave.arm` a no-op — swap in a motion-allowing `matchMedia` locally so
 * the wave arms and the intro fn actually drives frames (same recipe as the
 * core `line-intro.test.ts`).
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

/**
 * The `introAnimation` option is a function the core reads live, per frame.
 * The React wrappers latch it behind a stable wrapper (`useLatestFn`) so:
 *
 * 1. A non-memoized inline fn (new reference every render) does NOT re-fire
 *    the option effect — no `updateSeriesOptions` churn.
 * 2. A swapped fn still reaches the renderer — the wrapper delegates to the
 *    latest fn on every call (previously bar/candlestick silently ignored
 *    post-mount swaps because `introAnimation` was absent from their deps).
 * 3. Presence flips (fn ↔ undefined) DO re-apply, so the core can fall back
 *    to its default intro and pick the wrapper back up.
 */
describe('introAnimation reference stability (useLatestFn latch)', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  beforeEach(() => {
    allowMotion();
  });

  afterEach(() => {
    globalThis.matchMedia = reducedMotionStub;
    mounted?.unmount();
    mounted = null;
  });

  // Keep the wave far from settling — the RAF mock advances 16ms per frame
  // and flushAll caps at 100 frames, so a 10s duration stays active
  // throughout every flush in these tests.
  const INTRO_MS = 10_000;

  const lineData = [
    [
      { time: 1, value: 10 },
      { time: 2, value: 40 },
      { time: 3, value: 20 },
    ],
  ];
  const barData = [
    [
      { time: 1, value: 50 },
      { time: 2, value: 80 },
      { time: 3, value: 60 },
    ],
  ];
  const candles = [
    { time: 1, open: 10, high: 15, low: 8, close: 12 },
    { time: 2, open: 12, high: 18, low: 11, close: 16 },
    { time: 3, open: 16, high: 17, low: 12, close: 13 },
  ];

  it('LineSeries: a new inline intro fn neither re-applies options nor goes stale', () => {
    const fnA = vi.fn(() => ({}));
    const fnB = vi.fn(() => ({}));

    mounted = mountChart(<LineSeries id="line" data={lineData} options={{ introMs: INTRO_MS, introAnimation: fnA }} />);
    mounted.flushScheduler();
    expect(fnA).toHaveBeenCalled();

    const spy = vi.spyOn(mounted.chart, 'updateSeriesOptions');
    mounted.rerender(<LineSeries id="line" data={lineData} options={{ introMs: INTRO_MS, introAnimation: fnB }} />);
    mounted.flushScheduler();

    // The identity change stayed inside the latch — no option re-apply...
    expect(spy).not.toHaveBeenCalled();
    // ...yet the renderer already delegates to the swapped fn.
    expect(fnB).toHaveBeenCalled();
  });

  it('LineSeries: presence flips re-apply so the core falls back to / picks up the intro', () => {
    const fn = vi.fn(() => ({}));

    mounted = mountChart(<LineSeries id="line" data={lineData} options={{ introMs: INTRO_MS, introAnimation: fn }} />);
    mounted.flushScheduler();

    const spy = vi.spyOn(mounted.chart, 'updateSeriesOptions');
    mounted.rerender(<LineSeries id="line" data={lineData} options={{ introMs: INTRO_MS }} />);
    expect(spy).toHaveBeenCalledTimes(1);
    const dropped = spy.mock.calls[0]?.[1] as Partial<LineSeriesOptions> | undefined;
    expect(dropped?.introAnimation).toBeUndefined();

    mounted.rerender(<LineSeries id="line" data={lineData} options={{ introMs: INTRO_MS, introAnimation: fn }} />);
    expect(spy).toHaveBeenCalledTimes(2);
    const restored = spy.mock.calls[1]?.[1] as Partial<LineSeriesOptions> | undefined;
    expect(typeof restored?.introAnimation).toBe('function');
  });

  it('BarSeries: a post-mount intro swap reaches the renderer (was silently ignored)', () => {
    const fn = vi.fn(() => ({}));

    mounted = mountChart(<BarSeries id="bar" data={barData} options={{ introMs: INTRO_MS }} />);
    mounted.flushScheduler();

    const spy = vi.spyOn(mounted.chart, 'updateSeriesOptions');
    mounted.rerender(<BarSeries id="bar" data={barData} options={{ introMs: INTRO_MS, introAnimation: fn }} />);
    mounted.flushScheduler();

    // The presence flip re-applied options and the fn now drives frames.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalled();

    // A subsequent identity-only swap stays inside the latch.
    const next = vi.fn(() => ({}));
    mounted.rerender(<BarSeries id="bar" data={barData} options={{ introMs: INTRO_MS, introAnimation: next }} />);
    mounted.flushScheduler();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalled();
  });

  it('CandlestickSeries: a post-mount intro swap reaches the renderer (was silently ignored)', () => {
    const fn = vi.fn(() => ({}));

    mounted = mountChart(<CandlestickSeries id="ohlc" data={candles} options={{ introMs: INTRO_MS }} />);
    mounted.flushScheduler();

    const spy = vi.spyOn(mounted.chart, 'updateSeriesOptions');
    mounted.rerender(
      <CandlestickSeries id="ohlc" data={candles} options={{ introMs: INTRO_MS, introAnimation: fn }} />,
    );
    mounted.flushScheduler();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalled();

    const next = vi.fn(() => ({}));
    mounted.rerender(
      <CandlestickSeries id="ohlc" data={candles} options={{ introMs: INTRO_MS, introAnimation: next }} />,
    );
    mounted.flushScheduler();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalled();
  });
});

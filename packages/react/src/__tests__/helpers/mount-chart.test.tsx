import type React from 'react';

import { CandlestickSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { type TouchPoint, mountChart } from './mount-chart';

/** Phase 0 end-to-end smoke: helper boots a chart, main canvas receives draws. */
describe('mountChart (Phase 0 smoke)', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const data = [
    { time: 1, open: 10, high: 12, low: 9, close: 11 },
    { time: 2, open: 11, high: 13, low: 10, close: 12 },
    { time: 3, open: 12, high: 14, low: 11, close: 13 },
  ];

  it('mounts a ChartContainer and exposes ChartInstance + main/overlay spies', () => {
    mounted = mountChart(<CandlestickSeries data={data} />);

    expect(mounted.chart).toBeDefined();
    expect(mounted.mainCanvas).toBeInstanceOf(HTMLCanvasElement);
    expect(mounted.overlayCanvas).toBeInstanceOf(HTMLCanvasElement);
    expect(mounted.mainSpy.calls.length).toBeGreaterThan(0);
  });

  it('records candlestick body fillRects through the recording context', () => {
    mounted = mountChart(<CandlestickSeries data={data} />);
    mounted.flushScheduler();

    // Candlestick renderer draws one body fillRect per candle plus wicks via fillRect.
    // Lower bound: at least one fillRect per candle — exact count varies with volume overlay.
    expect(mounted.mainSpy.countOf('fillRect')).toBeGreaterThanOrEqual(data.length);
  });

  it('triggerResize fires MockResizeObserver callbacks and reschedules a render', () => {
    mounted = mountChart(<CandlestickSeries data={data} />);
    mounted.mainSpy.reset();
    expect(mounted.mainSpy.calls.length).toBe(0);

    mounted.triggerResize(1000, 500);

    expect(mounted.mainSpy.calls.length).toBeGreaterThan(0);
  });

  it('triggerResize makes descendants report the new size via getBoundingClientRect', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400 });
    const inner = mounted.mainCanvas.parentElement!;
    expect(inner.getBoundingClientRect().width).toBe(800);

    mounted.triggerResize(1200, 600);

    // The patched prototype now reads the live size via host.clientWidth
    // rather than the captured constant, so DOM-measuring code sees the
    // post-resize dimensions.
    const rect = inner.getBoundingClientRect();
    expect(rect.width).toBe(1200);
    expect(rect.height).toBe(600);
  });

  it('triggerResize passes the observed element as entry.target, not the outer host', () => {
    mounted = mountChart(<CandlestickSeries data={data} />);
    const observedEl = mounted.mainCanvas.parentElement;
    expect(observedEl).not.toBe(mounted.container); // chart wraps canvases in an inner div

    // Verified indirectly — the observed element's clientWidth must reflect
    // the new size after triggerResize, matching what CanvasManager reads
    // from entry.target.getBoundingClientRect() in production.
    mounted.triggerResize(900, 450);
    expect(observedEl!.clientWidth).toBe(900);
    expect(observedEl!.clientHeight).toBe(450);
  });

  it('failed mount rolls back the HTMLDivElement.prototype.getBoundingClientRect patch', () => {
    const beforePatch = HTMLDivElement.prototype.getBoundingClientRect;

    // Force a failure after the prototype patch is installed: pass children
    // that throw from their render function. The error must propagate, AND
    // the prototype must be back to its original reference afterwards.
    const Boom = (): React.ReactElement => {
      throw new Error('intentional mount failure');
    };
    expect(() => mountChart(<Boom />)).toThrow('intentional mount failure');

    expect(HTMLDivElement.prototype.getBoundingClientRect).toBe(beforePatch);
  });

  it('dispatchTouch delivers a populated touches list the production handler can read', () => {
    mounted = mountChart(<CandlestickSeries data={data} />);

    // Capture the event from the overlay canvas (where interactions attach).
    let observed: TouchEvent | null = null;
    mounted.overlayCanvas.addEventListener('touchstart', (e) => {
      observed = e as TouchEvent;
    });

    const twoFinger: TouchPoint[] = [
      { clientX: 100, clientY: 200 },
      { clientX: 300, clientY: 210 },
    ];
    mounted.dispatchTouch('touchstart', twoFinger, mounted.overlayCanvas);

    expect(observed).not.toBeNull();
    expect(observed!.touches.length).toBe(2);
    // Production handler reads touches[0].clientX / touches[0].clientY —
    // the previous inert-event version left these undefined.
    expect(observed!.touches[0].clientX).toBe(100);
    expect(observed!.touches[0].clientY).toBe(200);
    expect(observed!.touches[1].clientX).toBe(300);
  });
});

// @vitest-environment happy-dom
// Production `zoom.ts` reads `WheelEvent.DOM_DELTA_LINE` / `DOM_DELTA_PAGE`
// constants, which are only defined in a DOM environment.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ZoomHandler } from '../interactions/zoom';
import type { TimeScale } from '../scales/time-scale';
import type { Viewport } from '../viewport';

/**
 * Unit test for the wheel-driven zoom path. The handler is pure — no DOM —
 * so we mock `viewport` and `timeScale` with just the surface it reads.
 *
 * Key behaviors guarded:
 *  - deltaMode normalization (PIXEL / LINE / PAGE)
 *  - sensitivity formula: factor = exp(delta * 0.005)
 *  - offsetX clamp to chartWidth (excludes Y-axis band where wheel should zoom the last cursor-time, not past the axis)
 *  - preventDefault is always called (otherwise the page scrolls under the chart)
 *  - zero-delta wheel still fires viewport.zoomAt (factor === 1 is a no-op at the viewport layer)
 */
describe('ZoomHandler.handleWheel', () => {
  function setup() {
    const viewport = { zoomAt: vi.fn(), startRebound: vi.fn() } as unknown as Viewport & {
      zoomAt: ReturnType<typeof vi.fn>;
      startRebound: ReturnType<typeof vi.fn>;
    };
    const timeScale = {
      getMediaWidth: vi.fn(() => 800),
      xToTime: vi.fn((x: number) => x * 100), // identity-ish — each pixel = 100ms
    } as unknown as TimeScale;
    const handler = new ZoomHandler(viewport, timeScale);
    return { viewport, timeScale, handler };
  }

  // Constants match the WheelEvent spec values and keep this test explicit
  // without relying on environment-provided `WheelEvent.DOM_DELTA_*` values.
  const DOM_DELTA_PIXEL = 0;
  const DOM_DELTA_LINE = 1;
  const DOM_DELTA_PAGE = 2;

  function makeWheel(init: { deltaY: number; deltaMode?: number; offsetX?: number }): WheelEvent {
    const preventDefault = vi.fn();
    return {
      deltaY: init.deltaY,
      deltaMode: init.deltaMode ?? DOM_DELTA_PIXEL,
      offsetX: init.offsetX ?? 0,
      preventDefault,
    } as unknown as WheelEvent;
  }

  it('zooms in on negative deltaY (DOM_DELTA_PIXEL)', () => {
    const { viewport, handler } = setup();
    handler.handleWheel(makeWheel({ deltaY: -100, offsetX: 400 }));

    // factor = exp(-100 * 0.005) = exp(-0.5) ≈ 0.6065 → zoom in (range narrows)
    const [cursorTime, factor] = viewport.zoomAt.mock.calls[0];
    expect(cursorTime).toBe(40000); // xToTime(400) = 40000
    expect(factor).toBeCloseTo(Math.exp(-0.5), 5);
    expect(factor).toBeLessThan(1);
  });

  it('zooms out on positive deltaY', () => {
    const { viewport, handler } = setup();
    handler.handleWheel(makeWheel({ deltaY: 100, offsetX: 400 }));

    const [, factor] = viewport.zoomAt.mock.calls[0];
    expect(factor).toBeCloseTo(Math.exp(0.5), 5);
    expect(factor).toBeGreaterThan(1);
  });

  it('DOM_DELTA_LINE multiplies delta by 8 before sensitivity', () => {
    const { viewport, handler } = setup();
    handler.handleWheel(makeWheel({ deltaY: -1, deltaMode: DOM_DELTA_LINE, offsetX: 0 }));

    // normalized delta = -1 * 8 = -8; factor = exp(-8 * 0.005) = exp(-0.04)
    const [, factor] = viewport.zoomAt.mock.calls[0];
    expect(factor).toBeCloseTo(Math.exp(-0.04), 5);
  });

  it('DOM_DELTA_PAGE multiplies delta by 24 before sensitivity', () => {
    const { viewport, handler } = setup();
    handler.handleWheel(makeWheel({ deltaY: 1, deltaMode: DOM_DELTA_PAGE, offsetX: 0 }));

    const [, factor] = viewport.zoomAt.mock.calls[0];
    expect(factor).toBeCloseTo(Math.exp(24 * 0.005), 5);
  });

  it('clamps offsetX to chartWidth so wheel over the Y-axis still zooms at the rightmost chart X', () => {
    const { viewport, timeScale, handler } = setup();
    // offsetX well past chartWidth (800) — happens when the user scrolls while
    // hovering the Y-axis band on the right.
    handler.handleWheel(makeWheel({ deltaY: -50, offsetX: 950 }));

    // xToTime is called with the clamped value (800), not the raw offsetX.
    expect(timeScale.xToTime).toHaveBeenCalledWith(800);
    // zoomAt receives the clamped cursor time.
    const [cursorTime] = viewport.zoomAt.mock.calls[0];
    expect(cursorTime).toBe(80000);
  });

  it('calls preventDefault so the page does not scroll under the chart', () => {
    const { handler } = setup();
    const event = makeWheel({ deltaY: -100, offsetX: 100 });
    handler.handleWheel(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('zero deltaY still dispatches zoomAt (factor === 1 is a viewport-level no-op)', () => {
    const { viewport, handler } = setup();
    handler.handleWheel(makeWheel({ deltaY: 0, offsetX: 100 }));

    expect(viewport.zoomAt).toHaveBeenCalledTimes(1);
    const [, factor] = viewport.zoomAt.mock.calls[0];
    expect(factor).toBe(1);
  });
});

describe('ZoomHandler rebound debouncing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const viewport = { zoomAt: vi.fn(), startRebound: vi.fn() } as unknown as Viewport & {
      zoomAt: ReturnType<typeof vi.fn>;
      startRebound: ReturnType<typeof vi.fn>;
    };
    const timeScale = {
      getMediaWidth: vi.fn(() => 800),
      xToTime: vi.fn((x: number) => x * 100),
    } as unknown as TimeScale;
    const handler = new ZoomHandler(viewport, timeScale);
    return { viewport, handler };
  }

  function wheel(deltaY: number): WheelEvent {
    return {
      deltaY,
      deltaMode: 0,
      offsetX: 100,
      preventDefault: vi.fn(),
    } as unknown as WheelEvent;
  }

  it('schedules a rebound after the wheel goes idle for 150ms', () => {
    const { viewport, handler } = setup();
    handler.handleWheel(wheel(-100));
    expect(viewport.startRebound).not.toHaveBeenCalled();

    // Just under idle threshold — still nothing.
    vi.advanceTimersByTime(149);
    expect(viewport.startRebound).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(viewport.startRebound).toHaveBeenCalledTimes(1);
    expect(viewport.startRebound).toHaveBeenCalledWith(800);
  });

  it('successive wheel events reset the debounce window', () => {
    const { viewport, handler } = setup();
    handler.handleWheel(wheel(-100));
    vi.advanceTimersByTime(100);
    handler.handleWheel(wheel(-100)); // reset window
    vi.advanceTimersByTime(100);
    handler.handleWheel(wheel(-100)); // reset again
    vi.advanceTimersByTime(149);
    expect(viewport.startRebound).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(viewport.startRebound).toHaveBeenCalledTimes(1);
  });

  it('cancelPendingRebound clears a scheduled rebound', () => {
    const { viewport, handler } = setup();
    handler.handleWheel(wheel(-100));
    handler.cancelPendingRebound();
    vi.advanceTimersByTime(500);
    expect(viewport.startRebound).not.toHaveBeenCalled();
  });
});

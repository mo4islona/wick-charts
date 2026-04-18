// @vitest-environment happy-dom
/**
 * Regression: a wheel gesture arms a 150ms rebound timer via ZoomHandler.
 * If a new drag (or pinch) starts before that timer fires, the stale rebound
 * must be cancelled — otherwise it snaps the viewport back mid-gesture and
 * can emit a bogus `edgeReached` too.
 *
 * InteractionHandler owns the competing-gesture arbitration, so this is
 * tested at the full-handler level rather than on PanHandler in isolation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InteractionHandler } from '../interactions/handler';
import type { TimeScale } from '../scales/time-scale';
import type { YScale } from '../scales/y-scale';
import type { Viewport } from '../viewport';

function makeMockViewport(): Viewport & {
  pan: ReturnType<typeof vi.fn>;
  zoomAt: ReturnType<typeof vi.fn>;
  startRebound: ReturnType<typeof vi.fn>;
} {
  return {
    pan: vi.fn(),
    zoomAt: vi.fn(),
    startRebound: vi.fn(),
  } as unknown as Viewport & {
    pan: ReturnType<typeof vi.fn>;
    zoomAt: ReturnType<typeof vi.fn>;
    startRebound: ReturnType<typeof vi.fn>;
  };
}

function makeMockTimeScale(): TimeScale {
  return {
    getMediaWidth: vi.fn(() => 800),
    xToTime: vi.fn((x: number) => x * 100),
    pixelDeltaToTimeDelta: vi.fn((px: number) => px * 100),
  } as unknown as TimeScale;
}

function makeMockYScale(): YScale {
  return { yToValue: vi.fn((y: number) => y) } as unknown as YScale;
}

function dispatchWheel(canvas: HTMLCanvasElement, deltaY = -100): void {
  // Build via new WheelEvent so happy-dom's dispatchEvent accepts the instance;
  // then patch `offsetX` (not settable via init) to match production handler reads.
  const evt = new WheelEvent('wheel', { deltaY, deltaMode: 0, cancelable: true });
  Object.defineProperty(evt, 'offsetX', { value: 100, configurable: true });
  canvas.dispatchEvent(evt);
}

function dispatchTouch(
  canvas: HTMLCanvasElement,
  type: 'touchstart' | 'touchmove' | 'touchend',
  touches: Array<{ clientX: number; clientY: number }>,
): void {
  // happy-dom doesn't ship a TouchEvent constructor — synthesize via Event and
  // attach the touches shape the production handler reads.
  const evt = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    touches: unknown[];
    preventDefault: () => void;
  };
  Object.defineProperty(evt, 'touches', {
    value: touches.map((t) => ({ ...t })),
    configurable: true,
  });
  canvas.dispatchEvent(evt);
}

describe('InteractionHandler — wheel rebound is cancelled when a new gesture starts', () => {
  let canvas: HTMLCanvasElement;
  let viewport: ReturnType<typeof makeMockViewport>;
  let handler: InteractionHandler;

  beforeEach(() => {
    vi.useFakeTimers();
    canvas = document.createElement('canvas');
    viewport = makeMockViewport();
    handler = new InteractionHandler(canvas, viewport, makeMockTimeScale(), makeMockYScale());
  });

  afterEach(() => {
    handler.destroy();
    vi.useRealTimers();
  });

  it('mousedown before the 150ms wheel rebound timer fires cancels it', () => {
    // Wheel arms the rebound timer.
    dispatchWheel(canvas);
    expect(viewport.zoomAt).toHaveBeenCalledTimes(1);

    // Drag starts before the timer's deadline.
    vi.advanceTimersByTime(100);
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 100 }));

    // Even long after the original 150ms window, rebound must not fire.
    vi.advanceTimersByTime(500);
    expect(viewport.startRebound).not.toHaveBeenCalled();
  });

  it('touchstart before the rebound timer fires cancels it', () => {
    dispatchWheel(canvas);

    vi.advanceTimersByTime(100);
    dispatchTouch(canvas, 'touchstart', [{ clientX: 100, clientY: 50 }]);

    vi.advanceTimersByTime(500);
    expect(viewport.startRebound).not.toHaveBeenCalled();
  });

  it('two-finger pinch start also cancels the pending wheel rebound', () => {
    dispatchWheel(canvas);

    vi.advanceTimersByTime(50);
    dispatchTouch(canvas, 'touchstart', [
      { clientX: 100, clientY: 50 },
      { clientX: 200, clientY: 50 },
    ]);

    vi.advanceTimersByTime(500);
    expect(viewport.startRebound).not.toHaveBeenCalled();
  });

  it('wheel without any competing gesture still schedules rebound normally (baseline)', () => {
    // Sanity: the cancel only happens on mousedown/touchstart — an isolated
    // wheel gesture must still produce exactly one rebound after 150ms idle.
    dispatchWheel(canvas);
    expect(viewport.startRebound).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);
    expect(viewport.startRebound).toHaveBeenCalledTimes(1);
  });
});

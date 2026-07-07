// @vitest-environment happy-dom
// Needs a DOM: InteractionHandler attaches listeners to a real canvas and the
// internal PanHandler mutates canvas.style.cursor.
import { describe, expect, it, vi } from 'vitest';

import { InteractionHandler } from '../interactions/handler';
import type { PanZoomTarget } from '../interactions/pan-zoom-target';
import type { XScale } from '../scales/x-scale';
import type { YScale } from '../scales/y-scale';

/**
 * Guards the spatial-only interaction mode: when the target reports
 * `canPanZoom() === false` (pie / heatmap — no time axis), the handler must
 * leave wheel and touch events to the page (no preventDefault → the page
 * scrolls under the cursor) while keeping hover and click alive for
 * slice/cell tooltips.
 */
function setup(canPanZoom?: () => boolean) {
  const target = { pan: vi.fn(), zoomAt: vi.fn(), canPanZoom } as unknown as PanZoomTarget & {
    pan: ReturnType<typeof vi.fn>;
    zoomAt: ReturnType<typeof vi.fn>;
  };
  const timeScale = {
    pixelDeltaToTimeDelta: vi.fn((px: number) => px * 100),
    getMediaWidth: vi.fn(() => 800),
    xToTime: vi.fn((x: number) => x),
  } as unknown as XScale;
  const yScale = { yToValue: vi.fn((y: number) => y) } as unknown as YScale;
  const canvas = document.createElement('canvas');
  const handler = new InteractionHandler(canvas, target, timeScale, yScale);

  return { target, canvas, handler };
}

function wheel(offsetX = 200): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY: 120, cancelable: true, bubbles: true });
  Object.defineProperty(event, 'offsetX', { value: offsetX, configurable: true });

  return event;
}

function mouse(type: string, init: MouseEventInit & { offsetX?: number; offsetY?: number } = {}): MouseEvent {
  const { offsetX = 100, offsetY = 100, ...rest } = init;
  const event = new MouseEvent(type, { cancelable: true, bubbles: true, ...rest });
  Object.defineProperty(event, 'offsetX', { value: offsetX, configurable: true });
  Object.defineProperty(event, 'offsetY', { value: offsetY, configurable: true });

  return event;
}

/** Build a fake Touch point — the handler only reads clientX / clientY. */
function p(clientX: number, clientY: number): Touch {
  return { clientX, clientY } as unknown as Touch;
}

function touch(type: 'touchstart' | 'touchmove' | 'touchend', points: Touch[], changed: Touch[] = points): Event {
  const ev = new Event(type, { cancelable: true });
  Object.assign(ev, { touches: points, changedTouches: changed });

  return ev;
}

describe('InteractionHandler on a spatial-only target (canPanZoom → false)', () => {
  it('lets the wheel through: no zoom, no preventDefault, page scroll survives', () => {
    const { target, canvas } = setup(() => false);
    const event = wheel();
    canvas.dispatchEvent(event);

    expect(target.zoomAt).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('lets touch gestures through: no preventDefault, no pan on move', () => {
    const { target, canvas } = setup(() => false);
    const start = touch('touchstart', [p(100, 0)]);
    canvas.dispatchEvent(start);
    const move = touch('touchmove', [p(160, 0)]);
    canvas.dispatchEvent(move);

    expect(start.defaultPrevented).toBe(false);
    expect(move.defaultPrevented).toBe(false);
    expect(target.pan).not.toHaveBeenCalled();
  });

  it('does not synthesize a tap click — the un-prevented native click covers it', () => {
    const { canvas, handler } = setup(() => false);
    const clicks = vi.fn();
    handler.on('click', clicks);

    // Quick tap: with preventDefault skipped, the browser will fire its own
    // compatibility click; a synthetic one on top would double-fire.
    canvas.dispatchEvent(touch('touchstart', [p(100, 50)]));
    canvas.dispatchEvent(touch('touchend', [], [p(100, 50)]));

    expect(clicks).not.toHaveBeenCalled();
  });

  it('does not synthesize a click after a two-finger tap', () => {
    const { canvas, handler } = setup(() => false);
    const clicks = vi.fn();
    handler.on('click', clicks);

    // Both fingers land while the gesture is uncaptured, then lift one at a
    // time. The pinch-decay re-seed must not run for an uncaptured gesture —
    // it would start a pan drag and re-arm the tap timer, so the last lift
    // would emit a phantom 'click'.
    canvas.dispatchEvent(touch('touchstart', [p(100, 50), p(140, 50)]));
    canvas.dispatchEvent(touch('touchend', [p(100, 50)], [p(140, 50)]));

    expect(canvas.style.cursor).not.toBe('grabbing');

    canvas.dispatchEvent(touch('touchend', [], [p(100, 50)]));

    expect(clicks).not.toHaveBeenCalled();
  });

  it('keeps drag inert: cursor stays crosshair and mousemove never pans', () => {
    const { target, canvas } = setup(() => false);
    canvas.dispatchEvent(mouse('mousedown', { button: 0, clientX: 100 }));

    expect(canvas.style.cursor).toBe('crosshair');

    canvas.dispatchEvent(mouse('mousemove', { clientX: 180 }));

    expect(target.pan).not.toHaveBeenCalled();
  });

  it('keeps hover and click alive for slice/cell hit-testing', () => {
    const { canvas, handler } = setup(() => false);
    const crosshair = vi.fn();
    const clicks = vi.fn();
    handler.on('crosshairMove', crosshair);
    handler.on('click', clicks);

    canvas.dispatchEvent(mouse('mousemove', { clientX: 100, offsetX: 120, offsetY: 80 }));
    canvas.dispatchEvent(mouse('mousedown', { button: 0, clientX: 100, clientY: 100 }));
    canvas.dispatchEvent(mouse('click', { clientX: 100, clientY: 100, offsetX: 120, offsetY: 80 }));

    expect(crosshair).toHaveBeenCalledWith(expect.objectContaining({ mediaX: 120, mediaY: 80 }));
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('leaves native touch scrolling enabled via touch-action', () => {
    const { canvas } = setup(() => false);

    expect(canvas.style.touchAction).toBe('auto');
  });
});

describe('InteractionHandler pan/zoom mode transitions', () => {
  it('a target without the canPanZoom hook still captures the wheel (back-compat)', () => {
    const { target, canvas } = setup(undefined);
    const event = wheel();
    canvas.dispatchEvent(event);

    expect(target.zoomAt).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('a pan/zoomable target captures the wheel and blocks page scroll', () => {
    const { target, canvas } = setup(() => true);
    const event = wheel();
    canvas.dispatchEvent(event);

    expect(target.zoomAt).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('reads the capability live — gains and loses wheel capture as series change', () => {
    let enabled = false;
    const { target, canvas, handler } = setup(() => enabled);

    const first = wheel();
    canvas.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(false);

    // A time series lands (e.g. line added next to the heatmap).
    enabled = true;
    handler.syncPanZoomMode();
    const second = wheel();
    canvas.dispatchEvent(second);

    expect(second.defaultPrevented).toBe(true);
    expect(target.zoomAt).toHaveBeenCalledTimes(1);
    expect(canvas.style.touchAction).toBe('none');

    // …and is removed again.
    enabled = false;
    handler.syncPanZoomMode();
    const third = wheel();
    canvas.dispatchEvent(third);

    expect(third.defaultPrevented).toBe(false);
    expect(target.zoomAt).toHaveBeenCalledTimes(1);
    expect(canvas.style.touchAction).toBe('auto');
  });

  it('a captured pinch that decays to one finger still re-seeds the pan drag', () => {
    const { target, canvas } = setup(() => true);

    canvas.dispatchEvent(touch('touchstart', [p(100, 50), p(200, 50)]));
    canvas.dispatchEvent(touch('touchend', [p(100, 50)], [p(200, 50)]));
    canvas.dispatchEvent(touch('touchmove', [p(160, 50)]));

    expect(target.pan).toHaveBeenCalled();
  });
});

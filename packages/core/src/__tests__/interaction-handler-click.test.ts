// @vitest-environment happy-dom
// Needs a DOM: InteractionHandler attaches listeners to a real canvas.
import { describe, expect, it, vi } from 'vitest';

import { InteractionHandler } from '../interactions/handler';
import type { PanZoomTarget } from '../interactions/pan-zoom-target';
import type { XScale } from '../scales/x-scale';
import type { YScale } from '../scales/y-scale';

function setup() {
  const target = { pan: vi.fn(), zoomAt: vi.fn() } as unknown as PanZoomTarget;
  const timeScale = {
    pixelDeltaToTimeDelta: vi.fn((px: number) => px * 100),
    getMediaWidth: vi.fn(() => 800),
    xToTime: vi.fn((x: number) => x),
  } as unknown as XScale;
  const yScale = { yToValue: vi.fn((y: number) => y) } as unknown as YScale;
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: 400, right: 800, width: 800, height: 400, toJSON: () => ({}) }) as DOMRect;
  const handler = new InteractionHandler(canvas, target, timeScale, yScale);

  return { canvas, handler };
}

function mouse(type: string, opts: { clientX?: number; clientY?: number; offsetX?: number; offsetY?: number }): Event {
  const event = new MouseEvent(type, { bubbles: true, clientX: opts.clientX ?? 0, clientY: opts.clientY ?? 0 });
  Object.defineProperty(event, 'offsetX', { value: opts.offsetX ?? opts.clientX ?? 0 });
  Object.defineProperty(event, 'offsetY', { value: opts.offsetY ?? opts.clientY ?? 0 });

  return event;
}

function p(clientX: number, clientY: number): Touch {
  return { clientX, clientY } as unknown as Touch;
}

function touch(type: string, points: Touch[]): Event {
  const ev = new Event(type, { cancelable: true });
  Object.assign(ev, { touches: points, changedTouches: points });

  return ev;
}

describe('InteractionHandler click/dblclick', () => {
  it('emits click at the resolved position on a plain mousedown/mouseup/click', () => {
    const { canvas, handler } = setup();
    const onClick = vi.fn();
    handler.on('click', onClick);

    canvas.dispatchEvent(mouse('mousedown', { clientX: 100, clientY: 50, offsetX: 100, offsetY: 50 }));
    canvas.dispatchEvent(mouse('mouseup', { clientX: 100, clientY: 50 }));
    canvas.dispatchEvent(mouse('click', { clientX: 100, clientY: 50, offsetX: 100, offsetY: 50 }));

    expect(onClick).toHaveBeenCalledWith({ mediaX: 100, mediaY: 50, time: 100, y: 50 });
  });

  it('suppresses click when the pointer moved beyond tolerance between down and up (a drag, not a click)', () => {
    const { canvas, handler } = setup();
    const onClick = vi.fn();
    handler.on('click', onClick);

    canvas.dispatchEvent(mouse('mousedown', { clientX: 100, clientY: 50 }));
    canvas.dispatchEvent(mouse('mousemove', { clientX: 250, clientY: 50 }));
    canvas.dispatchEvent(mouse('mouseup', { clientX: 250, clientY: 50 }));
    canvas.dispatchEvent(mouse('click', { clientX: 250, clientY: 50, offsetX: 250, offsetY: 50 }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('still emits click for a sub-tolerance jitter between down and up', () => {
    const { canvas, handler } = setup();
    const onClick = vi.fn();
    handler.on('click', onClick);

    canvas.dispatchEvent(mouse('mousedown', { clientX: 100, clientY: 50 }));
    canvas.dispatchEvent(mouse('mouseup', { clientX: 102, clientY: 51 }));
    canvas.dispatchEvent(mouse('click', { clientX: 102, clientY: 51, offsetX: 102, offsetY: 51 }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('emits dblclick at the resolved position', () => {
    const { canvas, handler } = setup();
    const onDblClick = vi.fn();
    handler.on('dblclick', onDblClick);

    canvas.dispatchEvent(mouse('dblclick', { clientX: 40, clientY: 20, offsetX: 40, offsetY: 20 }));

    expect(onDblClick).toHaveBeenCalledWith({ mediaX: 40, mediaY: 20, time: 40, y: 20 });
  });

  it('emits click on a short, low-movement tap (no native click follows a preventDefault touchstart)', () => {
    const { canvas, handler } = setup();
    const onClick = vi.fn();
    handler.on('click', onClick);

    canvas.dispatchEvent(touch('touchstart', [p(60, 30)]));
    const end = new Event('touchend', { cancelable: true });
    Object.assign(end, { touches: [], changedTouches: [p(60, 30)] });
    canvas.dispatchEvent(end);

    expect(onClick).toHaveBeenCalledWith({ mediaX: 60, mediaY: 30, time: 60, y: 30 });
  });

  it('suppresses click for a touch that moved beyond tolerance before lifting (a drag, not a tap)', () => {
    const { canvas, handler } = setup();
    const onClick = vi.fn();
    handler.on('click', onClick);

    canvas.dispatchEvent(touch('touchstart', [p(60, 30)]));
    canvas.dispatchEvent(touch('touchmove', [p(200, 30)]));
    const end = new Event('touchend', { cancelable: true });
    Object.assign(end, { touches: [], changedTouches: [p(200, 30)] });
    canvas.dispatchEvent(end);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('suppresses click for a pinch releasing to zero fingers', () => {
    const { canvas, handler } = setup();
    const onClick = vi.fn();
    handler.on('click', onClick);

    canvas.dispatchEvent(touch('touchstart', [p(100, 0), p(200, 0)]));
    const end = new Event('touchend', { cancelable: true });
    Object.assign(end, { touches: [], changedTouches: [p(100, 0)] });
    canvas.dispatchEvent(end);

    expect(onClick).not.toHaveBeenCalled();
  });
});

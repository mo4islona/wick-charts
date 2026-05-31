// @vitest-environment happy-dom
// Needs a DOM: InteractionHandler attaches listeners to a real canvas and the
// internal PanHandler mutates canvas.style.cursor.
import { describe, expect, it, vi } from 'vitest';

import { InteractionHandler } from '../interactions/handler';
import type { PanZoomTarget } from '../interactions/pan-zoom-target';
import type { XScale } from '../scales/x-scale';
import type { YScale } from '../scales/y-scale';

function setup() {
  const target = { pan: vi.fn(), zoomAt: vi.fn() } as unknown as PanZoomTarget & {
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

  return { target, timeScale, canvas, handler };
}

/** Build a fake Touch point. Cast through `unknown` — the handler only reads
 *  clientX / clientY, not the full DOM Touch surface. */
function p(clientX: number, clientY: number): Touch {
  return { clientX, clientY } as unknown as Touch;
}

function touch(type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', points: Touch[]): Event {
  const ev = new Event(type, { cancelable: true });
  Object.assign(ev, { touches: points });

  return ev;
}

describe('InteractionHandler touch gestures', () => {
  it('going from two fingers to one re-seeds single-finger pan (no dead gesture)', () => {
    const { canvas, target } = setup();

    // Pinch begins (2 fingers) — no pan drag yet.
    canvas.dispatchEvent(touch('touchstart', [p(100, 0), p(200, 0)]));
    // Lift one finger — one touch remains.
    canvas.dispatchEvent(touch('touchend', [p(120, 0)]));
    // Drag the remaining finger.
    canvas.dispatchEvent(touch('touchmove', [p(160, 0)]));

    // Without the 2→1 transition fix the handler stays in 2-finger mode and pan
    // never fires.
    expect(target.pan).toHaveBeenCalled();
  });

  it('a vertical pinch still zooms (Euclidean distance) with a finite, clamped factor', () => {
    const { canvas, target } = setup();

    // Two fingers stacked vertically — X projection is 0, so the old abs(dx)
    // distance collapsed to 0 and the pinch was dead.
    canvas.dispatchEvent(touch('touchstart', [p(100, 100), p(100, 300)]));
    canvas.dispatchEvent(touch('touchmove', [p(100, 100), p(100, 260)]));

    expect(target.zoomAt).toHaveBeenCalledTimes(1);
    const factor = target.zoomAt.mock.calls[0][1] as number;
    expect(Number.isFinite(factor)).toBe(true);
    expect(factor).toBeGreaterThanOrEqual(0.1);
    expect(factor).toBeLessThanOrEqual(10);
    expect(factor).toBeCloseTo(200 / 160, 5);
  });

  it('a collapsed pinch (zero spread) never emits a non-finite zoom factor', () => {
    const { canvas, target } = setup();

    canvas.dispatchEvent(touch('touchstart', [p(100, 100), p(300, 100)]));
    // Both fingers converge to the same point → distance 0 → guarded out.
    canvas.dispatchEvent(touch('touchmove', [p(200, 100), p(200, 100)]));

    for (const call of target.zoomAt.mock.calls) {
      expect(Number.isFinite(call[1] as number)).toBe(true);
    }
  });

  it('touchcancel resets gesture state', () => {
    const { canvas, target } = setup();

    canvas.dispatchEvent(touch('touchstart', [p(100, 0), p(200, 0)]));
    canvas.dispatchEvent(touch('touchcancel', []));
    // After cancel, a fresh single touch + move should pan (state reset to single-finger capable).
    canvas.dispatchEvent(touch('touchstart', [p(100, 0)]));
    canvas.dispatchEvent(touch('touchmove', [p(140, 0)]));

    expect(target.pan).toHaveBeenCalled();
  });
});

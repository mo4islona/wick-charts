/**
 * Issue 7 — Pulse dot flicker during zoom.
 *
 * The overlay animation loop asks `hasOverlayContentInRange(from, to)` to
 * decide whether to keep ticking. It used to require `last.time <= to`, so a
 * zoom-in that briefly narrows `to` below `last.time` stopped the loop and
 * the pulse disappeared until auto-scroll caught up. The pulse dot is
 * canvas-clipped, so drawing off-range is harmless — the bound should only
 * check the left side.
 */
import { describe, expect, it } from 'vitest';

import { LineRenderer } from '../../series/line';

describe('LineRenderer.hasOverlayContentInRange', () => {
  function setup(): LineRenderer {
    const r = new LineRenderer(1, { pulse: true });
    r.setData([
      { time: 10, value: 1 },
      { time: 20, value: 2 },
      { time: 100, value: 3 },
    ]);

    return r;
  }

  it('reports true when the last point sits inside [from, to]', () => {
    const r = setup();
    expect(r.hasOverlayContentInRange(0, 200)).toBe(true);
  });

  it('reports true when the last point sits to the right of `to` (mid-zoom)', () => {
    const r = setup();
    // Zoom-in narrows `to` below `last.time` (100). Pulse is clipped by the
    // chart area, so the overlay loop must keep ticking so it reappears
    // immediately once auto-scroll slides `to` back past the last point.
    expect(r.hasOverlayContentInRange(0, 50)).toBe(true);
  });

  it('reports false when the last point is to the left of `from` (off-screen history)', () => {
    const r = setup();
    // User scrolled far into the future past the last point — nothing to
    // animate on screen, stop the loop.
    expect(r.hasOverlayContentInRange(200, 300)).toBe(false);
  });
});

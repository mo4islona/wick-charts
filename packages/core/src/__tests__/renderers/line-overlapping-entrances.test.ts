import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LineRenderer } from '../../series/line';
import type { TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

/**
 * Regression for "stacked lines shoot on every append of a fast feed".
 *
 * Only the newest entrance used to animate; when appends arrived faster than
 * `entryMs` (e.g. the 60ms stress feed vs the 250ms default), the previous
 * head snapped from its mid-lerp position to its raw spot the frame a new
 * point landed — a segment-fraction jump on every append, in both the off
 * and the stacked path. The chained-tail lerp keeps every still-unsettled
 * head unfurling from the previous link's rendered position instead.
 *
 * Method: drive a feed that appends every 4 frames (64ms) against
 * entryMs=300 so several entrances overlap, then probe the trailing vertex
 * 1ms after each append. Continuous geometry moves ~0px in 1ms; the old
 * snap showed its full magnitude regardless of dt.
 */

const FRAME = 16;
const VIEW = { timeRange: { from: 0, to: 320 }, yRange: { min: 0, max: 100 } };

describe('LineRenderer — appends faster than entryMs (overlapping entrances)', () => {
  let now = 0;
  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Render one frame and return the trailing vertex (max-X lineTo) of the
   *  topmost slice — everything before the first 'stroke' belongs to it,
   *  because layers draw top-first in stacked mode and there is a single
   *  layer in off mode. */
  function trailingVertex(r: LineRenderer): { x: number; y: number } {
    const { ctx, spy } = buildRenderContext(VIEW);
    r.render(ctx);

    const calls = spy.calls;
    const firstStroke = calls.findIndex((c) => c.method === 'stroke');
    const tos = calls
      .slice(0, firstStroke)
      .filter((c) => c.method === 'lineTo')
      .map((c) => ({ x: c.args[0] as number, y: c.args[1] as number }));
    expect(tos.length).toBeGreaterThan(0);
    tos.sort((a, b) => a.x - b.x);

    return tos[tos.length - 1];
  }

  function runFastFeed(r: LineRenderer, layerValues: Array<(t: number) => number>): number {
    let lastTime = 190;
    let maxAppendJump = 0;

    for (let tick = 0; tick < 8; tick++) {
      // 4 frames between appends — well under entryMs=300, so 4-5 entrances
      // overlap at any moment.
      for (let f = 0; f < 4; f++) {
        now += FRAME;
        trailingVertex(r);
      }

      const before = trailingVertex(r);
      lastTime += 10;
      for (let li = 0; li < layerValues.length; li++) {
        r.appendPoint({ time: lastTime, value: layerValues[li](lastTime) }, li);
      }
      now += 1;
      const after = trailingVertex(r);

      const jump = Math.hypot(after.x - before.x, after.y - before.y);
      if (jump > maxAppendJump) maxAppendJump = jump;
    }

    return maxAppendJump;
  }

  function seed(r: LineRenderer, layerValues: Array<(t: number) => number>): void {
    for (let li = 0; li < layerValues.length; li++) {
      const points: TimePoint[] = [];
      for (let i = 0; i < 20; i++) {
        points.push({ time: i * 10, value: layerValues[li](i * 10) });
      }
      r.setData(points, li);
    }
  }

  it('stacked: the top edge stays continuous through every append instant', () => {
    const values = [(t: number) => 20 + 5 * Math.sin(t / 30), (t: number) => 30 + 8 * Math.cos(t / 40)];
    const r = new LineRenderer(2, {
      stacking: 'normal',
      area: { visible: false },
      entryMs: 300,
      smoothMs: 300,
    });
    seed(r, values);

    // Pre-fix this measured ~5px (the snapped remainder of the previous
    // entrance) at every append, independent of the 1ms probe interval.
    expect(runFastFeed(r, values)).toBeLessThan(1.5);
  });

  it('off: the line head stays continuous through every append instant', () => {
    const values = [(t: number) => 40 + 12 * Math.sin(t / 25)];
    const r = new LineRenderer(1, {
      area: { visible: false },
      entryMs: 300,
      smoothMs: 300,
    });
    seed(r, values);

    expect(runFastFeed(r, values)).toBeLessThan(1.5);
  });

  it('chained heads still land on their raw positions once the feed pauses', () => {
    const values = [(t: number) => 20 + 5 * Math.sin(t / 30), (t: number) => 30 + 8 * Math.cos(t / 40)];
    const r = new LineRenderer(2, {
      stacking: 'normal',
      area: { visible: false },
      entryMs: 300,
      smoothMs: 300,
    });
    seed(r, values);

    let lastTime = 190;
    for (let tick = 0; tick < 4; tick++) {
      lastTime += 10;
      for (let li = 0; li < values.length; li++) {
        r.appendPoint({ time: lastTime, value: values[li](lastTime) }, li);
      }
      now += 4 * FRAME;
      trailingVertex(r);
    }

    // Let everything settle, then the top edge's trailing vertex must sit at
    // the exact stacked position of the final point.
    for (let f = 0; f < 40; f++) {
      now += FRAME;
      trailingVertex(r);
    }
    const settled = trailingVertex(r);

    const { timeScale, yScale } = buildRenderContext(VIEW);
    const expectedX = timeScale.timeToBitmapX(lastTime);
    const expectedY = yScale.valueToBitmapY(values[0](lastTime) + values[1](lastTime));
    expect(Math.abs(settled.x - expectedX)).toBeLessThan(0.5);
    expect(Math.abs(settled.y - expectedY)).toBeLessThan(0.5);
    expect(r.needsAnimation).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LineRenderer } from '../../series/line';
import type { TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

/**
 * Regression for the ragged stacked stream: six layers on independent
 * cadences, none in lockstep, so a shared time column is created by one layer
 * and reached by its siblings over the next couple of seconds.
 *
 * The column's 'grow' progress used to be the minimum across the layers
 * entering there, which every straggler reset to ~0. With arrivals spread
 * wider than `entryMs` the trailing columns never settled: the stack rendered
 * a permanent vertical cliff a column short of the live edge, the bottom
 * slice's baseline flared past it into a wedge, and the pulse dots hung out
 * beyond the stroke they were supposed to sit on.
 */

const FRAME = 16;
const LAYERS = 6;
const INTERVAL = 10;
const VIEW = { timeRange: { from: 0, to: 400 }, yRange: { min: 0, max: 200 } };

const value = (li: number, t: number): number => 10 + li * 4 + 3 * Math.sin(t / 37 + li);

describe('LineRenderer — ragged stacked stream', () => {
  let now = 0;
  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function build(): LineRenderer {
    const r = new LineRenderer(LAYERS, {
      stacking: 'normal',
      area: { visible: true },
      pulse: true,
      entryMs: 300,
      smoothMs: 300,
    });

    for (let li = 0; li < LAYERS; li++) {
      const points: TimePoint[] = [];
      for (let i = 0; i < 20; i++) {
        points.push({ time: i * INTERVAL, value: value(li, i * INTERVAL) });
      }
      r.setData(points, li);
    }

    return r;
  }

  /**
   * Drive the ragged feed and stop one frame after the *last* straggler
   * reaches the newest column — the worst instant for the old min-progress
   * rule, which reset that column to ~0 right there while the layer that
   * opened it had settled 500 ms earlier.
   *
   * Arrivals at a column are spread over 500 ms against entryMs=300, the same
   * ~2x ratio a six-layer feed on independent cadences produces.
   */
  function runRaggedFeed(r: LineRenderer, rounds: number): number[] {
    const heads = new Array(LAYERS).fill(190);

    for (let round = 0; round < rounds; round++) {
      for (let li = 0; li < LAYERS; li++) {
        now += 100;
        heads[li] += INTERVAL;
        r.appendPoint({ time: heads[li], value: value(li, heads[li]) }, li);

        const { ctx } = buildRenderContext(VIEW);
        r.render(ctx);
      }
    }

    now += FRAME;

    return heads;
  }

  /**
   * Vertices of each slice's stroked upper edge — the path built right before
   * a `stroke()` call. Deliberately not `max(all lineTo)`: the fill polygon
   * also emits the baseline, which is exactly the edge the wedge bug flared
   * past the stroke.
   */
  function upperEdges(spy: ReturnType<typeof buildRenderContext>['spy']): Array<Array<{ x: number; y: number }>> {
    const calls = spy.calls;
    const strokeIdxs = calls.map((c, i) => (c.method === 'stroke' ? i : -1)).filter((i) => i >= 0);

    return strokeIdxs.map((strokeIdx) => {
      let start = strokeIdx;
      while (calls[start].method !== 'beginPath') start--;

      return calls
        .slice(start, strokeIdx)
        .filter((c) => c.method === 'lineTo' || c.method === 'moveTo')
        .map((c) => ({ x: c.args[0] as number, y: c.args[1] as number }));
    });
  }

  it('the live edge keeps up with the newest column instead of stalling behind it', () => {
    const r = build();
    const heads = runRaggedFeed(r, 8);

    const { ctx, spy, timeScale } = buildRenderContext(VIEW);
    r.render(ctx);

    const newest = Math.max(...heads);
    const tipX = Math.max(
      ...upperEdges(spy)
        .flat()
        .map((v) => v.x),
    );
    const columnWidth = timeScale.timeToBitmapX(INTERVAL) - timeScale.timeToBitmapX(0);

    // The column opened 500 ms ago and entryMs is 300, so it is fully grown.
    // The bug held it at ~0 and parked the stroke a whole column behind.
    expect(timeScale.timeToBitmapX(newest) - tipX).toBeLessThan(0.25 * columnWidth);
  });

  it('the fill closes vertically at the live edge — no baseline wedge past the tip', () => {
    const r = build();
    runRaggedFeed(r, 8);

    const { ctx, spy } = buildRenderContext(VIEW);
    r.render(ctx);

    const bottom = ctx.scope.bitmapSize.height;
    const baseline = spy
      .callsOf('lineTo')
      .map((c) => ({ x: c.args[0] as number, y: c.args[1] as number }))
      .filter((p) => Math.abs(p.y - bottom) < 0.5);
    const tipX = Math.max(
      ...upperEdges(spy)
        .flat()
        .map((v) => v.x),
    );

    expect(baseline.length).toBeGreaterThan(0);
    expect(Math.abs(Math.max(...baseline.map((p) => p.x)) - tipX)).toBeLessThan(0.5);
  });

  it('every pulse dot sits on the boundary its layer is drawn at', () => {
    const r = build();
    runRaggedFeed(r, 8);

    const { ctx, overlayCtx, spy } = buildRenderContext(VIEW);
    r.render(ctx);

    const edges = upperEdges(spy);
    expect(edges.length).toBe(LAYERS);

    r.drawOverlay(overlayCtx());
    const arcs = spy.callsOf('arc').map((c) => ({ x: c.args[0] as number, y: c.args[1] as number }));
    expect(arcs.length).toBeGreaterThan(0);

    // Each dot must land on some drawn boundary vertex — the pre-fix dots sat
    // a column to the right of every one of them.
    for (const dot of arcs) {
      const onEdge = edges.some((edge) => edge.some((v) => Math.abs(v.x - dot.x) < 0.5 && Math.abs(v.y - dot.y) < 0.5));
      expect(onEdge).toBe(true);
    }
  });
});

import { describe, expect, it, vi } from 'vitest';

import { LineRenderer } from '../../series/line';
import type { CanvasRecorder } from '../../testing/recording-context';
import { buildRenderContext } from '../helpers/render-context';

// Strictly increasing, positive — a valid stacked input where every monotone
// segment fits a bezier (no degenerate lineTo).
const seed = () => [10, 18, 26, 34, 42].map((value, i) => ({ time: i * 10 + 5, value }));
const VIEW = { timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 110 } } as const;

/** Bezier count per closed path, attributed to its terminating `fill`/`stroke`. */
function bezierGroups(spy: CanvasRecorder): { type: 'fill' | 'stroke'; beziers: number }[] {
  const groups: { type: 'fill' | 'stroke'; beziers: number }[] = [];
  let count = 0;
  for (const c of spy.calls) {
    if (c.method === 'bezierCurveTo') {
      count++;
    } else if (c.method === 'fill' || c.method === 'stroke') {
      groups.push({ type: c.method, beziers: count });
      count = 0;
    }
  }

  return groups;
}

/** Like {@link bezierGroups} but keeps each bezier's raw `[cp1x,cp1y,cp2x,cp2y,x,y]`
 *  args so a test can compare two edges' geometry, not just their count. */
function bezierArgGroups(spy: CanvasRecorder): { type: 'fill' | 'stroke'; beziers: number[][] }[] {
  const groups: { type: 'fill' | 'stroke'; beziers: number[][] }[] = [];
  let current: number[][] = [];
  for (const c of spy.calls) {
    if (c.method === 'bezierCurveTo') {
      current.push(c.args as number[]);
    } else if (c.method === 'fill' || c.method === 'stroke') {
      groups.push({ type: c.method, beziers: current });
      current = [];
    }
  }

  return groups;
}

describe('LineRenderer — stacked curve', () => {
  it("stacked curve:'smooth' curves the upper-edge stroke (#18)", () => {
    const r = new LineRenderer(2, {
      stacking: 'normal',
      curve: 'smooth',
      area: { visible: false },
      colors: ['#111', '#222'],
    });
    r.setData(seed(), 0);
    r.setData(seed(), 1);
    const { ctx, spy } = buildRenderContext(VIEW);
    r.render(ctx);

    expect(spy.countOf('bezierCurveTo')).toBeGreaterThan(0);
  });

  it('interior boundary tiles: slice lower-edge curve == the slice-below upper-edge curve (#18b)', () => {
    const r = new LineRenderer(2, {
      stacking: 'normal',
      curve: 'smooth',
      area: { visible: true },
      colors: ['#111', '#222'],
    });
    r.setData(seed(), 0);
    r.setData(seed(), 1);
    const { ctx, spy } = buildRenderContext(VIEW);
    r.render(ctx);

    // Drawn top→bottom: [slice1 fill, slice1 stroke, slice0 fill, slice0 stroke].
    const groups = bezierGroups(spy);
    expect(groups).toHaveLength(4);
    const [slice1Fill, slice1Stroke, , slice0Stroke] = groups;

    // slice1 fill = its upper curve (forward) + its lower curve (reversed);
    // slice1 stroke = its upper curve only. The difference is slice1's lower
    // edge — the shared interior boundary, which equals slice0's upper edge.
    const slice1Lower = slice1Fill.beziers - slice1Stroke.beziers;
    const slice0Upper = slice0Stroke.beziers;

    expect(slice0Upper).toBeGreaterThan(0);
    expect(slice1Lower).toBe(slice0Upper); // gap-free tiling (count)

    // Geometric tiling: equal counts aren't enough — a y-drift on one edge would
    // keep the count yet open a sliver. Assert the reversed lower edge of slice1
    // traces the SAME cubic as the forward upper edge of slice0 (a reversed cubic
    // swaps its control points), so the boundary is pixel-identical.
    const argGroups = bezierArgGroups(spy);
    const slice1FillBez = argGroups[0].beziers; // S upper-forward + S lower-reversed
    const slice0UpperBez = argGroups[3].beziers; // slice0 stroke == its upper edge
    const segs = slice0UpperBez.length;
    expect(segs).toBeGreaterThan(0);
    expect(slice1FillBez).toHaveLength(2 * segs);

    const slice1LowerBez = slice1FillBez.slice(segs);
    for (let k = 0; k < segs; k++) {
      const lower = slice1LowerBez[k]; // reversed segment (segs-1-k)
      const upper = slice0UpperBez[segs - 1 - k]; // forward same segment
      // reversed cubic: lower.cp1 == upper.cp2 and lower.cp2 == upper.cp1
      expect([lower[0], lower[1]]).toEqual([upper[2], upper[3]]);
      expect([lower[2], lower[3]]).toEqual([upper[0], upper[1]]);
    }
  });

  it.each([
    'normal',
    'percent',
  ] as const)("stacked curve:'stepped' + area + stacking:'%s' renders without crashing (segment≠point count)", (stacking) => {
    // Regression: replaySegmentsReversed indexed points[] by SEGMENT index, but
    // stepped emits 2 segments per point → out-of-bounds → TypeError aborting
    // the whole frame. area:{visible:true} is the default, so a 2-layer stacked
    // stepped line crashed out of the box.
    const r = new LineRenderer(2, {
      stacking,
      curve: 'stepped',
      area: { visible: true },
      colors: ['#111', '#222'],
    });
    r.setData(seed(), 0);
    r.setData(seed(), 1);
    const { ctx, spy } = buildRenderContext(VIEW);

    expect(() => r.render(ctx)).not.toThrow();
    // It drew the interior boundary and never emitted an undefined / NaN coord.
    expect(spy.countOf('lineTo')).toBeGreaterThan(0);
    for (const call of spy.calls) {
      for (const arg of call.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  it("stacked curve:'straight' keeps the upper edge a polyline (no beziers)", () => {
    const r = new LineRenderer(2, { stacking: 'normal', area: { visible: true }, colors: ['#111', '#222'] });
    r.setData(seed(), 0);
    r.setData(seed(), 1);
    const { ctx, spy } = buildRenderContext(VIEW);
    r.render(ctx);

    expect(spy.countOf('bezierCurveTo')).toBe(0);
    expect(spy.countOf('lineTo')).toBeGreaterThan(0);
  });

  it('a sample just before a null gap keeps its height instead of dropping to 0', () => {
    const r = new LineRenderer(2, { stacking: 'normal', area: { visible: false }, entryMs: 0 });
    r.setData(
      [
        { time: 5, value: 30 },
        { time: 15, value: 40 },
        { time: 25, value: null },
      ],
      0,
    );
    r.setData(
      [
        { time: 5, value: 10 },
        { time: 15, value: 20 },
        { time: 25, value: null },
      ],
      1,
    );
    const { ctx, spy, timeScale, yScale } = buildRenderContext(VIEW);
    r.render(ctx);

    const x = timeScale.timeToBitmapXExact(15);
    const vertices = spy.calls.filter((c) => c.method === 'moveTo' || c.method === 'lineTo');
    const heights = vertices.filter((c) => Math.abs((c.args[0] as number) - x) < 0.5).map((c) => c.args[1] as number);
    const drawnAt = (value: number): boolean =>
      heights.some((y) => Math.abs(y - yScale.valueToBitmapYExact(value)) < 0.5);

    // Each slice's top edge at t=15: the lower layer at 40, the stack at 60.
    expect(drawnAt(40)).toBe(true);
    expect(drawnAt(60)).toBe(true);
  });
});

describe('LineRenderer — percent stack with a zero-total column', () => {
  // Column 3 (time 35) is zero in every layer: no shares to split.
  const layer = (values: number[]) => values.map((value, i) => ({ time: i * 10 + 5, value }));

  function render() {
    const r = new LineRenderer(2, { stacking: 'percent', colors: ['#111', '#222'], entryAnimation: 'none' });
    r.setData(layer([10, 20, 30, 0, 40, 50]), 0);
    r.setData(layer([30, 20, 10, 0, 20, 10]), 1);
    const built = buildRenderContext(VIEW);
    r.render(built.ctx);

    return built.spy;
  }

  it('breaks every layer at the column instead of dropping it to 0%', () => {
    const spy = render();

    // Two layers × two runs, each a fill and a stroke.
    expect(spy.countOf('fill')).toBe(4);
    expect(spy.countOf('stroke')).toBe(4);
  });

  it('sends no NaN coordinate to the canvas', () => {
    const spy = render();

    for (const call of spy.calls) {
      for (const arg of call.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  it('keeps a lone column between two gaps as a dot and a point marker', () => {
    const r = new LineRenderer(2, {
      stacking: 'percent',
      colors: ['#111', '#222'],
      entryAnimation: 'none',
      points: { visible: true },
    });
    r.setData(layer([1, 0, 1, 0, 1]), 0);
    r.setData(layer([1, 0, 1, 0, 1]), 1);
    const { ctx, spy, timeScale } = buildRenderContext(VIEW);
    r.render(ctx);

    const arcXs = spy.callsOf('arc').map((call) => Number(call.args[0]));
    const columnXs = [5, 25, 45].map((time) => timeScale.timeToBitmapXExact(time));

    // Two layers × three columns, each a stroke dot and a marker.
    expect(arcXs).toHaveLength(12);
    expect(new Set(arcXs)).toEqual(new Set(columnXs));
  });
});

describe('LineRenderer — stacked area floor', () => {
  const layer = (values: number[]) => values.map((value, i) => ({ time: i * 10 + 5, value }));

  /** Y of each straight vertex on the bottom slice's fill path — the slice drawn last. */
  function bottomFillYs(r: LineRenderer, view: Parameters<typeof buildRenderContext>[0]) {
    const built = buildRenderContext(view);
    r.render(built.ctx);

    const methods = built.spy.calls.map((call) => call.method);
    const fill = methods.lastIndexOf('fill');
    const start = methods.lastIndexOf('stroke', fill);
    const ys = built.spy.calls
      .slice(start + 1, fill)
      .filter((call) => call.method === 'lineTo')
      .map((call) => call.args[1] as number);

    return { ys, yScale: built.yScale };
  }

  function stack(bottom: number[]): LineRenderer {
    const r = new LineRenderer(2, { stacking: 'normal', entryAnimation: 'none', colors: ['#111', '#222'] });
    r.setData(layer(bottom), 0);
    r.setData(layer([10, 10, 10, 10, 10]), 1);

    return r;
  }

  it('closes a stack that dips below zero at the zero row', () => {
    const r = stack([-50, 30, -40, 20, 30]);
    const { ys, yScale } = bottomFillYs(r, { ...VIEW, yRange: { min: -100, max: 100 } });
    const zeroRow = yScale.valueToBitmapYExact(0);

    expect(ys.filter((y) => Math.abs(y - zeroRow) < 0.5)).toHaveLength(5);
    expect(ys.some((y) => y > yScale.valueToBitmapYExact(-50) + 0.5)).toBe(false);
  });

  it('keeps an all-positive stack filled through the padding to the X axis', () => {
    // 40 px of bottom padding over data 0..100 in 400 px puts zero on the data floor.
    const view = { ...VIEW, yRange: { min: -10, max: 100 }, padding: { top: 0, bottom: 40 } };
    const { ys } = bottomFillYs(stack([10, 20, 30, 40, 50]), view);

    expect(ys.filter((y) => y === 400)).toHaveLength(5);
  });

  it('keeps the floor at the zero row while a negative bottom layer hides', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const r = stack([-10, -10, -10, -10, -10]);
    const view = { ...VIEW, yRange: { min: -100, max: 100 }, padding: { top: 0, bottom: 20 } };
    bottomFillYs(r, view);

    r.setLayerVisible(0, false);
    r.setLayerAlpha(0, 0, 300);
    for (const step of [100, 150, 100]) {
      now += step;
      const { ys } = bottomFillYs(r, view);

      // The -10 dip reaches 220 px; the canvas bottom is 400 px.
      expect(Math.max(...ys)).toBeLessThan(220.5);
    }

    vi.restoreAllMocks();
  });
});

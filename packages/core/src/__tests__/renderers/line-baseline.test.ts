import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LineRenderer } from '../../series/line';
import type { LinePainter } from '../../series/painters/types';
import type { CanvasRecorder } from '../../testing/recording-context';
import type { LineSeriesOptions, TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

/** Swings across 50 — the baseline row of `VIEW` sits at y = 200. */
const CROSSING: TimePoint[] = [70, 30, 80, 20, 60].map((value, i) => ({ time: i * 10 + 5, value }));
const WITH_GAP: TimePoint[] = [70, 30, Number.NaN, 80, 20, 60].map((value, i) => ({ time: i * 10 + 5, value }));

const VIEW = { timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 100 } } as const;

type Options = Partial<LineSeriesOptions> & { colors?: string[] };

interface AreaPath {
  /** Vertices of the fill's top edges, closing rows left out. */
  edge: number[][];
  /** Y of every vertex a polygon closes along — the drop and the run back. */
  closingRows: number[];
  fillStyle: string;
}

/** The area fill's path: the calls between its `beginPath` and the first `fill`. */
function areaPath(spy: CanvasRecorder): AreaPath {
  const calls = spy.calls;
  const fillIndex = calls.findIndex((c) => c.method === 'fill');
  let start = fillIndex;
  while (start > 0 && calls[start].method !== 'beginPath') {
    start--;
  }

  const edge: number[][] = [];
  const closingRows: number[] = [];
  let subpath: number[][] = [];
  for (const call of calls.slice(start + 1, fillIndex)) {
    if (call.method !== 'closePath') {
      subpath.push(call.args.slice(-2) as number[]);
      continue;
    }

    // Every polygon closes with a drop to its base row and a run back along it.
    for (const [, y] of subpath.slice(-2)) {
      closingRows.push(y);
    }
    edge.push(...subpath.slice(0, -2));
    subpath = [];
  }

  return { edge, closingRows, fillStyle: calls[fillIndex]?.fillStyle ?? '' };
}

interface Stop {
  offset: number;
  rgb: string;
  alpha: number;
}

/** Color stops of a recorded `rgba()` gradient, as serialized by the recording context. */
function gradientStops(style: string): Stop[] {
  const matches = style.matchAll(/([\d.e-]+):rgba\((\d+), (\d+), (\d+), ([\d.e-]+)\)/g);

  return [...matches].map((m) => ({ offset: Number(m[1]), rgb: `${m[2]},${m[3]},${m[4]}`, alpha: Number(m[5]) }));
}

function renderArea(options: Options, opts: { data?: TimePoint[]; yRange?: { min: number; max: number } } = {}) {
  const r = new LineRenderer(1, { colors: ['#2962ff'], ...options });
  r.setData(opts.data ?? CROSSING, 0);
  const { ctx, spy } = buildRenderContext({ ...VIEW, yRange: opts.yRange ?? VIEW.yRange });
  r.render(ctx);

  return areaPath(spy);
}

describe('LineRenderer — area.baseline', () => {
  it('closes the fill to the baseline row instead of the floor', () => {
    const floor = renderArea({ area: { visible: true } });
    const baseline = renderArea({ area: { visible: true, baseline: 50 } });

    expect(floor.closingRows.length).toBeGreaterThan(0);
    expect(new Set(floor.closingRows)).toEqual(new Set([400]));
    expect(new Set(baseline.closingRows)).toEqual(new Set([200]));
    expect(baseline.edge).toEqual(floor.edge);
  });

  it('keeps the fill on when `area` sets only the baseline', () => {
    const explicit = renderArea({ area: { visible: true, baseline: 50 } });
    const implicit = renderArea({ area: { baseline: 50 } });

    expect(implicit.closingRows.length).toBeGreaterThan(0);
    expect(implicit).toEqual(explicit);
  });

  it('fades the fill toward the baseline from both plot edges', () => {
    const { fillStyle } = renderArea({ area: { visible: true, baseline: 50 } });

    expect(gradientStops(fillStyle)).toEqual([
      { offset: 0, rgb: '41,98,255', alpha: 0.12 },
      { offset: 0.5, rgb: '41,98,255', alpha: 0.01 },
      { offset: 1, rgb: '41,98,255', alpha: 0.12 },
    ]);
  });

  it('re-reads the baseline row from the Y scale every frame', () => {
    const r = new LineRenderer(1, { colors: ['#2962ff'], area: { visible: true, baseline: 50 } });
    r.setData(CROSSING, 0);

    const first = buildRenderContext(VIEW);
    r.render(first.ctx);
    const wider = buildRenderContext({ ...VIEW, yRange: { min: 0, max: 200 } });
    r.render(wider.ctx);

    expect(new Set(areaPath(first.spy).closingRows)).toEqual(new Set([200]));
    const after = areaPath(wider.spy);
    expect(new Set(after.closingRows)).toEqual(new Set([300]));
    expect(gradientStops(after.fillStyle).map((s) => s.offset)).toEqual([0, 0.75, 1]);
  });

  it.each([
    { baseline: 500, row: 0 },
    { baseline: -50, row: 400 },
  ])('clamps a baseline outside the Y range to the plot edge ($baseline → y $row)', ({ baseline, row }) => {
    const { closingRows } = renderArea({ area: { visible: true, baseline } });

    expect(new Set(closingRows)).toEqual(new Set([row]));
  });

  it('with a threshold at the baseline, fills above in `above` and below in `below`, each fading toward it', () => {
    const { fillStyle } = renderArea({
      area: { visible: true, baseline: 50 },
      threshold: { value: 50, above: '#00ff00', below: '#ff0000' },
    });
    const stops = gradientStops(fillStyle);

    expect(stops[0]).toEqual({ offset: 0, rgb: '0,255,0', alpha: 0.26 });
    expect(stops[stops.length - 1]).toEqual({ offset: 1, rgb: '255,0,0', alpha: 0.26 });
    for (const stop of stops) {
      expect(stop.rgb).toBe(stop.offset < 0.5 ? '0,255,0' : '255,0,0');
    }

    // Faintest right at the baseline, on both sides of it.
    const nearRow = stops.filter((s) => s.offset > 0 && s.offset < 1);
    expect(nearRow.length).toBe(2);
    for (const stop of nearRow) {
      expect(stop.alpha).toBeLessThan(0.03);
    }
  });

  it.each<[string, Options]>([
    ['smooth', { curve: 'smooth' }],
    ['stepped', { curve: 'stepped' }],
    [
      'a custom linePainter',
      {
        linePainter: ((env, args) => {
          env.ctx.moveTo(args.points[0].x, args.points[0].y);
          for (let i = 1; i < args.points.length; i++) {
            env.ctx.lineTo(args.points[i].x, args.points[i].y);
          }
        }) satisfies LinePainter,
      },
    ],
  ])('closes every run of a gapped line to the baseline with %s', (_, options) => {
    const { closingRows } = renderArea({ ...options, area: { visible: true, baseline: 50 } }, { data: WITH_GAP });

    // Two runs, two polygons — the drop and the run back of each.
    expect(closingRows).toEqual([200, 200, 200, 200]);
  });

  it('stacked mode ignores the baseline', () => {
    const draw = (area: LineSeriesOptions['area']) => {
      const r = new LineRenderer(2, { colors: ['#2962ff', '#f0556a'], stacking: 'normal', area });
      r.setData(CROSSING, 0);
      r.setData(CROSSING, 1);
      const { ctx, spy } = buildRenderContext({ ...VIEW, yRange: { min: 0, max: 200 } });
      r.render(ctx);

      return { calls: spy.calls, range: r.getValueRange(0, 100) };
    };

    expect(draw({ visible: true, baseline: 120 })).toEqual(draw({ visible: true }));
  });
});

describe('LineRenderer — area.baseline autoscale', () => {
  const POSITIVE: TimePoint[] = [10, 14, 20, 12].map((value, i) => ({ time: i * 10 + 5, value }));

  function rangeOf(options: Options, plottable?: (value: number) => boolean) {
    const r = new LineRenderer(1, options);
    r.setData(POSITIVE, 0);

    return r.getValueRange(0, 100, plottable ? { plottable } : undefined);
  }

  it('stretches the Y range to keep the baseline in view', () => {
    expect(rangeOf({ area: { visible: true, baseline: 0 } })).toEqual({ min: 0, max: 20 });
    expect(rangeOf({ area: { visible: true, baseline: 50 } })).toEqual({ min: 10, max: 50 });
    expect(rangeOf({ area: { visible: true, baseline: 15 } })).toEqual({ min: 10, max: 20 });
  });

  it('leaves the range to the data when the baseline does not apply', () => {
    expect(rangeOf({ area: { visible: false, baseline: 0 } })).toEqual({ min: 10, max: 20 });
    expect(rangeOf({ area: { visible: true, baseline: 0 } }, (v) => v > 0)).toEqual({ min: 10, max: 20 });
    expect(rangeOf({ area: { visible: true, baseline: Number.NaN } })).toEqual({ min: 10, max: 20 });
  });

  it('changes its value-range key only with the options its range reads', () => {
    const r = new LineRenderer(1, { area: { visible: true } });
    const keys = new Set([r.valueRangeKey]);

    r.updateOptions({ strokeWidth: 3, curve: 'smooth' });
    expect(keys.has(r.valueRangeKey)).toBe(true);

    for (const options of [
      { area: { visible: true, baseline: 0 } },
      { area: { visible: true, baseline: 5 } },
      { area: { visible: false, baseline: 5 } },
      { area: { visible: true, baseline: 5 }, stacking: 'normal' as const },
    ]) {
      r.updateOptions(options);
      keys.add(r.valueRangeKey);
    }

    // Floor, 0, 5, and two states where the baseline does not apply (hidden area, stack).
    expect(keys.size).toBe(4);
  });

  it('has no range without data in view', () => {
    const r = new LineRenderer(1, { area: { visible: true, baseline: 0 } });

    expect(r.getValueRange(0, 100)).toBeNull();
  });
});

/**
 * The global test setup reports `prefers-reduced-motion: reduce`, which skips
 * the intro and history waves — swap in a motion-allowing `matchMedia`.
 */
describe('LineRenderer — area.baseline under animation', () => {
  const reducedMotionStub = globalThis.matchMedia;
  let now = 0;

  beforeEach(() => {
    globalThis.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof globalThis.matchMedia;
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    globalThis.matchMedia = reducedMotionStub;
    vi.restoreAllMocks();
  });

  /** Drives a floor-filled and a baseline-filled line through the same steps and frame. */
  function renderPair(options: Options, steps: (r: LineRenderer) => void) {
    const draw = (area: LineSeriesOptions['area']) => {
      const r = new LineRenderer(1, { colors: ['#2962ff'], ...options, area });
      r.setData(CROSSING, 0);
      steps(r);
      const mid = buildRenderContext(VIEW);
      r.render(mid.ctx);

      now += 10_000;
      const settled = buildRenderContext(VIEW);
      r.render(settled.ctx);

      return { mid: areaPath(mid.spy), midCalls: mid.spy.calls, settledCalls: settled.spy.calls };
    };

    return { floor: draw({ visible: true }), baseline: draw({ visible: true, baseline: 50 }) };
  }

  it.each<[string, Options, (r: LineRenderer) => void]>([
    ['the intro', {}, () => (now += 300)],
    [
      "a 'grow' entry",
      { introMs: 0 },
      (r) => {
        r.appendPoint({ time: 55, value: 90 }, 0);
        now += 100;
      },
    ],
    [
      'a history reveal',
      { introMs: 0 },
      (r) => {
        r.prependPoints([{ time: -5, value: 10 }], 0);
        now += 150;
      },
    ],
  ])('mid %s, the fill keeps the floor fill’s top edge and closes to the baseline', (_, options, steps) => {
    const { floor, baseline } = renderPair(options, steps);

    // The frame really is mid-animation: the settled line draws differently.
    expect(baseline.midCalls).not.toEqual(baseline.settledCalls);

    expect(baseline.mid.edge).toEqual(floor.mid.edge);
    expect(new Set(baseline.mid.closingRows)).toEqual(new Set([200]));
  });
});

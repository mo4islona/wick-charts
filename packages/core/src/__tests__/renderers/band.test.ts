import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnimationConfig } from '../../animation/config';
import { logScale } from '../../scales/log-scale';
import { BandRenderer, BandSeriesDef } from '../../series/band';
import type { RecordedCall } from '../../testing/recording-context';
import { catppuccin } from '../../theme/themes/catppuccin';
import type { BandPointInput } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

// With the default context (yRange 0..100 over 400px), value v lands at y = 400 - 4v.
const yOf = (value: number): number => 400 - value * 4;

function band(points: Array<[number, number, number]>): BandPointInput[] {
  return points.map(([time, low, high]) => ({ time, low, high }));
}

const STEADY = band([
  [10, 20, 60],
  [20, 25, 65],
  [30, 30, 70],
  [40, 25, 60],
]);

function render(r: BandRenderer, opts: Parameters<typeof buildRenderContext>[0] = {}) {
  const built = buildRenderContext(opts);
  r.render(built.ctx);

  return built;
}

/** Path vertices (moveTo / lineTo / bezier endpoints) between each beginPath and the fill that closes it. */
function fillPolygons(calls: readonly RecordedCall[]): Array<Array<{ x: number; y: number }>> {
  const polygons: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];

  for (const call of calls) {
    if (call.method === 'beginPath') {
      current = [];
      continue;
    }

    if (call.method === 'moveTo' || call.method === 'lineTo') {
      current.push({ x: Number(call.args[0]), y: Number(call.args[1]) });
      continue;
    }

    if (call.method === 'bezierCurveTo') {
      current.push({ x: Number(call.args[4]), y: Number(call.args[5]) });
      continue;
    }

    if (call.method === 'fill') polygons.push(current);
  }

  return polygons;
}

/** One edge segment as a cubic in Y; a straight segment is degree-elevated. */
interface CubicY {
  y0: number;
  c1: number;
  c2: number;
  y1: number;
}

/** The stroke's subpaths (upper edge, then lower edge), one cubic per segment. */
function strokedEdges(calls: readonly RecordedCall[]): CubicY[][] {
  const end = calls.findIndex((c) => c.method === 'stroke');
  let start = end;
  while (start > 0 && calls[start].method !== 'beginPath') {
    start--;
  }

  const edges: CubicY[][] = [];
  let y = 0;
  for (const call of calls.slice(start, end)) {
    if (call.method === 'moveTo') {
      edges.push([]);
      y = Number(call.args[1]);
      continue;
    }

    if (call.method === 'bezierCurveTo') {
      const y1 = Number(call.args[5]);
      edges[edges.length - 1].push({ y0: y, c1: Number(call.args[1]), c2: Number(call.args[3]), y1 });
      y = y1;
      continue;
    }

    if (call.method === 'lineTo') {
      const y1 = Number(call.args[1]);
      edges[edges.length - 1].push({ y0: y, c1: y + (y1 - y) / 3, c2: y + (2 * (y1 - y)) / 3, y1 });
      y = y1;
    }
  }

  return edges;
}

function cubicAt(c: CubicY, t: number): number {
  const u = 1 - t;

  return u * u * u * c.y0 + 3 * u * u * t * c.c1 + 3 * u * t * t * c.c2 + t * t * t * c.y1;
}

describe('BandRenderer — geometry', () => {
  it('fills only between the two edges, never down to the plot floor', () => {
    const r = new BandRenderer(1, { colors: ['#2962ff'] });
    r.setData(STEADY);
    const { spy } = render(r);

    const polygons = fillPolygons(spy.calls);
    expect(polygons).toHaveLength(1);

    const ys = polygons[0].map((p) => p.y);
    expect(Math.max(...ys)).toBeCloseTo(yOf(20));
    expect(Math.min(...ys)).toBeCloseTo(yOf(70));
    expect(ys).not.toContain(400);
  });

  it('traces the upper edge forward and the lower edge back', () => {
    const r = new BandRenderer(1);
    r.setData(STEADY);
    const { spy } = render(r);

    const [polygon] = fillPolygons(spy.calls);
    const expected = [60, 65, 70, 60, 25, 30, 25, 20].map(yOf);
    expect(polygon).toHaveLength(expected.length);
    polygon.forEach((p, i) => {
      expect(p.y).toBeCloseTo(expected[i]);
    });
  });

  it('strokes both edges with the layer color at reduced opacity', () => {
    const r = new BandRenderer(1, { colors: ['#2962ff'] });
    r.setData(STEADY);
    const { spy } = render(r);

    const strokes = spy.callsOf('stroke');
    expect(strokes).toHaveLength(1);
    expect(strokes[0].strokeStyle).toBe('rgba(41, 98, 255, 0.6)');
    expect(spy.countOf('moveTo')).toBe(1 + 2); // fill polygon + one subpath per edge
  });

  it('stroke.visible: false draws the fill only', () => {
    const r = new BandRenderer(1, { stroke: { visible: false } });
    r.setData(STEADY);
    const { spy } = render(r);

    expect(spy.countOf('fill')).toBe(1);
    expect(spy.countOf('stroke')).toBe(0);
  });

  it('defaults to a gradient of the layer color over the band extent', () => {
    const r = new BandRenderer(1, { colors: ['#2962ff'] });
    r.setData(STEADY);
    const { spy } = render(r);

    expect(spy.callsOf('fill')[0].fillStyle).toBe(
      'gradient(linear;0:rgba(41, 98, 255, 0.4),1:rgba(41, 98, 255, 0.04))',
    );
    const [, top, , bottom] = spy.callsOf('createLinearGradient')[0].args.map(Number);
    expect(top).toBeCloseTo(yOf(70));
    expect(bottom).toBeCloseTo(yOf(20));
  });

  it('a color fill paints flat', () => {
    const r = new BandRenderer(1, { fill: 'rgba(0, 0, 255, 0.2)' });
    r.setData(STEADY);
    const { spy } = render(r);

    expect(spy.callsOf('fill')[0].fillStyle).toBe('rgba(0, 0, 255, 0.2)');
    expect(spy.countOf('createLinearGradient')).toBe(0);
  });

  it('a [top, bottom] fill paints a vertical gradient over the band extent', () => {
    const r = new BandRenderer(1, { fill: ['#ff0000', '#0000ff'] });
    r.setData(STEADY);
    const { spy } = render(r);

    expect(spy.callsOf('fill')[0].fillStyle).toBe('gradient(linear;0:#ff0000,1:#0000ff)');
    const [x0, top, x1, bottom] = spy.callsOf('createLinearGradient')[0].args.map(Number);
    expect([x0, x1]).toEqual([0, 0]);
    expect(top).toBeCloseTo(yOf(70));
    expect(bottom).toBeCloseTo(yOf(20));
  });

  it('a non-finite or missing edge splits the band into separate polygons', () => {
    const r = new BandRenderer(1);
    r.setData([
      { time: 10, low: 20, high: 60 },
      { time: 20, low: 25, high: 65 },
      { time: 30, low: Number.NaN, high: 70 },
      { time: 40, low: 25, high: 60 },
      { time: 50, low: null as unknown as number, high: 60 },
      { time: 60, low: 30, high: 50 },
      { time: 70, low: 30, high: 55 },
    ]);
    const { spy } = render(r);

    // Two polygons; the lone sample at t=40 between two gaps draws as a tick.
    expect(fillPolygons(spy.calls)).toHaveLength(2);
    expect(spy.countOf('stroke')).toBe(2);
  });

  it('normalizes low > high instead of crossing the edges', () => {
    const r = new BandRenderer(1);
    r.setData(
      band([
        [10, 60, 20],
        [20, 25, 65],
      ]),
    );
    const { spy } = render(r);

    const [polygon] = fillPolygons(spy.calls);
    expect(polygon.map((p) => p.y)).toEqual([60, 65, 25, 20].map(yOf));
    expect(r.getDataAtTime(10, 1)).toMatchObject({ low: 20, high: 60 });
  });

  it('curve: smooth never overshoots either edge', () => {
    const r = new BandRenderer(1, { curve: 'smooth' });
    r.setData(
      band([
        [10, 20, 60],
        [20, 45, 90],
        [30, 10, 40],
        [40, 30, 80],
        [50, 25, 50],
      ]),
    );
    const { spy } = render(r);

    const beziers = spy.callsOf('bezierCurveTo');
    expect(beziers.length).toBeGreaterThan(0);

    // Every control point stays inside its segment's Y span — the monotone
    // guarantee that keeps each edge inside the sample envelope.
    let prevY = 0;
    for (const call of spy.calls) {
      if (call.method === 'moveTo' || call.method === 'lineTo') {
        prevY = Number(call.args[1]);
        continue;
      }
      if (call.method !== 'bezierCurveTo') continue;

      const endY = Number(call.args[5]);
      const lo = Math.min(prevY, endY) - 1e-9;
      const hi = Math.max(prevY, endY) + 1e-9;
      expect(Number(call.args[1])).toBeGreaterThanOrEqual(lo);
      expect(Number(call.args[1])).toBeLessThanOrEqual(hi);
      expect(Number(call.args[3])).toBeGreaterThanOrEqual(lo);
      expect(Number(call.args[3])).toBeLessThanOrEqual(hi);
      prevY = endY;
    }
  });

  it('curve: smooth keeps the edges in order between samples', () => {
    // Each edge is monotone on its own, yet fitted alone the lower edge rose past the upper one mid-segment.
    const r = new BandRenderer(1, { curve: 'smooth' });
    r.setData(
      band([
        [10, 0, 60],
        [20, 50, 51],
        [30, 100, 101],
        [40, 0, 101],
      ]),
    );
    const { spy } = render(r);

    const [upper, lower] = strokedEdges(spy.calls);
    expect(upper).toHaveLength(3);
    expect(lower).toHaveLength(3);

    for (let i = 0; i < upper.length; i++) {
      for (let k = 0; k <= 20; k++) {
        const t = k / 20;
        // Screen Y grows downward, so the lower edge never draws above the upper one.
        expect(cubicAt(lower[i], t)).toBeGreaterThanOrEqual(cubicAt(upper[i], t) - 1e-9);
      }
    }

    for (const segment of [...upper, ...lower]) {
      const lo = Math.min(segment.y0, segment.y1) - 1e-9;
      const hi = Math.max(segment.y0, segment.y1) + 1e-9;
      for (const control of [segment.c1, segment.c2]) {
        expect(control).toBeGreaterThanOrEqual(lo);
        expect(control).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('draws layers in order, each in its own color', () => {
    const r = new BandRenderer(2, { colors: ['#111111', '#222222'] });
    r.setData(STEADY, 0);
    r.setData(
      band([
        [10, 30, 50],
        [40, 35, 45],
      ]),
      1,
    );
    const { spy } = render(r);

    expect(spy.callsOf('fill').map((c) => c.fillStyle)).toEqual([
      'gradient(linear;0:rgba(17, 17, 17, 0.4),1:rgba(17, 17, 17, 0.04))',
      'gradient(linear;0:rgba(34, 34, 34, 0.4),1:rgba(34, 34, 34, 0.04))',
    ]);
  });

  it('a layer faded to alpha 0 draws nothing', () => {
    const r = new BandRenderer(2, { colors: ['#111111', '#222222'] });
    r.setData(STEADY, 0);
    r.setData(STEADY, 1);
    r.setLayerVisible(1, false);
    r.setLayerAlpha(1, 0, 0);
    const { spy } = render(r);

    expect(spy.countOf('fill')).toBe(1);
  });

  it('crosshair dots mark both edges of every visible band', () => {
    const r = new BandRenderer(2);
    r.setData(STEADY, 0);
    r.setData(STEADY, 1);
    const { overlayCtx, spy } = buildRenderContext({ dataInterval: 10 });
    r.drawOverlay(overlayCtx({ mediaX: 0, mediaY: 0, time: 20, y: 0 }));

    const arcs = spy.callsOf('arc');
    expect(arcs).toHaveLength(8); // 2 layers × 2 edges × (halo + dot)
    expect(arcs.map((c) => c.args[1])).toEqual(expect.arrayContaining([yOf(65), yOf(25)]));
  });
});

describe('BandRenderer — data queries', () => {
  it('value range spans the lowest low and the highest high of visible layers', () => {
    const r = new BandRenderer(2);
    r.setData(STEADY, 0);
    r.setData(band([[20, 5, 95]]), 1);

    expect(r.getValueRange(0, 100)).toEqual({ min: 5, max: 95 });

    r.setLayerVisible(1, false);
    expect(r.getValueRange(0, 100)).toEqual({ min: 20, max: 70 });
  });

  it('value range skips samples whose edges the scale cannot place', () => {
    const r = new BandRenderer(1);
    r.setData(
      band([
        [10, -5, 60],
        [20, 10, 30],
      ]),
    );

    expect(r.getValueRange(0, 100, { plottable: (v) => v > 0 })).toEqual({ min: 10, max: 30 });
  });

  it('multi-layer snapshots carry both edges; a single layer answers through getDataAtTime', () => {
    const single = new BandRenderer(1);
    single.setData(STEADY);
    expect(single.getLayerSnapshots(20, 5)).toBeNull();
    expect(single.getDataAtTime(20, 5)).toEqual({ time: 20, low: 25, high: 65 });

    const multi = new BandRenderer(2, { colors: ['#111111', '#222222'] });
    multi.setData(STEADY, 0);
    multi.setData(band([[20, 1, 2]]), 1);

    expect(multi.getLayerSnapshots(20, 5)).toEqual([
      { layerIndex: 0, time: 20, value: 45, color: '#111111', low: 25, high: 65 },
      { layerIndex: 1, time: 20, value: 1.5, color: '#222222', low: 1, high: 2 },
    ]);
  });

  it('a gap has no tooltip row', () => {
    const r = new BandRenderer(1);
    r.setData([{ time: 10, low: Number.NaN, high: 5 }]);

    expect(r.getDataAtTime(10, 5)).toBeNull();
  });
});

describe('BandRenderer — streaming', () => {
  let now = 0;
  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('appendPoint grows the store and plays the entrance', () => {
    const r = new BandRenderer(1);
    r.setData(STEADY);
    render(r);
    expect(r.needsAnimation).toBe(false);

    r.appendPoint({ time: 50, low: 30, high: 80 });
    expect(r.getTotalLength()).toBe(5);
    expect(r.needsAnimation).toBe(true);

    now += 1000;
    render(r);
    expect(r.needsAnimation).toBe(false);
  });

  it("'grow' entrance unfurls the new trailing segment from the previous point", () => {
    const r = new BandRenderer(1);
    r.setData(STEADY);
    r.appendPoint({ time: 50, low: 30, high: 80 });
    now += 50;
    const { spy, timeScale } = render(r);

    const [polygon] = fillPolygons(spy.calls);
    const headX = polygon[STEADY.length].x;
    expect(headX).toBeGreaterThan(timeScale.timeToBitmapXExact(40));
    expect(headX).toBeLessThan(timeScale.timeToBitmapXExact(50));
  });

  it("'fade' entrance fades only the new segment, in a second clipped pass", () => {
    const r = new BandRenderer(1, { entryAnimation: 'fade' });
    r.setData(STEADY);
    r.appendPoint({ time: 50, low: 30, high: 80 });
    now += 125;
    const { spy } = render(r);

    expect(spy.countOf('clip')).toBe(2);
    const alphas = spy.callsOf('fill').map((c) => c.globalAlpha);
    expect(alphas[0]).toBe(1);
    expect(alphas[1]).toBeCloseTo(0.5);
  });

  it('crosshair dots follow the growing tail, not its end position', () => {
    const r = new BandRenderer(1);
    r.setData(STEADY);
    r.appendPoint({ time: 50, low: 30, high: 80 });
    now += 50;
    const { ctx, overlayCtx, spy } = buildRenderContext({ dataInterval: 10 });
    r.render(ctx);

    // The polygon runs the upper edge forward, then the lower edge back from its last vertex.
    const polygon = fillPolygons(spy.calls)[0];
    const upperHead = polygon[STEADY.length];
    const lowerHead = polygon[STEADY.length + 1];

    r.drawOverlay(overlayCtx({ mediaX: 0, mediaY: 0, time: 50, y: 0 }));
    const arcs = spy.callsOf('arc').map((c) => ({ x: Number(c.args[0]), y: Number(c.args[1]) }));
    expect(arcs).toHaveLength(4);

    const expected = [upperHead, upperHead, lowerHead, lowerHead];
    arcs.forEach((arc, i) => {
      expect(arc.x).toBeCloseTo(expected[i].x);
      expect(arc.y).toBeCloseTo(expected[i].y);
    });
  });

  it('on a log scale, an edge still chasing through non-positive values draws as a gap', () => {
    const logContext = () => buildRenderContext({ yRange: { min: 1, max: 100 }, yTransform: logScale() });
    const r = new BandRenderer(1);
    r.setData(
      band([
        [10, 20, 60],
        [20, 25, 65],
        [30, -10, 20],
      ]),
    );
    r.render(logContext().ctx);

    r.updateLastPoint({ time: 30, low: 10, high: 20 });
    now += 16;
    const chasing = logContext();
    r.render(chasing.ctx);

    // The chased low is still ≤ 0, so the last sample stays out of the polygon instead of pinning to the floor.
    const [polygon] = fillPolygons(chasing.spy.calls);
    expect(polygon).toHaveLength(4);
    for (const vertex of polygon) {
      expect(vertex.y).toBeLessThan(399);
    }

    now += 2000;
    const settled = logContext();
    r.render(settled.ctx);
    expect(fillPolygons(settled.spy.calls)[0]).toHaveLength(6);
  });

  it('updateLastPoint chases both edges toward the new values', () => {
    const r = new BandRenderer(1);
    r.setData(STEADY);
    render(r);

    r.updateLastPoint({ time: 40, low: 45, high: 90 });
    now += 16;
    render(r);

    const mid = r.getDataAtTime(40, 5);
    expect(mid?.low).toBeGreaterThan(25);
    expect(mid?.low).toBeLessThan(45);
    expect(mid?.high).toBeGreaterThan(60);
    expect(mid?.high).toBeLessThan(90);

    now += 2000;
    render(r);
    expect(r.getDataAtTime(40, 5)).toEqual({ time: 40, low: 45, high: 90 });
    expect(r.needsAnimation).toBe(false);
  });

  it('morphData eases both edges of a sample that keeps its time, not only the last', () => {
    const r = new BandRenderer(1);
    r.setData(STEADY);
    render(r);

    r.morphData([STEADY[0], { time: 20, low: 45, high: 90 }, STEADY[2], STEADY[3]]);
    now += 16;
    render(r);

    const mid = r.getDataAtTime(20, 5);
    expect(mid?.low).toBeGreaterThan(25);
    expect(mid?.low).toBeLessThan(45);
    expect(mid?.high).toBeGreaterThan(65);
    expect(mid?.high).toBeLessThan(90);
    expect(r.getDataAtTime(10, 5)).toEqual({ time: 10, low: 20, high: 60 });

    now += 2000;
    render(r);
    expect(r.getDataAtTime(20, 5)).toEqual({ time: 20, low: 45, high: 90 });
    expect(r.needsAnimation).toBe(false);
  });

  it('smoothMs: 0 snaps the last point', () => {
    const r = new BandRenderer(1, { smoothMs: 0 });
    r.setData(STEADY);
    r.updateLastPoint({ time: 40, low: 45, high: 90 });

    expect(r.getDataAtTime(40, 5)).toEqual({ time: 40, low: 45, high: 90 });
    expect(r.needsAnimation).toBe(false);
  });

  it('prependPoints and keepLast edit the history without touching the tail', () => {
    const r = new BandRenderer(1);
    r.setData(STEADY);
    r.prependPoints(band([[0, 10, 50]]));
    expect(r.getTimeBounds()).toEqual({ first: 0, last: 40 });

    r.keepLast(2);
    expect(r.getTimeBounds()).toEqual({ first: 30, last: 40 });
    expect(r.getLastDataPoint()).toEqual({ time: 40, low: 25, high: 60 });
  });

  it('a bulk re-seed never replays the intro', () => {
    const r = new BandRenderer(1);
    r.setData(STEADY);
    render(r);

    r.setData(STEADY);
    expect(r.needsAnimation).toBe(false);
  });
});

describe('BandRenderer — intro', () => {
  const reducedMotion = globalThis.matchMedia;
  let now = 0;

  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    globalThis.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof globalThis.matchMedia;
  });
  afterEach(() => {
    globalThis.matchMedia = reducedMotion;
    vi.restoreAllMocks();
  });

  it('the default intro opens the band out of its center', () => {
    const r = new BandRenderer(1);
    r.setData(STEADY);
    expect(r.needsAnimation).toBe(true);

    render(r);
    now += 100;
    const { spy } = render(r);

    const ys = fillPolygons(spy.calls)[0].map((p) => p.y);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(height).toBeLessThan(yOf(20) - yOf(70));

    now += 5000;
    render(r);
    expect(r.needsAnimation).toBe(false);
  });

  it('on a log scale, an intro value the scale cannot place draws as a gap', () => {
    // A custom intro that drops every edge below zero for its whole run.
    const r = new BandRenderer(1, { introAnimation: () => ({ value: ({ value }) => value - 1000 }) });
    r.setData(STEADY.map((p) => ({ ...p, low: p.low + 10 })));

    const { ctx, spy } = buildRenderContext({ yRange: { min: 1, max: 100 }, yTransform: logScale() });
    r.render(ctx);

    expect(spy.countOf('fill')).toBe(0);
  });

  it('is skipped under prefers-reduced-motion', () => {
    globalThis.matchMedia = reducedMotion;
    const r = new BandRenderer(1);
    r.setData(STEADY);

    expect(r.needsAnimation).toBe(false);
  });
});

describe('BandSeriesDef', () => {
  it('one layer takes the theme band color, several take the series palette', () => {
    const { theme } = catppuccin;
    const single = BandSeriesDef.create({ theme, layerCount: 1 }, {});
    const multi = BandSeriesDef.create({ theme, layerCount: 2 }, {});

    expect(single.getLayerColors()).toEqual([theme.bands.upper]);
    expect(multi.getLayerColors()).toEqual(theme.seriesColors.slice(0, 2));
  });

  it('chart-level animations.series.band: false forces every band tween off', () => {
    const config = AnimationConfig.resolve({ series: { band: false } });

    expect(config.defaults('band')).toEqual({ entryMs: 0, smoothMs: 0, introMs: 0 });
    expect(config.overrides('band')).toEqual({ entryMs: 0, smoothMs: 0, introMs: 0 });
  });
});

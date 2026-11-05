import { afterEach, describe, expect, it, vi } from 'vitest';

import { LineRenderer } from '../../series/line';
import { lastPointOnly, pointsWhere } from '../../series/painters/point-markers';
import type { PointPaintArgs, PointPainter } from '../../series/painters/types';
import type { LineSeriesOptions, TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

const VIEW = { timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 100 } } as const;
const SPARSE: TimePoint[] = [
  { time: 10, value: 20 },
  { time: 30, value: 80 },
  { time: 50, value: 40 },
  { time: 70, value: 60 },
];

function renderer(points: NonNullable<LineSeriesOptions['points']>, options: Partial<LineSeriesOptions> = {}) {
  return new LineRenderer(1, { area: { visible: false }, pulse: false, entryMs: 0, smoothMs: 0, points, ...options });
}

function recordingPainter(): { painter: PointPainter; calls: PointPaintArgs[] } {
  const calls: PointPaintArgs[] = [];
  const painter: PointPainter = (_env, point) => {
    calls.push(point);
  };

  return { painter, calls };
}

function dense(count: number): TimePoint[] {
  return Array.from({ length: count }, (_, i) => ({ time: i, value: 50 + (i % 7) }));
}

describe('LineRenderer — points.pointPainter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces the default dots and describes each point', () => {
    const { painter, calls } = recordingPainter();
    const r = renderer({ visible: true, radius: 5, pointPainter: painter });
    r.setData(SPARSE, 0);
    const { ctx, spy, timeScale, yScale } = buildRenderContext(VIEW);

    r.render(ctx);

    expect(spy.countOf('arc')).toBe(0);
    expect(calls.map((c) => c.value)).toEqual([20, 80, 40, 60]);
    expect(calls.map((c) => c.index)).toEqual([0, 1, 2, 3]);
    expect(calls[1]).toMatchObject({
      x: timeScale.timeToBitmapXExact(30),
      y: yScale.valueToBitmapYExact(80),
      time: 30,
      radius: 5,
      hovered: false,
    });
    expect(calls.map((c) => c.isLast)).toEqual([false, false, false, true]);
  });

  it('skips a gap and treats the last finite point as the last', () => {
    const { painter, calls } = recordingPainter();
    const r = renderer({ visible: true, pointPainter: painter });
    r.setData([...SPARSE, { time: 90, value: Number.NaN }], 0);
    const { ctx } = buildRenderContext(VIEW);

    r.render(ctx);

    expect(calls.map((c) => c.time)).toEqual([10, 30, 50, 70]);
    expect(calls[3].isLast).toBe(true);
  });

  it('scales the radius by the pixel ratio and prefers points.color', () => {
    const { painter, calls } = recordingPainter();
    const r = renderer({ visible: true, radius: 4, color: '#123456', pointPainter: painter });
    r.setData(SPARSE, 0);
    const { ctx } = buildRenderContext({ ...VIEW, pixelRatio: 2 });

    r.render(ctx);

    expect(calls[0].radius).toBe(8);
    expect(calls[0].color).toBe('#123456');
  });

  it('colors a marker across a threshold like the stroke', () => {
    const { painter, calls } = recordingPainter();
    const r = renderer({ visible: true, pointPainter: painter }, { threshold: { value: 50, above: '#ff0000' } });
    r.setData(SPARSE, 0);
    const { ctx } = buildRenderContext(VIEW);

    r.render(ctx);

    expect(calls[1].color).toBe('#ff0000');
    expect(calls[0].color).not.toBe('#ff0000');
  });

  it('flags the first lowest and highest point in view, once each on flat data', () => {
    const { painter, calls } = recordingPainter();
    const r = renderer({ visible: true, pointPainter: painter });
    r.setData(
      [
        { time: 10, value: 50 },
        { time: 30, value: 50 },
      ],
      0,
    );
    const { ctx } = buildRenderContext(VIEW);

    r.render(ctx);

    expect(calls.map((c) => c.isMin)).toEqual([true, false]);
    expect(calls.map((c) => c.isMax)).toEqual([true, false]);
  });

  it('ignores an extreme past the pane edge', () => {
    const { painter, calls } = recordingPainter();
    const r = renderer({ visible: true, pointPainter: painter });
    r.setData([{ time: -5, value: 99 }, ...SPARSE], 0);
    const { ctx } = buildRenderContext(VIEW);

    r.render(ctx);

    const highest = calls.find((c) => c.isMax);
    expect(highest?.time).toBe(30);
  });

  it('keeps a marker on the animated head during the grow entrance', () => {
    const { painter, calls } = recordingPainter();
    const r = renderer({ visible: true, pointPainter: painter }, { entryMs: 1000 });
    r.setData(SPARSE, 0);
    r.appendPoint({ time: 90, value: 100 }, 0);
    const { ctx, spy, timeScale } = buildRenderContext(VIEW);

    r.render(ctx);

    const head = calls[calls.length - 1];
    const strokeHead = spy.callsOf('lineTo').at(-1);
    expect(head.time).toBe(90);
    expect(head.value).toBe(100);
    expect(head.x).toBe(strokeHead?.args[0]);
    expect(head.y).toBe(strokeHead?.args[1]);
    expect(head.x).toBeLessThan(timeScale.timeToBitmapXExact(90));
  });

  it('reads the raw value on the stacked upper edge', () => {
    const { painter, calls } = recordingPainter();
    const r = new LineRenderer(2, {
      area: { visible: false },
      pulse: false,
      entryMs: 0,
      smoothMs: 0,
      stacking: 'normal',
      points: { visible: true, pointPainter: painter },
    });
    r.setData(
      [
        { time: 10, value: 10 },
        { time: 50, value: 20 },
      ],
      0,
    );
    r.setData(
      [
        { time: 10, value: 30 },
        { time: 50, value: 40 },
      ],
      1,
    );
    const { ctx, yScale } = buildRenderContext(VIEW);

    r.render(ctx);

    const upper = calls.find((c) => c.value === 40);
    expect(upper?.y).toBe(yScale.valueToBitmapYExact(60));
    expect(calls).toHaveLength(4);
  });

  it('calls a painter on a stack only where the layer has its own sample', () => {
    const { painter, calls } = recordingPainter();
    const r = new LineRenderer(2, {
      area: { visible: false },
      pulse: false,
      entryMs: 0,
      smoothMs: 0,
      stacking: 'normal',
      points: { visible: true, pointPainter: painter },
    });
    r.setData([{ time: 10, value: 10 }], 0);
    r.setData(
      [
        { time: 10, value: 30 },
        { time: 50, value: 40 },
      ],
      1,
    );
    const { ctx } = buildRenderContext(VIEW);

    r.render(ctx);

    expect(calls.filter((c) => c.time === 50)).toHaveLength(1);
    expect(calls).toHaveLength(3);
  });

  it('falls back to the default dot and warns once when a painter throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const painter: PointPainter = (env) => {
      env.ctx.globalAlpha = 0.1;
      throw new Error('boom');
    };
    const r = renderer({ visible: true, pointPainter: painter });
    r.setData(SPARSE, 0);
    const { ctx, spy } = buildRenderContext(VIEW);

    r.render(ctx);

    const arcs = spy.callsOf('arc');
    expect(arcs).toHaveLength(SPARSE.length);
    expect(arcs.every((c) => c.globalAlpha === 1)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('isolates the canvas state of each marker', () => {
    const painter: PointPainter = (env) => {
      env.ctx.globalAlpha = 0.1;
    };
    const r = renderer({ visible: true, pointPainter: painter });
    r.setData(SPARSE, 0);
    const { ctx, spy } = buildRenderContext(VIEW);
    const canvas = ctx.scope.context;

    r.render(ctx);

    expect(canvas.globalAlpha).toBe(1);
    expect(spy.countOf('save')).toBe(spy.countOf('restore'));
  });
});

describe('LineRenderer — points.minSpacing', () => {
  it('hides default dots under 1.5 diameters', () => {
    const r = renderer({ visible: true });
    r.setData(dense(100), 0);
    const { ctx, spy } = buildRenderContext(VIEW);

    r.render(ctx);

    expect(spy.countOf('arc')).toBe(0);
  });

  it('honours a smaller threshold', () => {
    const r = renderer({ visible: true, minSpacing: 4 });
    r.setData(dense(100), 0);
    const { ctx, spy } = buildRenderContext(VIEW);

    r.render(ctx);

    expect(spy.countOf('arc')).toBe(100);
  });

  it('honours a larger threshold', () => {
    const r = renderer({ visible: true, minSpacing: 200 });
    r.setData(SPARSE, 0);
    const { ctx, spy } = buildRenderContext(VIEW);

    r.render(ctx);

    expect(spy.countOf('arc')).toBe(0);
  });

  it('always draws with minSpacing: false', () => {
    const r = renderer({ visible: true, minSpacing: false });
    r.setData(dense(100), 0);
    const { ctx, spy } = buildRenderContext(VIEW);

    r.render(ctx);

    expect(spy.countOf('arc')).toBe(100);
  });

  it('applies to a raw painter', () => {
    const { painter, calls } = recordingPainter();
    const r = renderer({ visible: true, pointPainter: painter });
    r.setData(dense(100), 0);
    const { ctx } = buildRenderContext(VIEW);

    r.render(ctx);

    expect(calls).toHaveLength(0);
  });

  it('does not hide a selection helper', () => {
    const r = renderer({ visible: true, pointPainter: lastPointOnly() });
    r.setData(dense(100), 0);
    const { ctx, spy, timeScale } = buildRenderContext(VIEW);

    r.render(ctx);

    expect(spy.countOf('arc')).toBe(1);
    expect(spy.callsOf('arc')[0].args[0]).toBe(timeScale.timeToBitmapXExact(99));
  });
});

describe('LineRenderer — hovered marker', () => {
  const crosshair = { mediaX: 0, mediaY: 0, time: 30, y: 0 };

  it('hands the hovered point to the painter in place of the crosshair dot', () => {
    const { painter, calls } = recordingPainter();
    const r = renderer({ visible: true, pointPainter: painter });
    r.setData(SPARSE, 0);
    const { ctx, overlayCtx, spy, timeScale, yScale } = buildRenderContext({ ...VIEW, dataInterval: 20 });
    r.render(ctx);
    calls.length = 0;
    spy.reset();

    r.drawOverlay(overlayCtx(crosshair));

    expect(spy.countOf('arc')).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      x: timeScale.timeToBitmapXExact(30),
      y: yScale.valueToBitmapYExact(80),
      value: 80,
      index: 1,
      hovered: true,
      isMax: true,
    });
  });

  it('keeps the crosshair dot and halo when the painter returns false', () => {
    const r = renderer({ visible: true, pointPainter: lastPointOnly() });
    r.setData(SPARSE, 0);
    const { overlayCtx, spy } = buildRenderContext({ ...VIEW, dataInterval: 20 });

    r.drawOverlay(overlayCtx(crosshair));

    expect(spy.countOf('arc')).toBe(2);
  });

  it('keeps the crosshair dot with no painter', () => {
    const r = renderer({ visible: true });
    r.setData(SPARSE, 0);
    const { overlayCtx, spy } = buildRenderContext({ ...VIEW, dataInterval: 20 });

    r.drawOverlay(overlayCtx(crosshair));

    expect(spy.countOf('arc')).toBe(2);
  });

  it('shows nothing until hover with a hovered-only selection', () => {
    const r = renderer({ visible: true, pointPainter: pointsWhere((point) => point.hovered) });
    r.setData(SPARSE, 0);
    const { ctx, overlayCtx, spy } = buildRenderContext({ ...VIEW, dataInterval: 20 });

    r.render(ctx);

    expect(spy.countOf('arc')).toBe(0);

    r.drawOverlay(overlayCtx(crosshair));

    // The grown dot and its halo.
    expect(spy.countOf('arc')).toBe(2);
    expect(spy.callsOf('arc')[1].args[2]).toBe(4);
  });

  it('ignores the painter while the markers are off', () => {
    const { painter, calls } = recordingPainter();
    const r = renderer({ visible: false, pointPainter: painter });
    r.setData(SPARSE, 0);
    const { overlayCtx, spy } = buildRenderContext({ ...VIEW, dataInterval: 20 });

    r.drawOverlay(overlayCtx(crosshair));

    expect(calls).toHaveLength(0);
    expect(spy.countOf('arc')).toBe(2);
  });
});

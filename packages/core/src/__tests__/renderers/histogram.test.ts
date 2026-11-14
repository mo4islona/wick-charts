import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HistogramRenderer } from '../../series/histogram';
import { buildRenderContext } from '../helpers/render-context';

const STILL = { introMs: 0, entryMs: 0, smoothMs: 0 } as const;

describe('HistogramRenderer', () => {
  let now = 0;

  beforeEach(() => {
    now = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws one bar per non-empty bin, edge to edge with a hairline gap', () => {
    const renderer = new HistogramRenderer(1, { ...STILL, binWidth: 10 });
    renderer.setData([5, 15, 15, 35]);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 40 }, yRange: { min: 0, max: 4 } });

    renderer.render(ctx);

    const rects = spy.callsOf('fillRect').map((call) => call.args);
    // 800 px over 40 units: a 10-wide bin is 200 px, less a 1 px gap. The empty 20–30 bin draws nothing.
    expect(rects).toEqual([
      [1, 300, 199, 100],
      [201, 200, 199, 200],
      [601, 300, 199, 100],
    ]);
  });

  it('draws pre-binned data as given', () => {
    const renderer = new HistogramRenderer(1, { ...STILL, gap: 0 });
    renderer.setData([
      { x0: 0, x1: 10, count: 2 },
      { x0: 10, x1: 30, count: 4 },
    ]);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 40 }, yRange: { min: 0, max: 4 } });

    renderer.render(ctx);

    expect(spy.callsOf('fillRect').map((call) => call.args)).toEqual([
      [0, 200, 200, 200],
      [200, 0, 400, 400],
    ]);
  });

  it('scales heights by normalize', () => {
    const renderer = new HistogramRenderer(1, { ...STILL, binWidth: 10 });
    renderer.setData([5, 15, 15, 15]);

    expect(renderer.getValueRange(0, 40)).toEqual({ min: 0, max: 3 });

    renderer.updateOptions({ normalize: 'percent' });
    expect(renderer.getValueRange(0, 40)).toEqual({ min: 0, max: 75 });

    renderer.updateOptions({ normalize: 'density' });
    expect(renderer.getValueRange(0, 40)).toEqual({ min: 0, max: 0.075 });
  });

  it('counts overlaid layers into the same bins and draws them translucent', () => {
    const renderer = new HistogramRenderer(2, { ...STILL, colors: ['#111111', '#222222'] });
    renderer.setData([1, 2, 3, 4, 5, 6, 7, 8, 9], 0);
    renderer.setData([50, 60, 70], 1);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 80 }, yRange: { min: 0, max: 10 } });

    renderer.render(ctx);

    const rows = renderer.getLayerSnapshots(55, 1) ?? [];
    expect(rows.map((row) => row.bin)).toEqual([
      { x0: 50, x1: 60, count: 0, share: 0 },
      { x0: 50, x1: 60, count: 1, share: (1 / 3) * 100 },
    ]);

    const fills = spy.callsOf('fillRect');
    expect(fills.some((call) => call.fillStyle === '#222222')).toBe(true);
    expect(fills.every((call) => call.globalAlpha < 1)).toBe(true);
  });

  it('reports the hovered bin with its range, count and share', () => {
    const renderer = new HistogramRenderer(1, { ...STILL, binWidth: 10 });
    renderer.setData([5, 15, 15, 35]);

    expect(renderer.getDataAtTime(12, 1)).toMatchObject({ x0: 10, x1: 20, count: 2, share: 50, value: 2 });
    // The last bin holds its right edge; past it there is no bin.
    expect(renderer.getDataAtTime(40, 1)).toMatchObject({ x0: 30, x1: 40 });
    expect(renderer.getDataAtTime(41, 1)).toBeNull();
  });

  it('reports the bin edges as a tick grid that counts from a round origin', () => {
    const renderer = new HistogramRenderer(1, { ...STILL, binWidth: 20 });
    renderer.setData([25, 47]);

    expect(renderer.getXTickGrid()).toEqual({ step: 20, origin: 0 });

    renderer.updateOptions({ binOrigin: 5 });
    expect(renderer.getXTickGrid()).toEqual({ step: 20, origin: 5 });

    renderer.setData([
      { x0: 0, x1: 10, count: 1 },
      { x0: 10, x1: 30, count: 1 },
    ]);
    expect(renderer.getXTickGrid()).toBeNull();
  });

  it('eases a bin to its new height when samples arrive', () => {
    const renderer = new HistogramRenderer(1, { binWidth: 10, introMs: 0, entryMs: 0, smoothMs: 200 });
    renderer.setData([5, 15]);
    renderer.appendPoint(15);

    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 20 }, yRange: { min: 0, max: 4 } });
    now += 40;
    renderer.render(ctx);
    const midway = spy.callsOf('fillRect')[1].args[3] as number;

    expect(renderer.needsAnimation).toBe(true);
    // One sample is 100 px tall: mid-ease the 10–20 bar sits between one and two samples.
    expect(midway).toBeGreaterThan(100);
    expect(midway).toBeLessThan(200);

    spy.reset();
    now += 1_000;
    renderer.render(ctx);
    expect(spy.callsOf('fillRect')[1].args[3]).toBe(200);
  });

  it('keeps each bar at its screen height across a normalize switch, as Y snaps to the new units', () => {
    const renderer = new HistogramRenderer(1, { binWidth: 10, introMs: 0, entryMs: 0, smoothMs: 300 });
    renderer.setData([5, 15, 15, 15]);
    const counts = buildRenderContext({ timeRange: { from: 0, to: 20 }, yRange: { min: 0, max: 3 } });
    renderer.render(counts.ctx);
    const before = counts.spy.callsOf('fillRect').map((call) => call.args[3]);

    renderer.updateOptions({ normalize: 'percent' });
    const percent = buildRenderContext({ timeRange: { from: 0, to: 20 }, yRange: { min: 0, max: 75 } });
    now += 16;
    renderer.render(percent.ctx);

    expect(percent.spy.callsOf('fillRect').map((call) => call.args[3])).toEqual(before);
  });

  it('keeps a bar that is still easing at its screen height across a normalize switch', () => {
    const renderer = new HistogramRenderer(1, { binWidth: 10, introMs: 0, entryMs: 0, smoothMs: 300 });
    renderer.setData([5, 15]);
    renderer.appendPoint(15);
    renderer.appendPoint(15);
    now += 40;
    const counts = buildRenderContext({ timeRange: { from: 0, to: 20 }, yRange: { min: 0, max: 3 } });
    renderer.render(counts.ctx);
    const easing = counts.spy.callsOf('fillRect')[1].args[3] as number;

    renderer.updateOptions({ normalize: 'percent' });
    const percent = buildRenderContext({ timeRange: { from: 0, to: 20 }, yRange: { min: 0, max: 75 } });
    renderer.render(percent.ctx);

    expect(percent.spy.callsOf('fillRect')[1].args[3]).toBeCloseTo(easing, 0);
  });

  it('keeps a rolling window of samples with keepLast', () => {
    const renderer = new HistogramRenderer(1, { ...STILL, binWidth: 10 });
    renderer.setData([5, 15, 25]);
    renderer.keepLast(2);

    expect(renderer.getDataAtTime(5, 1)).toBeNull();
    expect(renderer.getDataAtTime(25, 1)).toMatchObject({ count: 1, share: 50 });
  });

  it('draws a dashed quantile line with a chip per quantile', () => {
    const renderer = new HistogramRenderer(1, { ...STILL, binWidth: 10, quantiles: [0.5, { q: 0.9, label: 'slow' }] });
    renderer.setData([0, 10, 20, 30, 40]);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 50 }, yRange: { min: 0, max: 2 } });

    renderer.render(ctx);

    expect(renderer.getQuantiles()[0]).toEqual([
      { q: 0.5, label: 'p50', x: 20 },
      { q: 0.9, label: 'slow', x: 36 },
    ]);
    expect(spy.callsOf('setLineDash').some((call) => (call.args[0] as number[]).length > 0)).toBe(true);
    const texts = spy.callsOf('fillText').map((call) => call.args[0]);
    expect(texts).toEqual(expect.arrayContaining(['p50', 'slow']));
  });

  it('skips points of the other kind on a layer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const renderer = new HistogramRenderer(1, { ...STILL, binWidth: 10 });
    renderer.setData([5, 15]);
    renderer.appendPoint({ x0: 0, x1: 10, count: 9 });

    expect(renderer.getDataAtTime(5, 1)).toMatchObject({ count: 1 });
    expect(warn).toHaveBeenCalled();
  });
});

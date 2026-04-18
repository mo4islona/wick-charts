import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LineRenderer } from '../../series/line';
import type { LineData } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

const DATA: LineData[] = [
  { time: 10, value: 5 },
  { time: 20, value: 6 },
];

function displayed(r: LineRenderer): Array<number | null> {
  return (r as unknown as { displayedLastValues: Array<number | null> }).displayedLastValues;
}

function entries(r: LineRenderer, layer = 0): Map<number, { startTime: number }> {
  return (r as unknown as { entries: Array<Map<number, { startTime: number }>> }).entries[layer];
}

describe('LineRenderer — animation', () => {
  let now = 0;
  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function advance(ms: number): void {
    now += ms;
  }

  function renderFrame(r: LineRenderer): void {
    const { ctx } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 20 } });
    r.render(ctx);
  }

  it('first render seeds displayedLast to the store last; no animation on bulk load', () => {
    const r = new LineRenderer(1);
    r.setData(DATA);
    renderFrame(r);
    expect(displayed(r)[0]).toBe(6);
    expect(r.needsAnimation).toBe(false);
  });

  it('updateLastPoint smoothly chases target', () => {
    const r = new LineRenderer(1);
    r.setData(DATA);
    renderFrame(r);

    r.updateLastPoint({ time: 20, value: 16 });
    advance(16);
    renderFrame(r);

    const v = displayed(r)[0]!;
    expect(v).toBeGreaterThan(6);
    expect(v).toBeLessThan(16);
    expect(r.needsAnimation).toBe(true);
  });

  it('converges and clears needsAnimation after enough frames', () => {
    const r = new LineRenderer(1);
    r.setData(DATA);
    renderFrame(r);

    r.updateLastPoint({ time: 20, value: 16 });
    for (let i = 0; i < 60; i++) {
      advance(16);
      renderFrame(r);
    }

    expect(Math.abs((displayed(r)[0] ?? 0) - 16)).toBeLessThan(0.01);
    expect(r.needsAnimation).toBe(false);
  });

  it('liveSmoothRate: 0 disables smoothing', () => {
    const r = new LineRenderer(1, { liveSmoothRate: 0 });
    r.setData(DATA);
    renderFrame(r);

    r.updateLastPoint({ time: 20, value: 16 });
    advance(16);
    renderFrame(r);

    expect(displayed(r)[0]).toBe(16);
    expect(r.needsAnimation).toBe(false);
  });

  it('appendPoint registers an entrance entry (default grow)', () => {
    const r = new LineRenderer(1);
    r.setData(DATA);
    renderFrame(r);

    r.appendPoint({ time: 30, value: 8 });
    expect(entries(r).has(30)).toBe(true);
    expect(r.needsAnimation).toBe(true);
  });

  it("appendAnimation: 'none' skips entry registration", () => {
    const r = new LineRenderer(1, { appendAnimation: 'none' });
    r.setData(DATA);
    renderFrame(r);

    r.appendPoint({ time: 30, value: 8 });
    expect(entries(r).size).toBe(0);
  });

  it('entrance completes after appendDurationMs and clears the entry', () => {
    const r = new LineRenderer(1, { appendDurationMs: 250 });
    r.setData(DATA);
    renderFrame(r);

    r.appendPoint({ time: 30, value: 8 });
    for (let i = 0; i < 30; i++) {
      advance(16);
      renderFrame(r);
    }

    expect(entries(r).has(30)).toBe(false);
  });

  it('cancelEntranceAnimations clears entries on every layer; preserves displayedLast', () => {
    const r = new LineRenderer(2);
    r.setData(DATA, 0);
    r.setData(DATA, 1);
    renderFrame(r);

    r.appendPoint({ time: 30, value: 8 }, 0);
    r.appendPoint({ time: 30, value: 9 }, 1);
    expect(entries(r, 0).size).toBe(1);
    expect(entries(r, 1).size).toBe(1);
    const liveBefore = [...displayed(r)];

    r.cancelEntranceAnimations();

    expect(entries(r, 0).size).toBe(0);
    expect(entries(r, 1).size).toBe(0);
    expect(displayed(r)).toEqual(liveBefore);
  });

  describe('stacked mode live-tracking', () => {
    it('normal stacking: the rendered upper edge Y tracks the smoothed layer-1 value', () => {
      const r = new LineRenderer(2, { stacking: 'normal', areaFill: false });
      r.setData(
        [
          { time: 10, value: 3 },
          { time: 20, value: 4 },
        ],
        0,
      );
      r.setData(
        [
          { time: 10, value: 3 },
          { time: 20, value: 4 },
        ],
        1,
      );
      renderFrame(r);

      r.updateLastPoint({ time: 20, value: 14 }, 1);
      advance(16);

      const yRange = { min: 0, max: 30 };
      const { ctx, spy, yScale } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange });
      r.render(ctx);

      // The stacked render draws two strokes (one per layer). The topmost path's
      // last `lineTo` is at the upper cumulative at time=20 — i.e. y(4 + smoothed).
      // Without effectiveValue in the stacked path, it would be y(4 + 14) = y(18).
      const lineTos = spy.callsOf('lineTo');
      expect(lineTos.length).toBeGreaterThan(0);
      const topYs = lineTos.map((c) => c.args[1] as number);
      const highestEdge = Math.min(...topYs);

      const smoothed = displayed(r)[1]!;
      const smoothedCumulativeY = yScale.valueToBitmapY(4 + smoothed);
      const rawCumulativeY = yScale.valueToBitmapY(4 + 14);

      expect(Math.abs(highestEdge - smoothedCumulativeY)).toBeLessThan(2);
      expect(Math.abs(highestEdge - rawCumulativeY)).toBeGreaterThan(2);
    });

    it('percent stacking: the layer-split Y reflects the smoothed last value', () => {
      const r = new LineRenderer(2, { stacking: 'percent', areaFill: false });
      r.setData(
        [
          { time: 10, value: 2 },
          { time: 20, value: 3 },
        ],
        0,
      );
      r.setData(
        [
          { time: 10, value: 2 },
          { time: 20, value: 7 },
        ],
        1,
      );
      renderFrame(r);

      r.updateLastPoint({ time: 20, value: 27 }, 1);
      advance(16);

      const { ctx, spy, yScale } = buildRenderContext({
        timeRange: { from: 0, to: 100 },
        yRange: { min: 0, max: 100 },
      });
      r.render(ctx);

      const lineTos = spy.callsOf('lineTo');
      expect(lineTos.length).toBeGreaterThan(0);

      // Layer-0 cumulative at time=20 is 3 / (3 + smoothed) * 100, vs raw 3/(3+27)*100=10%.
      const smoothed = displayed(r)[1]!;
      const smoothedPct = (3 / (3 + smoothed)) * 100;
      const rawPct = (3 / (3 + 27)) * 100;

      // The layer-0 path's Y at x=time=20 (rightmost) — the lowest of the two layer strokes.
      // Capture the largest Y (smallest percentage → biggest screen Y for typical yScale).
      const ys = lineTos.map((c) => c.args[1] as number);
      const lowestPath = Math.max(...ys); // bottom of chart for smallest percent
      const expectedSmoothedY = yScale.valueToBitmapY(smoothedPct);
      const expectedRawY = yScale.valueToBitmapY(rawPct);

      expect(Math.abs(lowestPath - expectedSmoothedY)).toBeLessThan(2);
      expect(Math.abs(lowestPath - expectedRawY)).toBeGreaterThan(2);
    });
  });

  it('pulse-dot position uses the smoothed last value', () => {
    const r = new LineRenderer(1, { pulse: true });
    r.setData(DATA);
    renderFrame(r);

    r.updateLastPoint({ time: 20, value: 18 });
    advance(16);
    // advanceLiveTracking only runs inside render() — trigger once, read smoothed value.
    renderFrame(r);
    const smoothedValue = displayed(r)[0]!;

    // Draw overlay and assert the pulse arc's y matches the smoothed value's Y,
    // not the raw 18.
    const { overlayCtx, yScale, spy } = buildRenderContext({
      timeRange: { from: 0, to: 100 },
      yRange: { min: 0, max: 20 },
    });
    r.drawOverlay(overlayCtx());
    const arcs = spy.callsOf('arc');
    // Arcs include crosshair (none here) and pulse (two per visible layer: glow + dot).
    expect(arcs.length).toBeGreaterThan(0);
    const arcY = arcs[0].args[1] as number;
    expect(Math.abs(arcY - yScale.valueToBitmapY(smoothedValue))).toBeLessThan(1);
    expect(Math.abs(arcY - yScale.valueToBitmapY(18))).toBeGreaterThan(1);
  });

  describe('pulse-dot X follows the trailing-segment entrance', () => {
    it("'grow' entrance: pulse X is between penultimate and new X during the animation", () => {
      const r = new LineRenderer(1, {
        pulse: true,
        appendAnimation: 'grow',
        appendDurationMs: 400,
      });
      r.setData(DATA);
      renderFrame(r);

      r.appendPoint({ time: 30, value: 9 });
      advance(16);

      // Render main once to advance per-frame state; pulse dot is drawn in drawOverlay.
      renderFrame(r);

      const { overlayCtx, timeScale, spy } = buildRenderContext({
        timeRange: { from: 0, to: 100 },
        yRange: { min: 0, max: 20 },
      });
      r.drawOverlay(overlayCtx());
      const arcs = spy.callsOf('arc');
      expect(arcs.length).toBeGreaterThan(0);
      const arcX = arcs[0].args[0] as number;

      const penulX = timeScale.timeToBitmapX(20);
      const lastX = timeScale.timeToBitmapX(30);
      // Strictly between penultimate and new — confirms the interpolation wired in.
      expect(arcX).toBeGreaterThan(penulX);
      expect(arcX).toBeLessThan(lastX);
    });

    it('pulse dot X lands at the raw last-point X after the entrance completes', () => {
      const r = new LineRenderer(1, {
        pulse: true,
        appendAnimation: 'grow',
        appendDurationMs: 250,
      });
      r.setData(DATA);
      renderFrame(r);

      r.appendPoint({ time: 30, value: 9 });
      // Run past the entrance duration.
      for (let i = 0; i < 30; i++) {
        advance(16);
        renderFrame(r);
      }

      const { overlayCtx, timeScale, spy } = buildRenderContext({
        timeRange: { from: 0, to: 100 },
        yRange: { min: 0, max: 20 },
      });
      r.drawOverlay(overlayCtx());
      const arcs = spy.callsOf('arc');
      expect(arcs.length).toBeGreaterThan(0);
      const arcX = arcs[0].args[0] as number;

      const lastX = timeScale.timeToBitmapX(30);
      expect(Math.abs(arcX - lastX)).toBeLessThan(1);
    });

    it("'appendAnimation: none' — pulse dot X snaps to the new X on the first frame", () => {
      const r = new LineRenderer(1, {
        pulse: true,
        appendAnimation: 'none',
      });
      r.setData(DATA);
      renderFrame(r);

      r.appendPoint({ time: 30, value: 9 });
      advance(16);
      renderFrame(r);

      const { overlayCtx, timeScale, spy } = buildRenderContext({
        timeRange: { from: 0, to: 100 },
        yRange: { min: 0, max: 20 },
      });
      r.drawOverlay(overlayCtx());
      const arcs = spy.callsOf('arc');
      expect(arcs.length).toBeGreaterThan(0);
      const arcX = arcs[0].args[0] as number;

      const lastX = timeScale.timeToBitmapX(30);
      expect(Math.abs(arcX - lastX)).toBeLessThan(1);
    });
  });
});

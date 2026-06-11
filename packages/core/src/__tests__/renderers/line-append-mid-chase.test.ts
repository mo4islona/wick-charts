import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LineRenderer } from '../../series/line';
import type { TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

/**
 * Regression for "line kinks / head teleports for 1–2 frames on every append".
 *
 * A fast feed streams `updateLastPoint` ticks (smoothed by the live-chase
 * spring) and then appends the next point while the spring is still mid-flight.
 * `appendPoint` used to kill the spring, so the now-penultimate vertex snapped
 * from its smoothed display Y to the raw stored value in a single frame — and
 * the 'grow' entrance launched the head from that raw position instead of
 * where it was actually drawn. The fix pins the in-flight chase to the
 * penultimate's time and lets it keep settling.
 */

const DATA: TimePoint[] = [
  { time: 10, value: 5 },
  { time: 20, value: 6 },
];

function displayed(r: LineRenderer): Array<number | null> {
  return (r as unknown as { displayedLastValues: Array<number | null> }).displayedLastValues;
}

describe('LineRenderer — append while the live chase is mid-flight', () => {
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

  /** Stream an update toward 16 and stop mid-chase: displayed is strictly
   *  between the old value (6) and the target (16) when this returns. */
  function midChaseSetup(): { r: LineRenderer; midChase: number } {
    const r = new LineRenderer(1, { area: { visible: false }, smoothMs: 400, entryMs: 400 });
    r.setData(DATA);
    renderFrame(r);

    r.updateLastPoint({ time: 20, value: 16 });
    advance(48);
    renderFrame(r);
    const midChase = displayed(r)[0];
    if (midChase === null) throw new Error('chase did not seed');

    return { r, midChase };
  }

  it('sanity: the chase is mid-flight before the append', () => {
    const { midChase } = midChaseSetup();

    expect(midChase).toBeGreaterThan(6);
    expect(midChase).toBeLessThan(15);
  });

  it('the penultimate vertex keeps its smoothed Y on the first post-append frame (no snap to raw)', () => {
    const { r, midChase } = midChaseSetup();

    r.appendPoint({ time: 30, value: 8 });
    advance(16);

    const { ctx, spy, timeScale, yScale } = buildRenderContext({
      timeRange: { from: 0, to: 100 },
      yRange: { min: 0, max: 20 },
    });
    r.render(ctx);

    const X20 = timeScale.timeToBitmapX(20);
    const at20 = spy.callsOf('lineTo').filter((c) => Math.abs((c.args[0] as number) - X20) < 0.5);
    expect(at20.length).toBeGreaterThan(0);
    const y20 = at20[0].args[1] as number;

    // One 16ms tick after the append the pinned spring has barely moved on
    // from `midChase` — nowhere near the raw stored value (16) it used to
    // snap to. yRange 0..20 over 400px → 20px per value unit.
    expect(Math.abs(y20 - yScale.valueToBitmapY(midChase))).toBeLessThan(20);
    expect(Math.abs(y20 - yScale.valueToBitmapY(16))).toBeGreaterThan(100);
  });

  it("the 'grow' head launches from the smoothed penultimate, not the raw value", () => {
    const { r, midChase } = midChaseSetup();

    r.appendPoint({ time: 30, value: 8 });
    advance(16);

    const { ctx, spy, timeScale, yScale } = buildRenderContext({
      timeRange: { from: 0, to: 100 },
      yRange: { min: 0, max: 20 },
    });
    r.render(ctx);

    // The trailing (growing) endpoint is the only lineTo strictly right of X20.
    const X20 = timeScale.timeToBitmapX(20);
    const trailing = spy.callsOf('lineTo').filter((c) => (c.args[0] as number) > X20 + 1);
    expect(trailing.length).toBeGreaterThan(0);
    const trailingY = trailing[0].args[1] as number;

    // At entrance progress ≈ 0 the head must sit where the line head was
    // drawn the frame before the append (the smoothed value) — continuity is
    // the whole point. The buggy path lerped from y(16) and landed ~160px off.
    expect(Math.abs(trailingY - yScale.valueToBitmapY(midChase))).toBeLessThan(25);
    expect(Math.abs(trailingY - yScale.valueToBitmapY(16))).toBeGreaterThan(100);
  });

  it('the pinned chase settles on the stored value and clears needsAnimation', () => {
    const { r } = midChaseSetup();

    r.appendPoint({ time: 30, value: 8 });
    for (let i = 0; i < 80; i++) {
      advance(16);
      renderFrame(r);
    }

    const { ctx, spy, timeScale, yScale } = buildRenderContext({
      timeRange: { from: 0, to: 100 },
      yRange: { min: 0, max: 20 },
    });
    r.render(ctx);

    const X20 = timeScale.timeToBitmapX(20);
    const at20 = spy.callsOf('lineTo').filter((c) => Math.abs((c.args[0] as number) - X20) < 0.5);
    expect(at20.length).toBeGreaterThan(0);
    expect(Math.abs((at20[0].args[1] as number) - yScale.valueToBitmapY(16))).toBeLessThan(1);
    expect(r.needsAnimation).toBe(false);
  });

  it('panned into history: the visible tail is NOT replaced by the store-last endpoint', () => {
    const r = new LineRenderer(1, { area: { visible: false } });
    const points: TimePoint[] = [];
    for (let t = 10; t <= 100; t += 10) {
      points.push({ time: t, value: 5 });
    }
    r.setData(points);

    // Viewport ends at t=55; getVisibleData adds one margin point (t=60).
    // The old code swapped that margin point for the store's last (t=100),
    // stroking a bogus segment shooting toward the live edge.
    const { ctx, spy, timeScale } = buildRenderContext({
      timeRange: { from: 0, to: 55 },
      yRange: { min: 0, max: 20 },
    });
    r.render(ctx);

    const X60 = timeScale.timeToBitmapX(60);
    const X100 = timeScale.timeToBitmapX(100);
    const xs = spy.callsOf('lineTo').map((c) => c.args[0] as number);

    expect(xs.some((x) => Math.abs(x - X60) < 0.5)).toBe(true);
    expect(xs.some((x) => Math.abs(x - X100) < 0.5)).toBe(false);
  });
});

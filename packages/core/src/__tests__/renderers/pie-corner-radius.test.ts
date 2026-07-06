import { describe, expect, it } from 'vitest';

import { PieRenderer } from '../../series/pie';
import type { PieSliceData } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

/**
 * Tests for `cornerRadius` — rounding the corners where a slice's straight
 * edges meet the outer rim (and, for donuts, the inner rim). Slices default
 * to `sliceLabels: { mode: 'none' }` throughout so `arc` calls come only from
 * slice paths, not label anchor dots / leader lines.
 */

const SLICES: PieSliceData[] = [
  { label: 'A', value: 50 },
  { label: 'B', value: 30 },
  { label: 'C', value: 20 },
];

function finite(n: unknown): boolean {
  return typeof n === 'number' && Number.isFinite(n);
}

describe('PieRenderer — cornerRadius', () => {
  it('defaults to rounded corners (3px): 1 main arc + 2 fillets per slice', () => {
    const r = new PieRenderer({ padAngle: 0, sliceLabels: { mode: 'none' } });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx);

    expect(spy.countOf('arc')).toBe(SLICES.length * 3);
  });

  it('cornerRadius: 0 opts out — one outer arc per slice, no fillets', () => {
    const r = new PieRenderer({ padAngle: 0, cornerRadius: 0, sliceLabels: { mode: 'none' } });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx);

    expect(spy.countOf('arc')).toBe(SLICES.length);
  });

  it('full pie: rounds only the two outer corners — 1 main arc + 2 fillets per slice', () => {
    const r = new PieRenderer({ padAngle: 0, cornerRadius: 12, sliceLabels: { mode: 'none' } });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx);

    expect(spy.countOf('arc')).toBe(SLICES.length * 3);
    for (const call of spy.callsOf('arc')) {
      for (const arg of call.args) expect(finite(arg) || typeof arg === 'boolean').toBe(true);
    }
  });

  it('donut: rounds all four corners — 2 main arcs + 4 fillets per slice', () => {
    const r = new PieRenderer({ padAngle: 0, innerRadiusRatio: 0.6, cornerRadius: 10, sliceLabels: { mode: 'none' } });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx);

    expect(spy.countOf('arc')).toBe(SLICES.length * 6);
    for (const call of spy.callsOf('arc')) {
      for (const arg of call.args) expect(finite(arg) || typeof arg === 'boolean').toBe(true);
    }
  });

  it('auto-clamps on a very thin ring instead of producing degenerate geometry', () => {
    // outerR - innerR is tiny (0.98 ratio) — a naive 30px corner radius would
    // vastly exceed the ring's depth if not clamped per slice.
    const r = new PieRenderer({
      padAngle: 0,
      innerRadiusRatio: 0.98,
      cornerRadius: 30,
      sliceLabels: { mode: 'none' },
    });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx);

    expect(spy.countOf('arc')).toBe(SLICES.length * 6);
    for (const call of spy.callsOf('arc')) {
      for (const arg of call.args) expect(finite(arg) || typeof arg === 'boolean').toBe(true);
    }
  });

  it('auto-clamps on many thin slices instead of producing degenerate geometry', () => {
    const many: PieSliceData[] = Array.from({ length: 24 }, (_, i) => ({ label: `S${i}`, value: 1 }));
    const r = new PieRenderer({ padAngle: 0.5, cornerRadius: 40, other: false, sliceLabels: { mode: 'none' } });
    r.setData(many);
    const { ctx, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx);

    expect(spy.countOf('arc')).toBe(many.length * 3);
    for (const call of spy.callsOf('arc')) {
      for (const arg of call.args) expect(finite(arg) || typeof arg === 'boolean').toBe(true);
    }
  });

  it('a cornerRadius larger than the outer radius still renders finite geometry', () => {
    const r = new PieRenderer({ padAngle: 0, cornerRadius: 10_000, sliceLabels: { mode: 'none' } });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx);

    expect(spy.countOf('arc')).toBe(SLICES.length * 3);
    for (const call of spy.callsOf('arc')) {
      for (const arg of call.args) expect(finite(arg) || typeof arg === 'boolean').toBe(true);
    }
  });

  it('updating cornerRadius at runtime changes the arc count on the next render', () => {
    const r = new PieRenderer({ padAngle: 0, cornerRadius: 0, sliceLabels: { mode: 'none' } });
    r.setData(SLICES);
    const { ctx, spy: spy1 } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx);
    expect(spy1.countOf('arc')).toBe(SLICES.length);

    r.updateOptions({ cornerRadius: 12 });
    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx2);

    expect(spy.countOf('arc')).toBe(SLICES.length * 3);
  });
});

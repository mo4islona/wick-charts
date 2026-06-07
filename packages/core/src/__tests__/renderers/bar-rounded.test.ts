import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BarRenderer } from '../../series/bar';
import type { BarPainter } from '../../series/painters/types';
import { catppuccin } from '../../theme/themes/catppuccin';
import { buildRenderContext } from '../helpers/render-context';

// Wide, tall bars (slot 200px @ dataInterval 25, body ~118px) so the default
// 4px radius is never clamped away — rounding is unambiguous.
const WIDE = { yRange: { min: 0, max: 100 }, dataInterval: 25 } as const;

describe('BarRenderer — rounded corners (default)', () => {
  it('a positive bar rounds its top with arcTo and fills with the bar color', () => {
    const r = new BarRenderer(1, { colors: ['#8250df'] });
    r.setData([
      { time: 25, value: 60 },
      { time: 50, value: 80 },
      { time: 75, value: 50 },
    ]);
    const { ctx, spy } = buildRenderContext(WIDE);
    r.render(ctx);

    // Two arcs per bar (top-left + top-right), three bars.
    expect(spy.countOf('arcTo')).toBe(6);
    expect(spy.countOf('fill')).toBe(3);
    // Bodies never use the square path when they round.
    expect(spy.countOf('fillRect')).toBe(0);
    expect(spy.callsOf('fill').at(-1)?.fillStyle).toBe('#8250df');
  });

  it('rounds the top of a positive bar and the bottom of a negative bar', () => {
    const pos = new BarRenderer(1, { colors: ['#8250df'] });
    pos.setData([{ time: 50, value: 60 }]);
    const a = buildRenderContext({ ...WIDE, timeRange: { from: 0, to: 100 } });
    pos.render(a.ctx);

    const neg = new BarRenderer(1, { colors: ['#8250df', '#c4820e'] });
    neg.setData([{ time: 50, value: -30 }]);
    const b = buildRenderContext({ yRange: { min: -50, max: 100 }, dataInterval: 25, timeRange: { from: 0, to: 100 } });
    neg.render(b.ctx);

    const posTopY = a.yScale.valueToBitmapY(60);
    const zeroY = b.yScale.valueToBitmapY(0);
    const negBottomY = b.yScale.valueToBitmapY(-30);

    // Positive bar: both arc control points sit on the top edge (free end).
    for (const arc of a.spy.callsOf('arcTo')) {
      expect(arc.args[1] as number).toBeCloseTo(posTopY, 0);
    }
    // Negative bar: arcs sit on the bottom edge, clearly below the zero line.
    for (const arc of b.spy.callsOf('arcTo')) {
      expect(arc.args[1] as number).toBeCloseTo(negBottomY, 0);
      expect(arc.args[1] as number).toBeGreaterThan(zeroY);
    }
  });

  it('a sub-1px-tall bar degrades to fillRect — never a near-zero arcTo', () => {
    const r = new BarRenderer(1, { colors: ['#8250df'] });
    // value 1 over a [0,1000] range → ~0.4px tall → clamps to 1px.
    r.setData([{ time: 50, value: 1 }]);
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 1000 }, dataInterval: 25 });
    expect(() => r.render(ctx)).not.toThrow();

    expect(spy.countOf('arcTo')).toBe(0);
    expect(spy.countOf('fillRect')).toBe(1);
    for (const call of spy.calls) {
      for (const arg of call.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  it('stacked: only the topmost segment per column rounds; interior segments stay square', () => {
    const r = new BarRenderer(2, { colors: ['#8250df', '#c4820e'], stacking: 'normal' });
    r.setData([{ time: 50, value: 50 }], 0); // paid (interior)
    r.setData([{ time: 50, value: 15 }], 1); // awaiting cap (top)
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 80 }, dataInterval: 25 });
    r.render(ctx);

    const arcs = spy.callsOf('arcTo');
    expect(arcs.length).toBeGreaterThan(0);
    // Only the cap (layer 1) rounds — every arc is painted in the cap color.
    for (const arc of arcs) {
      expect(arc.fillStyle).toBe('#c4820e');
    }
    // The interior paid segment is square → a fillRect in the paid color.
    expect(spy.callsOf('fillRect').some((f) => f.fillStyle === '#8250df')).toBe(true);
  });

  it('overlap (stacking off): only the front-most bar rounds; the taller back bar is square', () => {
    const r = new BarRenderer(2, { colors: ['#111111', '#222222'], stacking: 'off' });
    r.setData([{ time: 50, value: 80 }], 0); // tall → drawn first (behind)
    r.setData([{ time: 50, value: 30 }], 1); // short → drawn last (front)
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 100 }, dataInterval: 25 });
    r.render(ctx);

    const arcs = spy.callsOf('arcTo');
    expect(arcs.length).toBeGreaterThan(0);
    // Only the front (shorter, layer 1) bar rounds.
    for (const arc of arcs) {
      expect(arc.fillStyle).toBe('#222222');
    }
    // The back (taller, layer 0) bar is square → a fillRect in its color.
    expect(spy.callsOf('fillRect').some((f) => f.fillStyle === '#111111')).toBe(true);
  });

  it('a projected bar fills translucent with globalAlpha left at 1 (single alpha source)', () => {
    const r = new BarRenderer(1, { colors: ['#8250df'], projectedFrom: 60 });
    r.setData([
      { time: 25, value: 50 },
      { time: 50, value: 50 },
      { time: 75, value: 50 }, // >= 60 → projected ghost
    ]);
    const { ctx, spy } = buildRenderContext(WIDE);
    r.render(ctx);

    const ghostFills = spy.callsOf('fill').filter((f) => String(f.fillStyle).includes('rgba'));
    expect(ghostFills).toHaveLength(1);
    // The painter never touches globalAlpha — the translucency is the only fade.
    expect(ghostFills[0].globalAlpha).toBe(1);
    // The two real bars fill solid.
    expect(spy.callsOf('fill').filter((f) => f.fillStyle === '#8250df')).toHaveLength(2);
  });

  it('cornerRadius:0 is byte-identical to the pre-rounding fillRect path', () => {
    const r = new BarRenderer(1, { colors: ['#8250df'], cornerRadius: 0 });
    r.setData([
      { time: 25, value: 60 },
      { time: 50, value: 80 },
    ]);
    const { ctx, spy } = buildRenderContext(WIDE);
    r.render(ctx);

    expect(spy.countOf('arcTo')).toBe(0);
    expect(spy.countOf('fill')).toBe(0);
    expect(spy.countOf('fillRect')).toBe(2);
  });

  it('a projected bar with a #rgb shorthand color fills a valid rgba — never rgba(NaN, …)', () => {
    const r = new BarRenderer(1, { colors: ['#abc'], projectedFrom: 60 });
    r.setData([
      { time: 25, value: 50 },
      { time: 75, value: 50 }, // >= 60 → projected ghost
    ]);
    const { ctx, spy } = buildRenderContext(WIDE);
    r.render(ctx);

    const ghost = spy.callsOf('fill').find((f) => String(f.fillStyle).includes('rgba'));
    // Shorthand is expanded before alpha-blending; no NaN channel reaches canvas.
    expect(ghost?.fillStyle).toBe('rgba(170, 187, 204, 0.25)');
    expect(String(ghost?.fillStyle)).not.toContain('NaN');
  });

  describe('rounds through the entrance transform (§3.2 BLOCKER — no square→rounded pop)', () => {
    let now = 0;
    beforeEach(() => {
      now = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('an entering bar (progress<1) still rounds (arcTo under globalAlpha<1), never a square fillRect', () => {
      const r = new BarRenderer(1, { colors: ['#8250df'], entryMs: 250 });
      // setData clears entrance entries → these two are settled.
      r.setData([
        { time: 25, value: 60 },
        { time: 50, value: 80 },
      ]);
      // Append a tall bar and render mid-entrance so it draws through the
      // entrance branch (the only place a square→rounded pop could regress).
      r.appendPoint({ time: 75, value: 90 });
      now += 100; // 100/250 = 0.4 progress
      const { ctx, spy } = buildRenderContext(WIDE);
      r.render(ctx);

      // The entering bar is rounded WHILE faded — an arcTo recorded under a
      // sub-1 globalAlpha proves the rounded path ran inside the transform.
      expect(spy.callsOf('arcTo').some((a) => a.globalAlpha < 1)).toBe(true);
      // It never fell back to a square fillRect mid-entrance.
      expect(spy.countOf('fillRect')).toBe(0);
    });
  });

  describe('options survive a runtime theme switch (#17 — applyTheme merges, not replaces)', () => {
    it('a set cornerRadius:0 is preserved (a replace-instead-of-merge would start rounding)', () => {
      const r = new BarRenderer(1, { colors: ['#8250df'], cornerRadius: 0 });
      r.setData([
        { time: 25, value: 60 },
        { time: 50, value: 80 },
      ]);
      // applyTheme only sends a partial { colors }; the shallow merge must keep
      // cornerRadius:0 rather than dropping it back to the rounded default.
      r.applyTheme(catppuccin.theme, catppuccin.theme);
      const { ctx, spy } = buildRenderContext(WIDE);
      r.render(ctx);

      expect(spy.countOf('arcTo')).toBe(0);
      expect(spy.countOf('fillRect')).toBe(2);
    });

    it('a set barPainter is preserved (the custom painter still runs after the swap)', () => {
      let painted = 0;
      const painter: BarPainter = () => {
        painted++;
      };
      const r = new BarRenderer(1, { colors: ['#8250df'], barPainter: painter });
      r.setData([{ time: 50, value: 60 }]);
      r.applyTheme(catppuccin.theme, catppuccin.theme);
      const { ctx } = buildRenderContext(WIDE);
      r.render(ctx);

      // If the swap had replaced options, the default rounded fill would run
      // and `painted` would stay 0.
      expect(painted).toBe(1);
    });
  });
});

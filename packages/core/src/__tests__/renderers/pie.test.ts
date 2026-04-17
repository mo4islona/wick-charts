import { describe, expect, it } from 'vitest';

import { PieRenderer } from '../../series/pie';
import { darkTheme } from '../../theme/dark';
import type { PieSliceData } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

const SLICES: PieSliceData[] = [
  { label: 'A', value: 50 },
  { label: 'B', value: 30 },
  { label: 'C', value: 20 },
];

describe('PieRenderer.render', () => {
  it('empty data → zero draw calls', () => {
    const r = new PieRenderer();
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);
    expect(spy.calls).toHaveLength(0);
  });

  it('N slices → N arc() calls', () => {
    const r = new PieRenderer();
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    // Pie: outer arc per slice (no inner arc because innerRadiusRatio=0 → lineTo center).
    expect(spy.countOf('arc')).toBe(3);
  });

  it('slice angle is proportional to value', () => {
    const r = new PieRenderer({ padAngle: 0 });
    r.setData([
      { label: 'half', value: 50 },
      { label: 'quarter', value: 25 },
      { label: 'quarter2', value: 25 },
    ]);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    const arcs = spy.callsOf('arc');
    expect(arcs).toHaveLength(3);

    const startAngle0 = arcs[0].args[3] as number;
    const endAngle0 = arcs[0].args[4] as number;
    const sweep0 = endAngle0 - startAngle0;
    const startAngle1 = arcs[1].args[3] as number;
    const endAngle1 = arcs[1].args[4] as number;
    const sweep1 = endAngle1 - startAngle1;
    // First slice (50%) sweeps ~twice the second (25%).
    expect(sweep0).toBeCloseTo(sweep1 * 2, 2);
  });

  it('innerRadiusRatio > 0 → donut: each slice draws both an outer and an inner arc', () => {
    const r = new PieRenderer({ innerRadiusRatio: 0.5 });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    // With donut, each slice draws 2 arcs (outer + reverse inner).
    expect(spy.countOf('arc')).toBe(6);
  });

  it('each slice fills with a radial gradient (depth effect)', () => {
    const r = new PieRenderer();
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    // One createRadialGradient per slice.
    expect(spy.countOf('createRadialGradient')).toBe(3);
    const fills = spy.callsOf('fill');
    expect(fills).toHaveLength(3);
    for (const f of fills) expect(f.fillStyle).toContain('gradient(radial');
  });

  it('stroke-draw suppressed when strokeWidth=0 or strokeColor=transparent', () => {
    const r = new PieRenderer({ strokeWidth: 0, strokeColor: 'transparent' });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    expect(spy.countOf('stroke')).toBe(0);
  });
});

describe('PieRenderer.hitTest', () => {
  it('returns correct slice index for a point inside the pie', () => {
    const r = new PieRenderer({ padAngle: 0 });
    r.setData([
      { label: 'top-right', value: 25 }, // rendering starts at top, sweeps clockwise
      { label: 'bottom-right', value: 25 },
      { label: 'bottom-left', value: 25 },
      { label: 'top-left', value: 25 },
    ]);
    // Clearly in the top-right quadrant (above center, right of center).
    expect(r.hitTest(260, 140, 400, 400)).toBe(0);
    // Clearly in the bottom-right quadrant.
    expect(r.hitTest(260, 260, 400, 400)).toBe(1);
    // Clearly in the bottom-left quadrant.
    expect(r.hitTest(140, 260, 400, 400)).toBe(2);
    // Clearly in the top-left quadrant.
    expect(r.hitTest(140, 140, 400, 400)).toBe(3);
  });

  it('returns -1 for a point outside the outer radius', () => {
    const r = new PieRenderer();
    r.setData(SLICES);
    expect(r.hitTest(10, 10, 400, 400)).toBe(-1);
  });

  it('returns -1 for a point in the donut hole when innerRadiusRatio > 0', () => {
    const r = new PieRenderer({ innerRadiusRatio: 0.7 });
    r.setData(SLICES);
    // Center point — well inside the inner radius.
    expect(r.hitTest(200, 200, 400, 400)).toBe(-1);
  });

  it('returns -1 on empty data', () => {
    const r = new PieRenderer();
    expect(r.hitTest(100, 100, 400, 400)).toBe(-1);
  });
});

describe('PieRenderer.getSliceInfo / getHoverInfo', () => {
  it('getSliceInfo returns percentages that sum to 100', () => {
    const r = new PieRenderer();
    r.setData(SLICES);
    const info = r.getSliceInfo(darkTheme);
    expect(info).not.toBeNull();
    const total = info!.reduce((s, e) => s + e.percent, 0);
    expect(total).toBeCloseTo(100);
    expect(info!.map((e) => e.label)).toEqual(['A', 'B', 'C']);
  });

  it('getHoverInfo returns null when nothing hovered, and the slice when set', () => {
    const r = new PieRenderer();
    r.setData(SLICES);
    expect(r.getHoverInfo(darkTheme)).toBeNull();

    r.setHoverIndex(1);
    const info = r.getHoverInfo(darkTheme);
    expect(info?.label).toBe('B');
    expect(info?.value).toBe(30);
    expect(info?.percent).toBeCloseTo(30);
  });

  it('getSliceInfo returns null on empty data', () => {
    const r = new PieRenderer();
    expect(r.getSliceInfo(darkTheme)).toBeNull();
  });
});

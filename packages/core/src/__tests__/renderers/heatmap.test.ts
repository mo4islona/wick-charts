import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HeatmapRenderer } from '../../series/heatmap';
import type { HeatmapCellData } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

// 2×2 grid, values spanning the domain so ramp endpoints are exercised.
const GRID: HeatmapCellData[] = [
  { x: 'c1', y: 'r1', value: 0 },
  { x: 'c2', y: 'r1', value: 50 },
  { x: 'c1', y: 'r2', value: 75 },
  { x: 'c2', y: 'r2', value: 100 },
];

/**
 * Options that make geometry assertions exact: no entrance wave (cells paint
 * at full size on frame one), no rounding (cells fall back to plain
 * `fillRect`, so `fillStyleAt` and args-based placement work), no gaps or
 * label gutters (cell rects tile the full canvas).
 */
const FLAT = {
  entryMs: 0,
  updateMs: 0,
  cornerRadius: 0,
  gap: 0,
  axisLabels: false,
} as const;

describe('HeatmapRenderer.render', () => {
  it('empty data → zero draw calls', () => {
    const { ctx, spy } = buildRenderContext();
    const r = new HeatmapRenderer(FLAT);
    r.setData([]);
    r.render(ctx);

    expect(spy.calls.length).toBe(0);
  });

  it('draws one rect per cell on a settled grid', () => {
    const { ctx, spy } = buildRenderContext();
    const r = new HeatmapRenderer(FLAT);
    r.setData(GRID);
    r.render(ctx);

    expect(spy.countOf('fillRect')).toBe(GRID.length);
  });

  it('places cells on the column/row grid in first-seen order', () => {
    const { ctx, spy } = buildRenderContext(); // 800×400 @ dpr 1
    const r = new HeatmapRenderer(FLAT);
    r.setData(GRID);
    r.render(ctx);

    const rects = spy.callsOf('fillRect').map((c) => c.args as [number, number, number, number]);
    // c1/r1 occupies the top-left quadrant, c2/r2 the bottom-right.
    expect(rects[0][0]).toBeCloseTo(0);
    expect(rects[0][1]).toBeCloseTo(0);
    expect(rects[0][2]).toBeCloseTo(400);
    expect(rects[0][3]).toBeCloseTo(200);
    expect(rects[3][0]).toBeCloseTo(400);
    expect(rects[3][1]).toBeCloseTo(200);
  });

  it('maps the domain endpoints onto the ramp endpoints', () => {
    const { ctx, spy } = buildRenderContext();
    const r = new HeatmapRenderer({ ...FLAT, colors: ['#000000', '#ffffff'] });
    r.setData(GRID);
    r.render(ctx);

    // value 0 → first stop (top-left), value 100 → last stop (bottom-right).
    expect(spy.fillStyleAt(10, 10)).toBe('#000000');
    expect(spy.fillStyleAt(790, 390)).toBe('#ffffff');
  });

  it('interpolates mid-domain values between the stops', () => {
    const { ctx, spy } = buildRenderContext();
    const r = new HeatmapRenderer({ ...FLAT, colors: ['#000000', '#ffffff'] });
    r.setData(GRID);
    r.render(ctx);

    // value 50 (top-right cell) sits strictly between the endpoints.
    const mid = spy.fillStyleAt(790, 10);
    expect(mid).toMatch(/^#[0-9a-f]{6}$/);
    expect(mid).not.toBe('#000000');
    expect(mid).not.toBe('#ffffff');
  });

  it('explicit per-cell color overrides the ramp', () => {
    const { ctx, spy } = buildRenderContext();
    const r = new HeatmapRenderer({ ...FLAT, colors: ['#000000', '#ffffff'] });
    r.setData([...GRID.slice(0, 3), { x: 'c2', y: 'r2', value: 100, color: '#123456' }]);
    r.render(ctx);

    expect(spy.fillStyleAt(790, 390)).toBe('#123456');
  });

  it('explicit min/max clamp out-of-domain values to the ramp endpoints', () => {
    const { ctx, spy } = buildRenderContext();
    const r = new HeatmapRenderer({ ...FLAT, colors: ['#000000', '#ffffff'], min: 40, max: 60 });
    r.setData(GRID);
    r.render(ctx);

    // 0 clamps below the domain → first stop; 100 clamps above → last stop.
    expect(spy.fillStyleAt(10, 10)).toBe('#000000');
    expect(spy.fillStyleAt(790, 390)).toBe('#ffffff');
  });

  it('falls back to a theme-derived accent ramp when no colors are set', () => {
    const { ctx, spy } = buildRenderContext();
    const r = new HeatmapRenderer(FLAT);
    r.setData(GRID);
    r.render(ctx);

    // catppuccin ships a theme.heatmap token; the max cell paints its last stop.
    const expected = ctx.theme.heatmap?.colors.at(-1);
    expect(expected).toBeDefined();
    expect(spy.fillStyleAt(790, 390)).toBe(expected);
  });

  it('axis labels reserve a left gutter and draw row/column keys', () => {
    const { ctx, spy } = buildRenderContext();
    const r = new HeatmapRenderer({ ...FLAT, axisLabels: true });
    r.setData(GRID);
    r.render(ctx);

    const texts = spy.callsOf('fillText').map((c) => c.args[0]);
    expect(texts).toContain('r1');
    expect(texts).toContain('r2');
    expect(texts).toContain('c1');
    expect(texts).toContain('c2');

    // The first cell starts past the measured row-label gutter.
    const firstRect = spy.callsOf('fillRect')[0].args as [number, number, number, number];
    expect(firstRect[0]).toBeGreaterThan(0);
  });

  it('cell labels draw the value inside large cells', () => {
    const { ctx, spy } = buildRenderContext();
    const r = new HeatmapRenderer({ ...FLAT, cellLabels: true });
    r.setData(GRID);
    r.render(ctx);

    const texts = spy.callsOf('fillText').map((c) => c.args[0]);
    expect(texts).toContain('100');
  });
});

describe('HeatmapRenderer.hitTest', () => {
  it('maps bitmap coordinates to grid positions', () => {
    const { ctx } = buildRenderContext();
    const r = new HeatmapRenderer(FLAT);
    r.setData(GRID);
    r.render(ctx); // primes the gutter cache (0 here)

    expect(r.hitTest(100, 100, 800, 400)).toBe(0); // c1/r1
    expect(r.hitTest(700, 100, 800, 400)).toBe(1); // c2/r1
    expect(r.hitTest(700, 300, 800, 400)).toBe(3); // c2/r2
  });

  it('returns -1 outside the grid and on empty slots', () => {
    const { ctx } = buildRenderContext();
    const r = new HeatmapRenderer(FLAT);
    // Sparse: bottom-right slot has no datum.
    r.setData(GRID.slice(0, 3));
    r.render(ctx);

    expect(r.hitTest(700, 300, 800, 400)).toBe(-1);
    expect(r.hitTest(-10, 100, 800, 400)).toBe(-1);
    expect(r.hitTest(100, 500, 800, 400)).toBe(-1);
  });

  it('returns -1 on empty data', () => {
    const r = new HeatmapRenderer(FLAT);
    r.setData([]);

    expect(r.hitTest(100, 100, 800, 400)).toBe(-1);
  });
});

describe('HeatmapRenderer.getHoverInfo', () => {
  it('reports the hovered cell with its ramp color and domain position', () => {
    const { ctx } = buildRenderContext();
    const r = new HeatmapRenderer({ ...FLAT, colors: ['#000000', '#ffffff'] });
    r.setData(GRID);
    r.render(ctx);

    expect(r.getHoverInfo(ctx.theme)).toBeNull();

    r.setHoverIndex(3); // c2/r2, value 100
    const info = r.getHoverInfo(ctx.theme);
    expect(info).not.toBeNull();
    expect(info?.label).toBe('r2 · c2');
    expect(info?.value).toBe(100);
    expect(info?.percent).toBeCloseTo(100);
    expect(info?.color).toBe('#ffffff');
  });

  it('setHoverIndex reports change only on transitions', () => {
    const r = new HeatmapRenderer(FLAT);
    r.setData(GRID);

    expect(r.setHoverIndex(1)).toBe(true);
    expect(r.setHoverIndex(1)).toBe(false);
    expect(r.setHoverIndex(-1)).toBe(true);
  });

  it('a same-slot-count reshape resets the hover index', () => {
    // Regression: 2×2 → 4×1 keeps the total slot count, but position 3 now
    // addresses a different cell — a stale index made the tooltip report a
    // cell the cursor wasn't over.
    const { ctx } = buildRenderContext();
    const r = new HeatmapRenderer(FLAT);
    r.setData(GRID);
    r.setHoverIndex(3);

    r.setData([
      { x: 'c1', y: 'r1', value: 1 },
      { x: 'c2', y: 'r1', value: 2 },
      { x: 'c3', y: 'r1', value: 3 },
      { x: 'c4', y: 'r1', value: 4 },
    ]);

    expect(r.getHoverIndex()).toBe(-1);
    expect(r.getHoverInfo(ctx.theme)).toBeNull();
  });

  it('a same-shape data update keeps the hover index', () => {
    const r = new HeatmapRenderer(FLAT);
    r.setData(GRID);
    r.setHoverIndex(3);

    r.setData(GRID.map((cell) => ({ ...cell, value: cell.value + 1 })));

    expect(r.getHoverIndex()).toBe(3);
  });
});

/**
 * Value/entrance animation is driven by `performance.now()` deltas inside
 * `render()`. Tests stub the clock and advance virtual time — same recipe as
 * the pie explode-animation tests.
 */
describe('HeatmapRenderer — animation', () => {
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

  function renderFrame(r: HeatmapRenderer): void {
    const { ctx } = buildRenderContext();
    r.render(ctx);
  }

  function displayed(r: HeatmapRenderer, x: string, y: string): number | undefined {
    return r._inspectDisplayedValues().get(`${x}\u0000${y}`);
  }

  it('same-shape setData tweens values over frames instead of snapping', () => {
    const r = new HeatmapRenderer({ ...FLAT, updateMs: 300 });
    r.setData(GRID);
    renderFrame(r); // prime lastRenderTime

    r.setData(GRID.map((cell) => ({ ...cell, value: cell.value + 100 })));
    expect(r.needsAnimation).toBe(true);

    advance(16);
    renderFrame(r);
    const after = displayed(r, 'c1', 'r2');
    expect(after).toBeGreaterThan(75);
    expect(after).toBeLessThan(175);
  });

  it('converges to the new targets and stops requesting frames', () => {
    const r = new HeatmapRenderer({ ...FLAT, updateMs: 300 });
    r.setData(GRID);
    renderFrame(r);

    r.setData(GRID.map((cell) => ({ ...cell, value: cell.value + 100 })));
    for (let i = 0; i < 120; i++) {
      advance(16);
      renderFrame(r);
    }

    expect(displayed(r, 'c2', 'r2')).toBe(200);
    expect(r.needsAnimation).toBe(false);
  });

  it('grid-shape change snaps values and replays the entrance wave', () => {
    const r = new HeatmapRenderer({ ...FLAT, entryMs: 600 });
    r.setData(GRID);
    renderFrame(r);
    advance(2000);
    renderFrame(r);
    expect(r.needsAnimation).toBe(false);

    r.setData([...GRID, { x: 'c3', y: 'r1', value: 10 }]);
    expect(displayed(r, 'c3', 'r1')).toBe(10);
    expect(r.needsAnimation).toBe(true);
  });

  it('entrance wave staggers along the diagonal — near cells lead far cells', () => {
    const r = new HeatmapRenderer({ ...FLAT, entryMs: 600 });
    r.setData(GRID);
    renderFrame(r); // stamps entryStart

    // Delays on a 2×2 grid are 0 / 300 / 300 / 600 ms; at t=450 the lead
    // cell is deep into its tween while the diagonal-1 cells just started.
    advance(450);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    const rects = spy.callsOf('fillRect');
    expect(rects.length).toBeGreaterThanOrEqual(2);
    const first = rects[0]; // c1/r1 — diagonal 0
    const last = rects[rects.length - 1]; // deepest visible diagonal
    expect(first.globalAlpha).toBeGreaterThan(last.globalAlpha);
  });

  it('entryMs 0 paints fully opaque on the first frame', () => {
    const r = new HeatmapRenderer(FLAT);
    r.setData(GRID);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    for (const call of spy.callsOf('fillRect')) {
      expect(call.globalAlpha).toBe(1);
    }
    expect(r.needsAnimation).toBe(false);
  });

  it('hover lift eases toward the hovered cell when updateMs > 0', () => {
    const r = new HeatmapRenderer({ ...FLAT, updateMs: 300 });
    r.setData(GRID);
    renderFrame(r);

    r.setHoverIndex(0);
    expect(r.needsAnimation).toBe(true);

    for (let i = 0; i < 120; i++) {
      advance(16);
      renderFrame(r);
    }
    expect(r.needsAnimation).toBe(false);
  });
});

describe('HeatmapRenderer — options and lifecycle', () => {
  it('notifies data listeners on setData and supports unsubscribe', () => {
    const r = new HeatmapRenderer(FLAT);
    let fired = 0;
    const unsub = r.onDataChanged(() => {
      fired += 1;
    });

    r.setData(GRID);
    expect(fired).toBe(1);

    unsub();
    r.setData(GRID);
    expect(fired).toBe(1);
  });

  it('explicit columns/rows pin the grid order and admit empty slots', () => {
    const { ctx } = buildRenderContext();
    const r = new HeatmapRenderer({ ...FLAT, columns: ['c2', 'c1', 'c3'], rows: ['r2', 'r1'] });
    r.setData(GRID);
    r.render(ctx);

    // Grid is 3 cols × 2 rows = 6 positions; c2 is now column 0, r2 row 0 —
    // so the cell at position 0 is (c2, r2) with value 100.
    r.setHoverIndex(0);
    expect(r.getHoverInfo(ctx.theme)?.value).toBe(100);

    // The c3 column exists but holds no data → empty slot.
    expect(r.hitTest(750, 100, 800, 400)).toBe(-1);
  });

  it('duplicate (x, y) coordinates — the last datum wins', () => {
    const { ctx } = buildRenderContext();
    const r = new HeatmapRenderer(FLAT);
    r.setData([...GRID, { x: 'c1', y: 'r1', value: 999 }]);
    r.render(ctx);

    r.setHoverIndex(0);
    expect(r.getHoverInfo(ctx.theme)?.value).toBe(999);
  });

  it('non-finite values render without corrupting the domain', () => {
    const { ctx, spy } = buildRenderContext();
    const r = new HeatmapRenderer({ ...FLAT, colors: ['#000000', '#ffffff'] });
    r.setData([
      { x: 'c1', y: 'r1', value: Number.NaN },
      { x: 'c2', y: 'r1', value: 10 },
      { x: 'c1', y: 'r2', value: 20 },
    ]);
    r.render(ctx);

    // Finite extent (10..20) still maps to the ramp endpoints.
    expect(spy.fillStyleAt(790, 10)).toBe('#000000');
    expect(spy.fillStyleAt(10, 390)).toBe('#ffffff');
  });

  it('getLayerColors reports the theme ramp high stop for a default-configured series', () => {
    // Regression: legends used to get a neutral '#888' swatch while the
    // canvas painted the theme-derived accent ramp.
    const { ctx } = buildRenderContext();
    const r = new HeatmapRenderer(FLAT, ctx.theme);

    expect(r.getLayerColors()).toEqual([ctx.theme.heatmap?.colors.at(-1)]);
  });

  it('getLayerColors follows the ramp across a theme swap', () => {
    const { ctx } = buildRenderContext();
    const r = new HeatmapRenderer(FLAT, ctx.theme);

    const swapped = {
      ...ctx.theme,
      heatmap: { colors: ['#111111', '#abcdef'] },
    };
    r.applyTheme(swapped, ctx.theme);

    expect(r.getLayerColors()).toEqual(['#abcdef']);
  });

  it('dispose clears data and listeners', () => {
    const r = new HeatmapRenderer(FLAT);
    let fired = 0;
    r.onDataChanged(() => {
      fired += 1;
    });
    r.setData(GRID);
    r.dispose();

    expect(r.getData()).toEqual([]);
    expect(r.needsAnimation).toBe(false);
    expect(fired).toBe(1);
  });
});

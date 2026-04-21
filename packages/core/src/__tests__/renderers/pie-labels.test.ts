import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PieRenderer } from '../../series/pie';
import type { PieSliceData } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

/**
 * Tests for the per-slice label rendering on pie/donut charts.
 *
 * The fixture-context `measureText` returns `text.length * 6` pixels (see
 * `recording-context.ts`), so short/long string contrasts are large enough to
 * drive the inside-mode fit check and to produce a meaningfully non-zero
 * `labelReserve` in outside mode.
 *
 * `performance.now()` is stubbed in every suite so the reveal animation
 * advances deterministically — otherwise the real wall-clock barely ticks
 * across a batch of synchronous `render` calls and the reveal stays at 0.
 */

const SLICES: PieSliceData[] = [
  { label: 'A', value: 50 },
  { label: 'B', value: 30 },
  { label: 'C', value: 20 },
];

/**
 * Multiple small same-side slices followed by a dominant one. The big slice
 * sits on the right; the small ones cluster at 6–7 o'clock on the left side,
 * giving the de-cluster pass a genuine collision to resolve.
 */
const CLUSTER_SLICES: PieSliceData[] = [
  { label: 'big', value: 60 },
  { label: 'aa', value: 8 },
  { label: 'bb', value: 8 },
  { label: 'cc', value: 8 },
  { label: 'dd', value: 8 },
  { label: 'ee', value: 8 },
];

let virtualNow = 0;

function advance(ms: number): void {
  virtualNow += ms;
}

/** Render many frames to push `labelReveal` to its steady-state value (≈ 1). */
function settleReveal(r: PieRenderer, ctx: Parameters<PieRenderer['render']>[0]): void {
  for (let i = 0; i < 80; i++) {
    advance(32);
    r.render(ctx);
  }
}

beforeEach(() => {
  virtualNow = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => virtualNow);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PieRenderer.sliceLabels — mode: outside (default)', () => {
  it('draws an anchor dot + leader stroke + text per eligible slice', () => {
    const r = new PieRenderer();
    r.setData(SLICES);
    const { ctx } = buildRenderContext();
    settleReveal(r, ctx);

    // Fresh recorder — render once more to capture a steady-state frame.
    const { ctx: ctx2, spy } = buildRenderContext();
    advance(16);
    r.render(ctx2);

    const fillTexts = spy.callsOf('fillText');
    expect(fillTexts).toHaveLength(3);
    // Each label text is the "label  pct%" combo (`content: 'both'` default).
    expect(fillTexts[0].args[0]).toMatch(/A\s+50%/);
    expect(fillTexts[1].args[0]).toMatch(/B\s+30%/);
    expect(fillTexts[2].args[0]).toMatch(/C\s+20%/);

    // Three slices × (slice outer arc + anchor dot arc) ⇒ 6 arcs.
    expect(spy.countOf('arc')).toBe(SLICES.length * 2);
    // Each label produces at least one stroke (anchor→elbow + elbow→rail).
    expect(spy.countOf('stroke')).toBeGreaterThanOrEqual(SLICES.length);
  });

  it('right-side slices get textAlign=left, left-side slices get textAlign=right', () => {
    const r = new PieRenderer();
    r.setData([
      { label: 'right', value: 50 },
      { label: 'left', value: 50 },
    ]);
    const { ctx } = buildRenderContext();
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext();
    advance(16);
    r.render(ctx2);

    const fillTexts = spy.callsOf('fillText');
    expect(fillTexts).toHaveLength(2);
    // First slice starts at 12 o'clock sweeping clockwise — its midangle
    // lands in the right half (cos > 0), so textAlign = 'left'.
    expect(fillTexts[0].textAlign).toBe('left');
    // Second slice midangle lands in the left half (cos < 0), textAlign = 'right'.
    expect(fillTexts[1].textAlign).toBe('right');
  });

  it('skips slices below minSliceAngle', () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'outside', minSliceAngle: 0.5 } });
    r.setData([
      { label: 'big', value: 95 },
      // Two tiny slices ~0.15 rad each, well below the 0.5 threshold.
      { label: 'tiny-a', value: 2 },
      { label: 'tiny-b', value: 3 },
    ]);
    const { ctx } = buildRenderContext();
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext();
    advance(16);
    r.render(ctx2);

    const fillTexts = spy.callsOf('fillText');
    expect(fillTexts).toHaveLength(1);
    expect(fillTexts[0].args[0]).toMatch(/big/);
  });

  it('reserves horizontal space — outer radius smaller than with mode=none', () => {
    const rNone = new PieRenderer({ padAngle: 0, sliceLabels: { mode: 'none' } });
    rNone.setData(SLICES);
    const { ctx: ctxN, spy: spyN } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    rNone.render(ctxN);
    const rNoneRadius = spyN.callsOf('arc')[0].args[2] as number;

    const rOutside = new PieRenderer({ padAngle: 0, sliceLabels: { mode: 'outside' } });
    rOutside.setData(SLICES);
    const { ctx: ctxO, spy: spyO } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    rOutside.render(ctxO);
    const rOutsideRadius = spyO.callsOf('arc')[0].args[2] as number;

    expect(rOutsideRadius).toBeLessThan(rNoneRadius);
  });

  it('de-cluster pushes same-side labels apart vertically', () => {
    const r = new PieRenderer({ padAngle: 0 });
    r.setData(CLUSTER_SLICES);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    advance(16);
    r.render(ctx2);

    const fillTexts = spy.callsOf('fillText');
    const leftYs: number[] = [];
    const rightYs: number[] = [];
    for (const c of fillTexts) {
      const y = c.args[2] as number;
      if (c.textAlign === 'left') rightYs.push(y);
      else if (c.textAlign === 'right') leftYs.push(y);
    }

    // Small slices cluster on the left after the 60% dominant; assert the
    // side with multiple labels respects the min-gap.
    const side = leftYs.length >= rightYs.length ? leftYs : rightYs;
    expect(side.length).toBeGreaterThanOrEqual(2);
    const sorted = [...side].sort((a, b) => a - b);
    // minGap = fontSize(11) × 1.4 × hpr(1). Allow a hair of float slack.
    const minGap = 11 * 1.4;
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(minGap - 0.01);
    }
  });

  it('renders horizontal leader rails after de-cluster (no kinks)', () => {
    // 50% dominant + 9 small slices packed near the pole stress the label
    // layout: their ideal y's are all near the top of the canvas, forcing
    // PAV to spread them. After elbow re-anchor the rail y must equal the
    // text y — a horizontal rail instead of the old diagonal kink.
    const data: PieSliceData[] = [{ label: 'big', value: 50 }];
    for (let i = 0; i < 9; i++) {
      data.push({ label: `p${i}`, value: 50 / 9 });
    }

    const r = new PieRenderer({ padAngle: 0 });
    r.setData(data);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    advance(16);
    r.render(ctx2);

    // Walk the call stream. Each label produces this ordered block at full
    // reveal: beginPath → moveTo → lineTo(elbow) → lineTo(railEnd) → stroke
    // → fillText. The two lineTos bracket the leader-line path; their y's
    // must match the fillText y for the rail to be horizontal.
    const calls = spy.calls;
    let pathLineTos: number[] = [];
    let inPath = false;

    for (const c of calls) {
      if (c.method === 'beginPath') {
        pathLineTos = [];
        inPath = true;
      } else if (inPath && c.method === 'lineTo') {
        pathLineTos.push(c.args[1] as number);
      } else if (c.method === 'stroke') {
        inPath = false;
      } else if (c.method === 'fillText' && pathLineTos.length >= 2) {
        const textY = c.args[2] as number;
        const elbowY = pathLineTos[pathLineTos.length - 2];
        const railEndY = pathLineTos[pathLineTos.length - 1];
        expect(Math.abs(elbowY - textY)).toBeLessThan(0.5);
        expect(Math.abs(railEndY - textY)).toBeLessThan(0.5);
        pathLineTos = [];
      }
    }

    // Sanity: we did actually pair labels with strokes.
    const labelCount = spy.countOf('fillText');
    expect(labelCount).toBeGreaterThanOrEqual(5);
  });

  it('balanceSides moves ambiguous near-pole labels to the less-crowded side', () => {
    // Three committed-left slices (a, b, c — all with |cos| ≥ 0.3) versus
    // one committed-right slice (big). Two tiny slices land near 12 o'clock
    // with |cos| < 0.3 so rebalance should walk both to the right to even
    // out the stack — final counts: right=3 (big + tiny-a + tiny-b), left=3
    // (a, b, c).
    //
    // Angular walk (angle starts at -π/2, clockwise):
    //   big  50% → mid =  0.000 rad, cos =  1.00 → right (committed).
    //   a    25% → mid =  2.356 rad, cos = -0.707 → left (committed).
    //   b    15% → mid =  3.612 rad, cos = -0.897 → left (committed).
    //   c     5% → mid =  4.248 rad, cos = -0.444 → left (committed).
    //   tny-a 3% → mid =  4.499 rad, cos = -0.213 → ambiguous.
    //   tny-b 2% → mid =  4.656 rad, cos = -0.055 → ambiguous.
    const r = new PieRenderer({ padAngle: 0, sliceLabels: { balanceSides: true } });
    r.setData([
      { label: 'big', value: 50 },
      { label: 'a', value: 25 },
      { label: 'b', value: 15 },
      { label: 'c', value: 5 },
      { label: 'tiny-a', value: 3 },
      { label: 'tiny-b', value: 2 },
    ]);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    advance(16);
    r.render(ctx2);

    const fillTexts = spy.callsOf('fillText');
    const textsBySide = new Map<string, string[]>();
    for (const c of fillTexts) {
      const key = c.textAlign;
      const arr = textsBySide.get(key) ?? [];
      arr.push(c.args[0] as string);
      textsBySide.set(key, arr);
    }

    // Pie renderer: textAlign=left means label sits on the right side
    // (anchor points right into empty right-of-pie space); vice versa.
    const rightLabels = textsBySide.get('left') ?? [];
    const leftLabels = textsBySide.get('right') ?? [];

    expect(rightLabels.some((t) => t.includes('big'))).toBe(true);
    expect(leftLabels.some((t) => t.includes('a'))).toBe(true);
    expect(rightLabels.some((t) => t.includes('tiny-a'))).toBe(true);
    expect(rightLabels.some((t) => t.includes('tiny-b'))).toBe(true);
  });
});

describe('PieRenderer.sliceLabels — mode: inside', () => {
  it('draws labels centered on the slice, not outside', () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'inside' } });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    const fillTexts = spy.callsOf('fillText');
    expect(fillTexts).toHaveLength(3);
    for (const c of fillTexts) {
      expect(c.textAlign).toBe('center');
      expect(c.textBaseline).toBe('middle');
    }
    // Only slice outer arcs — no anchor-dot arcs.
    expect(spy.countOf('arc')).toBe(SLICES.length);
  });

  it("skips text that doesn't fit the slice chord", () => {
    // One dominant slice leaves two narrow wedges (≈ 30° each). The long
    // labels on those wedges can't fit the chord at labelR; the short label
    // on the dominant slice still renders.
    const r = new PieRenderer({
      padAngle: 0,
      sliceLabels: { mode: 'inside', content: 'label', minSliceAngle: 0 },
    });
    r.setData([
      { label: 'X', value: 80 },
      { label: 'OVERSIZED_LABEL_A', value: 10 },
      { label: 'OVERSIZED_LABEL_B', value: 10 },
    ]);
    const { ctx, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx);

    const fillTexts = spy.callsOf('fillText');
    const rendered = fillTexts.map((c) => c.args[0]);
    expect(rendered).toContain('X');
    expect(rendered).not.toContain('OVERSIZED_LABEL_A');
    expect(rendered).not.toContain('OVERSIZED_LABEL_B');
  });
});

describe('PieRenderer.sliceLabels — mode: none', () => {
  it('draws zero fillText and no leader strokes', () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'none' } });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    expect(spy.countOf('fillText')).toBe(0);
    // Only slice outer arcs — no anchor-dot arcs.
    expect(spy.countOf('arc')).toBe(SLICES.length);
  });
});

describe('PieRenderer.sliceLabels — content', () => {
  it("'percent' renders only the percentage", () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'inside', content: 'percent' } });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    const fillTexts = spy.callsOf('fillText');
    expect(fillTexts[0].args[0]).toBe('50%');
    expect(fillTexts[1].args[0]).toBe('30%');
    expect(fillTexts[2].args[0]).toBe('20%');
  });

  it("'label' renders only the label name", () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'inside', content: 'label' } });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    const fillTexts = spy.callsOf('fillText');
    expect(fillTexts[0].args[0]).toBe('A');
    expect(fillTexts[1].args[0]).toBe('B');
    expect(fillTexts[2].args[0]).toBe('C');
  });

  it("'both' renders label and percent together", () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'inside', content: 'both' } });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    const fillTexts = spy.callsOf('fillText');
    expect(fillTexts[0].args[0]).toMatch(/A.*50%/);
    expect(fillTexts[1].args[0]).toMatch(/B.*30%/);
    expect(fillTexts[2].args[0]).toMatch(/C.*20%/);
  });
});

describe('PieRenderer.sliceLabels — reveal animation', () => {
  it('flags needsAnimation true after setData in outside mode, false once settled', () => {
    const r = new PieRenderer();
    r.setData(SLICES);
    const { ctx } = buildRenderContext();
    // Prime `lastRenderTime` then advance and render once: the reveal has
    // taken its first step but is far from settled.
    r.render(ctx);
    advance(16);
    r.render(ctx);
    expect(r.needsAnimation).toBe(true);

    settleReveal(r, ctx);
    expect(r.needsAnimation).toBe(false);
  });

  it('does not flag reveal animation when mode is none', () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'none' } });
    r.setData(SLICES);
    const { ctx } = buildRenderContext();
    r.render(ctx);

    // No hover set, no outside reveal → nothing to animate.
    expect(r.needsAnimation).toBe(false);
  });

  it('switching mode into outside restarts the reveal', () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'none' } });
    r.setData(SLICES);
    const { ctx } = buildRenderContext();
    settleReveal(r, ctx);
    expect(r.needsAnimation).toBe(false);

    r.updateOptions({ sliceLabels: { mode: 'outside' } });
    advance(16);
    r.render(ctx);
    // Reveal was reset to 0 — this frame reports animation in flight.
    expect(r.needsAnimation).toBe(true);
  });
});

describe('PieRenderer.hitTest — reduced radius in outside mode', () => {
  it('rejects points that land between the shrunken outer radius and the unreduced radius', () => {
    const r = new PieRenderer({ padAngle: 0, sliceLabels: { mode: 'outside' } });
    r.setData(SLICES);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    // Render once so `#labelReserveCache` is populated; hitTest reads it.
    r.render(ctx);

    // The unreduced radius on a 400×400 bitmap is ≈ 170; outside-mode shrinks
    // it. A point at cx+165 sits inside the unreduced disk but outside the
    // shrunken one.
    const hit = r.hitTest(365, 200, 400, 400);
    expect(hit).toBe(-1);

    // A point well inside the shrunken disk still hits a slice.
    const nearCenter = r.hitTest(210, 200, 400, 400);
    expect(nearCenter).toBeGreaterThanOrEqual(0);
  });
});

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
    const r = new PieRenderer({ sliceLabels: { mode: 'outside', minSliceAngle: 20 } });
    r.setData([
      { label: 'big', value: 95 },
      // Two tiny slices (~7° and ~11°), both under the 20° threshold.
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

  it('keeps rails short — horizontal reach bounded by `distance + legPad + label width`', () => {
    // Radial per-slice: each label sits on its slice's radial ray. The
    // horizontal distance between the anchor dot and the rendered text must
    // stay within `distance + legPad + textWidth` regardless of midangle —
    // no label gets a long horizontal rail to reach a canvas-wide column.
    const data: PieSliceData[] = [{ label: 'big', value: 50 }];
    for (let i = 0; i < 9; i++) {
      data.push({ label: `p${i}`, value: 50 / 9 });
    }

    const distance = 24;
    const legPad = 6;
    const mockedCharWidth = 6; // recording-context's measureText returns length*6

    const r = new PieRenderer({ padAngle: 0, sliceLabels: { distance, legPad } });
    r.setData(data);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    advance(16);
    r.render(ctx2);

    const fillTexts = spy.callsOf('fillText');
    const arcs = spy.callsOf('arc');
    // First N arcs are slice outlines; the rest are anchor dots, one per label.
    const anchorArcs = arcs.slice(data.length);
    expect(anchorArcs.length).toBe(fillTexts.length);

    for (let i = 0; i < fillTexts.length; i++) {
      const anchorX = anchorArcs[i].args[0] as number;
      const textX = fillTexts[i].args[1] as number;
      const labelText = fillTexts[i].args[0] as string;
      const textWidth = labelText.length * mockedCharWidth;
      // Reach = gap from anchor to text start (≤ distance) + legPad, and the
      // text itself is textWidth wide. Anything more is a column-layout
      // regression that the user rejected as "too long lines".
      const maxReach = distance + legPad + textWidth + 2;
      expect(Math.abs(textX - anchorX)).toBeLessThanOrEqual(maxReach);
    }
  });

  it('each label sits on its own radial ray — no shared column', () => {
    // Many same-side slices at varying angles. Their text x values must
    // differ (each label follows its slice's cos), so the range across a
    // crowded side must be non-trivial. A shared-column layout would
    // collapse all text x's to a single value.
    const r = new PieRenderer({ padAngle: 0 });
    r.setData(CLUSTER_SLICES);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    advance(16);
    r.render(ctx2);

    const fillTexts = spy.callsOf('fillText');
    const leftXs: number[] = [];
    const rightXs: number[] = [];
    for (const c of fillTexts) {
      const x = c.args[1] as number;
      if (c.textAlign === 'left') rightXs.push(x);
      else if (c.textAlign === 'right') leftXs.push(x);
    }

    const crowded = leftXs.length >= rightXs.length ? leftXs : rightXs;
    expect(crowded.length).toBeGreaterThanOrEqual(2);
    const minX = Math.min(...crowded);
    const maxX = Math.max(...crowded);
    expect(maxX - minX).toBeGreaterThan(10);
  });

  it('same-side labels maintain at least `fontSize * labelGap` vertical separation', () => {
    // PAV invariant: no two same-side labels end up vertically closer than
    // `minGap = fontSize * labelGap`. Driver dataset has many small top
    // slices that would naturally collide without PAV.
    const r = new PieRenderer({ padAngle: 0, sliceLabels: { fontSize: 11, labelGap: 1.4 } });
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

    const minGap = 11 * 1.4;
    for (const side of [leftYs, rightYs]) {
      const sorted = [...side].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(minGap - 0.01);
      }
    }
  });

  it("label Y follows slice Y: slice closest to 12 o'clock lands highest on its side", () => {
    // Chains-shaped dataset. On the left side (all cos<0), the slice whose
    // midangle is closest to 12 o'clock (Other at cos≈-0.06) has the smallest
    // ideal Y and therefore sits at the top of the left column, above slices
    // that are further from the pole (Polygon at cos≈-0.28, Avalanche at
    // cos≈-0.61, BSC at cos≈-0.93, Solana at cos≈-0.88 but below cy).
    const r = new PieRenderer({ padAngle: 0 });
    r.setData([
      { label: 'Ethereum', value: 58 },
      { label: 'Solana', value: 18 },
      { label: 'BSC', value: 10 },
      { label: 'Avalanche', value: 7 },
      { label: 'Polygon', value: 5 },
      { label: 'Other', value: 2 },
    ]);
    const { ctx } = buildRenderContext({ mediaWidth: 500, mediaHeight: 400 });
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 500, mediaHeight: 400 });
    advance(16);
    r.render(ctx2);

    const fillTexts = spy.callsOf('fillText');
    const labelY = (name: string): number => {
      const call = fillTexts.find((c) => new RegExp(name).test(c.args[0] as string));
      expect(call).toBeDefined();

      return call?.args[2] as number;
    };

    // All labels on the left (ambiguous `balanceSides` no-op in radial mode,
    // so Polygon and Other stay on the natural left).
    const otherY = labelY('Other');
    const polygonY = labelY('Polygon');
    const avalancheY = labelY('Avalanche');

    // Smaller Y = higher on screen. Natural geometric order:
    // Other (pole-most) above Polygon above Avalanche.
    expect(otherY).toBeLessThan(polygonY);
    expect(polygonY).toBeLessThan(avalancheY);
  });

  it("`distance` clamps to `elbowLen` — values below don't collapse the rail", () => {
    // When a user sets distance < elbowLen, the label ring would fall inside
    // the elbow stub and flip the rail direction on a pure-radial slice.
    // The layout clamps internally; the rail length on the right-side slice
    // at 3 o'clock must stay non-negative.
    const r = new PieRenderer({
      padAngle: 0,
      sliceLabels: { distance: 4, elbowLen: 12 },
    });
    r.setData([
      { label: 'big', value: 90 },
      { label: 'tiny', value: 10 },
    ]);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    advance(16);
    r.render(ctx2);

    // "big" slice midangle at 3 o'clock area (cos > 0). Its label x must sit
    // to the right of its anchor (rail points outward, not inward).
    const fillTexts = spy.callsOf('fillText');
    const arcs = spy.callsOf('arc');
    const bigText = fillTexts.find((c) => /big/.test(c.args[0] as string));
    // The first anchor dot arc corresponds to the first label in draw order,
    // which is "big" (it renders first because it's first in the data array).
    const anchorArcs = arcs.slice(2); // skip 2 slice outlines
    const bigAnchor = anchorArcs[0];
    expect(bigText).toBeDefined();
    expect(bigAnchor).toBeDefined();
    const textX = bigText?.args[1] as number;
    const anchorX = bigAnchor?.args[0] as number;
    expect(textX).toBeGreaterThan(anchorX);
  });

  it('produces no labels when data is empty', () => {
    const r = new PieRenderer();
    r.setData([]);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    expect(spy.countOf('fillText')).toBe(0);
    expect(spy.countOf('arc')).toBe(0);
  });

  it('renders exactly one label for a single-slice pie', () => {
    const r = new PieRenderer({ padAngle: 0 });
    r.setData([{ label: 'solo', value: 100 }]);
    const { ctx } = buildRenderContext();
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext();
    advance(16);
    r.render(ctx2);

    const fillTexts = spy.callsOf('fillText');
    expect(fillTexts).toHaveLength(1);
    expect(fillTexts[0].args[0]).toMatch(/solo/);
  });

  it('emits zero labels when every slice is below minSliceAngle', () => {
    // 100 equal slices of 3.6° each — all below the default 2.5° threshold?
    // 3.6° > 2.5°, so bump the threshold instead.
    const data: PieSliceData[] = [];
    for (let i = 0; i < 100; i++) {
      data.push({ label: `s${i}`, value: 1 });
    }
    const r = new PieRenderer({ padAngle: 0, sliceLabels: { minSliceAngle: 5 } });
    r.setData(data);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    advance(16);
    r.render(ctx2);

    expect(spy.countOf('fillText')).toBe(0);
  });

  it('hides text (but keeps anchor dots) while reveal progress is mid-flight', () => {
    // Requires `animate: true` — otherwise reveal is pinned at 1 and text
    // paints on the first frame. The reveal pipeline fades the dot first
    // (progress > 0), then the elbow, then text+rail together at
    // progress > 0.6. Pick a `labelReveal` that clears all stagger starts
    // but falls short of every label's text threshold.
    const r = new PieRenderer({ padAngle: 0, animate: true });
    r.setData(SLICES);
    const { ctx } = buildRenderContext();
    // Prime lastRenderTime then push reveal into [0.12, 0.6] over a few
    // 60 fps frames (exp decay at rate 6 → ~9 %/frame).
    r.render(ctx);
    for (let i = 0; i < 3; i++) {
      advance(16);
      r.render(ctx);
    }

    const { ctx: ctx2, spy } = buildRenderContext();
    advance(16);
    r.render(ctx2);

    // No label text drawn yet.
    expect(spy.countOf('fillText')).toBe(0);
    // Every label contributes an anchor-dot arc, on top of the N slice arcs.
    expect(spy.countOf('arc')).toBeGreaterThanOrEqual(SLICES.length * 2);
  });

  it('label x sits at `outerR + distance + railWidth + legPad` for a horizontal slice', () => {
    // Single slice at 3 o'clock (cos=1). Its label anchor is on the radial
    // ray at `outerR + distance`, then extended horizontally by `railWidth`;
    // text starts `legPad` past the anchor in the text direction.
    const r = new PieRenderer({
      padAngle: 0,
      sliceLabels: { distance: 24, railWidth: 16, elbowLen: 12, legPad: 6 },
    });
    r.setData([
      { label: 'right', value: 50 },
      { label: 'left', value: 50 },
    ]);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    advance(16);
    r.render(ctx2);

    const arcs = spy.callsOf('arc');
    const sliceRadius = arcs[0].args[2] as number;
    const fillTexts = spy.callsOf('fillText');
    const right = fillTexts.find((c) => /right/.test(c.args[0] as string));
    expect(right).toBeDefined();

    const cx = 200;
    const expectedTextX = cx + sliceRadius + 24 + 16 + 6;
    const textX = right?.args[1] as number;
    expect(Math.abs(textX - expectedTextX)).toBeLessThan(2);
  });

  it('railWidth controls the length of the horizontal leader leg', () => {
    // The horizontal finish from elbow to rail-end must grow with
    // `railWidth`. Measure it per leader line: the two trailing lineTo
    // calls before a `fillText` are `(elbowX, labelY)` and `(railEndX,
    // labelY)`; their X delta is the rail length.
    const data: PieSliceData[] = [
      { label: 'right', value: 50 },
      { label: 'left', value: 50 },
    ];
    const measureRail = (railWidth: number): number => {
      const r = new PieRenderer({ padAngle: 0, sliceLabels: { railWidth } });
      r.setData(data);
      const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
      r.render(ctx);
      const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
      r.render(ctx2);

      const calls = spy.calls;
      let last2: Array<[number, number]> = [];
      let inPath = false;
      for (const c of calls) {
        if (c.method === 'beginPath') {
          last2 = [];
          inPath = true;
        } else if (inPath && c.method === 'lineTo') {
          last2.push([c.args[0] as number, c.args[1] as number]);
        } else if (c.method === 'stroke') {
          inPath = false;
        } else if (c.method === 'fillText' && last2.length >= 2) {
          // Use the first leader found (right-side slice).
          const elbowX = last2[last2.length - 2][0];
          const railEndX = last2[last2.length - 1][0];
          return Math.abs(railEndX - elbowX);
        }
      }
      throw new Error('no leader line recorded');
    };

    expect(measureRail(40)).toBeGreaterThan(measureRail(8));
  });

  it('labels never collapse inside the pie (text anchor point lies outside the outer disk)', () => {
    const r = new PieRenderer({ padAngle: 0 });
    r.setData(CLUSTER_SLICES);
    const { ctx } = buildRenderContext({ mediaWidth: 500, mediaHeight: 500 });
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 500, mediaHeight: 500 });
    advance(16);
    r.render(ctx2);

    const arcs = spy.callsOf('arc');
    const outerR = arcs[0].args[2] as number;
    const cx = 250;
    // Center Y is hard to read back directly — infer from a slice arc.
    const cy = arcs[0].args[1] as number;
    const fillTexts = spy.callsOf('fillText');

    // Every text anchor (x, y) must sit outside the pie disk. PAV can shift
    // Y but X stays on the slice's radial ray, so `(labelX, labelY)` is at
    // radius ≥ outerR + distance in the unperturbed case. Even with Y
    // shifted by minGap, the anchor stays safely outside.
    for (const c of fillTexts) {
      const x = c.args[1] as number;
      const y = c.args[2] as number;
      const d = Math.hypot(x - cx, y - cy);
      expect(d).toBeGreaterThan(outerR);
    }
  });

  it('near-pole slice rails do not reverse direction at small `distance`', () => {
    // Regression: `distance: 16` used to produce a reversed-direction rail
    // for near-pole slices. The Stage-3 fallback placed the elbow at
    // `anchor ± elbowLen/2` which landed on the wrong side of labelX for
    // slices with cos ≈ 0 — the horizontal finish then drew back toward the
    // pie instead of out toward the text.
    //
    // Invariant: for every label, `labelX` must sit on the same side of
    // `elbowX` as the text direction (determined by `side`). Equivalently,
    // `side * (labelX − elbowX) >= 0`.
    const r = new PieRenderer({
      padAngle: 0,
      sliceLabels: { distance: 16 },
    });
    r.setData([
      // Chain-like dataset: dominant slice + a cluster near 12 o'clock.
      { label: 'Big', value: 58 },
      { label: 'A', value: 18 },
      { label: 'B', value: 10 },
      { label: 'C', value: 7 },
      { label: 'D', value: 5 },
      { label: 'E', value: 2 },
    ]);
    const { ctx } = buildRenderContext({ mediaWidth: 500, mediaHeight: 500 });
    r.render(ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 500, mediaHeight: 500 });
    r.render(ctx2);

    // Walk each leader line path and check the elbow → rail-end direction
    // matches the text's side (inferred from textAlign).
    const calls = spy.calls;
    let pathLineTos: Array<[number, number]> = [];
    let inPath = false;

    for (const c of calls) {
      if (c.method === 'beginPath') {
        pathLineTos = [];
        inPath = true;
      } else if (inPath && c.method === 'lineTo') {
        pathLineTos.push([c.args[0] as number, c.args[1] as number]);
      } else if (c.method === 'stroke') {
        inPath = false;
      } else if (c.method === 'fillText' && pathLineTos.length >= 2) {
        const textAlign = c.textAlign;
        const side = textAlign === 'left' ? 1 : -1;
        const elbowX = pathLineTos[pathLineTos.length - 2][0];
        const railEndX = pathLineTos[pathLineTos.length - 1][0];
        // Direction of the horizontal leg must match the text side (positive
        // dx on right-side labels, negative on left). A tolerance of 0.5 px
        // absorbs rounding when the leg is near-zero for pure-pole slices.
        expect(side * (railEndX - elbowX)).toBeGreaterThan(-0.5);
        pathLineTos = [];
      }
    }
  });

  it('leader line ends with a horizontal finish — elbow Y matches text Y', () => {
    // The last leg of every leader line must be horizontal: elbow Y (second-
    // to-last lineTo) equals rail-end Y (last lineTo) equals text Y. Stage 3
    // re-anchors the elbow to `labelY` exactly for this property.
    const r = new PieRenderer({ padAngle: 0 });
    r.setData(CLUSTER_SLICES);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx2);

    const calls = spy.calls;
    let pathLineTos: number[] = [];
    let inPath = false;
    let horizontalFinishes = 0;

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
        horizontalFinishes++;
        pathLineTos = [];
      }
    }

    expect(horizontalFinishes).toBeGreaterThanOrEqual(CLUSTER_SLICES.length - 1);
  });

  it('leader line ends exactly at the text y so the text sits on the rail', () => {
    // Invariant for every label: the last lineTo y before stroke matches the
    // fillText y within 0.5 px — text sits right on the rail tip.
    const r = new PieRenderer({ padAngle: 0 });
    r.setData(CLUSTER_SLICES);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    advance(16);
    r.render(ctx2);

    const calls = spy.calls;
    let lastLineToY: number | null = null;
    let inPath = false;

    for (const c of calls) {
      if (c.method === 'beginPath') {
        lastLineToY = null;
        inPath = true;
      } else if (inPath && c.method === 'lineTo') {
        lastLineToY = c.args[1] as number;
      } else if (c.method === 'stroke') {
        inPath = false;
      } else if (c.method === 'fillText' && lastLineToY !== null) {
        const textY = c.args[2] as number;
        expect(Math.abs(lastLineToY - textY)).toBeLessThan(0.5);
        lastLineToY = null;
      }
    }
  });

  it('increasing `labelGap` widens the gap between PAV-merged Polygon/Other pair', () => {
    // Chains dataset: Polygon (idx 4) and Other (idx 5) have near-identical
    // ideal Y and are guaranteed to merge in PAV. Their final gap equals the
    // minGap = fontSize * labelGap, so labelGap controls it directly.
    const chains: PieSliceData[] = [
      { label: 'Ethereum', value: 58 },
      { label: 'Solana', value: 18 },
      { label: 'BSC', value: 10 },
      { label: 'Avalanche', value: 7 },
      { label: 'Polygon', value: 5 },
      { label: 'Other', value: 2 },
    ];

    const measureGap = (labelGap: number): number => {
      const r = new PieRenderer({ padAngle: 0, sliceLabels: { labelGap, fontSize: 11 } });
      r.setData(chains);
      const { ctx } = buildRenderContext({ mediaWidth: 500, mediaHeight: 500 });
      settleReveal(r, ctx);
      const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 500, mediaHeight: 500 });
      advance(16);
      r.render(ctx2);

      const fillTexts = spy.callsOf('fillText');
      const polygon = fillTexts.find((c) => /Polygon/.test(c.args[0] as string));
      const other = fillTexts.find((c) => /Other/.test(c.args[0] as string));
      const polyY = polygon?.args[2] as number;
      const otherY = other?.args[2] as number;

      return Math.abs(polyY - otherY);
    };

    expect(measureGap(2.5)).toBeGreaterThan(measureGap(1.0));
  });

  it('larger `distance` shrinks the pie radius', () => {
    // The label reserve scales with `distance`, so the pie must shrink to
    // leave room. Smaller pies → smaller slice arcs.
    const radius = (distance: number): number => {
      const r = new PieRenderer({ padAngle: 0, sliceLabels: { distance } });
      r.setData(SLICES);
      const { ctx, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
      r.render(ctx);

      return spy.callsOf('arc')[0].args[2] as number;
    };

    expect(radius(60)).toBeLessThan(radius(12));
  });

  it('animate:false (default) keeps hovered slice in place — no explode jump', () => {
    // With animation off, the explode offset must stay at 0 on hover. The
    // tooltip / legend / cursor handle feedback; no slice movement.
    const r = new PieRenderer({ padAngle: 0 }); // animate defaults to false
    r.setData([
      { label: 'a', value: 50 },
      { label: 'b', value: 50 },
    ]);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx);

    r.setHoverIndex(0);
    // Drive many frames; offset must never leave 0.
    for (let i = 0; i < 40; i++) {
      advance(16);
      r.render(ctx);
    }
    expect(r._inspectSliceOffsets()[0]).toBe(0);
    expect(r.needsAnimation).toBe(false);
  });

  it('hover-driven explode offset pushes the anchor dot outward (requires animate:true)', () => {
    // Settle the reveal, then hover slice 0 and re-render until the offset
    // converges. The hovered slice's anchor dot should sit farther from cx
    // than its non-hovered counterpart. With `animate:false` (the default)
    // the explode effect is disabled entirely, so this test opts in.
    const r = new PieRenderer({ padAngle: 0, animate: true });
    r.setData([
      { label: 'a', value: 50 },
      { label: 'b', value: 50 },
    ]);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    settleReveal(r, ctx);

    const { ctx: ctxNoHover, spy: spyNoHover } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    advance(16);
    r.render(ctxNoHover);
    const restingArcs = spyNoHover.callsOf('arc').slice(2); // skip 2 slice arcs
    const restingX = restingArcs[0].args[0] as number;

    r.setHoverIndex(0);
    for (let i = 0; i < 80; i++) {
      advance(16);
      r.render(ctx);
    }

    const { ctx: ctxHover, spy: spyHover } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    advance(16);
    r.render(ctxHover);
    const hoverArcs = spyHover.callsOf('arc').slice(2);
    const hoverX = hoverArcs[0].args[0] as number;

    // Slice 0 midangle is at cos=1 (right side), so explode pushes the
    // anchor dot to a higher x.
    expect(hoverX).toBeGreaterThan(restingX);
  });

  it('donut (innerRadiusRatio > 0) still places label anchors on the OUTER ring', () => {
    // Donut slices draw two arcs each (outer + inner); anchor dots come
    // after. Label anchors must sit on the outer radius regardless of the
    // donut hole.
    const r = new PieRenderer({
      padAngle: 0,
      innerRadiusRatio: 0.5,
      sliceLabels: { distance: 24 },
    });
    r.setData([
      { label: 'right', value: 50 },
      { label: 'left', value: 50 },
    ]);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    advance(16);
    r.render(ctx2);

    const arcs = spy.callsOf('arc');
    const outerR = arcs[0].args[2] as number;
    // 2 slices × 2 arcs each = 4 slice arcs, then 2 anchor arcs.
    const anchorArcs = arcs.slice(4);
    expect(anchorArcs.length).toBe(2);
    const cx = 200;
    for (const a of anchorArcs) {
      const ax = a.args[0] as number;
      expect(Math.abs(Math.abs(ax - cx) - outerR)).toBeLessThan(1);
    }
  });

  it('cache invalidation: updating `distance` re-computes the reserve and reflows the pie', () => {
    const r = new PieRenderer({ padAngle: 0, sliceLabels: { distance: 12 } });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx);
    const before = spy.callsOf('arc')[0].args[2] as number;

    r.updateOptions({ sliceLabels: { distance: 60 } });
    const { ctx: ctx2, spy: spy2 } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    r.render(ctx2);
    const after = spy2.callsOf('arc')[0].args[2] as number;

    expect(after).toBeLessThan(before);
  });

  it('HiDPI: doubling pixelRatio at least doubles the outer radius in bitmap pixels', () => {
    // Canvas scales with pixelRatio, so the bitmap-pixel outer radius must
    // grow at least proportionally. (Exact ratio depends on how the mocked
    // measureText scales — the real font would make it exactly 2×; here we
    // just assert the "bigger canvas → bigger pie" direction.)
    const r = new PieRenderer({ padAngle: 0 });
    r.setData([
      { label: 'right', value: 50 },
      { label: 'left', value: 50 },
    ]);

    const outerRAt = (pixelRatio: number): number => {
      const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400, pixelRatio });
      settleReveal(r, ctx);
      const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400, pixelRatio });
      advance(16);
      r.render(ctx2);

      return spy.callsOf('arc')[0].args[2] as number;
    };

    expect(outerRAt(2)).toBeGreaterThanOrEqual(outerRAt(1) * 2);
  });

  it('data re-set rebuilds labels (no stale entries from the previous dataset)', () => {
    const r = new PieRenderer({ padAngle: 0 });
    r.setData(SLICES);
    const { ctx } = buildRenderContext();
    settleReveal(r, ctx);

    r.setData([{ label: 'only', value: 100 }]);
    const { ctx: ctx2 } = buildRenderContext();
    settleReveal(r, ctx2);
    const { ctx: ctx3, spy } = buildRenderContext();
    advance(16);
    r.render(ctx3);

    const fillTexts = spy.callsOf('fillText');
    expect(fillTexts).toHaveLength(1);
    expect(fillTexts[0].args[0]).toMatch(/only/);
  });

  it('zero total value short-circuits without throwing', () => {
    const r = new PieRenderer();
    r.setData([
      { label: 'a', value: 0 },
      { label: 'b', value: 0 },
    ]);
    const { ctx, spy } = buildRenderContext();
    expect(() => r.render(ctx)).not.toThrow();
    expect(spy.countOf('fillText')).toBe(0);
  });

  it('pad-angle does not affect label placement (anchor is at slice midangle)', () => {
    // Labels are anchored at slice midangles, which are unaffected by pad
    // gaps between slices. Two renders with different padAngle should
    // produce identical label Y's (within a tiny float budget).
    const sample = (padAngle: number): number[] => {
      const r = new PieRenderer({ padAngle });
      r.setData(SLICES);
      const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
      settleReveal(r, ctx);
      const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
      advance(16);
      r.render(ctx2);

      return spy.callsOf('fillText').map((c) => c.args[2] as number);
    };

    const a = sample(0);
    const b = sample(5);
    expect(a).toHaveLength(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(Math.abs(a[i] - b[i])).toBeLessThan(0.5);
    }
  });

  it('shadow:false (default) renders slices without any drop-shadow blur', () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'none' } });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    // Check the recorded state right before each fill(): shadowBlur must
    // be 0 when shadow is off and hover hasn't fired.
    const fills = spy.callsOf('fill');
    for (const f of fills) expect(f.shadowBlur).toBe(0);
  });

  it('shadow:true renders slices with an ambient drop-shadow blur', () => {
    const r = new PieRenderer({ shadow: true, sliceLabels: { mode: 'none' } });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    const fills = spy.callsOf('fill');
    expect(fills.length).toBeGreaterThan(0);
    for (const f of fills) {
      expect(f.shadowBlur).toBeGreaterThan(0);
      expect(f.shadowColor).not.toBe('transparent');
    }
  });

  it('innerShadow adds a darker edge stop to the slice gradient', () => {
    // Without innerShadow the per-slice gradient has exactly 2 stops; with
    // it enabled, a 3rd stop (darkened rim color) is appended.
    const base = new PieRenderer({ sliceLabels: { mode: 'none' } });
    base.setData([{ label: 'only', value: 100, color: '#3366ff' }]);
    const { ctx: ctxB, spy: spyB } = buildRenderContext();
    base.render(ctxB);
    const baseFillStyle = spyB.callsOf('fill')[0].fillStyle as string;

    const withInner = new PieRenderer({
      sliceLabels: { mode: 'none' },
      innerShadow: { depth: 0.3, color: 'rgba(0,0,0,0.5)' },
    });
    withInner.setData([{ label: 'only', value: 100, color: '#3366ff' }]);
    const { ctx: ctxI, spy: spyI } = buildRenderContext();
    withInner.render(ctxI);
    const innerFillStyle = spyI.callsOf('fill')[0].fillStyle as string;

    // The recording context serializes gradients as
    //   gradient(radial;<offset1>:<color1>,<offset2>:<color2>,...)
    // so more commas == more stops.
    const baseStops = (baseFillStyle.match(/,/g) ?? []).length;
    const innerStops = (innerFillStyle.match(/,/g) ?? []).length;
    expect(innerStops).toBeGreaterThan(baseStops);
  });

  it('shadow object: color/blur/offset passed through to the paint', () => {
    const r = new PieRenderer({
      shadow: { color: '#123456', blur: 20, offsetX: 2, offsetY: 10 },
      sliceLabels: { mode: 'none' },
    });
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext({ pixelRatio: 1 });
    r.render(ctx);

    const fills = spy.callsOf('fill');
    expect(fills.length).toBeGreaterThan(0);
    for (const f of fills) {
      expect(f.shadowColor).toBe('#123456');
      expect(f.shadowBlur).toBe(20);
      expect(f.shadowOffsetX).toBe(2);
      expect(f.shadowOffsetY).toBe(10);
    }
  });

  it('slice colors propagate to leader strokes (per-label color inheritance)', () => {
    // Each label's leader stroke should use its slice color.
    const r = new PieRenderer({ padAngle: 0 });
    r.setData([
      { label: 'red', value: 33, color: '#ff0000' },
      { label: 'green', value: 33, color: '#00ff00' },
      { label: 'blue', value: 34, color: '#0000ff' },
    ]);
    const { ctx } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    settleReveal(r, ctx);

    const { ctx: ctx2, spy } = buildRenderContext({ mediaWidth: 400, mediaHeight: 400 });
    advance(16);
    r.render(ctx2);

    const strokeStyles = spy.calls.filter((c) => c.method === 'stroke').map((c) => c.strokeStyle as string);

    expect(strokeStyles).toContain('#ff0000');
    expect(strokeStyles).toContain('#00ff00');
    expect(strokeStyles).toContain('#0000ff');
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
  it('flags needsAnimation true after setData when animate:true, false once settled', () => {
    const r = new PieRenderer({ animate: true });
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
    const r = new PieRenderer({ animate: true, sliceLabels: { mode: 'none' } });
    r.setData(SLICES);
    const { ctx } = buildRenderContext();
    r.render(ctx);

    // No hover set, no outside reveal → nothing to animate.
    expect(r.needsAnimation).toBe(false);
  });

  it('switching mode into outside restarts the reveal (only when animate:true)', () => {
    const r = new PieRenderer({ animate: true, sliceLabels: { mode: 'none' } });
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

  it('animate:false (default) skips the reveal — labels paint fully on first frame', () => {
    const r = new PieRenderer(); // animate defaults to false
    r.setData(SLICES);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    // No prior renders, no reveal tween — text is already drawn.
    expect(spy.countOf('fillText')).toBe(SLICES.length);
    expect(r.needsAnimation).toBe(false);
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

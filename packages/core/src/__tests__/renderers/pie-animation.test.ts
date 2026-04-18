import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PieRenderer } from '../../series/pie';
import type { PieSliceData } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

const SLICES: PieSliceData[] = [
  { label: 'A', value: 50 },
  { label: 'B', value: 30 },
  { label: 'C', value: 20 },
];

/**
 * Pie hover/explode animation is driven by `performance.now()` deltas inside `render()`.
 * Tests stub `performance.now` so we can advance virtual time and observe the
 * `sliceOffsets` state machine deterministically (no real RAF involved).
 */
describe('PieRenderer — slice explode animation', () => {
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

  function renderFrame(r: PieRenderer): void {
    const { ctx } = buildRenderContext();
    r.render(ctx);
  }

  function offsetOf(r: PieRenderer, index: number): number {
    // `sliceOffsets` is private, so this helper reaches through a casted
    // instance to inspect that internal state for test assertions only.
    const offsets = (r as unknown as { sliceOffsets: number[] }).sliceOffsets;
    return offsets[index];
  }

  it('animates over many frames instead of snapping in one', () => {
    const r = new PieRenderer();
    r.setData(SLICES);
    renderFrame(r); // prime lastRenderTime
    r.setHoverIndex(1);

    // Advance by a single 60fps frame and render. Offset should be partial,
    // not fully at 1 — that would mean it snapped straight to the target.
    advance(16);
    renderFrame(r);
    const afterOneFrame = offsetOf(r, 1);
    expect(afterOneFrame).toBeGreaterThan(0);
    expect(afterOneFrame).toBeLessThan(0.5);
    expect(r.needsAnimation).toBe(true);
  });

  it('reaches the hovered target after enough frames', () => {
    const r = new PieRenderer();
    r.setData(SLICES);
    renderFrame(r);
    r.setHoverIndex(2);

    for (let i = 0; i < 60; i++) {
      advance(16);
      renderFrame(r);
    }
    expect(offsetOf(r, 2)).toBeGreaterThan(0.99);
    expect(r.needsAnimation).toBe(false);
  });

  // Regression: lastRenderTime would go stale once `needsAnimation` returned
  // false (no markDirty → no renders). The next hover then computed a huge dt
  // and `lerp(_, _, speed * dt)` clamped t to 1, snapping the new slice fully
  // exploded in one frame. Symptom in the docs app: "animation works a few
  // times then stops" — really, it teleports after any idle gap.
  it('does not snap when the next hover happens after a long idle gap', () => {
    const r = new PieRenderer();
    r.setData(SLICES);
    renderFrame(r);

    // First hover, run to completion.
    r.setHoverIndex(0);
    for (let i = 0; i < 60; i++) {
      advance(16);
      renderFrame(r);
    }
    expect(offsetOf(r, 0)).toBeGreaterThan(0.99);
    expect(r.needsAnimation).toBe(false);

    // User stares at the exploded slice for 5 seconds — no renders happen.
    advance(5000);

    // Move to a different slice. The first frame after the idle must NOT
    // collapse the old slice or fully explode the new one.
    r.setHoverIndex(2);
    advance(16);
    renderFrame(r);

    const oldOffset = offsetOf(r, 0);
    const newOffset = offsetOf(r, 2);
    // Old slice should still be near fully exploded; not snapped to 0.
    expect(oldOffset).toBeGreaterThan(0.5);
    // New slice should have only started its animation, not jumped to 1.
    expect(newOffset).toBeLessThan(0.5);
    expect(r.needsAnimation).toBe(true);
  });

  it('animates retraction when hover clears', () => {
    const r = new PieRenderer();
    r.setData(SLICES);
    renderFrame(r);

    r.setHoverIndex(1);
    for (let i = 0; i < 60; i++) {
      advance(16);
      renderFrame(r);
    }
    expect(offsetOf(r, 1)).toBeGreaterThan(0.99);

    r.setHoverIndex(-1);
    advance(16);
    renderFrame(r);
    const partial = offsetOf(r, 1);
    expect(partial).toBeLessThan(1);
    expect(partial).toBeGreaterThan(0.3); // smooth, not snapped
    expect(r.needsAnimation).toBe(true);
  });
});

/**
 * Edge-indicator orchestration — the per-side dispatch that ChartInstance
 * delegates to. `drawEdgeIndicators` walks both sides, skips inert states,
 * resolves a boundary time, and hands off to `renderEdgeIndicator` (the
 * primitive drawing is covered separately in
 * `__tests__/components/edge-indicator.test.ts`). `resolveEdgeBoundary` is
 * the pure boundary-picking helper.
 */
import { describe, expect, it, vi } from 'vitest';

import { buildRenderContext } from '../../__tests__/helpers/render-context';
import type { EdgeSide, EdgeState } from '../../components/edge-indicator';
import { type EdgeIndicatorContext, drawEdgeIndicators, resolveEdgeBoundary } from '../edge-indicators';

function buildCtx(opts: {
  edgeStates: Record<EdgeSide, EdgeState>;
  resolveBoundary: (side: EdgeSide) => number | null;
}): { spy: ReturnType<typeof buildRenderContext>['spy']; ctx: EdgeIndicatorContext } {
  const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 100 } });

  return {
    spy: built.spy,
    ctx: {
      scope: built.ctx.scope,
      chartMediaHeight: 400,
      timeScale: built.timeScale,
      theme: built.ctx.theme,
      edgeStates: opts.edgeStates,
      resolveBoundary: opts.resolveBoundary,
    },
  };
}

describe('resolveEdgeBoundary', () => {
  it('prefers the cached overshoot time when present', () => {
    expect(resolveEdgeBoundary('right', 42, { first: 0, last: 100 })).toBe(42);
    expect(resolveEdgeBoundary('left', 7, { first: 0, last: 100 })).toBe(7);
  });

  it('falls back to the matching data edge per side when no cache', () => {
    expect(resolveEdgeBoundary('left', null, { first: 5, last: 95 })).toBe(5);
    expect(resolveEdgeBoundary('right', null, { first: 5, last: 95 })).toBe(95);
  });

  it('returns null when neither a cache nor a data edge is available', () => {
    expect(resolveEdgeBoundary('left', null, { first: undefined, last: undefined })).toBeNull();
    expect(resolveEdgeBoundary('right', null, { first: undefined, last: undefined })).toBeNull();
  });
});

describe('drawEdgeIndicators', () => {
  it('draws nothing when both sides are idle', () => {
    const { spy, ctx } = buildCtx({
      edgeStates: { left: 'idle', right: 'idle' },
      resolveBoundary: () => 0,
    });

    drawEdgeIndicators(ctx);

    expect(spy.calls).toHaveLength(0);
  });

  it('skips has-more sides without resolving a boundary', () => {
    const resolveBoundary = vi.fn(() => 50);
    const { spy, ctx } = buildCtx({
      edgeStates: { left: 'has-more', right: 'has-more' },
      resolveBoundary,
    });

    drawEdgeIndicators(ctx);

    expect(spy.calls).toHaveLength(0);
    expect(resolveBoundary).not.toHaveBeenCalled();
  });

  it('resolves the boundary only for active sides', () => {
    const resolveBoundary = vi.fn((side: EdgeSide) => (side === 'left' ? 0 : 100));
    const { ctx } = buildCtx({
      edgeStates: { left: 'loading', right: 'idle' },
      resolveBoundary,
    });

    drawEdgeIndicators(ctx);

    expect(resolveBoundary).toHaveBeenCalledTimes(1);
    expect(resolveBoundary).toHaveBeenCalledWith('left');
  });

  it('draws the loading spinner for an active side with a boundary', () => {
    const { spy, ctx } = buildCtx({
      edgeStates: { left: 'loading', right: 'idle' },
      resolveBoundary: () => 0,
    });

    drawEdgeIndicators(ctx);

    // Three-dot traveling-pulse spinner → three arcs.
    expect(spy.countOf('arc')).toBe(3);
  });

  it('skips an active side whose boundary resolves to null', () => {
    const { spy, ctx } = buildCtx({
      edgeStates: { left: 'no-data', right: 'idle' },
      resolveBoundary: () => null,
    });

    drawEdgeIndicators(ctx);

    expect(spy.calls).toHaveLength(0);
  });

  it('renders both sides independently when both are active', () => {
    const { spy, ctx } = buildCtx({
      edgeStates: { left: 'loading', right: 'loading' },
      resolveBoundary: (side) => (side === 'left' ? 0 : 100),
    });

    drawEdgeIndicators(ctx);

    // Two spinners → six arcs.
    expect(spy.countOf('arc')).toBe(6);
  });
});

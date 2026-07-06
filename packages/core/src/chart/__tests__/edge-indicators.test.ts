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
import {
  type EdgeIndicatorContext,
  drawEdgeIndicators,
  resolveEdgeAnchorValue,
  resolveEdgeBoundary,
} from '../edge-indicators';

function buildCtx(opts: {
  edgeStates: Record<EdgeSide, EdgeState>;
  resolveBoundary: (side: EdgeSide) => number | null;
  edgeExitFades?: Record<EdgeSide, number | null>;
}): { spy: ReturnType<typeof buildRenderContext>['spy']; ctx: EdgeIndicatorContext } {
  const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 100 } });

  return {
    spy: built.spy,
    ctx: {
      scope: built.ctx.scope,
      chartMediaWidth: 800,
      chartMediaHeight: 400,
      timeScale: built.timeScale,
      theme: built.ctx.theme,
      edgeStates: opts.edgeStates,
      edgeExitFades: opts.edgeExitFades ?? { left: null, right: null },
      edgeIndicatorFns: { left: null, right: null },
      resolveBoundary: opts.resolveBoundary,
      resolveEdgeAnchor: () => null,
      resolveEdgeBarSpacing: () => null,
      reportPlaceholders: () => {},
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

  it('keeps painting a faded loading frame for an idle side with an exit fade', () => {
    const { spy, ctx } = buildCtx({
      edgeStates: { left: 'idle', right: 'idle' },
      resolveBoundary: () => 0,
      edgeExitFades: { left: 0.5, right: null },
    });

    drawEdgeIndicators(ctx);

    // One fading spinner → three arcs, drawn at reduced alpha.
    const arcs = spy.callsOf('arc');
    expect(arcs).toHaveLength(3);
    for (const arc of arcs) {
      expect(arc.globalAlpha).toBe(0.5);
    }
  });

  it('does not fade a side that moved to no-data', () => {
    const { spy, ctx } = buildCtx({
      edgeStates: { left: 'no-data', right: 'idle' },
      resolveBoundary: () => 0,
      edgeExitFades: { left: null, right: null },
    });

    drawEdgeIndicators(ctx);

    // The no-data marker draws as usual (dashed line + label), no spinner arcs.
    expect(spy.countOf('arc')).toBe(0);
    expect(spy.countOf('fillText')).toBe(1);
  });
});

describe('resolveEdgeAnchorValue', () => {
  const candle = { time: 1000, open: 10, high: 12, low: 8, close: 11 };

  it('continues from open when loading older history (left)', () => {
    expect(resolveEdgeAnchorValue('left', candle)).toBe(10);
  });

  it('continues from close when loading newer data (right)', () => {
    expect(resolveEdgeAnchorValue('right', candle)).toBe(11);
  });

  it('uses the single value field for a line/bar point regardless of side', () => {
    const point = { time: 1000, value: 42 };
    expect(resolveEdgeAnchorValue('left', point)).toBe(42);
    expect(resolveEdgeAnchorValue('right', point)).toBe(42);
  });
});

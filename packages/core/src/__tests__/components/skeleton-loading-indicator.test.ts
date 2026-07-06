import { describe, expect, it } from 'vitest';

import { type PlaceholderBar, skeletonLoadingIndicator } from '../../components/loading-indicator';
import { buildRenderContext } from '../helpers/render-context';

/**
 * "Chart skeleton" draws muted placeholder candle bodies (`fillRect`) plus a
 * shimmer sweep (a `createLinearGradient` fill over the same bodies). The
 * bar nearest the boundary is centered on the real `edgeValueY`; the rest
 * taper away from it. The anchor side flips which end of the stage the
 * nearest bar sits at.
 */
describe('skeletonLoadingIndicator', () => {
  function firstBodyCenterY(calls: ReturnType<typeof buildRenderContext>['spy']['calls']): number {
    const body = calls.find((c) => c.method === 'fillRect');
    if (!body?.args) throw new Error('no fillRect call recorded');
    const [, y, , h] = body.args as number[];

    return y + h / 2;
  }

  it('centers the nearest placeholder bar on edgeValueY when provided', () => {
    const built = buildRenderContext();
    skeletonLoadingIndicator({
      scope: built.ctx.scope,
      theme: built.ctx.theme,
      chartMediaWidth: 150,
      chartMediaHeight: 400,
      now: 0,
      side: 'right',
      edgeValueY: 120,
    });

    expect(firstBodyCenterY(built.spy.calls)).toBeCloseTo(120);
  });

  it('falls back to mid-height when edgeValueY is absent', () => {
    const built = buildRenderContext();
    skeletonLoadingIndicator({
      scope: built.ctx.scope,
      theme: built.ctx.theme,
      chartMediaWidth: 150,
      chartMediaHeight: 400,
      now: 0,
      side: 'right',
    });

    expect(firstBodyCenterY(built.spy.calls)).toBeCloseTo(200);
  });

  it('anchors the nearest bar near x=0 for the right side and near chartMediaWidth for the left side', () => {
    const built = buildRenderContext();

    skeletonLoadingIndicator({
      scope: built.ctx.scope,
      theme: built.ctx.theme,
      chartMediaWidth: 150,
      chartMediaHeight: 400,
      now: 0,
      side: 'right',
      edgeValueY: 100,
    });
    const rightBody = built.spy.calls.find((c) => c.method === 'fillRect');
    const rightX = (rightBody?.args as number[])[0];

    built.spy.reset();
    skeletonLoadingIndicator({
      scope: built.ctx.scope,
      theme: built.ctx.theme,
      chartMediaWidth: 150,
      chartMediaHeight: 400,
      now: 0,
      side: 'left',
      edgeValueY: 100,
    });
    const leftBody = built.spy.calls.find((c) => c.method === 'fillRect');
    const leftX = (leftBody?.args as number[])[0];

    expect(rightX).toBeLessThan(75);
    expect(leftX).toBeGreaterThan(75);
  });

  it('draws a placeholder body per bar plus a shimmer sweep over each', () => {
    const built = buildRenderContext();
    skeletonLoadingIndicator({
      scope: built.ctx.scope,
      theme: built.ctx.theme,
      chartMediaWidth: 150,
      chartMediaHeight: 400,
      now: 0,
      side: 'right',
      edgeValueY: 100,
    });

    const bars = Math.max(3, Math.min(6, Math.floor(150 / 24)));
    // One body fillRect + one shimmer fillRect per bar.
    expect(built.spy.countOf('fillRect')).toBe(bars * 2);
    expect(built.spy.countOf('createLinearGradient')).toBeGreaterThan(0);
  });

  it('clamps to a minimum of three bars on a very narrow stage', () => {
    const built = buildRenderContext();
    skeletonLoadingIndicator({
      scope: built.ctx.scope,
      theme: built.ctx.theme,
      chartMediaWidth: 40,
      chartMediaHeight: 400,
      now: 0,
      side: 'right',
      edgeValueY: 100,
    });

    expect(built.spy.countOf('fillRect')).toBe(3 * 2);
  });

  it('sizes placeholder bodies from the real barSpacing instead of a fixed gap', () => {
    const built = buildRenderContext();
    skeletonLoadingIndicator({
      scope: built.ctx.scope,
      theme: built.ctx.theme,
      chartMediaWidth: 150,
      chartMediaHeight: 400,
      now: 0,
      side: 'right',
      edgeValueY: 100,
      barSpacing: 60,
    });

    const body = built.spy.calls.find((c) => c.method === 'fillRect');
    const width = (body?.args as number[])[2];
    // Body width tracks barSpacing (60 * 0.55 = 33), not the 24px fallback gap.
    expect(width).toBeCloseTo(60 * 0.55);
  });

  it('draws wick stubs for a candlestick series (and when the kind is unresolvable)', () => {
    const candlestick = buildRenderContext();
    skeletonLoadingIndicator({
      scope: candlestick.ctx.scope,
      theme: candlestick.ctx.theme,
      chartMediaWidth: 150,
      chartMediaHeight: 400,
      now: 0,
      side: 'right',
      edgeValueY: 100,
      seriesKind: 'candlestick',
    });
    expect(candlestick.spy.countOf('stroke')).toBeGreaterThan(0);

    const unresolved = buildRenderContext();
    skeletonLoadingIndicator({
      scope: unresolved.ctx.scope,
      theme: unresolved.ctx.theme,
      chartMediaWidth: 150,
      chartMediaHeight: 400,
      now: 0,
      side: 'right',
      edgeValueY: 100,
    });
    expect(unresolved.spy.countOf('stroke')).toBeGreaterThan(0);
  });

  it('reports one boundary-relative placeholder per drawn bar', () => {
    const built = buildRenderContext();
    let reported: PlaceholderBar[] | null = null;

    skeletonLoadingIndicator({
      scope: built.ctx.scope,
      theme: built.ctx.theme,
      chartMediaWidth: 150,
      chartMediaHeight: 400,
      now: 0,
      side: 'left',
      edgeValueY: 120,
      barSpacing: 24,
      reportPlaceholders: (bars) => {
        reported = bars;
      },
    });

    const bars: PlaceholderBar[] = reported ?? [];
    expect(bars.length).toBeGreaterThanOrEqual(3);

    // Offsets grow away from the boundary (which sits at the stage's right
    // edge for a left-side loader), one bar gap apart, all positive.
    expect(bars[0].offsetX).toBeCloseTo(24 * 0.7);
    expect(bars[1].offsetX).toBeCloseTo(24 * 0.7 + 24);
    // The nearest bar is centered on the real edge value.
    expect(bars[0].y).toBeCloseTo(120);
    for (const bar of bars) {
      expect(bar.offsetX).toBeGreaterThan(0);
      expect(bar.halfHeight).toBeGreaterThan(0);
      expect(bar.width).toBeGreaterThan(0);
    }
  });

  it('skips wick stubs for a line/bar series', () => {
    const line = buildRenderContext();
    skeletonLoadingIndicator({
      scope: line.ctx.scope,
      theme: line.ctx.theme,
      chartMediaWidth: 150,
      chartMediaHeight: 400,
      now: 0,
      side: 'right',
      edgeValueY: 100,
      seriesKind: 'line',
    });
    expect(line.spy.countOf('stroke')).toBe(0);

    const bar = buildRenderContext();
    skeletonLoadingIndicator({
      scope: bar.ctx.scope,
      theme: bar.ctx.theme,
      chartMediaWidth: 150,
      chartMediaHeight: 400,
      now: 0,
      side: 'right',
      edgeValueY: 100,
      seriesKind: 'bar',
    });
    expect(bar.spy.countOf('stroke')).toBe(0);
  });
});

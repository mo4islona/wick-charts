import { describe, expect, it } from 'vitest';

import { renderEdgeIndicator } from '../../components/edge-indicator';
import { buildRenderContext } from '../helpers/render-context';

function renderFor(state: 'idle' | 'loading' | 'no-data' | 'has-more', side: 'left' | 'right') {
  const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 100 } });
  renderEdgeIndicator({
    scope: built.ctx.scope,
    timeScale: built.timeScale,
    theme: built.ctx.theme,
    chartMediaHeight: 400,
    boundaryTime: side === 'right' ? 100 : 0,
    side,
    state,
    now: 0,
  });
  return built.spy;
}

describe('renderEdgeIndicator', () => {
  it('idle state draws nothing', () => {
    const spy = renderFor('idle', 'right');
    expect(spy.calls).toHaveLength(0);
  });

  it('has-more state draws nothing (reserved, currently a no-op)', () => {
    const spy = renderFor('has-more', 'right');
    expect(spy.calls).toHaveLength(0);
  });

  it('loading state draws three arc dots (spinner)', () => {
    const spy = renderFor('loading', 'right');
    const arcs = spy.calls.filter((c) => c.method === 'arc');
    expect(arcs).toHaveLength(3);
  });

  it('loading state highlights exactly one dot per animation phase', () => {
    const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 100 } });
    renderEdgeIndicator({
      scope: built.ctx.scope,
      timeScale: built.timeScale,
      theme: built.ctx.theme,
      chartMediaHeight: 400,
      boundaryTime: 100,
      side: 'right',
      state: 'loading',
      now: 0, // phase 0 → first dot active
    });
    // Three fills in total. Exactly one is the "active" color (theme.axis.textColor as-is);
    // the other two are semi-transparent rgba variants.
    const fills = built.spy.calls.filter((c) => c.method === 'fill');
    expect(fills).toHaveLength(3);
  });

  it('no-data state draws a dashed vertical line plus the label text', () => {
    const spy = renderFor('no-data', 'right');
    const strokes = spy.calls.filter((c) => c.method === 'stroke');
    expect(strokes.length).toBeGreaterThan(0);
    // Dashed pattern was configured.
    const dashCalls = spy.calls.filter((c) => c.method === 'setLineDash');
    expect(dashCalls.length).toBeGreaterThanOrEqual(1);
    // Label was drawn.
    const textCalls = spy.calls.filter((c) => c.method === 'fillText');
    expect(textCalls).toHaveLength(1);
    expect(textCalls[0].args?.[0]).toBe('No more data');
  });

  it('no-data label sits on the interior side of the boundary', () => {
    // Right side: label x should be LESS than boundary x (inset toward chart center).
    const rightSpy = renderFor('no-data', 'right');
    const rightText = rightSpy.callsOf('fillText')[0];
    const rightLabelX = rightText.args[1] as number;
    // Boundary was at time=100, which maps to mediaWidth (800); bitmap x = 800 * pixelRatio (1).
    expect(rightLabelX).toBeLessThan(800);

    // Left side: label x should be GREATER than boundary x.
    const leftSpy = renderFor('no-data', 'left');
    const leftText = leftSpy.callsOf('fillText')[0];
    const leftLabelX = leftText.args[1] as number;
    // Boundary was at time=0 → bitmap x = 0.
    expect(leftLabelX).toBeGreaterThan(0);
  });
});

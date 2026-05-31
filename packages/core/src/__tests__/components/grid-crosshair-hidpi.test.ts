import { describe, expect, it } from 'vitest';

import { renderCrosshair } from '../../components/crosshair';
import { renderGrid } from '../../components/grid';
import type { TickTrackerSnapshot } from '../../scales/tick-tracker';
import { buildRenderContext } from '../helpers/render-context';

const ticks = (values: number[]): TickTrackerSnapshot => ({
  entries: values.map((value) => ({ value, opacity: 1 })),
  isAnimating: false,
});

describe('grid / crosshair HiDPI stroke width', () => {
  it('grid lines scale lineWidth to device pixels at DPR 2', () => {
    const built = buildRenderContext({ pixelRatio: 2 });
    renderGrid({
      scope: built.ctx.scope,
      timeScale: built.timeScale,
      yScale: built.yScale,
      theme: built.ctx.theme,
      yTicks: ticks([25, 50, 75]),
      timeTicks: ticks([25, 50, 75]),
    });

    const strokes = built.spy.callsOf('stroke');
    expect(strokes.length).toBeGreaterThan(0);
    for (const s of strokes) {
      expect(s.lineWidth).toBe(2);
    }
  });

  it('grid lines stay 1px at DPR 1 (no regression)', () => {
    const built = buildRenderContext({ pixelRatio: 1 });
    renderGrid({
      scope: built.ctx.scope,
      timeScale: built.timeScale,
      yScale: built.yScale,
      theme: built.ctx.theme,
      yTicks: ticks([50]),
      timeTicks: ticks([50]),
    });

    for (const s of built.spy.callsOf('stroke')) {
      expect(s.lineWidth).toBe(1);
    }
  });

  it('crosshair scales lineWidth to device pixels at DPR 2', () => {
    const built = buildRenderContext({ pixelRatio: 2 });
    renderCrosshair(built.ctx.scope, 100, 100, built.ctx.theme);

    const strokes = built.spy.callsOf('stroke');
    expect(strokes.length).toBeGreaterThan(0);
    for (const s of strokes) {
      expect(s.lineWidth).toBe(2);
    }
  });

  it('crosshair stays 1px at DPR 1 (no regression)', () => {
    const built = buildRenderContext({ pixelRatio: 1 });
    renderCrosshair(built.ctx.scope, 100, 100, built.ctx.theme);

    for (const s of built.spy.callsOf('stroke')) {
      expect(s.lineWidth).toBe(1);
    }
  });
});

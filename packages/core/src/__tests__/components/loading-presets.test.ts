import { describe, expect, it } from 'vitest';

import { placeholderShapes } from '../../components/loading/placeholders';
import {
  auroraLoadingIndicator,
  condenseLoadingIndicator,
  dustLoadingIndicator,
  glassLoadingIndicator,
  halftoneLoadingIndicator,
} from '../../components/loading/presets';
import type { LoadingIndicatorArgs, LoadingIndicatorFn, PlaceholderBar } from '../../components/loading-indicator';
import { buildRenderContext } from '../helpers/render-context';

/**
 * The presets share one placeholder geometry: shapes one slot apart from the
 * boundary, sized from the real marks the chart reports. This file runs
 * without a DOM, so the shader presets take their flat 2D fallback.
 */

function frame(overrides: Partial<LoadingIndicatorArgs> = {}) {
  const built = buildRenderContext();
  const args: LoadingIndicatorArgs = {
    scope: built.ctx.scope,
    theme: built.ctx.theme,
    chartMediaWidth: 150,
    chartMediaHeight: 400,
    now: 0,
    side: 'left',
    ...overrides,
  };

  return { args, spy: built.spy };
}

describe('placeholderShapes', () => {
  it('copies the real candle body width and spaces candles one slot apart', () => {
    const { args } = frame({ seriesKind: 'candlestick', edgeValueY: 120, barSpacing: 12, bodyWidth: 7 });
    const shapes = placeholderShapes(args);

    expect(shapes.kind).toBe('candle');
    expect(shapes.bars.every((bar) => bar.width === 7)).toBe(true);
    expect(shapes.bars[0].x).toBeCloseTo(150 - 12);
    expect(shapes.bars[1].x).toBeCloseTo(150 - 24);
    expect(shapes.bars[0].y).toBeCloseTo(120);
  });

  it('falls back to the renderers’ default width ratio when the series reports none', () => {
    const { args } = frame({ seriesKind: 'candlestick', barSpacing: 12 });

    expect(placeholderShapes(args).bars[0].width).toBeCloseTo(12 * 0.6);
  });

  it('stands bars on the baseline, the first one topped at the boundary value', () => {
    const { args } = frame({ seriesKind: 'bar', edgeValueY: 100, baselineY: 380, barSpacing: 12, bodyWidth: 7 });
    const [first, ...rest] = placeholderShapes(args).bars;

    expect(first.y - first.halfHeight).toBeCloseTo(100);
    expect(first.y + first.halfHeight).toBeCloseTo(380);
    for (const bar of rest) {
      expect(bar.y + bar.halfHeight).toBeCloseTo(380);
    }
  });

  it('starts a line at the boundary value with the real stroke width', () => {
    const { args } = frame({ seriesKind: 'line', edgeValueY: 90, barSpacing: 10, strokeWidth: 2.5 });
    const shapes = placeholderShapes(args);

    expect(shapes.bars).toHaveLength(0);
    expect(shapes.points[0]).toEqual({ x: 150, y: 90 });
    expect(shapes.stroke).toBe(2.5);
  });

  it('mirrors the shapes onto the right side', () => {
    const { args } = frame({ side: 'right', seriesKind: 'candlestick', barSpacing: 12 });

    expect(placeholderShapes(args).bars[0].x).toBeCloseTo(12);
  });

  it('keeps a line inside the plot when the boundary value sits at its top', () => {
    const { args } = frame({ seriesKind: 'line', edgeValueY: 2, barSpacing: 10 });
    const ys = placeholderShapes(args).points.map((point) => point.y);

    expect(Math.min(...ys)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...ys)).toBeLessThanOrEqual(400);
  });
});

describe('loading presets without WebGL2', () => {
  const shapePresets: Array<[string, LoadingIndicatorFn]> = [
    ['glass', glassLoadingIndicator],
    ['condense', condenseLoadingIndicator],
  ];

  it.each(shapePresets)('%s draws the flat candles and reports them for the morph reveal', (_name, preset) => {
    const reported: PlaceholderBar[][] = [];
    const { args, spy } = frame({
      seriesKind: 'candlestick',
      edgeValueY: 120,
      barSpacing: 12,
      bodyWidth: 7,
      reportPlaceholders: (bars) => reported.push(bars),
    });

    preset(args);

    expect(spy.countOf('fillRect')).toBeGreaterThan(0);
    expect(reported).toHaveLength(1);
    expect(reported[0][0]).toMatchObject({ offsetX: 12, width: 7 });
  });

  it('strokes a line at the real width and reports nothing — only candles morph', () => {
    const reported: PlaceholderBar[][] = [];
    const { args, spy } = frame({
      seriesKind: 'line',
      edgeValueY: 90,
      strokeWidth: 2.5,
      reportPlaceholders: (bars) => reported.push(bars),
    });

    glassLoadingIndicator(args);

    expect(spy.callsOf('stroke')[0]?.lineWidth).toBe(2.5);
    expect(reported).toHaveLength(0);
  });

  it.each([
    ['aurora', auroraLoadingIndicator],
    ['halftone', halftoneLoadingIndicator],
  ])('%s falls back to the flat shapes', (_name, preset) => {
    const { args, spy } = frame({ seriesKind: 'candlestick', edgeValueY: 120, barSpacing: 12 });

    preset(args);

    expect(spy.countOf('fillRect')).toBeGreaterThan(0);
  });

  it('dust draws its motes as short strokes', () => {
    const { args, spy } = frame({ edgeValueY: 120, now: 1234 });

    dustLoadingIndicator(args);

    expect(spy.countOf('stroke')).toBeGreaterThan(10);
  });
});

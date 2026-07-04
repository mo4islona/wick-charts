import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  roundedBarFill,
  roundedCandleFill,
  smoothCurve,
  steppedCurve,
  straightCurve,
} from '../../series/painters/builtins';
import { resolveBarPainter, resolveCandlePainter, resolveLinePainter } from '../../series/painters/resolve';
import type { BarPaintArgs, PaintEnv } from '../../series/painters/types';
import { createRecordingContext } from '../../testing/recording-context';
import { catppuccin } from '../../theme/themes/catppuccin';

function makeEnv(ctx: CanvasRenderingContext2D): PaintEnv {
  return { ctx, theme: catppuccin.theme, horizontalPixelRatio: 2, verticalPixelRatio: 2 };
}

const BAR_ARGS: BarPaintArgs = {
  geom: { x: 0, y: 0, width: 20, height: 40, baselineY: 40 },
  color: '#8250df',
  corners: { tl: true, tr: true, br: false, bl: false },
  radius: 4,
  progress: 1,
  isProjected: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('line curve resolution (direct builtins, no module-load side effect)', () => {
  it('maps the built-in curve names to their builders', () => {
    expect(resolveLinePainter('straight')).toBe(straightCurve);
    expect(resolveLinePainter('smooth')).toBe(smoothCurve);
    expect(resolveLinePainter('stepped')).toBe(steppedCurve);
  });
});

describe('default resolution', () => {
  it('defaults undefined to the rounded / straight built-ins', () => {
    expect(resolveBarPainter(undefined)).toBe(roundedBarFill);
    expect(resolveCandlePainter(undefined)).toBe(roundedCandleFill);
    expect(resolveLinePainter(undefined)).toBe(straightCurve);
  });
});

describe('raw function option', () => {
  it('invokes a raw function option', () => {
    const { ctx } = createRecordingContext();
    const raw = vi.fn();

    resolveBarPainter(raw)(makeEnv(ctx), BAR_ARGS);

    expect(raw).toHaveBeenCalledTimes(1);
  });

  it('guards a throwing raw function — does not abort, falls back to the default, warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ctx, spy } = createRecordingContext();
    const boom = vi.fn(() => {
      throw new Error('boom');
    });
    const resolved = resolveBarPainter(boom);

    expect(() => resolved(makeEnv(ctx), BAR_ARGS)).not.toThrow();
    resolved(makeEnv(ctx), BAR_ARGS);

    // The throwing raw painter ran both times...
    expect(boom).toHaveBeenCalledTimes(2);
    // ...the default fill rescued the paint...
    expect(spy.countOf('fill')).toBeGreaterThan(0);
    // ...and the warning fired once for that painter (WeakSet once-guard).
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

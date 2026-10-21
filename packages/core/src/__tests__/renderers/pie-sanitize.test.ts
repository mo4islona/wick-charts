import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PieRenderer } from '../../series/pie';
import { catppuccin } from '../../theme/themes/catppuccin';
import type { PieSliceData } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

const theme = catppuccin.theme;

describe('PieRenderer value sanitization (negative / non-finite slices)', () => {
  // Every case here feeds undrawable slices on purpose.
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns once, naming the first slice that gets no arc and its value', () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'none' } });
    const mix: PieSliceData[] = [
      { label: 'Wind', value: 21_000 },
      { label: 'Pumped storage', value: -1565 },
      { label: 'Solar', value: Number.NaN },
    ];
    r.setData(mix);
    r.setData(mix);

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('pie: 2 slices drawn with no arc');
    expect(message).toContain('"Pumped storage" with value -1565');
    expect(r.getSliceInfo(theme)?.[1].value).toBe(-1565);
  });

  it('stays silent for positive and zero slices', () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'none' } });
    r.setData([
      { label: 'A', value: 3 },
      { label: 'B', value: 0 },
    ]);

    expect(warn).not.toHaveBeenCalled();
  });

  it('a negative slice contributes 0 to layout but keeps its reported value', () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'none' } });
    r.setData([
      { label: 'A', value: 100 },
      { label: 'B', value: -40 },
    ] as PieSliceData[]);

    const info = r.getSliceInfo(theme);
    expect(info).not.toBeNull();
    // A is the only positive slice → 100% of the (sanitized) total.
    expect(info?.[0].percent).toBeCloseTo(100, 5);
    // B contributes nothing to the geometry, so 0% — but its raw value is preserved.
    expect(info?.[1].percent).toBe(0);
    expect(info?.[1].value).toBe(-40);
  });

  it('NaN / Infinity slices do not blank the disk or produce NaN percentages', () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'none' } });
    r.setData([
      { label: 'A', value: 50 },
      { label: 'B', value: Number.NaN },
      { label: 'C', value: Number.POSITIVE_INFINITY },
      { label: 'D', value: 50 },
    ] as PieSliceData[]);

    const info = r.getSliceInfo(theme);
    // Only A and D are finite-positive → 50/50.
    expect(info?.[0].percent).toBeCloseTo(50, 5);
    expect(info?.[3].percent).toBeCloseTo(50, 5);
    for (const slice of info ?? []) {
      expect(Number.isFinite(slice.percent)).toBe(true);
    }
  });

  it('degenerate (negative) slices are skipped in the rendered arc count', () => {
    const r = new PieRenderer({ padAngle: 0, sliceLabels: { mode: 'none' }, cornerRadius: 0 });
    r.setData([
      { label: 'A', value: 100 },
      { label: 'B', value: -40 },
      { label: 'C', value: 60 },
    ] as PieSliceData[]);
    const { ctx, spy } = buildRenderContext();

    r.render(ctx);

    // Two positive slices → two arcs; the negative slice draws nothing and must
    // not drag the running angle backward.
    expect(spy.countOf('arc')).toBe(2);
  });

  it('an all-non-positive dataset renders nothing instead of throwing', () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'none' } });
    r.setData([
      { label: 'A', value: -1 },
      { label: 'B', value: 0 },
      { label: 'C', value: Number.NaN },
    ] as PieSliceData[]);
    const { ctx, spy } = buildRenderContext();

    expect(() => r.render(ctx)).not.toThrow();
    expect(spy.countOf('arc')).toBe(0);
  });
});

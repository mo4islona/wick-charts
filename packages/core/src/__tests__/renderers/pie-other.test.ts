import { describe, expect, it } from 'vitest';

import { PieRenderer } from '../../series/pie';
import { catppuccin } from '../../theme/themes/catppuccin';
import type { PieSliceData } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

/** 10 slices, descending values — more than the default maxSlices of 8. */
const TEN_SLICES: PieSliceData[] = Array.from({ length: 10 }, (_, i) => ({
  label: `cat-${i}`,
  value: 100 - i * 10,
}));

describe('PieRenderer — "other" grouping (default on)', () => {
  it('groups a 10-slice dataset into 7 kept slices + one "Other"', () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'none' }, cornerRadius: 0 });
    r.setData(TEN_SLICES);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    // One outer arc per displayed slice: maxSlices defaults to 8 total.
    expect(spy.countOf('arc')).toBe(8);
  });

  it('keeps datasets at or below maxSlices untouched', () => {
    const r = new PieRenderer({ sliceLabels: { mode: 'none' }, cornerRadius: 0 });
    r.setData(TEN_SLICES.slice(0, 8));
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    expect(spy.countOf('arc')).toBe(8);
    const labels = r.getSliceInfo(catppuccin.theme)?.map((s) => s.label);
    expect(labels).not.toContain('Other');
  });

  it('reports the aggregate through getSliceInfo: Other is last, sums the dropped values, percentages still total 100', () => {
    const r = new PieRenderer();
    r.setData(TEN_SLICES);
    const info = r.getSliceInfo(catppuccin.theme);
    expect(info).not.toBeNull();

    expect(info).toHaveLength(8);
    const other = info?.[7];
    expect(other?.label).toBe('Other');
    // Dropped slices are the 3 smallest: 30 + 20 + 10.
    expect(other?.value).toBe(60);
    const total = (info ?? []).reduce((s, e) => s + e.percent, 0);
    expect(total).toBeCloseTo(100);
  });

  it('keeps the largest slices in their original order regardless of input order', () => {
    const r = new PieRenderer({ other: { maxSlices: 3 } });
    r.setData([
      { label: 'small-1', value: 1 },
      { label: 'big', value: 100 },
      { label: 'small-2', value: 2 },
      { label: 'medium', value: 50 },
    ]);

    const labels = r.getSliceInfo(catppuccin.theme)?.map((s) => s.label);
    expect(labels).toEqual(['big', 'medium', 'Other']);
  });

  it('paints the aggregate with the theme `pie.otherColor`, not the next palette color', () => {
    const r = new PieRenderer();
    r.setData(TEN_SLICES);
    const info = r.getSliceInfo(catppuccin.theme);
    expect(catppuccin.theme.pie?.otherColor).toBeTruthy();
    expect(info?.[7].color).toBe(catppuccin.theme.pie?.otherColor);
  });

  it('falls back to axis.textColor for theme literals without a `pie` block', () => {
    const r = new PieRenderer();
    r.setData(TEN_SLICES);
    const legacyTheme = { ...catppuccin.theme, pie: undefined };
    const info = r.getSliceInfo(legacyTheme);
    expect(info?.[7].color).toBe(legacyTheme.axis.textColor);
  });

  it('hover over the aggregate resolves to the Other slice', () => {
    const r = new PieRenderer();
    r.setData(TEN_SLICES);
    r.setHoverIndex(7);
    const info = r.getHoverInfo(catppuccin.theme);
    expect(info?.label).toBe('Other');
    expect(info?.value).toBe(60);
  });

  it('hitTest indexes the displayed slices — the last hittable index is the Other slice', () => {
    const r = new PieRenderer({ padAngle: 0 });
    r.setData(TEN_SLICES);
    const indices = new Set<number>();
    // Probe a ring of points inside the pie; collect every distinct index.
    for (let deg = 0; deg < 360; deg += 2) {
      const a = (deg * Math.PI) / 180;
      const idx = r.hitTest(200 + Math.cos(a) * 100, 200 + Math.sin(a) * 100, 400, 400);
      if (idx >= 0) indices.add(idx);
    }

    expect(Math.max(...indices)).toBe(7);
  });

  it('ranks by sanitized value: negative / non-finite slices can never outrank a real one', () => {
    const r = new PieRenderer({ other: { maxSlices: 3 } });
    r.setData([
      { label: 'broken', value: Number.NaN },
      { label: 'negative', value: -500 },
      { label: 'real-1', value: 10 },
      { label: 'real-2', value: 5 },
    ]);

    const labels = r.getSliceInfo(catppuccin.theme)?.map((s) => s.label);
    expect(labels).toEqual(['real-1', 'real-2', 'Other']);
  });
});

describe('PieRenderer — "other" grouping configuration', () => {
  it('other: false renders every slice', () => {
    const r = new PieRenderer({ other: false, sliceLabels: { mode: 'none' }, cornerRadius: 0 });
    r.setData(TEN_SLICES);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    expect(spy.countOf('arc')).toBe(10);
    expect(r.getSliceInfo(catppuccin.theme)).toHaveLength(10);
  });

  it('custom maxSlices / label / color flow through', () => {
    const r = new PieRenderer({ other: { maxSlices: 5, label: 'Rest', color: '#123456' } });
    r.setData(TEN_SLICES);

    const info = r.getSliceInfo(catppuccin.theme);
    expect(info).toHaveLength(5);
    expect(info?.[4].label).toBe('Rest');
    expect(info?.[4].color).toBe('#123456');
    // Dropped: 6 smallest of 100..10 → 60+50+40+30+20+10.
    expect(info?.[4].value).toBe(210);
  });

  it('updateOptions toggles grouping off and back on for already-set data', () => {
    const r = new PieRenderer();
    r.setData(TEN_SLICES);
    expect(r.getSliceInfo(catppuccin.theme)).toHaveLength(8);

    r.updateOptions({ other: false });
    expect(r.getSliceInfo(catppuccin.theme)).toHaveLength(10);

    r.updateOptions({ other: true });
    expect(r.getSliceInfo(catppuccin.theme)).toHaveLength(8);
  });

  it('partial updateOptions deep-merges with previous grouping options', () => {
    const r = new PieRenderer({ other: { maxSlices: 5 } });
    r.setData(TEN_SLICES);

    r.updateOptions({ other: { label: 'Rest' } });

    const info = r.getSliceInfo(catppuccin.theme);
    // maxSlices: 5 from the constructor must survive the label-only update.
    expect(info).toHaveLength(5);
    expect(info?.[4].label).toBe('Rest');
  });
});

import { describe, expect, it } from 'vitest';

import { XScale } from '../scales/x-scale';

function makeScale(args: { type: 'numeric' | 'category'; from: number; to: number; width?: number }): XScale {
  const scale = new XScale();
  scale.setType(args.type);
  scale.update({ from: args.from, to: args.to }, args.width ?? 800, 1);

  return scale;
}

function isNiceStep(step: number): boolean {
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const mantissa = Math.round((step / magnitude) * 1e9) / 1e9;

  return [1, 2, 5].includes(mantissa);
}

describe('XScale on a numeric axis', () => {
  it('places ticks on a 1-2-5 step that clears minLabelSpacing', () => {
    const scale = makeScale({ type: 'numeric', from: 0, to: 64, width: 400 });
    const { ticks, tickInterval } = scale.niceTickValues(8);

    expect(isNiceStep(tickInterval)).toBe(true);
    expect(scale.barWidthMedia(tickInterval)).toBeGreaterThanOrEqual(80);
    for (const tick of ticks) {
      expect(tick % tickInterval).toBe(0);
    }
  });

  it('honours labelCount and a tighter minLabelSpacing', () => {
    const scale = makeScale({ type: 'numeric', from: 0, to: 64, width: 800 });
    scale.setMinSpacing(20);
    scale.setLabelCount(5);

    const { ticks, tickInterval } = scale.niceTickValues(8);

    expect(tickInterval).toBe(10);
    expect(ticks).toEqual([0, 10, 20, 30, 40, 50, 60]);
  });

  it('ignores the data interval, so no time tier is picked', () => {
    const scale = makeScale({ type: 'numeric', from: 0, to: 1, width: 800 });

    expect(scale.niceTickValues(0.25).tickInterval).toBe(0.1);
    expect(scale.niceTickValues(60_000).tickInterval).toBe(0.1);
  });

  it('formats a locale number with the decimals the step needs', () => {
    const scale = makeScale({ type: 'numeric', from: 0, to: 2000 });

    expect(scale.formatX(1500, 500)).toBe('1,500');
    expect(scale.formatX(0.25, 0.05)).toBe('0.25');

    scale.setLocale('de-DE');
    expect(scale.formatX(1500.5, 0.5)).toBe('1.500,5');
  });

  it('hands the number to a custom formatter', () => {
    const scale = makeScale({ type: 'numeric', from: 0, to: 64 });
    scale.setFormat((x, step) => `${x} req (${step})`);

    expect(scale.formatX(16, 16)).toBe('16 req (16)');
  });
});

describe('XScale on a category axis', () => {
  function categoryScale(names: string[], padding?: { inner?: number; outer?: number }): XScale {
    const scale = new XScale();
    scale.setType('category');
    scale.setCategories(names);
    scale.setBandPadding(padding);
    const range = scale.bandRange();
    if (range === null) throw new Error('no bands');
    scale.update(range, 500, 1);

    return scale;
  }

  it('fits every band with its outer padding', () => {
    const scale = categoryScale(['EU', 'Asia', 'Amer.', 'Africa', 'Oce.'], { inner: 0.3, outer: 0.2 });

    expect(scale.bandRange()).toEqual({ from: -0.55, to: 4.55 });
    // 5 bands over 5.1 steps on 500 px: one step is 500 / 5.1 px wide.
    const step = 500 / 5.1;
    expect(scale.timeToX(0)).toBeCloseTo(0.55 * step);
    expect(scale.bandWidthBitmap()).toBe(Math.round(0.7 * step));
  });

  it('defaults the band padding near the mockup', () => {
    const scale = categoryScale(['a', 'b']);

    expect(scale.getBandPadding()).toEqual({ inner: 0.3, outer: 0.2 });
  });

  it('puts one tick per category at its band centre, labelled with the name', () => {
    const scale = categoryScale(['EU', 'Asia', 'Amer.']);
    const { ticks, tickInterval } = scale.niceTickValues(1);

    expect(ticks).toEqual([0, 1, 2]);
    expect(tickInterval).toBe(1);
    expect(ticks.map((tick) => scale.formatX(tick, tickInterval))).toEqual(['EU', 'Asia', 'Amer.']);
  });

  it('snaps a coordinate to the nearest band and reads its name', () => {
    const scale = categoryScale(['EU', 'Asia', 'Amer.']);

    expect(scale.snapToBand(1.4)).toBe(1);
    expect(scale.snapToBand(-0.5)).toBe(0);
    expect(scale.snapToBand(7)).toBe(2);
    expect(scale.domainValue(1.6)).toBe('Amer.');
  });

  it('hands the name to a custom formatter', () => {
    const scale = categoryScale(['Europe']);
    scale.setFormat((x) => String(x).slice(0, 2));

    expect(scale.formatX(0, 1)).toBe('Eu');
  });
});

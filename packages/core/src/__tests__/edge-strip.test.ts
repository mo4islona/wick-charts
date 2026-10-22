import { describe, expect, it } from 'vitest';

import { edgeStripAlpha } from '../series/edge-strip';

describe('edgeStripAlpha', () => {
  const strip = { start: 745, end: 757 };

  it('keeps a dot whole without a strip or while its edge stays out of it', () => {
    expect(edgeStripAlpha({ strip: null, x: 760, radius: 7 })).toBe(1);
    expect(edgeStripAlpha({ strip, x: 738, radius: 7 })).toBe(1);
  });

  it('fades on an ease-in as the dot edge reaches into the strip', () => {
    expect(edgeStripAlpha({ strip, x: 741, radius: 7 })).toBeCloseTo(1 - (3 / 12) ** 2);
    expect(edgeStripAlpha({ strip, x: 747, radius: 7 })).toBeCloseTo(1 - (9 / 12) ** 2);
  });

  it('is gone once the dot edge reaches the strip end, where the clip stops', () => {
    expect(edgeStripAlpha({ strip, x: 750, radius: 7 })).toBe(0);
    expect(edgeStripAlpha({ strip, x: 800, radius: 7 })).toBe(0);
  });
});

/**
 * Easing curves (animation/easing.ts). `easeOutCubic` was previously also
 * defined in utils/math; it's consolidated here, so its tests live here too.
 */
import { describe, expect, it } from 'vitest';

import { easeLinear, easeOutCubic } from '../../animation/easing';

describe('easeLinear', () => {
  it('is the identity over [0, 1]', () => {
    expect(easeLinear(0)).toBe(0);
    expect(easeLinear(0.5)).toBe(0.5);
    expect(easeLinear(1)).toBe(1);
  });
});

describe('easeOutCubic', () => {
  it('returns 0 at t=0', () => expect(easeOutCubic(0)).toBe(0));
  it('returns 1 at t=1', () => expect(easeOutCubic(1)).toBe(1));

  it('is strictly monotonic over [0, 1]', () => {
    let prev = easeOutCubic(0);
    for (let i = 1; i <= 20; i++) {
      const cur = easeOutCubic(i / 20);
      expect(cur).toBeGreaterThan(prev);
      prev = cur;
    }
  });

  it('has ease-out shape (above linear for t in (0, 1))', () => {
    // Cubic ease-out decelerates — mid-curve it's ahead of linear.
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
  });
});

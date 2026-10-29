import { describe, expect, it } from 'vitest';

import { XScale } from '../x-scale';

function categoryScale(): XScale {
  const scale = new XScale();
  scale.setType('category');
  scale.setCategories(['a', 'b', 'c', 'd', 'e', 'f']);

  return scale;
}

describe('XScale.bandEnterProgress', () => {
  // Band 5 slides in from 1 and crosses band 3, which enters in place.
  const slideAt = (progress: number) => ({ from: new Map([[5, 1]]), entering: new Set([3]), progress });

  it('keeps an entering band hidden until the sliding band has passed it, then fades it in', () => {
    const scale = categoryScale();
    const presence = (progress: number) => {
      scale.setBandSlide(slideAt(progress));

      return scale.bandEnterProgress(3);
    };

    expect(presence(0)).toBe(0);
    expect(presence(0.5)).toBe(0);
    // At 3.8 the sliding band is 0.8 of a step away: past a bar's width (0.7), not yet a full step.
    expect(presence(0.7)).toBeCloseTo(1 / 3);
    expect(presence(0.8)).toBe(1);
  });

  it('shows every band in full outside a slide', () => {
    const scale = categoryScale();
    scale.setBandSlide(slideAt(0));
    scale.setBandSlide(null);

    expect(scale.bandEnterProgress(3)).toBe(1);
    expect(scale.bandEnterProgress(4)).toBe(1);
  });
});

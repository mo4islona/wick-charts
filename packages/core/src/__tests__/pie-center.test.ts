import { describe, expect, it } from 'vitest';

import { pieCenterBox, pieCenterText, pieCenterValueFontSize, pieTotal } from '../pie-center';
import { githubLight } from '../theme/themes/github-light';

const hole = { x: 200, y: 150, innerRadius: 80, outerRadius: 130 };
const slices = [
  { label: 'A', value: 30, percent: 30, color: '#111' },
  { label: 'B', value: 70, percent: 70, color: '#222' },
];

describe('pie center helpers', () => {
  it('the box is the square inside the hole, centered on it', () => {
    const box = pieCenterBox(hole, githubLight.theme);
    if (!box) throw new Error('no box');

    const size = 80 * Math.SQRT2;
    expect(box.size).toBeCloseTo(size, 6);
    expect(box.left).toBeCloseTo(200 - size / 2, 6);
    expect(box.top).toBeCloseTo(150 - size / 2, 6);
  });

  it('no box for a pie without a hole', () => {
    expect(pieCenterBox({ ...hole, innerRadius: 0 }, githubLight.theme)).toBeNull();
  });

  it('a long value gets a smaller font that fits the box width', () => {
    const box = pieCenterBox(hole, githubLight.theme);
    if (!box) throw new Error('no box');

    const short = pieCenterValueFontSize(box, '42');
    const long = pieCenterValueFontSize(box, '1,231,500,000');
    expect(short).toBe(box.valueFontSize);
    expect(long).toBeLessThan(short);
    expect(long * 0.62 * '1,231,500,000'.length).toBeLessThanOrEqual(box.size);
    expect(pieCenterValueFontSize(box, 'x'.repeat(500))).toBe(box.captionFontSize);
  });

  it('the text is the total with the label, or the hovered slice', () => {
    const format = (v: number) => `${v}`;

    expect(pieTotal(slices)).toBe(100);
    expect(pieCenterText({ slices, hovered: null, format, label: 'Total' })).toEqual({
      value: '100',
      caption: 'Total',
    });
    expect(pieCenterText({ slices, hovered: slices[1], format, label: 'Total' })).toEqual({
      value: '70',
      caption: 'B · 70.0%',
    });
  });

  it('a negative slice adds nothing to the total', () => {
    expect(pieTotal([...slices, { label: 'C', value: -50, percent: 0, color: '#333' }])).toBe(100);
  });
});

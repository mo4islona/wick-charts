import { describe, expect, it } from 'vitest';

import { logScale } from '../scales/log-scale';
import { YScale } from '../scales/y-scale';
import { ScaleStack } from '../series/scale-stack';

function makeLog(min: number, max: number): YScale {
  const s = new YScale();
  s.setTransform(logScale());
  s.update({ min, max }, 400, 1);

  return s;
}

/** Top edges of a stack, bottom to top. */
function edges(yScale: YScale, layers: { values: number[]; weights: number[] }): number[] {
  const stack = new ScaleStack(yScale);

  return layers.values.map((value, i) => stack.push(value, layers.weights[i]));
}

describe('ScaleStack', () => {
  it('adds settled layers exactly', () => {
    expect(edges(makeLog(1, 10_000), { values: [10, 90, 900], weights: [1, 1, 1] })).toEqual([10, 100, 1000]);
  });

  it('collapses a fading bottom layer to the plot floor at an even pixel speed', () => {
    const s = makeLog(1, 10_000);

    for (const weight of [0.25, 0.5, 0.75]) {
      const [top] = edges(s, { values: [1000], weights: [weight] });
      expect(s.valueToY(top)).toBeCloseTo(400 - 300 * weight, 9);
    }
  });

  it('grows a partial upper layer from the edge below at an even pixel speed', () => {
    const s = makeLog(1, 10_000);
    const [, top] = edges(s, { values: [10, 990], weights: [1, 0.5] });

    expect(s.valueToY(top)).toBeCloseTo((s.valueToY(10) + s.valueToY(1000)) / 2, 9);
  });

  it('a layer at weight 0 leaves the stack as if it were gone', () => {
    const s = makeLog(1, 10_000);
    const without = edges(s, { values: [10, 5], weights: [1, 1] });

    expect(edges(s, { values: [1000, 10, 5], weights: [0, 1, 1] }).slice(1)).toEqual(without);
    expect(edges(s, { values: [10, 1000, 5], weights: [1, 0, 1] })[2]).toBe(15);
  });

  it('keeps a thin layer thin while a thick one fades under it', () => {
    const s = makeLog(1, 10_000);
    const [bottom, top] = edges(s, { values: [1000, 10], weights: [0.5, 1] });

    // Settled, the band is 10 thick; mid-fade it may lose at most the floor's value.
    expect(top - bottom).toBeGreaterThan(9.4);
    expect(top - bottom).toBeLessThanOrEqual(10);
  });

  it('a zero value moves nothing', () => {
    const s = makeLog(1, 10_000);
    const [alone] = edges(s, { values: [1000], weights: [0.5] });

    expect(edges(s, { values: [1000, 0], weights: [0.5, 1] })[1]).toBe(alone);
  });
});

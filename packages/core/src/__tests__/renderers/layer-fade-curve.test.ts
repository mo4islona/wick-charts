import { afterEach, describe, expect, it, vi } from 'vitest';

import { YRangeHermite } from '../../animation/y-range-hermite';
import { LineRenderer } from '../../series/line';
import { buildRenderContext } from '../helpers/render-context';

const DURATION = 300;
const START = 1000;

describe('layer visibility fade', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A hidden layer's stack share shrinks with its alpha while Y eases to the
  // new range. On different curves the layers above drop below their target
  // and then grow back.
  it('follows the Y range curve over a toggle', () => {
    let now = START;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const renderer = new LineRenderer(2, { stacking: 'normal', entryAnimation: 'none' });
    const points = [10, 20, 30].map((value, i) => ({ time: i * 10 + 5, value }));
    renderer.setData(points, 0);
    renderer.setData(points, 1);
    const y = new YRangeHermite({ initial: { min: 0, max: 1 } });

    renderer.setLayerAlpha(0, 0, DURATION);
    y.retarget({ min: 0, max: 0 }, { now, expandMs: DURATION, contractMs: DURATION });

    for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      now = START + fraction * DURATION;
      const { ctx } = buildRenderContext({ timeRange: { from: 0, to: 30 }, yRange: { min: 0, max: 60 } });
      renderer.render(ctx);
      y.tick(now);

      expect(renderer.getLayerAlpha(0)).toBeCloseTo(y.current.max, 6);
    }
  });
});

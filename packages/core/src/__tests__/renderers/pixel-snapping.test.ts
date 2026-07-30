import { describe, expect, it } from 'vitest';

import { BarRenderer } from '../../series/bar';
import { LineRenderer } from '../../series/line';
import type { TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

/**
 * A viewport whose bar step lands off the pixel grid — 7 points across 800px
 * puts every vertex at a fractional device X, so snapping is observable.
 */
const OFF_GRID = {
  timeRange: { from: 0, to: 7 },
  yRange: { min: 0, max: 3 },
  mediaWidth: 800,
  mediaHeight: 300,
  dataInterval: 1,
} as const;

function seed(): TimePoint[] {
  return Array.from({ length: 7 }, (_, i) => ({ time: i, value: [0, 1.7, 0.4, 2.9, 1.1, 2.3, 0.8][i] }));
}

const isFractional = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n) && n !== Math.round(n);

describe('pixel snapping by primitive shape', () => {
  it('line vertices keep their exact position — snapping a diagonal stroke buys no sharpness', () => {
    const r = new LineRenderer(1, { area: { visible: false } });
    r.setData(seed(), 0);
    const { ctx, spy, timeScale, yScale } = buildRenderContext(OFF_GRID);
    r.render(ctx);

    const verts = [...spy.callsOf('moveTo'), ...spy.callsOf('lineTo')];
    expect(verts.length).toBeGreaterThan(0);
    expect(verts.some((c) => isFractional(c.args[0]) || isFractional(c.args[1]))).toBe(true);

    const data = seed();
    const drawn = spy.callsOf('lineTo').map((c) => c.args[0]);
    expect(drawn).toContainEqual(timeScale.timeToBitmapXExact(data[3].time));
    expect(spy.callsOf('lineTo').map((c) => c.args[1])).toContainEqual(yScale.valueToBitmapYExact(data[3].value));
  });

  it('bar bodies stay on the grid — their edges are axis-aligned and have to read crisp', () => {
    const r = new BarRenderer(1);
    r.setData(seed(), 0);
    const { ctx, spy } = buildRenderContext(OFF_GRID);
    r.render(ctx);

    const rects = spy.callsOf('fillRect');
    expect(rects.length).toBeGreaterThan(0);
    for (const rect of rects) {
      expect(isFractional(rect.args[0])).toBe(false);
      expect(isFractional(rect.args[2])).toBe(false);
    }
  });
});

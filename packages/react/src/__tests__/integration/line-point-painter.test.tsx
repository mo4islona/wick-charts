import { LineSeries, ringPoint } from '@wick-charts/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

const DATA = [
  { time: 1_000_000, value: 1 },
  { time: 1_060_000, value: 2 },
  { time: 1_120_000, value: 3 },
];

describe('LineSeries points.pointPainter', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('reaches the renderer, and a swap takes effect on the next frame', () => {
    const first = vi.fn();
    mounted = mountChart(<LineSeries data={DATA} options={{ points: { visible: true, pointPainter: first } }} />);
    mounted.flushScheduler();

    expect(first).toHaveBeenCalled();

    const strokesBefore = mounted.mainSpy.countOf('stroke');
    mounted.rerender(<LineSeries data={DATA} options={{ points: { visible: true, pointPainter: ringPoint() } }} />);
    mounted.flushScheduler();

    // The line stroke plus one outline per ring.
    expect(mounted.mainSpy.countOf('stroke') - strokesBefore).toBeGreaterThanOrEqual(DATA.length);
  });
});

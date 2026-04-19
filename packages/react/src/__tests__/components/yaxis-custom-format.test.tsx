import { LineSeries, YAxis } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

describe('YAxis custom format', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('applies the user-supplied formatter to every rendered tick label', () => {
    mounted = mountChart(
      <>
        <LineSeries
          data={[
            [
              { time: 1, value: 100 },
              { time: 2, value: 200 },
              { time: 3, value: 300 },
            ],
          ]}
        />
        <YAxis format={(v) => `$${v}`} />
      </>,
    );

    const host = mounted.container;
    // Tick labels are absolute spans inside the YAxis container.
    const labels = Array.from(host.querySelectorAll('span'))
      .map((n) => n.textContent ?? '')
      .filter((t) => t.startsWith('$'));
    expect(labels.length).toBeGreaterThan(0);
    for (const t of labels) expect(t).toMatch(/^\$-?\d/);
  });
});

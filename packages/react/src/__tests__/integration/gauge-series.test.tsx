import { GaugeSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

type Spy = ReturnType<typeof mountChart>['mainSpy'];

function textsOf(spy: Spy): string[] {
  return spy.callsOf('fillText').map((call) => String(call.args[0]));
}

describe('<GaugeSeries>', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('draws the track, the value arc, the caption and the range ends on a chart with no axes', () => {
    mounted = mountChart(
      <GaugeSeries value={72} options={{ label: 'CPU load', format: (value) => `${value}%`, color: '#ff8800' }} />,
    );
    mounted.flushScheduler();

    expect(mounted.chart.yAxisWidth).toBe(0);
    expect(textsOf(mounted.mainSpy)).toEqual(['72%', 'CPU load', '0%', '100%']);
    expect(mounted.mainSpy.callsOf('arc').some((call) => call.strokeStyle === '#ff8800')).toBe(true);
  });

  it('shows a new value and option from the props', () => {
    const tree = (value: number, style: 'arc' | 'needle') => <GaugeSeries value={value} options={{ style }} />;
    mounted = mountChart(tree(30, 'arc'));
    mounted.flushScheduler();
    expect(mounted.mainSpy.countOf('lineTo')).toBe(0);

    mounted.mainSpy.reset();
    mounted.rerender(tree(55, 'needle'));
    mounted.flushScheduler();

    expect(textsOf(mounted.mainSpy)).toContain('55');
    expect(mounted.mainSpy.countOf('lineTo')).toBe(1);
  });

  it('moves down under the top padding', () => {
    const centerY = (padding: { top: number; bottom: number }) => {
      const m = mountChart(<GaugeSeries value={50} options={{ trackColor: '#123456' }} />, { padding });
      m.flushScheduler();
      const track = m.mainSpy.callsOf('arc').find((call) => call.strokeStyle === '#123456');
      m.unmount();
      if (track === undefined) throw new Error('no track');

      return { cy: track.args[1] as number, radius: track.args[2] as number };
    };

    const free = centerY({ top: 0, bottom: 0 });
    const padded = centerY({ top: 120, bottom: 0 });

    expect(padded.cy).toBeGreaterThan(free.cy);
    expect(padded.cy - padded.radius).toBeGreaterThanOrEqual(120);
  });
});

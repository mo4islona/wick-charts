import { LineSeries, logScale } from '@wick-charts/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LineRenderer } from '../../../../core/src/series/line';
import type { CanvasRecorder } from '../../../../core/src/testing/recording-context';
import { mountChart } from '../helpers/mount-chart';

const T0 = 1_000_000;
const STEP = 60_000;

/** P&L that never dips to zero — only the baseline pulls 0 into the Y range. */
const PNL = Array.from({ length: 20 }, (_, i) => ({ time: T0 + i * STEP, value: 10 + (i % 5) * 2 }));

const UP = '#00ff00';
const DOWN = '#ff0000';

const LOG_AXIS = { y: { scale: logScale() } };

function lineRendererOf(chart: ReturnType<typeof mountChart>['chart'], id: string): LineRenderer {
  const listed = (chart as unknown as { listSeriesForTest: () => Array<{ id: string; renderer: LineRenderer }> })
    .listSeriesForTest()
    .find((entry) => entry.id === id);
  if (!listed) throw new Error(`no series ${id}`);

  return listed.renderer;
}

/** Rows the latest area fill closes along: the drop and the run back that end each polygon. */
function areaClosingRows(spy: CanvasRecorder): number[] {
  const calls = spy.calls;
  let fillIndex = -1;
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i].method === 'fill' && calls[i].fillStyle.startsWith('gradient(linear')) {
      fillIndex = i;
      break;
    }
  }

  let start = fillIndex;
  while (start > 0 && calls[start].method !== 'beginPath') {
    start--;
  }

  const rows: number[] = [];
  let subpath: number[] = [];
  for (const call of calls.slice(start + 1, fillIndex)) {
    if (call.method !== 'closePath') {
      subpath.push(call.args[call.args.length - 1] as number);
      continue;
    }

    rows.push(...subpath.slice(-2));
    subpath = [];
  }

  return rows;
}

describe('<LineSeries> area baseline', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('fills to the baseline in two colors and keeps the baseline in the Y range', () => {
    mounted = mountChart(
      <LineSeries
        data={PNL}
        options={{ area: { visible: true, baseline: 0 }, threshold: { value: 0, above: UP, below: DOWN } }}
      />,
      { width: 800, height: 400 },
    );

    expect(mounted.chart.getYRange().min).toBeLessThanOrEqual(0);

    const rows = areaClosingRows(mounted.mainSpy);
    expect(rows.length).toBeGreaterThan(0);
    const zeroRow = mounted.chart.yScale.valueToBitmapYExact(0);
    for (const row of rows) {
      expect(row).toBeCloseTo(zeroRow, 6);
    }

    const fill = mounted.mainSpy.callsOf('fill').find((c) => c.fillStyle.startsWith('gradient(linear'));
    expect(fill?.fillStyle).toContain('rgba(0, 255, 0,');
    expect(fill?.fillStyle).toContain('rgba(255, 0, 0,');
  });

  it('dropping the baseline closes the fill to the floor and fits the Y range to the data again', () => {
    const baselineOptions = { area: { visible: true, baseline: 0 } };
    mounted = mountChart(<LineSeries data={PNL} options={baselineOptions} />, { width: 800, height: 400 });

    mounted.mainSpy.reset();
    mounted.rerender(<LineSeries data={PNL} options={{ area: { visible: true } }} />);
    mounted.flushScheduler();

    expect(mounted.chart.getYRange().min).toBeGreaterThan(0);

    const floor = mounted.mainCanvas.height;
    const rows = areaClosingRows(mounted.mainSpy);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toBe(floor);
    }
  });

  it('on a log axis, moving the baseline re-fits Y to it', () => {
    // -10 has no place on log, so an unfiltered range reads the same for baseline 0 and 5.
    const signed = PNL.map((point, i) => (i === 0 ? { ...point, value: -10 } : point));
    const options = (baseline: number) => ({ area: { visible: true, baseline } });
    mounted = mountChart(<LineSeries data={signed} options={options(0)} />, {
      width: 800,
      height: 400,
      axis: LOG_AXIS,
    });

    expect(mounted.chart.getYRange().min).toBeGreaterThan(5);

    mounted.rerender(<LineSeries data={signed} options={options(5)} />);
    mounted.flushScheduler();

    expect(mounted.chart.getYRange().min).toBeLessThan(5);
  });

  it('an options update that leaves the Y fit alone scans no data', () => {
    mounted = mountChart(<LineSeries id="pnl" data={PNL} options={{ area: { visible: true, baseline: 0 } }} />, {
      width: 800,
      height: 400,
    });
    const scan = vi.spyOn(lineRendererOf(mounted.chart, 'pnl'), 'getValueRange');

    mounted.chart.updateSeriesOptions('pnl', { strokeWidth: 3, area: { visible: true, baseline: 0 } });
    expect(scan).not.toHaveBeenCalled();

    mounted.chart.updateSeriesOptions('pnl', { area: { visible: true, baseline: -5 } });
    expect(scan).toHaveBeenCalled();
  });
});

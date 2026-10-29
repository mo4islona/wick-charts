import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';
import type { ChartOptions } from '../chart/options';
import { DepthSeriesDef } from '../series/depth';
import type { DepthBook } from '../types';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const STEP = 60_000;
/** One second of 16 ms frames. */
const FRAMES_PER_UPDATE = 62;
/** The frames before the next update in which an idle loop requests nothing. */
const IDLE_TAIL = 10;
const SECONDS = 8;

type Update = (tick: number) => void;

function wave(i: number): number {
  return 100 + Math.sin(i * 0.7) * 10;
}

function book(tick: number): DepthBook {
  const mid = 100 + Math.sin(tick) * 0.5;

  return {
    bids: [
      [mid - 1, 1 + (tick % 3)],
      [mid - 3, 2],
      [mid - 6, 3],
    ],
    asks: [
      [mid + 1, 1],
      [mid + 2, 2 + (tick % 2)],
      [mid + 4, 4],
    ],
  };
}

describe('ChartInstance frame loop between live updates', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;
  let requests = 0;

  beforeEach(() => {
    raf = installRaf();
    const request = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => {
      requests++;

      return request(cb);
    };
    container = makeChartContainer();
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
  });

  /**
   * Feed one update per second of wall time. Per update: the frames requested
   * and how far the drawn X range moved, both just before the next update.
   */
  function streamOncePerSecond(update: Update): { lateRequests: number[]; lateShifts: number[] } {
    raf.flush(400);

    const lateRequests: number[] = [];
    const lateShifts: number[] = [];
    for (let tick = 0; tick < SECONDS; tick++) {
      update(tick);

      let late = 0;
      let tailStart = 0;
      for (let frame = 0; frame < FRAMES_PER_UPDATE; frame++) {
        if (frame === FRAMES_PER_UPDATE - IDLE_TAIL) tailStart = chart.getAnimationState().xRange.to;

        const before = requests;
        raf.step();
        if (frame >= FRAMES_PER_UPDATE - IDLE_TAIL) late += requests - before;
      }

      lateRequests.push(late);
      lateShifts.push(Math.abs(chart.getAnimationState().xRange.to - tailStart));
    }

    return { lateRequests, lateShifts };
  }

  function timeSeries(args: { type: 'line' | 'band' | 'candlestick' }): Update {
    const { type } = args;
    const point = (i: number) => {
      const v = wave(i);
      if (type === 'candlestick') return { time: i * STEP, open: v, high: v + 2, low: v - 2, close: v + 1 };
      if (type === 'band') return { time: i * STEP, low: v - 3, high: v + 3 };

      return { time: i * STEP, value: v };
    };

    chart = new ChartInstance(container, {});
    const add = {
      line: () => chart.addSeries('line', { pulse: false }),
      band: () => chart.addSeries('band'),
      candlestick: () => chart.addSeries('candlestick'),
    };
    const id = add[type]();
    chart.setSeriesData(
      id,
      Array.from({ length: 50 }, (_, i) => point(i)),
    );

    return (tick) => chart.appendData(id, point(50 + tick));
  }

  function depth(options: ChartOptions = {}): Update {
    chart = new ChartInstance(container, { axis: { x: { type: 'numeric' } }, ...options });
    const id = chart.addSeries(DepthSeriesDef);
    chart.setSeriesData(id, book(0));

    return (tick) => chart.setSeriesData(id, book(tick + 1));
  }

  for (const type of ['line', 'band', 'candlestick'] as const) {
    it(`a ${type} chart keeps sliding until its next 1 Hz update`, () => {
      const { lateShifts } = streamOncePerSecond(timeSeries({ type }));

      // The first ticks measure the cadence; from then on the view never rests between ticks.
      for (const shift of lateShifts.slice(2)) {
        expect(shift).toBeGreaterThan(0);
      }
    });
  }

  it('an order book stops requesting frames before its next 1 Hz update', () => {
    const { lateRequests } = streamOncePerSecond(depth());

    expect(lateRequests.slice(2)).toEqual(Array(SECONDS - 2).fill(0));
  });

  it('restarts the loop on the next update after idling', () => {
    const update = depth();
    streamOncePerSecond(update);

    const before = requests;
    update(SECONDS);
    raf.step();

    expect(requests).toBeGreaterThan(before);
  });

  it('restarts the loop on a zoom after idling', () => {
    streamOncePerSecond(depth());

    const before = requests;
    const { from, to } = chart.getVisibleRange();
    chart.zoomAt((from + to) / 2, 0.8, 800);
    raf.step();

    expect(requests).toBeGreaterThan(before);
  });
});

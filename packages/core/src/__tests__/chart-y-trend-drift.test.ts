/**
 * A trending series must stay inside the plot area while the axis follows it,
 * and the axis must not stall between ticks.
 *
 * Chasing position alone loses on both counts. The Y target is a staircase —
 * it reports where the data was at the last tick — so at the instant a new
 * extreme arrives the bound has, at best, settled on the *previous* one, and
 * the point lands a step below the floor. Shortening the expand only shortens
 * how long it stays there, and buys stillness between ticks instead: the two
 * complaints are the two ends of one slider.
 *
 * `YTrendDrift` measures the rate each bound is travelling and spends it
 * twice — aiming ahead by `rate × settle` so the curve targets where the
 * extreme is going, and handing the curve the rate as a terminal velocity so
 * it arrives still moving. Either half alone is not enough: velocity matching
 * on its own still left the point clipped on most frames.
 *
 * Prediction cannot cover a value nobody saw coming, so the rendered range is
 * also clamped to contain the visible extremes. The two are complements, not
 * alternatives: the clamp on its own turns the axis into a step function
 * (15-19 jumps over 22 ticks instead of 3), and the prediction on its own
 * still let a spike run 1770 px off a 370 px canvas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance, type ChartOptions } from '../chart';

const HEIGHT = 400;
const PLOT_H = HEIGHT - 30;

function installClock() {
  let nextId = 1;
  let now = 0;
  let queue: Array<{ id: number; cb: FrameRequestCallback }> = [];
  const origRaf = globalThis.requestAnimationFrame;
  const origCancel = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = nextId++;
    queue.push({ id, cb });

    return id;
  };
  globalThis.cancelAnimationFrame = (id: number) => {
    queue = queue.filter((f) => f.id !== id);
  };
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);

  return {
    get now() {
      return now;
    },
    frame: () => {
      now += 16;
      const pending = queue;
      queue = [];
      for (const f of pending) f.cb(now);
    },
    uninstall: () => {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.cancelAnimationFrame = origCancel;
      spy.mockRestore();
      queue = [];
    },
  };
}

function makeChart(extra: Partial<ChartOptions> = {}): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  const rect: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: HEIGHT,
    right: 800,
    width: 800,
    height: HEIGHT,
    toJSON: () => ({}),
  };
  container.getBoundingClientRect = () => rect;
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: HEIGHT, configurable: true });
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, { interactive: false, ...extra }), container };
}

interface Run {
  /** Fraction of frames the newest point rendered below the plot floor. */
  clipped: number;
  /** Fraction of frames the lower bound did not move at all. */
  frozen: number;
  /** Typical empty canvas between the newest point and the floor. */
  medianGapPx: number;
}

function runDecline(chart: ChartInstance, clock: ReturnType<typeof installClock>, cadence: number): Run {
  const id = chart.addSeries('line');
  const t0 = 1_000_000;
  const seed = 40;
  chart.setSeriesData(
    id,
    Array.from({ length: seed }, (_, i) => ({ time: t0 + i * cadence, value: 26 + ((i * 37) % 11) * 0.25 })),
  );

  let time = t0 + (seed - 1) * cadence;
  let value = 26;
  let nextAt = clock.now + cadence;
  let ticks = 0;
  const declineTicks = Math.max(12, Math.round(9000 / cadence));
  const rows: Array<{ at: number; min: number; span: number; below: number; gapPx: number }> = [];

  let guard = 0;
  while (ticks < declineTicks && guard++ < 1400) {
    if (clock.now >= nextAt) {
      nextAt += cadence;
      time += cadence;
      ticks++;
      // A fixed rate in units per second, so every cadence sees the same trend.
      value -= 1.2 * (cadence / 1000);
      chart.appendData(id, { time, value });
    }
    clock.frame();

    const { min, max } = chart.getYRange();
    const span = max - min;
    const pointPx = ((max - value) / span) * PLOT_H;
    rows.push({ at: clock.now, min, span, below: pointPx - PLOT_H, gapPx: PLOT_H - pointPx });
  }

  // Skip the warm-up: both the cadence EMA and the trend EMA need samples.
  const warm = 4 * cadence;
  const window = rows.filter((r) => r.at >= warm);
  let frozen = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].at < warm) continue;

    const px = Math.abs(((rows[i].min - rows[i - 1].min) / rows[i].span) * PLOT_H);
    if (px < 0.05) frozen++;
  }

  const gaps = window.map((r) => r.gapPx).sort((a, b) => a - b);

  return {
    clipped: window.filter((r) => r.below > 0).length / window.length,
    frozen: frozen / window.length,
    medianGapPx: gaps[Math.floor(gaps.length / 2)],
  };
}

/** value(tick) shapes prediction cannot see coming. */
const SURPRISES: Array<[string, (k: number) => number]> = [
  ['a flat series diving without warning', (k) => (k < 6 ? 26 : 26 - 1.2 * (k - 5))],
  ['a trend that steepens', (k) => 26 - 0.05 * k * k],
  ['a lone spike', (k) => (k === 10 ? 12 : 26)],
  ['a sawtooth', (k) => 26 - 4 * (k % 4)],
];

describe('the rendered Y range always contains the data', () => {
  let chart: ChartInstance;
  let container: HTMLElement;
  let clock: ReturnType<typeof installClock>;

  beforeEach(() => {
    clock = installClock();
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    clock.uninstall();
  });

  it.each(SURPRISES)('never crops %s', (_label, shape) => {
    const id = chart.addSeries('line');
    const t0 = 1_000_000;
    const cadence = 1000;
    const seed = 40;
    chart.setSeriesData(
      id,
      Array.from({ length: seed }, (_, i) => ({ time: t0 + i * cadence, value: 26 + ((i * 37) % 11) * 0.25 })),
    );

    let time = t0 + (seed - 1) * cadence;
    let value = 26;
    let nextAt = clock.now + cadence;
    let k = 0;
    let worstOffCanvas = 0;

    let guard = 0;
    while (k < 22 && guard++ < 1400) {
      if (clock.now >= nextAt) {
        nextAt += cadence;
        time += cadence;
        value = shape(k);
        k++;
        chart.appendData(id, { time, value });
      }
      clock.frame();

      const { min, max } = chart.getYRange();
      const px = ((max - value) / (max - min)) * PLOT_H;
      worstOffCanvas = Math.max(worstOffCanvas, px - PLOT_H, -px);
    }

    expect(worstOffCanvas).toBeLessThanOrEqual(0);
  });
});

describe('Y target leads a trending series', () => {
  let chart: ChartInstance;
  let container: HTMLElement;
  let clock: ReturnType<typeof installClock>;

  beforeEach(() => {
    clock = installClock();
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    clock.uninstall();
  });

  it.each([[1000], [500], [250], [100]])('holds the newest point on canvas at a %dms cadence', (cadence) => {
    const run = runDecline(chart, clock, cadence);

    expect(run.clipped).toBeLessThan(0.02);
    expect(run.frozen).toBeLessThan(0.15);
    // The aim-ahead is paid for in empty canvas under the line. Bounded, or
    // a trending chart reads as mostly margin.
    expect(run.medianGapPx).toBeLessThan(0.15 * PLOT_H);
  });
});

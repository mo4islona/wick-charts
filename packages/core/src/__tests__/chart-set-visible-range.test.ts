/**
 * ChartInstance.setVisibleRange — public imperative API for setting the
 * visible time range.
 *
 * Covers both forms: explicit `{ from, to }` and shorthand bar-count.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance, type ChartOptions } from '../chart';

const INTERVAL = 60_000;

// Deterministic RAF + clock so animator ticks advance under our control —
// the same stub pattern the streaming/zoom animation tests use. Gesture-mode
// tests need this to observe the X spring easing and the Y re-fit settling.
function installRaf(): {
  flush: (frames?: number) => void;
  advance: (ms: number) => void;
  uninstall: () => void;
} {
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
    flush: (frames = 20) => {
      for (let i = 0; i < frames; i++) {
        if (queue.length === 0) return;

        const pending = queue;
        queue = [];
        now += 16;
        for (const f of pending) {
          f.cb(now);
        }
      }
    },
    advance: (ms: number) => {
      now += ms;
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
    bottom: 400,
    right: 800,
    width: 800,
    height: 400,
    toJSON: () => ({}),
  };
  container.getBoundingClientRect = () => rect;
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, { interactive: false, ...extra }), container };
}

function seedCandles(chart: ChartInstance, count: number, startTime = 1_000_000): string {
  const id = chart.addSeries('candlestick');
  const data = Array.from({ length: count }, (_, i) => ({
    time: startTime + i * INTERVAL,
    open: 100,
    high: 105,
    low: 95,
    close: 101,
  }));
  chart.setSeriesData(id, data);

  return id;
}

function seedSpikeCandles(chart: ChartInstance, count: number, startTime = 1_000_000): string {
  const id = chart.addSeries('candlestick');
  const data = Array.from({ length: count }, (_, i) => ({
    time: startTime + i * INTERVAL,
    open: 100,
    // First ten bars spike high, so a window past them forces the Y axis to
    // contract — the slow path that exposes a re-armed (stalled) Y ease.
    high: i < 10 ? 300 : 105,
    low: 95,
    close: 101,
  }));
  chart.setSeriesData(id, data);

  return id;
}

describe('ChartInstance.setVisibleRange', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('explicit {from, to} — applies exactly what was passed', () => {
    seedCandles(chart, 50);
    const start = 1_000_000;

    chart.setVisibleRange({ from: start + 10 * INTERVAL, to: start + 30 * INTERVAL });

    const { from, to } = chart.getVisibleRange();
    expect(from).toBe(start + 10 * INTERVAL);
    expect(to).toBe(start + 30 * INTERVAL);
  });

  it('rejects invalid ranges (to <= from) silently', () => {
    seedCandles(chart, 50);
    const before = { ...chart.getVisibleRange() };

    chart.setVisibleRange({ from: 5000, to: 1000 });
    chart.setVisibleRange({ from: 5000, to: 5000 });

    expect(chart.getVisibleRange()).toEqual(before);
  });

  it('rejects non-finite bounds silently (NaN / Infinity)', () => {
    seedCandles(chart, 50);
    const before = { ...chart.getVisibleRange() };

    chart.setVisibleRange({ from: Number.NaN, to: 1000 });
    chart.setVisibleRange({ from: 0, to: Number.POSITIVE_INFINITY });
    chart.setVisibleRange({ from: Number.NEGATIVE_INFINITY, to: 0 });

    expect(chart.getVisibleRange()).toEqual(before);
  });

  it('rejects ranges spanning fewer than 2 bars without flipping auto-scroll', () => {
    seedCandles(chart, 50);
    const start = 1_000_000;

    // Pan to a range where the tail is off-screen so auto-scroll goes false.
    chart.setVisibleRange({ from: start + 5 * INTERVAL, to: start + 25 * INTERVAL });
    const before = { ...chart.getVisibleRange() };

    // Sub-2-bar range — should be a true no-op (range unchanged, auto-scroll
    // not silently flipped back on).
    chart.setVisibleRange({ from: 0, to: INTERVAL });

    expect(chart.getVisibleRange()).toEqual(before);
  });

  it('number form — shows the last N bars', () => {
    seedCandles(chart, 200);
    const lastTime = 1_000_000 + 199 * INTERVAL;

    chart.setVisibleRange(50);

    const { from, to } = chart.getVisibleRange();
    // Right edge pinned near the tail (fitToData adds right-padding).
    expect(to).toBeGreaterThanOrEqual(lastTime);
    // Visible span covers roughly 50 bars of data (padding slightly inflates).
    const visibleBars = (to - from) / INTERVAL;
    expect(visibleBars).toBeGreaterThanOrEqual(50);
    expect(visibleBars).toBeLessThanOrEqual(60);
  });

  it('number form — no-ops when there is no data yet', () => {
    const before = { ...chart.getVisibleRange() };

    chart.setVisibleRange(120);

    expect(chart.getVisibleRange()).toEqual(before);
  });

  it('number form — rejects invalid N (0, negative, NaN, Infinity, non-integer)', () => {
    seedCandles(chart, 200);
    const before = { ...chart.getVisibleRange() };

    const invalid = [0, 1, -10, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const n of invalid) {
      chart.setVisibleRange(n);
      expect(chart.getVisibleRange(), `N=${n} should be a no-op`).toEqual(before);
    }
  });

  it('number form — clamps when N exceeds available bars', () => {
    seedCandles(chart, 30);

    chart.setVisibleRange(500);

    const { from, to } = chart.getVisibleRange();
    const visibleBars = (to - from) / INTERVAL;
    // Can't show more than what exists — should cover the 30 bars (+padding).
    expect(visibleBars).toBeLessThan(40);
  });

  it('idempotent — re-setting the current range emits no viewportChange', () => {
    seedCandles(chart, 50);
    const start = 1_000_000;
    const range = { from: start + 10 * INTERVAL, to: start + 30 * INTERVAL };

    chart.setVisibleRange(range);

    // Now subscribe AFTER the initial set — we only want to observe whether
    // a redundant setVisibleRange re-emits.
    let emitCount = 0;
    const onChange = () => {
      emitCount += 1;
    };
    chart.on('viewportChange', onChange);

    chart.setVisibleRange({ ...range });
    chart.setVisibleRange({ from: range.from, to: range.to });

    chart.off('viewportChange', onChange);

    expect(emitCount).toBe(0);
    expect(chart.getVisibleRange()).toEqual(range);
  });

  it('idempotent — two mutually-syncing charts terminate without a guard', () => {
    // Regression: the multi-chart-sync demo previously needed a `last` ref
    // to break the feedback loop because setVisibleRange always emitted
    // viewportChange. With idempotency, the receiver's echo back to the
    // sender is a no-op (sender already has that exact range), so naive
    // bidirectional binding terminates on its own.
    const { chart: chartB, container: containerB } = makeChart();
    seedCandles(chart, 50);
    seedCandles(chartB, 50);
    const start = 1_000_000;

    let emitsA = 0;
    let emitsB = 0;
    const onA = () => {
      emitsA += 1;
      chartB.setVisibleRange(chart.getVisibleRange());
    };
    const onB = () => {
      emitsB += 1;
      chart.setVisibleRange(chartB.getVisibleRange());
    };

    chart.on('viewportChange', onA);
    chartB.on('viewportChange', onB);

    chart.setVisibleRange({ from: start + 10 * INTERVAL, to: start + 30 * INTERVAL });

    chart.off('viewportChange', onA);
    chartB.off('viewportChange', onB);
    chartB.destroy();
    containerB.remove();

    // A fires once for the initial user set, B fires once for the receiver
    // applying it. The echoes (B → A → B → ...) are killed by idempotency.
    expect(emitsA).toBe(1);
    expect(emitsB).toBe(1);
    expect(chart.getVisibleRange()).toEqual(chartB.getVisibleRange());
  });
});

describe('ChartInstance.setVisibleRange — gesture mode (multi-chart sync)', () => {
  let raf: ReturnType<typeof installRaf>;

  beforeEach(() => {
    raf = installRaf();
  });

  afterEach(() => {
    raf.uninstall();
  });

  it('eases X into the new window where the default form snaps it', () => {
    // The default (programmatic) form snaps X — consumers read
    // getVisibleRange() synchronously after and expect the new target. Gesture
    // mode eases X on the spring like a real pan/zoom, so a synced pane glides
    // in lockstep with the gesture that drives it instead of jumping ahead.
    const prog = makeChart();
    const gesture = makeChart();
    seedCandles(prog.chart, 200);
    seedCandles(gesture.chart, 200);
    raf.flush(40); // settle both initial fits — now post-init, so X eases

    const start = 1_000_000;
    const window = { from: start + 60 * INTERVAL, to: start + 80 * INTERVAL };
    const oldVisualTo = gesture.chart.getAnimationState().xRange.to;

    prog.chart.setVisibleRange(window);
    gesture.chart.setVisibleRange(window, { gesture: true });

    // Logical target is identical and synchronously readable in both forms.
    expect(prog.chart.getVisibleRange()).toEqual(window);
    expect(gesture.chart.getVisibleRange()).toEqual(window);

    // Visual X right after the call: programmatic is already at the target
    // (snapped); gesture is still back at the old edge (spring just armed).
    expect(prog.chart.getAnimationState().xRange.to).toBeCloseTo(window.to, -2);

    const gestureVisualTo = gesture.chart.getAnimationState().xRange.to;
    expect(gestureVisualTo).toBeCloseTo(oldVisualTo, -2);
    expect(Math.abs(gestureVisualTo - oldVisualTo)).toBeLessThan(Math.abs(gestureVisualTo - window.to));

    // Both converge on the logical target once the spring settles.
    raf.flush(60);
    expect(gesture.chart.getAnimationState().xRange.to).toBeCloseTo(window.to, -2);

    prog.chart.destroy();
    gesture.chart.destroy();
    prog.container.remove();
    gesture.container.remove();
  });

  it('re-setting the current range emits no viewportChange', () => {
    const { chart, container } = makeChart();
    seedCandles(chart, 50);
    raf.flush(40);
    const start = 1_000_000;
    const window = { from: start + 10 * INTERVAL, to: start + 30 * INTERVAL };

    chart.setVisibleRange(window, { gesture: true });

    let emits = 0;
    const onChange = () => {
      emits += 1;
    };
    chart.on('viewportChange', onChange);

    chart.setVisibleRange({ ...window }, { gesture: true });
    chart.setVisibleRange(window, { gesture: true });

    chart.off('viewportChange', onChange);

    expect(emits).toBe(0);
    expect(chart.getVisibleRange()).toEqual(window);

    chart.destroy();
    container.remove();
  });

  it('a per-frame echo of the same range does not stall the Y re-fit', () => {
    // Regression: the source pane re-emits viewportChange on every animation
    // frame, so the sync handler calls setVisibleRange with an unchanged
    // logical X each frame. Without the no-op guard, each call re-armed the Y
    // curve — resetting its segment clock — and the re-fit never converged.
    // X is pinned to snap here so the assertion isolates the Y ease.
    const cfg: Partial<ChartOptions> = { animations: { axis: { x: false } } };
    const reference = makeChart(cfg);
    const subject = makeChart(cfg);
    seedSpikeCandles(reference.chart, 200);
    seedSpikeCandles(subject.chart, 200);
    raf.flush(60);

    const start = 1_000_000;
    // Pin both to the full span first so Y covers the left-edge spike — that
    // way the upcoming zoom is a genuine contraction, not a no-op.
    const full = { from: start, to: start + 199 * INTERVAL };
    reference.chart.setVisibleRange(full);
    subject.chart.setVisibleRange(full);
    raf.flush(60);
    const preMax = reference.chart.getYRange().max;

    // Window past the spike: zooming in forces the Y axis to contract.
    const window = { from: start + 60 * INTERVAL, to: start + 80 * INTERVAL };

    // Reference: ease once and settle fully — this is where Y should land.
    reference.chart.setVisibleRange(window, { gesture: true });
    raf.flush(60);
    const settledMax = reference.chart.getYRange().max;

    // Subject: arm the same gesture, then echo the identical range on every
    // frame, exactly as the sync handler does while the source animates.
    subject.chart.setVisibleRange(window, { gesture: true });
    for (let i = 0; i < 10; i++) {
      raf.flush(1);
      subject.chart.setVisibleRange(window, { gesture: true });
    }

    // 10 frames (~160 ms) is well past the 100 ms gesture budget, so with the
    // guard the contraction has converged on the reference fit. A re-armed
    // (buggy) curve would still sit near the pre-zoom spike, ~3x higher.
    const subjectMax = subject.chart.getYRange().max;
    expect(preMax).toBeGreaterThan(settledMax + 100); // sanity: real contraction
    expect(subjectMax).toBeCloseTo(settledMax, -1);

    reference.chart.destroy();
    subject.chart.destroy();
    reference.container.remove();
    subject.container.remove();
  });
});

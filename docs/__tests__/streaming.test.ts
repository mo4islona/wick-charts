import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LineStream, OHLCStream, barStrategy, lineDriftStrategy, ohlcStrategy } from '../data';

const INTERVAL = 5_000;

describe('OHLCStream continuity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Start exactly at a boundary so virtualNow aligns cleanly.
    vi.setSystemTime(new Date(5_000_000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits contiguous boundary bars at 1× speed', () => {
    const historyLast = { time: 5_000_000 - INTERVAL, open: 100, high: 101, low: 99, close: 100, volume: 0 };
    const stream = new OHLCStream({
      last: historyLast,
      startIndex: 299,
      interval: INTERVAL,
      strategy: ohlcStrategy(100),
      speed: () => 1,
    });
    const emitted: number[] = [];
    stream.onTick((c) => emitted.push(c.time));
    stream.start(500);

    // 60 seconds of real time → 12 new bars at interval=5s.
    vi.advanceTimersByTime(60_000);
    stream.stop();

    const boundaries = uniqueSorted(emitted);
    expectContiguous(boundaries, historyLast.time + INTERVAL, INTERVAL);
    expect(boundaries.length).toBeGreaterThanOrEqual(10);
  });

  it('emits contiguous bars at 10× speed with no gap after history', () => {
    const historyLast = { time: 5_000_000 - INTERVAL, open: 100, high: 101, low: 99, close: 100, volume: 0 };
    const stream = new OHLCStream({
      last: historyLast,
      startIndex: 299,
      interval: INTERVAL,
      strategy: ohlcStrategy(100),
      speed: () => 10,
    });
    const emitted: number[] = [];
    stream.onTick((c) => emitted.push(c.time));
    stream.start(500);

    // 20 real seconds at 10× = 200s of virtual time → 40 new bars.
    vi.advanceTimersByTime(20_000);
    stream.stop();

    const boundaries = uniqueSorted(emitted);
    // The very first emitted time must be the slot directly after history —
    // otherwise there's a gap between historical tail and streamed bars.
    expect(boundaries[0]).toBe(historyLast.time + INTERVAL);
    expectContiguous(boundaries, historyLast.time + INTERVAL, INTERVAL);
    expect(boundaries.length).toBeGreaterThanOrEqual(35);
  });

  it('catches up after a long pause without dropping bars', () => {
    const historyLast = { time: 5_000_000 - INTERVAL, open: 100, high: 101, low: 99, close: 100, volume: 0 };
    const stream = new OHLCStream({
      last: historyLast,
      startIndex: 299,
      interval: INTERVAL,
      strategy: ohlcStrategy(100),
      speed: () => 1,
    });
    const emitted: number[] = [];
    stream.onTick((c) => emitted.push(c.time));
    stream.start(500);

    // Simulate the tab being backgrounded: advance wall time by 30s in one step.
    vi.advanceTimersByTime(30_000);
    stream.stop();

    const boundaries = uniqueSorted(emitted);
    expect(boundaries[0]).toBe(historyLast.time + INTERVAL);
    expectContiguous(boundaries, historyLast.time + INTERVAL, INTERVAL);
  });
});

describe('LineStream continuity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(5_000_000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('bar-kind stream emits contiguous samples at high speed', () => {
    const historyLast = { time: 5_000_000 - INTERVAL, value: 42 };
    const stream = new LineStream({
      last: historyLast,
      startIndex: 299,
      interval: INTERVAL,
      strategy: barStrategy(100),
      speed: () => 10,
    });
    const emitted: number[] = [];
    stream.onTick((p) => emitted.push(p.time));
    stream.start(500);

    vi.advanceTimersByTime(20_000);
    stream.stop();

    const boundaries = uniqueSorted(emitted);
    expect(boundaries[0]).toBe(historyLast.time + INTERVAL);
    expectContiguous(boundaries, historyLast.time + INTERVAL, INTERVAL);
  });

  it('line-kind drift stream advances through each interval', () => {
    const historyLast = { time: 5_000_000 - INTERVAL, value: 100 };
    const stream = new LineStream({
      last: historyLast,
      startIndex: 299,
      interval: INTERVAL,
      strategy: lineDriftStrategy(100),
      speed: () => 4,
    });
    const emitted: number[] = [];
    stream.onTick((p) => emitted.push(p.time));
    stream.start(500);

    vi.advanceTimersByTime(15_000); // 60s virtual at 4× → 12 bars
    stream.stop();

    const boundaries = uniqueSorted(emitted);
    expect(boundaries[0]).toBe(historyLast.time + INTERVAL);
    expectContiguous(boundaries, historyLast.time + INTERVAL, INTERVAL);
    expect(boundaries.length).toBeGreaterThanOrEqual(10);
  });
});

describe('OHLCStream resume semantics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(5_000_000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not freeze when resumed with last.time ahead of wall clock', () => {
    // Simulates a StrictMode remount after the stream had been running at
    // speed > 1: the virtual tail is well past `Date.now()` when a fresh
    // instance is constructed. The new stream must keep advancing on its
    // first tick instead of stalling until wall clock catches up.
    const AHEAD = 5_000_000 + 10 * INTERVAL;
    const last = { time: AHEAD, open: 100, high: 101, low: 99, close: 100, volume: 0 };
    const stream = new OHLCStream({
      last,
      startIndex: 310,
      interval: INTERVAL,
      strategy: ohlcStrategy(100),
      speed: () => 5,
    });
    const emitted: number[] = [];
    stream.onTick((c) => emitted.push(c.time));
    stream.start(500);

    // Two real seconds at 5× → 10 s virtual; plenty for a boundary cross.
    vi.advanceTimersByTime(2_000);
    stream.stop();

    // The first NEW boundary (i.e. the first time strictly after the tail)
    // must be last.time + interval. Without the virtualNow fix, no such
    // boundary would be emitted within this window — the stream would stall.
    const newBoundaries = uniqueSorted(emitted.filter((t) => t > AHEAD));
    expect(newBoundaries[0]).toBe(AHEAD + INTERVAL);
    expectContiguous(newBoundaries, AHEAD + INTERVAL, INTERVAL);
  });

  it('feeds the strategy a continuing index after a resumed startIndex', () => {
    // Phase continuity check: supply a custom strategy that records the
    // `index` it was invoked with. When a stream resumes with startIndex=500,
    // the first new boundary must come through with index=501, not 300 (the
    // historical tail) — otherwise the sampler's sine trend restarts and the
    // chart shows a seam.
    const seenIndices: number[] = [];
    const recordingStrategy = {
      boundary: ({ index, time, prev }: { index: number; time: number; prev: { close: number } | null }) => {
        seenIndices.push(index);
        return { time, open: 100, high: 101, low: 99, close: prev?.close ?? 100, volume: 0 };
      },
    };
    const last = { time: 5_000_000 + 5 * INTERVAL, open: 100, high: 101, low: 99, close: 100, volume: 0 };
    const stream = new OHLCStream({
      last,
      startIndex: 500,
      interval: INTERVAL,
      strategy: recordingStrategy,
      speed: () => 5,
    });
    stream.onTick(() => {});
    stream.start(500);

    vi.advanceTimersByTime(3_000);
    stream.stop();

    expect(seenIndices.length).toBeGreaterThan(0);
    expect(seenIndices[0]).toBe(501);
    for (let i = 1; i < seenIndices.length; i++) {
      expect(seenIndices[i]).toBe(seenIndices[i - 1] + 1);
    }
  });
});

// ── helpers ────────────────────────────────────────────────

function uniqueSorted(times: number[]): number[] {
  return [...new Set(times)].sort((a, b) => a - b);
}

function expectContiguous(times: number[], firstExpected: number, step: number) {
  if (times.length === 0) return;
  expect(times[0]).toBe(firstExpected);
  for (let i = 1; i < times.length; i++) {
    expect(times[i] - times[i - 1]).toBe(step);
  }
}

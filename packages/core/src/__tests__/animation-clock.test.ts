/**
 * Regression suite for the unified animation pipeline.
 *
 * Covers the contracts that previous reviews flagged as easy to break by
 * accident — single RAF per frame, mutual exclusion of main vs overlay paths,
 * frame-id guards against double-advance, and synchronous-tick semantics
 * (`runSynchronous` forces `dt = 0` for snap behavior). These tests pin the
 * AnimationClock primitive directly, without going through ChartInstance.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnimationClock } from '../animation-clock';

describe('AnimationClock', () => {
  let rafHandle = 1;
  let pending: Array<{ id: number; cb: FrameRequestCallback }> = [];
  let mockedNow = 0;

  function flushOne(): void {
    const next = pending.shift();
    if (!next) return;

    next.cb(mockedNow);
  }

  function flushAll(): void {
    let guard = 0;
    while (pending.length > 0 && guard < 50) {
      flushOne();
      guard++;
    }
  }

  let originalRaf: typeof requestAnimationFrame | undefined;
  let originalCancel: typeof cancelAnimationFrame | undefined;

  beforeEach(() => {
    rafHandle = 1;
    pending = [];
    mockedNow = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => mockedNow);
    originalRaf = globalThis.requestAnimationFrame;
    originalCancel = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
      const id = rafHandle++;
      pending.push({ id, cb });

      return id;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number): void => {
      pending = pending.filter((p) => p.id !== id);
    }) as typeof cancelAnimationFrame;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalRaf) globalThis.requestAnimationFrame = originalRaf;
    if (originalCancel) globalThis.cancelAnimationFrame = originalCancel;
  });

  it('coalesces multiple requestFrame calls into a single RAF', () => {
    const onMain = vi.fn();
    const onOverlay = vi.fn();
    const clock = new AnimationClock({ onMain, onOverlay });

    clock.requestFrame('main');
    clock.requestFrame('main');
    clock.requestFrame('overlay');

    expect(pending.length).toBe(1);
    flushAll();
    // Mutual exclusion: main was requested → main runs, standalone overlay
    // does NOT (chart.renderMain calls renderOverlay synchronously at the end).
    expect(onMain).toHaveBeenCalledTimes(1);
    expect(onOverlay).toHaveBeenCalledTimes(0);
  });

  it('overlay-only frame fires onOverlay, not onMain', () => {
    const onMain = vi.fn();
    const onOverlay = vi.fn();
    const clock = new AnimationClock({ onMain, onOverlay });

    clock.requestFrame('overlay');
    flushAll();

    expect(onMain).toHaveBeenCalledTimes(0);
    expect(onOverlay).toHaveBeenCalledTimes(1);
  });

  it('frameId is monotonic across ticks', () => {
    const seen: number[] = [];
    const clock = new AnimationClock({
      onMain: () => seen.push(clock.frameId),
      onOverlay: () => seen.push(clock.frameId),
    });

    clock.requestFrame('main');
    flushAll();
    mockedNow += 16;
    clock.requestFrame('main');
    flushAll();
    mockedNow += 16;
    clock.requestFrame('overlay');
    flushAll();

    expect(seen).toEqual([1, 2, 3]);
  });

  it('all listeners observe the same `now` and `dt` within one tick', () => {
    const captures: Array<{ phase: string; now: number; dt: number; frameId: number }> = [];
    const clock = new AnimationClock({
      onMain: () => captures.push({ phase: 'main', now: clock.now, dt: clock.dt, frameId: clock.frameId }),
      onOverlay: () => captures.push({ phase: 'overlay', now: clock.now, dt: clock.dt, frameId: clock.frameId }),
    });
    clock.onTick(({ now, dt, frameId }) => captures.push({ phase: 'tick', now, dt, frameId }));

    clock.requestFrame('main');
    flushAll();

    // main and tick listener fire in the same RAF, so all readings of `now`/
    // `dt`/`frameId` must be identical.
    expect(captures.length).toBe(2);
    const [a, b] = captures;
    expect(a.now).toBe(b.now);
    expect(a.dt).toBe(b.dt);
    expect(a.frameId).toBe(b.frameId);
  });

  it('first frame has dt = 0', () => {
    let captured = -1;
    const clock = new AnimationClock({
      onMain: () => {
        captured = clock.dt;
      },
      onOverlay: () => {},
    });

    clock.requestFrame('main');
    flushAll();

    expect(captured).toBe(0);
  });

  it('subsequent frames compute dt from elapsed wall-clock', () => {
    const seen: number[] = [];
    const clock = new AnimationClock({
      onMain: () => seen.push(clock.dt),
      onOverlay: () => {},
    });

    clock.requestFrame('main');
    flushAll();
    mockedNow += 16; // ~60Hz frame
    clock.requestFrame('main');
    flushAll();
    mockedNow += 32; // ~30Hz frame
    clock.requestFrame('main');
    flushAll();

    expect(seen[0]).toBe(0);
    expect(seen[1]).toBeCloseTo(0.016, 3);
    expect(seen[2]).toBeCloseTo(0.032, 3);
  });

  it('clamps dt to MAX_FRAME_DT_S after a tab-inactive pause', () => {
    let observed = 0;
    const clock = new AnimationClock({
      onMain: () => {
        observed = clock.dt;
      },
      onOverlay: () => {},
    });

    clock.requestFrame('main');
    flushAll(); // first frame: dt=0
    mockedNow += 60_000; // simulate 60s tab pause
    clock.requestFrame('main');
    flushAll();

    expect(observed).toBeLessThanOrEqual(0.05);
    expect(observed).toBeGreaterThan(0);
  });

  it('runSynchronous fires with dt = 0 and bumps frameId', () => {
    const clock = new AnimationClock({ onMain: () => {}, onOverlay: () => {} });
    let observedDt = -1;
    let observedFrameId = -1;

    clock.runSynchronous(() => {
      observedDt = clock.dt;
      observedFrameId = clock.frameId;
    });

    expect(observedDt).toBe(0);
    expect(observedFrameId).toBe(1);
  });

  it('onTick listeners can be unsubscribed', () => {
    const cb = vi.fn();
    const clock = new AnimationClock({ onMain: () => {}, onOverlay: () => {} });

    const unsub = clock.onTick(cb);

    clock.requestFrame('main');
    flushAll();
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
    mockedNow += 16;
    clock.requestFrame('main');
    flushAll();
    expect(cb).toHaveBeenCalledTimes(1); // no second call after unsubscribe
  });

  it('destroy cancels any pending RAF', () => {
    const onMain = vi.fn();
    const clock = new AnimationClock({ onMain, onOverlay: () => {} });

    clock.requestFrame('main');
    expect(pending.length).toBe(1);

    clock.destroy();
    expect(pending.length).toBe(0);

    flushAll();
    expect(onMain).not.toHaveBeenCalled();
  });
});

/**
 * Manual `requestAnimationFrame` + zero-delay `setTimeout` driver for tests.
 *
 * Happy-dom runs RAF callbacks asynchronously on its own clock, which makes
 * assertions racy — you never know if the render scheduler has fired by the
 * time a test checks the spy. `installRaf()` replaces RAF with a queue that
 * only drains when `flushRaf()` is called, so tests can drive the scheduler
 * one frame at a time.
 *
 * We also intercept `setTimeout(fn, 0)` because `<ChartContainer>` defers
 * `ChartInstance.destroy()` via `setTimeout(..., 0)` to tolerate
 * strict-mode remount cycles. Without this, `unmount()` returns before
 * destroy runs and cleanup tests assert against a half-torn-down chart.
 * Non-zero timeouts pass through to the real `setTimeout`.
 */

interface RafHandle {
  flush(steps?: number): void;
  flushAll(): void;
  pending(): number;
  /** Run all captured zero-delay setTimeout callbacks synchronously. */
  drainZeroTimeouts(): void;
  uninstall(): void;
}

interface RafFrame {
  id: number;
  cb: FrameRequestCallback;
}

let active: RafHandle | null = null;

export function installRaf(startTime = 0): RafHandle {
  if (active) return active;

  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const originalWindowRaf = typeof window !== 'undefined' ? window.requestAnimationFrame : undefined;
  const originalWindowCancel = typeof window !== 'undefined' ? window.cancelAnimationFrame : undefined;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  let queue: RafFrame[] = [];
  let nextId = 1;
  let now = startTime;

  const raf = (cb: FrameRequestCallback): number => {
    const id = nextId++;
    queue.push({ id, cb });
    return id;
  };
  const cancel = (id: number): void => {
    queue = queue.filter((f) => f.id !== id);
  };

  // Capture only zero-delay timeouts — longer delays keep real-time semantics.
  const zeroTimers = new Map<number, () => void>();
  let timerId = 1_000_000;
  const fakeSetTimeout: typeof setTimeout = ((fn: TimerHandler, delay?: number, ...args: unknown[]): number => {
    if (delay === 0 || delay === undefined) {
      const id = timerId++;
      const boundFn =
        typeof fn === 'function'
          ? () => (fn as (...a: unknown[]) => void)(...args)
          : () => {
              // eslint-disable-next-line no-new-func
              new Function(String(fn))();
            };
      zeroTimers.set(id, boundFn);
      return id as unknown as number;
    }
    return originalSetTimeout(fn as () => void, delay, ...args) as unknown as number;
  }) as unknown as typeof setTimeout;
  const fakeClearTimeout = ((id: number | undefined): void => {
    if (id !== undefined && zeroTimers.has(id)) {
      zeroTimers.delete(id);
      return;
    }
    originalClearTimeout(id);
  }) as typeof clearTimeout;

  globalThis.requestAnimationFrame = raf;
  globalThis.cancelAnimationFrame = cancel;
  globalThis.setTimeout = fakeSetTimeout;
  globalThis.clearTimeout = fakeClearTimeout;
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame = raf;
    window.cancelAnimationFrame = cancel;
    window.setTimeout = fakeSetTimeout;
    window.clearTimeout = fakeClearTimeout;
  }

  const flush = (steps = 1): void => {
    for (let i = 0; i < steps; i++) {
      if (queue.length === 0) return;
      // Snapshot — callbacks that schedule more frames run on the next flush,
      // mirroring real browser behavior.
      const pending = queue;
      queue = [];
      now += 16;
      for (const frame of pending) frame.cb(now);
    }
  };

  const handle: RafHandle = {
    flush,
    flushAll() {
      let guard = 0;
      while (queue.length > 0 && guard < 100) {
        flush(1);
        guard++;
      }
    },
    pending() {
      return queue.length;
    },
    drainZeroTimeouts() {
      // New timers scheduled from inside drained callbacks run on the next
      // drain — matching real event-loop semantics (no deep reentry).
      const pending = Array.from(zeroTimers.entries());
      zeroTimers.clear();
      for (const [, fn] of pending) fn();
    },
    uninstall() {
      globalThis.requestAnimationFrame = originalRaf;
      globalThis.cancelAnimationFrame = originalCancel;
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
      if (typeof window !== 'undefined' && originalWindowRaf && originalWindowCancel) {
        window.requestAnimationFrame = originalWindowRaf;
        window.cancelAnimationFrame = originalWindowCancel;
        window.setTimeout = originalSetTimeout;
        window.clearTimeout = originalClearTimeout;
      }
      queue = [];
      zeroTimers.clear();
      active = null;
    },
  };
  active = handle;
  return handle;
}

export function flushRaf(steps = 1): void {
  if (!active) throw new Error('flushRaf() called before installRaf()');
  active.flush(steps);
}

export function flushAllRaf(): void {
  if (!active) throw new Error('flushAllRaf() called before installRaf()');
  active.flushAll();
}

export function drainZeroTimeouts(): void {
  if (!active) throw new Error('drainZeroTimeouts() called before installRaf()');
  active.drainZeroTimeouts();
}

export function pendingRaf(): number {
  return active?.pending() ?? 0;
}

export function uninstallRaf(): void {
  active?.uninstall();
}

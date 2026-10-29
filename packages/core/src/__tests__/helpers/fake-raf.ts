import { vi } from 'vitest';

export interface FakeRaf {
  /** Run up to `frames` queued frames, advancing the clock 16ms each. Stops early once the queue drains. */
  flush: (frames?: number) => void;
  /** Run one 16ms frame, advancing the clock even when nothing is queued. Returns the number of callbacks run. */
  step: () => number;
  uninstall: () => void;
}

/**
 * Deterministic `requestAnimationFrame` + `performance.now` for animation
 * tests: frames only advance when `flush` or `step` is called, so a test can step a
 * tween one frame at a time and read what that frame painted.
 */
export function installRaf(): FakeRaf {
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
  // Like a browser, a frame skips a callback cancelled by an earlier callback of the same frame.
  const cancelled = new Set<number>();
  globalThis.cancelAnimationFrame = (id: number) => {
    queue = queue.filter((f) => f.id !== id);
    cancelled.add(id);
  };

  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);

  const runFrame = (): number => {
    const pending = queue;
    queue = [];
    cancelled.clear();
    now += 16;

    let ran = 0;
    for (const f of pending) {
      if (cancelled.has(f.id)) continue;

      f.cb(now);
      ran++;
    }

    return ran;
  };

  return {
    flush: (frames = 50) => {
      for (let i = 0; i < frames; i++) {
        if (queue.length === 0) return;

        runFrame();
      }
    },
    step: runFrame,
    uninstall: () => {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.cancelAnimationFrame = origCancel;
      spy.mockRestore();
      queue = [];
    },
  };
}

/** A detached 800×400 container that reports a real `getBoundingClientRect`, as `ChartInstance` requires. */
export function makeChartContainer(width = 800, height = 400): HTMLElement {
  const container = document.createElement('div');
  const rect: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: height,
    right: width,
    width,
    height,
    toJSON: () => ({}),
  };
  container.getBoundingClientRect = () => rect;
  Object.defineProperty(container, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(container);

  return container;
}

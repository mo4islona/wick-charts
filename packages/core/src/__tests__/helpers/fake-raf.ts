import { vi } from 'vitest';

export interface FakeRaf {
  /** Run up to `frames` queued frames, advancing the clock 16ms each. Stops early once the queue drains. */
  flush: (frames?: number) => void;
  uninstall: () => void;
}

/**
 * Deterministic `requestAnimationFrame` + `performance.now` for animation
 * tests: frames only advance when `flush` is called, so a test can step a
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
  globalThis.cancelAnimationFrame = (id: number) => {
    queue = queue.filter((f) => f.id !== id);
  };

  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);

  return {
    flush: (frames = 50) => {
      for (let i = 0; i < frames; i++) {
        if (queue.length === 0) return;

        const pending = queue;
        queue = [];
        now += 16;
        for (const f of pending) f.cb(now);
      }
    },
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

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RenderScheduler } from '../render-scheduler';

function installRaf(): { flush: () => void; pending: () => number; uninstall: () => void } {
  let nextId = 1;
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

  return {
    flush: () => {
      const pending = queue;
      queue = [];
      for (const f of pending) {
        f.cb(16);
      }
    },
    pending: () => queue.length,
    uninstall: () => {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.cancelAnimationFrame = origCancel;
      queue = [];
    },
  };
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
}

describe('RenderScheduler', () => {
  let raf: ReturnType<typeof installRaf>;

  beforeEach(() => {
    raf = installRaf();
    setHidden(false);
  });

  afterEach(() => {
    setHidden(false);
    raf.uninstall();
  });

  it('coalesces markDirty calls into one frame', () => {
    const cb = vi.fn();
    const s = new RenderScheduler(cb);

    s.markDirty();
    s.markDirty();
    s.markDirty();
    expect(raf.pending()).toBe(1);

    raf.flush();
    expect(cb).toHaveBeenCalledTimes(1);

    s.destroy();
  });

  it('consume() drops the pending frame; the next markDirty re-arms', () => {
    const cb = vi.fn();
    const s = new RenderScheduler(cb);

    s.markDirty();
    s.consume();
    raf.flush();
    expect(cb).not.toHaveBeenCalled();

    s.markDirty();
    raf.flush();
    expect(cb).toHaveBeenCalledTimes(1);

    s.destroy();
  });

  it('does not arm a frame while the document is hidden; fires once on the visible flip', () => {
    const cb = vi.fn();
    const s = new RenderScheduler(cb);

    setHidden(true);
    s.markDirty();
    s.markDirty();
    expect(raf.pending()).toBe(0); // no RAF spin in a hidden tab

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(raf.pending()).toBe(1);

    raf.flush();
    expect(cb).toHaveBeenCalledTimes(1);

    s.destroy();
  });

  it('destroy() unhooks the visibility listener', () => {
    const cb = vi.fn();
    const s = new RenderScheduler(cb);

    setHidden(true);
    s.markDirty();
    s.destroy();

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(raf.pending()).toBe(0);
    expect(cb).not.toHaveBeenCalled();
  });
});

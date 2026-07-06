/**
 * @wick-charts/react/testing — jsdom/happy-dom test harness for consumers'
 * own test suites.
 *
 * happy-dom/jsdom ship a no-op `HTMLCanvasElement.getContext('2d')` and no
 * `ResizeObserver` at all, so mounting `<ChartContainer>` in a plain Vitest/
 * Jest + Testing Library setup throws or silently renders nothing.
 * `installCanvasMock()` installs the same working canvas/ResizeObserver/
 * matchMedia stubs this repo's own test suite runs on, as a reusable,
 * uninstall-able function instead of a global `setupFiles` side effect.
 */

import { type CanvasRecorder, createRecordingContext } from '@wick-charts/core';

export type { CanvasRecorder, RecordedCall } from '@wick-charts/core';

type ResizeObserverCb = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;

class MockResizeObserver implements ResizeObserver {
  static readonly callbacks = new Set<ResizeObserverCb>();
  readonly #cb: ResizeObserverCb;

  constructor(cb: ResizeObserverCb) {
    this.#cb = cb;
    MockResizeObserver.callbacks.add(cb);
  }
  observe(): void {
    MockResizeObserver.callbacks.add(this.#cb);
  }
  unobserve(): void {
    // Per-spec unobserve removes one target, not the whole subscription —
    // keep the callback registered until disconnect().
  }
  disconnect(): void {
    MockResizeObserver.callbacks.delete(this.#cb);
  }
}

declare global {
  interface HTMLCanvasElement {
    /** Attached by `installCanvasMock()`. Undefined in production builds. */
    __spy?: CanvasRecorder;
  }
}

export interface CanvasMockHandle {
  /**
   * Fire every currently-observed `ResizeObserver` callback with the given
   * content-box size. Chart components observe their container to pick up
   * layout changes — call this after resizing a test container so the chart
   * re-measures.
   */
  triggerResize(width: number, height: number): void;
  /** Restore every patched global to its pre-install value. */
  uninstall(): void;
}

/**
 * Install a working canvas 2D context (records every draw call, inspectable
 * via `canvas.__spy`), a `ResizeObserver` stub, and a `prefers-reduced-motion:
 * reduce` `matchMedia` response (so entrance animations settle immediately —
 * deterministic first-paint assertions instead of a mid-animation snapshot).
 *
 * Call once per test (typically in `beforeEach`) and `uninstall()` the
 * returned handle afterward (`afterEach`) so tests don't leak patched globals
 * into each other.
 */
export function installCanvasMock(): CanvasMockHandle {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalMatchMedia = globalThis.matchMedia;
  const hadDevicePixelRatio = 'devicePixelRatio' in globalThis;
  const originalDevicePixelRatio = hadDevicePixelRatio ? window.devicePixelRatio : undefined;

  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

  const contexts = new WeakMap<HTMLCanvasElement, { ctx: CanvasRenderingContext2D; spy: CanvasRecorder }>();
  HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    kind: string,
    ...rest: unknown[]
  ): RenderingContext | null {
    if (kind !== '2d') {
      return (originalGetContext as (kind: string, ...rest: unknown[]) => RenderingContext | null).call(
        this,
        kind,
        ...rest,
      );
    }
    let entry = contexts.get(this);
    if (!entry) {
      entry = createRecordingContext();
      contexts.set(this, entry);
      Object.defineProperty(this, '__spy', { value: entry.spy, configurable: true, enumerable: false });
    }
    return entry.ctx;
  } as typeof HTMLCanvasElement.prototype.getContext;

  const nativeMatchMedia = typeof originalMatchMedia === 'function' ? originalMatchMedia.bind(globalThis) : null;
  const mediaQueryStub = (query: string, matches: boolean): MediaQueryList =>
    ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;

  globalThis.matchMedia = ((query: string): MediaQueryList => {
    if (query.includes('prefers-reduced-motion')) return mediaQueryStub(query, true);

    return nativeMatchMedia ? nativeMatchMedia(query) : mediaQueryStub(query, false);
  }) as typeof globalThis.matchMedia;

  if (!hadDevicePixelRatio) {
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, writable: true, configurable: true });
  }

  return {
    triggerResize(width, height) {
      const entry = {
        contentRect: { x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) },
        borderBoxSize: [{ inlineSize: width, blockSize: height }],
        contentBoxSize: [{ inlineSize: width, blockSize: height }],
        devicePixelContentBoxSize: [{ inlineSize: width, blockSize: height }],
      } as unknown as ResizeObserverEntry;
      const observer: ResizeObserver = { observe() {}, unobserve() {}, disconnect() {} };
      for (const cb of Array.from(MockResizeObserver.callbacks)) cb([entry], observer);
    },
    uninstall() {
      // The callback registry is class-static and outlives the install cycle
      // — a chart left mounted at test end would keep its resize callback
      // registered forever, and the next test's `triggerResize` would fire
      // it against a destroyed chart.
      MockResizeObserver.callbacks.clear();
      globalThis.ResizeObserver = originalResizeObserver;
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      globalThis.matchMedia = originalMatchMedia;
      if (!hadDevicePixelRatio) {
        delete (window as unknown as { devicePixelRatio?: number }).devicePixelRatio;
      } else {
        Object.defineProperty(window, 'devicePixelRatio', {
          value: originalDevicePixelRatio,
          writable: true,
          configurable: true,
        });
      }
    },
  };
}

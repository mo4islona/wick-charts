// Test harness for React components. Runs before each happy-dom test file.
//
// Two jobs:
//   1. Install a recording 2D context as the canvas backend (happy-dom ships
//      a no-op implementation) so tests can assert on draw calls via `canvas.__spy`.
//   2. Stub `ResizeObserver` with a version whose callbacks are inspectable,
//      so resize-driven regressions can be replayed from tests.

import { type CanvasRecorder, createRecordingContext } from '../core/src/__tests__/helpers/recording-context';
// Deep import on purpose — pulling the `@wick-charts/core` barrel here would
// pre-load (and cache) the whole core module graph before a test file's
// `vi.mock` of a core-internal module (e.g. navigator/decimate) can take
// effect. register-builtins only touches the series modules.
import { registerBuiltinSeries } from '../core/src/series/register-builtins';

// Tests use the string form `chart.addSeries('line', ...)` throughout; since
// the renderer-injection refactor that form resolves through the series
// registry, populate it once for every test file.
registerBuiltinSeries();

// Deterministic first paints: the initial-load intro (`IntroWave`) checks
// `prefers-reduced-motion` at arm time and stays settled when it matches.
// Report "reduce" for every test file so the thousands of existing
// assertions on settled first-frame geometry remain valid. Intro-specific
// tests override `globalThis.matchMedia` locally to exercise the wave.
const nativeMatchMedia = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia.bind(globalThis) : null;

function mediaQueryStub(query: string, matches: boolean): MediaQueryList {
  return {
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

globalThis.matchMedia = ((query: string): MediaQueryList => {
  if (query.includes('prefers-reduced-motion')) return mediaQueryStub(query, true);

  return nativeMatchMedia ? nativeMatchMedia(query) : mediaQueryStub(query, false);
}) as typeof globalThis.matchMedia;

type ResizeObserverCb = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;

class MockResizeObserver implements ResizeObserver {
  /**
   * Registry of callbacks for currently-active observers. Tests inspect this
   * directly to count live observations, and `triggerResize` fans out across
   * it. Production `ResizeObserver.disconnect()` stops all observations —
   * mirror that by removing the instance's callback here.
   */
  static readonly callbacks = new Set<ResizeObserverCb>();
  readonly #cb: ResizeObserverCb;

  constructor(cb: ResizeObserverCb) {
    this.#cb = cb;
    MockResizeObserver.callbacks.add(cb);
  }
  observe(): void {
    // Real ResizeObservers fire once per observed target on the next frame.
    // Tests drive resize explicitly via `triggerResize`, so nothing to do here —
    // but keep the callback in the registry across repeated observe() calls.
    MockResizeObserver.callbacks.add(this.#cb);
  }
  unobserve(): void {
    // Per-spec unobserve removes one target — NOT the whole subscription.
    // If you observe the same target again it would re-fire. We keep the
    // callback in the registry until explicit disconnect().
  }
  disconnect(): void {
    MockResizeObserver.callbacks.delete(this.#cb);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __mockResizeObserver: typeof MockResizeObserver;
  interface HTMLCanvasElement {
    /** Attached by `test-setup.ts`. Undefined in production builds. */
    __spy?: CanvasRecorder;
  }
}

if (typeof window !== 'undefined' && typeof HTMLCanvasElement !== 'undefined') {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    MockResizeObserver as unknown as typeof ResizeObserver;
  globalThis.__mockResizeObserver = MockResizeObserver;

  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const contexts = new WeakMap<HTMLCanvasElement, { ctx: CanvasRenderingContext2D; spy: CanvasRecorder }>();

  HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    kind: string,
    ...rest: unknown[]
  ): RenderingContext | null {
    if (kind !== '2d') {
      // Forward every argument — tests or dependencies requesting webgl /
      // bitmaprenderer / webgl2 get the real (possibly null) context from
      // happy-dom instead of silently receiving our 2d recorder.
      return (originalGetContext as (kind: string, ...rest: unknown[]) => RenderingContext | null).call(
        this,
        kind,
        ...rest,
      );
    }
    // 2d context options (alpha / willReadFrequently / colorSpace) are
    // accepted but ignored — the recording ctx is config-agnostic.
    let entry = contexts.get(this);
    if (!entry) {
      entry = createRecordingContext();
      contexts.set(this, entry);
      Object.defineProperty(this, '__spy', { value: entry.spy, configurable: true, enumerable: false });
    }
    return entry.ctx;
  } as typeof HTMLCanvasElement.prototype.getContext;

  if (!('devicePixelRatio' in window)) {
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, writable: true, configurable: true });
  }
}

export { MockResizeObserver };

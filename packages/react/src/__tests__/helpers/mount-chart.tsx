import { type ReactElement, type ReactNode, useEffect } from 'react';

import { type RenderResult, act, render } from '@testing-library/react';
import type { ChartInstance } from '@wick-charts/core';
import { ChartContainer, useChartInstance } from '@wick-charts/react';

import type { CanvasRecorder } from '../../../../core/src/__tests__/helpers/recording-context';
import type { ChartContainerProps } from '../../ChartContainer';
import { drainZeroTimeouts, flushAllRaf, installRaf, uninstallRaf } from './raf';

type ResizeCb = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;

interface MockResizeObserverCtor {
  readonly callbacks: Set<ResizeCb>;
  new (cb: ResizeCb): ResizeObserver;
}

export interface MountChartOptions extends Omit<ChartContainerProps, 'children'> {
  /** Container size in CSS pixels. Defaults to 800x400. */
  width?: number;
  height?: number;
  /** Device pixel ratio override. */
  dpr?: number;
}

export interface MountedChart {
  container: HTMLElement;
  /** ChartInstance captured from context. `null` until the first effect commit. */
  chart: ChartInstance;
  mainCanvas: HTMLCanvasElement;
  overlayCanvas: HTMLCanvasElement;
  mainSpy: CanvasRecorder;
  overlaySpy: CanvasRecorder;
  rerender(children: ReactNode, next?: Partial<MountChartOptions>): void;
  unmount(): void;
  /** Drain all pending RAF callbacks, wrapped in React's act() so state updates commit. */
  flushScheduler(): void;
  /** Fire every registered ResizeObserver callback with the supplied size. */
  triggerResize(width?: number, height?: number): void;
  dispatchWheel(init: WheelEventInit, target?: EventTarget): void;
  dispatchMouse(
    type: 'mousedown' | 'mousemove' | 'mouseup' | 'mouseleave',
    init: MouseEventInit,
    target?: EventTarget,
  ): void;
  dispatchTouch(type: 'touchstart' | 'touchmove' | 'touchend', touches: TouchPoint[], target?: EventTarget): void;
}

/**
 * Subset of the native Touch shape the production handler reads
 * (`packages/core/src/interactions/handler.ts`).
 */
export interface TouchPoint {
  clientX: number;
  clientY: number;
  /** Optional overrides — defaults fill in if omitted. */
  identifier?: number;
  pageX?: number;
  pageY?: number;
  screenX?: number;
  screenY?: number;
}

function mockBoundingRect(el: HTMLElement, width: number, height: number): void {
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
  el.getBoundingClientRect = () => rect;
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
}

/**
 * Browser-spec `offsetX/Y` are relative to the event target's bounding rect:
 *   offsetX = clientX - target.getBoundingClientRect().left
 * jsdom/happy-dom leave them `undefined` when only `clientX/Y` are passed to
 * the MouseEvent/WheelEvent constructor, so production code that reads
 * `e.offsetX` (ZoomHandler, InteractionHandler) breaks without help.
 *
 * Only patch when the init didn't already supply `offsetX/Y` — that lets
 * tests pass raw offsets explicitly when they need to bypass the target's
 * position (e.g. when mocking a canvas at an unusual origin).
 */
function patchOffsetFromClient(
  event: Event,
  target: HTMLElement,
  init: { clientX?: number; clientY?: number; offsetX?: number; offsetY?: number },
): void {
  const rect = target.getBoundingClientRect();
  if (init.offsetX === undefined && init.clientX !== undefined) {
    Object.defineProperty(event, 'offsetX', { value: init.clientX - rect.left, configurable: true });
  }
  if (init.offsetY === undefined && init.clientY !== undefined) {
    Object.defineProperty(event, 'offsetY', { value: init.clientY - rect.top, configurable: true });
  }
}

function captureSpy(canvas: HTMLCanvasElement | undefined | null): CanvasRecorder {
  if (!canvas) throw new Error('mountChart: canvas not found in DOM');
  // `getContext('2d')` lazily installs the spy on first access; call it here
  // to ensure __spy is attached before the test reads it.
  canvas.getContext('2d');
  const spy = canvas.__spy;
  if (!spy) throw new Error('mountChart: canvas.__spy missing — is test-setup.ts loaded?');
  return spy;
}

/**
 * Mount a `<ChartContainer>` with a known size and everything wired up for
 * assertions: RAF under manual control, ResizeObserver callbacks inspectable,
 * both canvases' recorders exposed.
 *
 * Call `flushScheduler()` after any action that schedules a render before
 * asserting on spies.
 */
export function mountChart(children: ReactNode, opts: MountChartOptions = {}): MountedChart {
  const { width = 800, height = 400, dpr = 1, ...containerProps } = opts;

  // Always pin devicePixelRatio so tests can't accidentally inherit state
  // from a previous test that set a different DPR.
  Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true, writable: true });

  installRaf();

  let chartInstance: ChartInstance | null = null;
  const Probe = () => {
    const chart = useChartInstance();
    useEffect(() => {
      chartInstance = chart;
    }, [chart]);
    return null;
  };

  // Set up everything that mutates global/DOM state first, then wrap the
  // throw-prone steps (render, RAF flush, post-mount guards) in a
  // rollback-on-failure block. Without this, a failure during setup leaves
  // the HTMLDivElement.prototype patch live and corrupts subsequent tests
  // in the same file.
  const host = document.createElement('div');
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  mockBoundingRect(host, width, height);
  document.body.appendChild(host);

  const origRect = HTMLDivElement.prototype.getBoundingClientRect;
  // Intercept getBoundingClientRect on every descendant div so the inner
  // chart container (flex: 1, minWidth: 0) also reports size. Read the
  // current host size each call — triggerResize updates `host.clientWidth`
  // and we want descendants to report the live size, not the value baked
  // in at mount time.
  HTMLDivElement.prototype.getBoundingClientRect = function patched() {
    const r = origRect.call(this);
    if (r.width > 0 && r.height > 0) return r;
    if (this === host || host.contains(this)) {
      const w = host.clientWidth || width;
      const h = host.clientHeight || height;
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: h,
        right: w,
        width: w,
        height: h,
        toJSON: () => ({}),
      };
    }
    return r;
  };

  const rollback = () => {
    HTMLDivElement.prototype.getBoundingClientRect = origRect;
    host.remove();
    uninstallRaf();
  };

  let rtl: RenderResult;
  let mainCanvas: HTMLCanvasElement;
  let overlayCanvas: HTMLCanvasElement;
  let mainSpy: CanvasRecorder;
  let overlaySpy: CanvasRecorder;
  try {
    const tree: ReactElement = (
      <ChartContainer {...containerProps}>
        <Probe />
        {children}
      </ChartContainer>
    );

    act(() => {
      rtl = render(tree, { container: host });
    });
    // Drain the first-paint scheduler pass so canvas spies see initial draws.
    act(() => flushAllRaf());

    if (!chartInstance) throw new Error('mountChart: ChartInstance never attached — ChartContainer failed to mount');

    const canvases = host.querySelectorAll('canvas');
    if (canvases.length < 2) {
      throw new Error(`mountChart: expected 2 canvases (main+overlay), got ${canvases.length}`);
    }
    mainCanvas = canvases[0] as HTMLCanvasElement;
    overlayCanvas = canvases[1] as HTMLCanvasElement;
    mainSpy = captureSpy(mainCanvas);
    overlaySpy = captureSpy(overlayCanvas);
  } catch (err) {
    rollback();
    throw err;
  }

  const api: MountedChart = {
    container: host,
    chart: chartInstance,
    mainCanvas,
    overlayCanvas,
    mainSpy,
    overlaySpy,
    rerender(nextChildren, nextOpts) {
      const merged = { ...containerProps, ...(nextOpts ?? {}) };
      // Split into two acts: the first flushes commit + layout effects (which
      // may call chart.batch → scheduler.markDirty), the second drains the
      // RAF queue those effects produced. Combining them into one act leaves
      // the queued frame unflushed until the next scheduler tick.
      act(() => {
        rtl.rerender(
          <ChartContainer {...merged}>
            <Probe />
            {nextChildren}
          </ChartContainer>,
        );
      });
      act(() => flushAllRaf());
    },
    unmount() {
      act(() => {
        rtl.unmount();
        flushAllRaf();
      });
      // <ChartContainer> defers `ChartInstance.destroy()` via setTimeout(0)
      // to tolerate strict-mode remount cycles; run those deferred callbacks
      // now so cleanup assertions see the fully-destroyed chart.
      act(() => {
        drainZeroTimeouts();
        flushAllRaf();
      });
      rollback();
    },
    flushScheduler() {
      act(() => flushAllRaf());
    },
    triggerResize(w = width, h = height) {
      const ctor = (globalThis as unknown as { __mockResizeObserver: MockResizeObserverCtor }).__mockResizeObserver;
      const callbacks = Array.from(ctor.callbacks);
      // CanvasManager observes the inner chart container (parent of both
      // canvases), not the outer RTL host. Mirror that so `entry.target`
      // and its dimensions match what production code reads.
      const observedEl = mainCanvas.parentElement ?? host;
      mockBoundingRect(host, w, h);
      if (observedEl !== host) mockBoundingRect(observedEl, w, h);
      const dpr = window.devicePixelRatio || 1;
      const entry = {
        target: observedEl,
        contentRect: { x: 0, y: 0, top: 0, left: 0, bottom: h, right: w, width: w, height: h, toJSON: () => ({}) },
        borderBoxSize: [{ inlineSize: w, blockSize: h }],
        contentBoxSize: [{ inlineSize: w, blockSize: h }],
        devicePixelContentBoxSize: [{ inlineSize: w * dpr, blockSize: h * dpr }],
      } as unknown as ResizeObserverEntry;
      // Pass an observer-shaped object so any callback that reads the
      // `observer` parameter (e.g. to call `.disconnect()`) doesn't crash.
      const observer: ResizeObserver = {
        observe() {},
        unobserve() {},
        disconnect() {},
      };
      act(() => {
        for (const cb of callbacks) cb([entry], observer);
        flushAllRaf();
      });
    },
    dispatchWheel(init, target) {
      const el = (target ?? mainCanvas) as HTMLElement;
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
      // `ZoomHandler.handleWheel` reads `e.offsetX` — which jsdom/happy-dom
      // leave undefined when only `clientX` is passed. In real browsers
      // `offsetX = clientX - target.getBoundingClientRect().left`; mirror
      // that so tests whose target isn't at (0, 0) still get correct
      // in-chart coordinates.
      patchOffsetFromClient(event, el, init);
      act(() => {
        el.dispatchEvent(event);
        flushAllRaf();
      });
    },
    dispatchMouse(type, init, target) {
      const el = (target ?? mainCanvas) as HTMLElement;
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
      // Same offset gap — `InteractionHandler.onMouseMove` calls
      // `emitCrosshair(e.offsetX, e.offsetY)`.
      patchOffsetFromClient(event, el, init);
      act(() => {
        el.dispatchEvent(event);
        flushAllRaf();
      });
    },
    dispatchTouch(type, touches, target) {
      const el = (target ?? mainCanvas) as HTMLElement;
      // The production handler reads `e.touches.length`, `e.touches[i].clientX`,
      // `e.touches[i].clientY`. Native TouchEvent in happy-dom often returns
      // empty touches arrays even when passed an init — work around it by
      // constructing a plain Event and attaching duck-typed touch lists so
      // the handler sees the right shape.
      const list = touches.map((p, i) => ({
        identifier: p.identifier ?? i,
        target: el,
        clientX: p.clientX,
        clientY: p.clientY,
        pageX: p.pageX ?? p.clientX,
        pageY: p.pageY ?? p.clientY,
        screenX: p.screenX ?? p.clientX,
        screenY: p.screenY ?? p.clientY,
        radiusX: 1,
        radiusY: 1,
        rotationAngle: 0,
        force: 1,
      }));
      const evt = new Event(type, { bubbles: true, cancelable: true });
      // `touches` = fingers currently on the surface; `targetTouches` = subset
      // whose target is this element; `changedTouches` = fingers that changed
      // in this event. For our purposes list === touches === targetTouches,
      // and `changedTouches` differs only on `touchend` (the lifted finger).
      Object.defineProperty(evt, 'touches', { value: list, configurable: true });
      Object.defineProperty(evt, 'targetTouches', { value: list, configurable: true });
      Object.defineProperty(evt, 'changedTouches', { value: list, configurable: true });
      act(() => {
        el.dispatchEvent(evt);
        flushAllRaf();
      });
    },
  };

  return api;
}

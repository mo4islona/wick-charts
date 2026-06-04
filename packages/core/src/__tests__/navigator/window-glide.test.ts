// @vitest-environment happy-dom
/**
 * Navigator window glide (#9): the brush window follows the engine's *eased*
 * visual X, not the committed *logical* target. On a wheel-zoom / pan it should
 * glide with the canvas instead of snapping to the destination while the chart
 * eases there. (During a brush-drag it stays on the logical path — covered by
 * the drag test in controller.test.ts.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../../chart';
import { NavigatorController } from '../../navigator/controller';
import type { NavigatorData } from '../../navigator/types';

const INTERVAL = 60_000;

function installRaf(): { flush: (frames?: number) => void; uninstall: () => void } {
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
    flush: (frames = 40) => {
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
    uninstall: () => {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.cancelAnimationFrame = origCancel;
      spy.mockRestore();
      queue = [];
    },
  };
}

function seedRect(el: HTMLElement, width: number, height: number): void {
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

function setup(): {
  chart: ChartInstance;
  chartContainer: HTMLElement;
  nav: NavigatorController;
  navContainer: HTMLElement;
} {
  const chartContainer = document.createElement('div');
  seedRect(chartContainer, 800, 400);
  document.body.appendChild(chartContainer);

  const chart = new ChartInstance(chartContainer, { interactive: false });
  const id = chart.addSeries('candlestick');
  const candles = Array.from({ length: 100 }, (_, i) => ({
    time: 1_000_000 + i * INTERVAL,
    open: 100,
    high: 105,
    low: 95,
    close: 101,
  }));
  chart.setSeriesData(id, candles);

  const navContainer = document.createElement('div');
  seedRect(navContainer, 800, 60);
  document.body.appendChild(navContainer);
  const navData: NavigatorData = {
    type: 'line',
    points: Array.from({ length: 100 }, (_, i) => ({ time: 1_000_000 + i * INTERVAL, value: 100 + i })),
  };
  const nav = new NavigatorController({ container: navContainer, chart, data: navData });

  return { chart, chartContainer, nav, navContainer };
}

// Brush window <div> width in px. Overlay append order is fixed in the
// controller: maskLeft, maskRight, window, handleLeft, handleRight — so the
// window body is the third child. The canvas is a <canvas>, so the first <div>
// descendant is the overlay wrapper.
function windowWidth(navContainer: HTMLElement): number {
  const overlay = navContainer.querySelector('div');
  if (overlay === null) throw new Error('navigator overlay missing');

  const windowEl = overlay.children[2] as HTMLElement;

  return Number.parseFloat(windowEl.style.width) || 0;
}

describe('navigator window glide (#9)', () => {
  let raf: ReturnType<typeof installRaf>;
  let env: ReturnType<typeof setup>;

  beforeEach(() => {
    raf = installRaf();
    env = setup();
  });

  afterEach(() => {
    env.nav.destroy();
    env.chart.destroy();
    env.chartContainer.remove();
    env.navContainer.remove();
    raf.uninstall();
  });

  it('eases the window with the canvas on a gesture zoom instead of snapping to the target', () => {
    const { chart, navContainer } = env;
    const start = 1_000_000;
    const end = start + 99 * INTERVAL;

    // Full view, settled — window spans (almost) the whole strip.
    chart.setVisibleRange({ from: start, to: end });
    raf.flush(80);
    const wFull = windowWidth(navContainer);
    expect(wFull).toBeGreaterThan(0);

    // Gesture zoom-in: logical jumps to the narrow window, the X spring eases
    // there over ~150ms.
    chart.zoomAt(start + 50 * INTERVAL, 0.3);

    // One frame in: the brush should still be near the wide (eased) width — not
    // the narrow logical target it would snap to without the fix.
    raf.flush(1);
    const wMid = windowWidth(navContainer);

    // Let the spring settle — the window converges on the narrow logical window.
    raf.flush(80);
    const wSettled = windowWidth(navContainer);

    // The zoom genuinely narrowed the window…
    expect(wSettled).toBeLessThan(wFull * 0.6);
    // …yet one frame after the gesture the window is still gliding near full
    // width, proving it tracks the eased visual rather than the snapped target.
    expect(wMid).toBeGreaterThan(wSettled * 1.5);
  });
});

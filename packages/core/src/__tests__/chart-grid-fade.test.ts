// @vitest-environment happy-dom
/**
 * Gridline layer fade.
 *
 * The per-tick cross-fade (see `chart-tick-tracker-arming`) stays snapped
 * through the mount phase, so the opening reveal is a separate layer-wide
 * ramp multiplied into every tick's own opacity: `0 → 1` on first paint,
 * `1 → 0` when `setGrid` hides the grid. This suite pins the ramp's shape,
 * the scheduler wake that carries it to completion, and the `false` opt-out.
 *
 * The global test setup reports `prefers-reduced-motion: reduce`, which
 * collapses the ramp to a snap — these tests swap in a motion-allowing
 * `matchMedia` and restore the global stub afterwards.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import type { ChartOptions } from '../chart/options';
import { catppuccin } from '../theme/themes/catppuccin';

const INTERVAL = 60_000;
const reducedMotionStub = globalThis.matchMedia;

function allowMotion(): void {
  globalThis.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof globalThis.matchMedia;
}

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

interface Harness {
  chart: ChartInstance;
  container: HTMLElement;
  /** Alphas of every gridline stroke recorded since the last `reset`. */
  gridAlphas: () => number[];
  reset: () => void;
}

function makeChart(options?: ChartOptions): Harness {
  const container = document.createElement('div');
  const rect: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 400,
    right: 800,
    width: 800,
    height: 400,
    toJSON: () => ({}),
  };
  container.getBoundingClientRect = () => rect;
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(container);

  const chart = new ChartInstance(container, { interactive: false, ...options });
  const canvas = container.querySelector('canvas');
  const spy = canvas?.__spy;
  if (!spy) throw new Error('recording canvas not installed');

  const gridColor = catppuccin.theme.grid.color;

  return {
    chart,
    container,
    gridAlphas: () =>
      spy
        .callsOf('stroke')
        .filter((c) => c.strokeStyle === gridColor)
        .map((c) => c.globalAlpha),
    reset: () => spy.reset(),
  };
}

/**
 * Peak gridline alpha per frame, one frame at a time, stopping as soon as a
 * frame paints no gridlines at all.
 */
function sampleFrames(h: Harness, raf: ReturnType<typeof installRaf>, frames: number): number[] {
  const samples: number[] = [];
  for (let i = 0; i < frames; i++) {
    h.reset();
    raf.flush(1);
    const alphas = h.gridAlphas();
    if (alphas.length === 0) break;

    samples.push(Math.max(...alphas));
  }

  return samples;
}

function seedLine(chart: ChartInstance, values: number[]): string {
  const id = chart.addSeries('line');
  chart.setSeriesData(
    id,
    values.map((value, i) => ({ time: 1_000_000 + i * INTERVAL, value })),
  );

  return id;
}

describe('gridline layer fade', () => {
  let h: Harness;
  let raf: ReturnType<typeof installRaf>;

  beforeEach(() => {
    allowMotion();
    raf = installRaf();
  });

  afterEach(() => {
    h?.chart.destroy();
    h?.container.remove();
    raf.uninstall();
    globalThis.matchMedia = reducedMotionStub;
  });

  it('reveals the grid over the resolved duration instead of painting it opaque', () => {
    h = makeChart();
    seedLine(h.chart, [50, 55, 60, 65, 70]);

    // Two frames in: the layer ramp has started but cannot be done — the
    // default reveal spans several frames.
    raf.flush(2);
    const early = h.gridAlphas();
    for (const alpha of early) {
      expect(alpha).toBeLessThan(1);
    }

    // The ramp keeps requesting frames on its own until it lands at 1.
    raf.flush(60);
    h.reset();
    h.chart.setGrid({ visible: true });
    raf.flush(2);

    const settled = h.gridAlphas();
    expect(settled.length).toBeGreaterThan(0);
    for (const alpha of settled) {
      expect(alpha).toBe(1);
    }
  });

  it('carries the reveal to full opacity without any other animation driving frames', () => {
    // The engine stops waking the scheduler on the frame it settles. Without
    // the ramp's own markDirty the grid would freeze part-way, so assert the
    // mid-ramp alphas actually climb frame over frame.
    h = makeChart();
    seedLine(h.chart, [50, 55, 60, 65, 70]);
    raf.flush(3);
    h.reset();

    raf.flush(1);
    const first = h.gridAlphas();
    h.reset();
    raf.flush(1);
    const second = h.gridAlphas();

    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(Math.max(...second)).toBeGreaterThan(Math.max(...first));
  });

  it('fades the grid out on setGrid({ visible: false }) instead of dropping it', () => {
    h = makeChart();
    seedLine(h.chart, [50, 55, 60, 65, 70]);
    raf.flush(60);

    h.chart.setGrid({ visible: false });
    const descent = sampleFrames(h, raf, 8);

    // Several frames of shrinking opacity, not one frame and gone. The first
    // sample is the retarget frame itself, which still paints the pre-fade
    // value — the descent starts from there.
    expect(descent.length).toBeGreaterThan(2);
    for (let i = 1; i < descent.length; i++) {
      expect(descent[i]).toBeLessThan(descent[i - 1]);
    }

    raf.flush(60);
    h.reset();
    h.chart.setGrid({ visible: false });
    raf.flush(2);
    expect(h.gridAlphas()).toEqual([]);
  });

  it('grid: false in the animations config paints the grid opaque on the first frame', () => {
    h = makeChart({ animations: { axis: { grid: false } } });
    seedLine(h.chart, [50, 55, 60, 65, 70]);
    raf.flush(1);

    const alphas = h.gridAlphas();
    expect(alphas.length).toBeGreaterThan(0);
    for (const alpha of alphas) {
      expect(alpha).toBe(1);
    }
  });

  it('holds the reveal for a chart whose data lands after mount', () => {
    // The empty-chart frames paint no gridlines. Starting the ramp there
    // would spend it against nothing and the real grid would arrive opaque.
    h = makeChart();
    raf.flush(40);
    expect(h.gridAlphas()).toEqual([]);

    seedLine(h.chart, [50, 55, 60, 65, 70]);
    h.reset();
    raf.flush(2);

    const early = h.gridAlphas();
    expect(early.length).toBeGreaterThan(0);
    for (const alpha of early) {
      expect(alpha).toBeLessThan(1);
    }
  });

  it('prefers-reduced-motion collapses the reveal to a snap', () => {
    globalThis.matchMedia = reducedMotionStub;
    h = makeChart();
    seedLine(h.chart, [50, 55, 60, 65, 70]);
    raf.flush(1);

    const alphas = h.gridAlphas();
    expect(alphas.length).toBeGreaterThan(0);
    for (const alpha of alphas) {
      expect(alpha).toBe(1);
    }
  });

  it('animations: false skips the reveal too', () => {
    h = makeChart({ animations: false });
    seedLine(h.chart, [50, 55, 60, 65, 70]);
    raf.flush(1);

    const alphas = h.gridAlphas();
    expect(alphas.length).toBeGreaterThan(0);
    for (const alpha of alphas) {
      expect(alpha).toBe(1);
    }
  });

  it('hiding the grid mid-reveal turns around without snapping to opaque first', () => {
    h = makeChart();
    seedLine(h.chart, [50, 55, 60, 65, 70]);
    raf.flush(3);

    h.chart.setGrid({ visible: false });
    const descent = sampleFrames(h, raf, 8);

    expect(descent.length).toBeGreaterThan(2);
    // The interrupted reveal never got to 1, so neither may the descent.
    for (const alpha of descent) {
      expect(alpha).toBeLessThan(1);
    }
    for (let i = 1; i < descent.length; i++) {
      expect(descent[i]).toBeLessThan(descent[i - 1]);
    }
  });
});

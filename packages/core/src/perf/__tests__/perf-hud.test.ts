// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTheme } from '../../theme/palettes';
import { resolveCandlestickBodyColor } from '../../theme/resolve';
import { PerfHud, perfHud, sparkBounds, sparkPeak } from '../perf-hud';
import { PerfMonitor } from '../perf-monitor';

function perfCell(container: HTMLElement, id: string): string {
  return container.querySelector(`[data-perf="${id}"]`)?.textContent ?? '';
}

function hudColor(container: HTMLElement, key: string): string {
  return (
    container.querySelector<HTMLElement>('[data-chart-perf-hud]')?.style.getPropertyValue(`--wick-perf-${key}`) ?? ''
  );
}

function rect(width: number, height: number): DOMRect {
  return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) };
}

/** happy-dom has no pointer capture; the stub captures on the first call. */
function stubPointerCapture(el: HTMLElement): ReturnType<typeof vi.fn> {
  const capture = vi.fn();
  el.setPointerCapture = capture;
  el.hasPointerCapture = () => capture.mock.calls.length > 0;
  el.releasePointerCapture = vi.fn();

  return capture;
}

function drag(el: HTMLElement, to: { x: number; y: number }): void {
  el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0, bubbles: true }));
  el.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: to.x, clientY: to.y, bubbles: true }));
  el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: to.x, clientY: to.y, bubbles: true }));
}

function hudState(container: HTMLElement): string {
  return container.querySelector('[data-chart-perf-hud]')?.getAttribute('data-perf-state') ?? '';
}

/** The HUD writes the DOM from a timer after the frame; tests run that timer at once. */
function fakeRenderTimer(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
}

describe('PerfHud', () => {
  let container: HTMLElement;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    container?.remove();
  });

  it('mounts a single overlay element in the container', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();

    const hud = new PerfHud(container, monitor);

    expect(container.querySelectorAll('[data-chart-perf-hud]')).toHaveLength(1);

    hud.destroy();
    monitor.destroy();
  });

  /**
   * Regression: React StrictMode mounts `ChartContainer`'s useLayoutEffect
   * twice. The existing ChartInstance-orphan pattern leaves the first chart's
   * DOM artifacts attached to the container so chart state survives the
   * remount — which meant the first HUD also stayed, and the second HUD
   * rendered on top of it, visibly double-printing the stats.
   * PerfHud strips any stale `[data-chart-perf-hud]` before appending.
   */
  it('does not stack when a second HUD is mounted into the same container', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const firstMonitor = new PerfMonitor();
    const secondMonitor = new PerfMonitor();

    // Simulate StrictMode: first HUD mounts, the orphan pattern leaves it
    // attached, then a second HUD mounts into the same container.
    new PerfHud(container, firstMonitor);
    const second = new PerfHud(container, secondMonitor);

    expect(container.querySelectorAll('[data-chart-perf-hud]')).toHaveLength(1);

    second.destroy();
    firstMonitor.destroy();
    secondMonitor.destroy();
  });

  it('removes its element on destroy', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();

    const hud = new PerfHud(container, monitor);
    hud.destroy();

    expect(container.querySelectorAll('[data-chart-perf-hud]')).toHaveLength(0);
    monitor.destroy();
  });

  it('starts in the waiting state with placeholder cells', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();

    const hud = new PerfHud(container, monitor);

    expect(hudState(container)).toBe('waiting');
    expect(perfCell(container, 'hero-fps')).toBe('—');
    expect(perfCell(container, 'main-ms')).toBe('—');
    expect(perfCell(container, 'overlay-ms')).toBe('—');

    hud.destroy();
    monitor.destroy();
  });

  it('flips to live and populates the main row, leaving an undrawn overlay as placeholders', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();

    fakeRenderTimer();
    // updateIntervalMs=0 so every frame schedules a DOM write.
    const hud = new PerfHud(container, monitor, { updateIntervalMs: 0 });

    monitor.recordFrame('main', 8, 100);
    monitor.recordFrame('main', 8, 116);
    vi.runAllTimers();

    expect(hudState(container)).toBe('live');
    expect(perfCell(container, 'main-fps')).toBe('62.5');
    expect(perfCell(container, 'main-ms')).toBe('8.00');
    // Overlay never drew (no mousemove yet) — its row keeps the placeholders.
    expect(perfCell(container, 'overlay-fps')).toBe('—');
    expect(perfCell(container, 'overlay-ms')).toBe('—');

    hud.destroy();
    monitor.destroy();
  });

  it('shows a per-series breakdown only when more than one series renders', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    fakeRenderTimer();
    const hud = new PerfHud(container, monitor, { updateIntervalMs: 0 });

    monitor.drawCallsMain.set('candlestick', 120);
    monitor.recordSeries('candlestick', 4, 100);
    monitor.recordFrame('main', 6, 100);
    vi.runAllTimers();

    // Single series — no breakdown, the row would just echo the main row.
    expect(perfCell(container, 'series-candlestick-ms')).toBe('');

    monitor.recordSeries('candlestick', 4, 116);
    monitor.recordSeries('line', 2, 116);
    monitor.recordFrame('main', 5, 116);
    vi.runAllTimers();

    expect(perfCell(container, 'series-candlestick-ms')).toBe('4.00');
    expect(perfCell(container, 'series-line-ms')).toBe('2.00');

    hud.destroy();
    monitor.destroy();
  });

  it('formats live rows for both layers', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    fakeRenderTimer();
    const hud = new PerfHud(container, monitor, { updateIntervalMs: 0 });

    monitor.drawCallsMain.set('candlestick', 120);
    monitor.recordFrame('main', 6, 100);
    monitor.recordFrame('main', 5, 116);

    monitor.drawCallsOverlay.set('crosshair', 30);
    monitor.recordFrame('overlay', 1, 105);
    monitor.recordFrame('overlay', 1, 121);
    vi.runAllTimers();

    expect(perfCell(container, 'main-ms')).toBe('5.00');
    expect(perfCell(container, 'overlay-ms')).toBe('1.00');
    expect(perfCell(container, 'overlay-fps')).toBe('62.5');
    expect(perfCell(container, 'hero-fps')).toBe('62.5');

    hud.destroy();
    monitor.destroy();
  });

  it('throttles DOM writes to updateIntervalMs', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();

    // 10 s update interval — every recorded frame after the first should be
    // suppressed because no clock time has elapsed inside the test.
    const hud = new PerfHud(container, monitor, { updateIntervalMs: 10_000 });

    fakeRenderTimer();
    monitor.recordFrame('main', 8, 100);
    vi.runAllTimers();
    // First frame may or may not pass the throttle gate depending on
    // performance.now() at construction time. The point of the test is the
    // *second* frame: even though stats changed, the cells must not be rewritten.
    const afterFirst = perfCell(container, 'main-ms');
    monitor.recordFrame('main', 4, 116);
    vi.runAllTimers();
    const afterSecond = perfCell(container, 'main-ms');

    expect(afterSecond).toBe(afterFirst);

    hud.destroy();
    monitor.destroy();
  });

  it('shows the whole frame when several charts share the monitor', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    fakeRenderTimer();
    const hud = new PerfHud(container, monitor, { updateIntervalMs: 0 });

    // Two charts paint each frame in back-to-back rAF callbacks.
    monitor.recordFrame('main', 6, 100);
    monitor.recordFrame('main', 5, 100);
    monitor.recordFrame('main', 6, 116);
    monitor.recordFrame('main', 5, 116);
    vi.runAllTimers();

    expect(perfCell(container, 'main-ms')).toBe('11.00');
    expect(perfCell(container, 'main-fps')).toBe('62.5');

    hud.destroy();
    monitor.destroy();
  });

  it('applies custom colors and panel sizes', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    const hud = new PerfHud(container, monitor, {
      colors: { background: 'rgb(255, 255, 255)', border: 'rgb(1, 2, 3)', good: 'rgb(0, 128, 0)' },
      mini: { width: 120, height: 36 },
      full: { width: 300 },
      radius: 18,
    });

    const panel = container.querySelector<HTMLElement>('[data-chart-perf-hud]');
    expect(panel?.style.width).toBe('120px');
    expect(panel?.style.height).toBe('36px');
    expect(panel?.style.borderRadius).toBe('18px');
    expect(hudColor(container, 'background')).toBe('rgb(255, 255, 255)');
    expect(hudColor(container, 'border')).toBe('rgb(1, 2, 3)');
    expect(hudColor(container, 'good')).toBe('rgb(0, 128, 0)');

    hud.destroy();
    monitor.destroy();
  });

  it('neither moves nor expands when drag and expand are off', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    const hud = new PerfHud(container, monitor, { draggable: false, expandable: false, blur: 0 });

    const panel = container.querySelector<HTMLElement>('[data-chart-perf-hud]');
    panel?.click();

    // Still the collapsed panel, and transparent to the pointer.
    expect(panel?.style.width).toBe('64px');
    expect(panel?.style.pointerEvents).toBe('none');
    expect(panel?.title).toBe('');
    expect(panel?.style.getPropertyValue('backdrop-filter')).toBe('');

    hud.destroy();
    monitor.destroy();
  });

  it('expands on a plain click when only drag is off', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    const hud = new PerfHud(container, monitor, { draggable: false, full: { width: 300 } });

    const panel = container.querySelector<HTMLElement>('[data-chart-perf-hud]');
    panel?.click();

    expect(panel?.style.width).toBe('300px');

    hud.destroy();
    monitor.destroy();
  });

  it('drags the open panel but not a pinned mini panel, and pins it back on collapse', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    container.getBoundingClientRect = () => rect(1000, 1000);
    const monitor = new PerfMonitor();
    const hud = new PerfHud(container, monitor, { mini: { draggable: false } });
    const panel = container.querySelector<HTMLElement>('[data-chart-perf-hud]');
    if (!panel) throw new Error('no panel');
    const capture = stubPointerCapture(panel);

    drag(panel, { x: 50, y: 40 });
    expect(capture).not.toHaveBeenCalled();

    panel.click();
    // The open panel shows the move icon in the status dot's place, and it is a handle.
    const handle = panel.querySelector<HTMLElement>('[data-perf="drag"]');
    expect(handle?.style.display).toBe('flex');
    if (!handle) throw new Error('no drag handle');
    drag(handle, { x: 50, y: 40 });
    expect(panel.style.transform).toBe('translate(50px, 40px)');

    panel.querySelector('button')?.click();
    expect(panel.style.width).toBe('64px');
    expect(panel.style.transform).toBe('');

    hud.destroy();
    monitor.destroy();
  });

  it('drags inside the viewport when the panel is larger than its container', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    container.getBoundingClientRect = () => rect(100, 40);
    const monitor = new PerfMonitor();
    const hud = new PerfHud(container, monitor);
    const panel = container.querySelector<HTMLElement>('[data-chart-perf-hud]');
    if (!panel) throw new Error('no panel');
    panel.getBoundingClientRect = () => rect(216, 250);
    stubPointerCapture(panel);

    drag(panel, { x: 50, y: 40 });

    expect(panel.style.transform).toBe('translate(50px, 40px)');

    hud.destroy();
    monitor.destroy();
  });

  it('pulses the live status dot unless `pulse` is off', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    const pulsing = () =>
      [...container.querySelectorAll<HTMLElement>('[data-chart-perf-hud] span')].some((el) =>
        el.style.animation.includes('wick-perf-pulse'),
      );

    const withPulse = new PerfHud(container, monitor);
    monitor.recordFrame('main', 1, 100);
    expect(pulsing()).toBe(true);
    withPulse.destroy();

    const still = new PerfHud(container, monitor, { pulse: false });
    monitor.recordFrame('main', 1, 116);
    expect(hudState(container)).toBe('live');
    expect(pulsing()).toBe(false);

    still.destroy();
    monitor.destroy();
  });

  it('keeps the default palette for keys left out of `colors`', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    const hud = new PerfHud(container, monitor, { colors: { border: 'rgb(1, 2, 3)' } });

    const panel = container.querySelector<HTMLElement>('[data-chart-perf-hud]');
    expect(panel?.style.width).toBe('64px');
    expect(hudColor(container, 'good')).toBe('#3fd68f');

    hud.destroy();
    monitor.destroy();
  });

  it('takes its palette from the chart theme, with overrides on top', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    const light = createTheme({ background: '#ffffff' }).theme;
    const dark = createTheme({ background: '#10141c' }).theme;
    const hud = new PerfHud(container, monitor, { theme: light, colors: { border: 'rgb(1, 2, 3)' } });

    expect(hudColor(container, 'background')).toBe(light.tooltip.background);
    expect(hudColor(container, 'good')).toBe(resolveCandlestickBodyColor(light.candlestick.up.body));
    expect(hudColor(container, 'border')).toBe('rgb(1, 2, 3)');

    hud.setTheme(dark);

    expect(hudColor(container, 'background')).toBe(dark.tooltip.background);
    expect(hudColor(container, 'good')).toBe(resolveCandlestickBodyColor(dark.candlestick.up.body));
    expect(hudColor(container, 'border')).toBe('rgb(1, 2, 3)');

    hud.destroy();
    monitor.destroy();
  });

  it('lays a wide mini panel out as a row: framed graph, then the number', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    const hud = new PerfHud(container, monitor, { mini: { width: 140, height: 35 } });

    const panel = container.querySelector<HTMLElement>('[data-chart-perf-hud]');
    expect(panel?.style.display).toBe('flex');
    expect(panel?.firstElementChild?.getAttribute('data-perf')).toBe('spark');
    // Room for the unit next to the number.
    monitor.recordFrame('main', 1, 100);
    expect(container.querySelector<HTMLElement>('[data-perf="hero-fps"]')?.nextElementSibling).toHaveProperty(
      'style.display',
      '',
    );

    hud.destroy();
    monitor.destroy();
  });

  it('collapses to a bare readout and opens to the full framed panel', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    const hud = new PerfHud(container, monitor, {
      mini: { width: 104, height: 35, sparkline: false, frame: false },
      draggable: false,
    });

    const panel = container.querySelector<HTMLElement>('[data-chart-perf-hud]');
    const spark = container.querySelector<HTMLElement>('[data-perf="spark"]');
    expect(panel?.style.display).toBe('flex');
    expect(panel?.style.background).toBe('transparent');
    expect(panel?.style.boxShadow).toBe('none');
    expect(spark?.style.display).toBe('none');

    panel?.click();

    expect(panel?.style.width).toBe('216px');
    expect(panel?.style.background).toBe('var(--wick-perf-background)');
    expect(spark?.style.display).toBe('');
    // Not draggable: no move icon in the open panel.
    expect(container.querySelector<HTMLElement>('[data-perf="drag"]')?.style.display).toBe('none');
    // Collapse ends the header row, inside the panel, so an `overflow: hidden` host can't clip it.
    const collapse = panel?.querySelector('button');
    expect(collapse?.parentElement?.lastElementChild).toBe(collapse);
    expect(collapse?.parentElement?.textContent).toContain('PERF');
    expect(collapse?.style.display).toBe('flex');
    expect(collapse?.style.position).toBe('');

    hud.destroy();
    monitor.destroy();
  });

  it('gives its graph epoch times, so a page open for days reads no Unix seconds', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // ~55 h of uptime: a bare `performance.now()` is now 1970-01-03 as ms.
    vi.spyOn(performance, 'now').mockReturnValue(2e8);
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    const hud = new PerfHud(container, monitor);

    const warnings = warn.mock.calls.map((call) => String(call[0]));
    expect(warnings.filter((message) => message.includes('Unix seconds'))).toEqual([]);

    hud.destroy();
    monitor.destroy();
  });

  it('flips to idle when frames stop arriving and back to live when they resume', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    const hud = new PerfHud(container, monitor, { updateIntervalMs: 0 });

    monitor.recordFrame('main', 8, 100);
    monitor.recordFrame('main', 8, 116);
    expect(hudState(container)).toBe('live');

    // No frames for well past the idle threshold — the watchdog flips the
    // state so a non-rendering chart reads as "idle", not as a confusing 0 fps.
    vi.advanceTimersByTime(2000);
    expect(hudState(container)).toBe('idle');
    expect(perfCell(container, 'hero-fps')).toBe('idle');

    monitor.recordFrame('main', 8, 2200);
    expect(hudState(container)).toBe('live');

    hud.destroy();
    monitor.destroy();
  });

  it('stays in waiting (not idle) when no frame has ever been recorded', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    const hud = new PerfHud(container, monitor, { updateIntervalMs: 0 });

    vi.advanceTimersByTime(5000);

    expect(hudState(container)).toBe('waiting');

    hud.destroy();
    monitor.destroy();
  });
});

describe('sparkBounds', () => {
  it('puts the rounded peak topPx below the plot top and zero 4px above its bottom', () => {
    const heightPx = 62;
    const topPx = 24;
    const range = sparkBounds({ values: [0, 57, 60.4], heightPx, topPx });
    const yOf = (value: number) => ((range.max - value) / (range.max - range.min)) * heightPx;

    expect(yOf(70)).toBeCloseTo(topPx);
    expect(yOf(0)).toBeCloseTo(heightPx - 4);
    expect(sparkPeak({ range, heightPx, topPx })).toBeCloseTo(70);
  });

  it('falls back to the bare peak before layout', () => {
    const range = sparkBounds({ values: [42], heightPx: 0, topPx: 24 });

    expect(range).toEqual({ min: 0, max: 50 });
    expect(sparkPeak({ range, heightPx: 0, topPx: 24 })).toBe(50);
  });
});

describe('perfHud', () => {
  it('owns a new monitor built from the monitor options', () => {
    const config = perfHud({ windowMs: 500 });

    expect(config.monitor).toBeInstanceOf(PerfMonitor);
    expect(config.ownsMonitor).toBe(true);
  });

  it('reuses a monitor passed directly or as `monitor`, without owning it', () => {
    const shared = new PerfMonitor();

    expect(perfHud(shared)).toMatchObject({ monitor: shared, ownsMonitor: false });
    expect(perfHud({ monitor: shared, mini: { width: 120 } })).toMatchObject({ monitor: shared, ownsMonitor: false });
  });
});

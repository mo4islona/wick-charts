// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PerfHud } from '../perf-hud';
import { PerfMonitor } from '../perf-monitor';

function perfCell(container: HTMLElement, id: string): string {
  return container.querySelector(`[data-perf="${id}"]`)?.textContent ?? '';
}

function hudState(container: HTMLElement): string {
  return container.querySelector('[data-chart-perf-hud]')?.getAttribute('data-perf-state') ?? '';
}

describe('PerfHud', () => {
  let container: HTMLElement;

  afterEach(() => {
    vi.useRealTimers();
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

    // updateIntervalMs=0 so the first frame writes to the DOM immediately.
    const hud = new PerfHud(container, monitor, 0);

    monitor.recordFrame('main', 8, 100);
    monitor.recordFrame('main', 8, 116);

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
    const hud = new PerfHud(container, monitor, 0);

    monitor.drawCallsMain.set('candlestick', 120);
    monitor.recordSeries('candlestick', 4, 100);
    monitor.recordFrame('main', 6, 100);

    // Single series — no breakdown, the row would just echo the main row.
    expect(perfCell(container, 'series-candlestick-ms')).toBe('');

    monitor.recordSeries('candlestick', 4, 116);
    monitor.recordSeries('line', 2, 116);
    monitor.recordFrame('main', 5, 116);

    expect(perfCell(container, 'series-candlestick-ms')).toBe('4.00');
    expect(perfCell(container, 'series-line-ms')).toBe('2.00');

    hud.destroy();
    monitor.destroy();
  });

  it('formats live rows for both layers', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    const hud = new PerfHud(container, monitor, 0);

    monitor.drawCallsMain.set('candlestick', 120);
    monitor.recordFrame('main', 6, 100);
    monitor.recordFrame('main', 5, 116);

    monitor.drawCallsOverlay.set('crosshair', 30);
    monitor.recordFrame('overlay', 1, 105);
    monitor.recordFrame('overlay', 1, 121);

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
    const hud = new PerfHud(container, monitor, 10_000);

    monitor.recordFrame('main', 8, 100);
    // First frame may or may not pass the throttle gate depending on
    // performance.now() at construction time. The point of the test is the
    // *second* frame: even though stats changed, the cells must not be rewritten.
    const afterFirst = perfCell(container, 'main-ms');
    monitor.recordFrame('main', 4, 116);
    const afterSecond = perfCell(container, 'main-ms');

    expect(afterSecond).toBe(afterFirst);

    hud.destroy();
    monitor.destroy();
  });

  it('flips to idle when frames stop arriving and back to live when they resume', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    container = document.createElement('div');
    document.body.appendChild(container);
    const monitor = new PerfMonitor();
    const hud = new PerfHud(container, monitor, 0);

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
    const hud = new PerfHud(container, monitor, 0);

    vi.advanceTimersByTime(5000);

    expect(hudState(container)).toBe('waiting');

    hud.destroy();
    monitor.destroy();
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';

import { PerfHud } from '../perf-hud';
import { PerfMonitor } from '../perf-monitor';

describe('PerfHud', () => {
  let container: HTMLElement;

  afterEach(() => {
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
   * rendered on top of it, visibly double-printing text like "FPS: 101".
   * PerfHud now strips any stale `[data-chart-perf-hud]` before appending.
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
});

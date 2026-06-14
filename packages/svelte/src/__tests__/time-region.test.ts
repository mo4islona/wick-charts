import { render } from '@testing-library/svelte';
import { ChartInstance } from '@wick-charts/core';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TimeRegionHarness from './TimeRegionHarness.svelte';

/**
 * Parity coverage for the Svelte `<TimeRegion>` wrapper: it forwards its props
 * to `chart.addRegion` on mount, `chart.updateRegion` on change, and
 * `chart.removeRegion` on destroy. Asserted via prototype spies (which call
 * through), so no canvas rendering is required.
 *
 * Runs under jsdom (see vitest.config.ts) with the client-side Svelte build so
 * `onMount` fires.
 */

const lineData = [
  [
    { time: 1, value: 10 },
    { time: 2, value: 30 },
    { time: 3, value: 50 },
  ],
];

function installSizePatch(width = 800, height = 400): () => void {
  const origRect = HTMLDivElement.prototype.getBoundingClientRect;
  HTMLDivElement.prototype.getBoundingClientRect = function patched() {
    return { x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) } as DOMRect;
  };
  const cw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(HTMLDivElement.prototype, 'clientHeight', { configurable: true, get: () => height });

  return () => {
    HTMLDivElement.prototype.getBoundingClientRect = origRect;
    if (cw) Object.defineProperty(HTMLElement.prototype, 'clientWidth', cw);
    if (ch) Object.defineProperty(HTMLElement.prototype, 'clientHeight', ch);
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await tick();
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
}

describe('<TimeRegion> (svelte)', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    restore();
    vi.restoreAllMocks();
  });

  it('registers a region on mount and removes it when toggled off', async () => {
    const add = vi.spyOn(ChartInstance.prototype, 'addRegion');
    const remove = vi.spyOn(ChartInstance.prototype, 'removeRegion');

    const { component } = render(TimeRegionHarness, { props: { lineData, showRegion: true } });
    await settle();

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ from: 2, to: 3, fill: 'rgba(240, 85, 106, 0.08)', label: 'window' }),
    );

    component.$set({ showRegion: false });
    await settle();

    expect(remove).toHaveBeenCalled();
  });

  it('updates the region when a prop changes', async () => {
    const update = vi.spyOn(ChartInstance.prototype, 'updateRegion');

    const { component } = render(TimeRegionHarness, { props: { lineData, regionTo: 3 } });
    await settle();

    component.$set({ regionTo: 5 });
    await settle();

    expect(update).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ to: 5 }));
  });
});

import { render } from '@testing-library/svelte';
import { ChartInstance } from '@wick-charts/core';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MarkerHarness from './MarkerHarness.svelte';

/**
 * Parity coverage for the Svelte `<Marker>` wrapper: it forwards its props to
 * `chart.addMarker` on mount, `chart.updateMarker` on change, and
 * `chart.removeMarker` on destroy. Asserted via prototype spies (which call
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

describe('<Marker> (svelte)', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    restore();
    vi.restoreAllMocks();
  });

  it('registers a marker on mount and removes it when toggled off', async () => {
    const add = vi.spyOn(ChartInstance.prototype, 'addMarker');
    const remove = vi.spyOn(ChartInstance.prototype, 'removeMarker');

    const { component } = render(MarkerHarness, { props: { lineData, showMarker: true } });
    await settle();

    expect(add).toHaveBeenCalledWith(expect.objectContaining({ time: 3, value: 50, label: 'broke', color: '#f0556a' }));

    component.$set({ showMarker: false });
    await settle();

    expect(remove).toHaveBeenCalled();
  });

  it('updates the marker when a prop changes', async () => {
    const update = vi.spyOn(ChartInstance.prototype, 'updateMarker');

    const { component } = render(MarkerHarness, { props: { lineData, markerValue: 50 } });
    await settle();

    component.$set({ markerValue: 20 });
    await settle();

    expect(update).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ value: 20 }));
  });
});

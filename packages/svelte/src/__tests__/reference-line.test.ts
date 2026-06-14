import { render } from '@testing-library/svelte';
import { ChartInstance } from '@wick-charts/core';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ReferenceLineHarness from './ReferenceLineHarness.svelte';

/**
 * Parity coverage for the Svelte `<ReferenceLine>` wrapper: it forwards its
 * props to `chart.addLine` on mount, `chart.updateLine` on change, and
 * `chart.removeLine` on destroy. Asserted via prototype spies (which call
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

describe('<ReferenceLine> (svelte)', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    restore();
    vi.restoreAllMocks();
  });

  it('registers a line on mount and removes it when toggled off', async () => {
    const add = vi.spyOn(ChartInstance.prototype, 'addLine');
    const remove = vi.spyOn(ChartInstance.prototype, 'removeLine');

    const { component } = render(ReferenceLineHarness, { props: { lineData, showLine: true } });
    await settle();

    expect(add).toHaveBeenCalledWith(expect.objectContaining({ value: 40, label: 'alert', color: '#f0556a' }));

    component.$set({ showLine: false });
    await settle();

    expect(remove).toHaveBeenCalled();
  });

  it('updates the line when a prop changes', async () => {
    const update = vi.spyOn(ChartInstance.prototype, 'updateLine');

    const { component } = render(ReferenceLineHarness, { props: { lineData, lineValue: 40 } });
    await settle();

    component.$set({ lineValue: 20 });
    await settle();

    expect(update).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ value: 20 }));
  });
});

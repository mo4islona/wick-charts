import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import LegendHarness from './LegendHarness.svelte';

/**
 * Parity regression tests for the Svelte `Legend` — mirrors the behaviors
 * enforced by `packages/react/src/__tests__/components/legend.test.tsx`.
 *
 * Covers:
 *   - seriesChange catch-up when Legend is declared before the series
 *   - toggle mode (click dims the corresponding legend item)
 *   - solo mode (second click restores all items)
 *   - position="right" teleports into the right anchor
 */

const twoLayerLine = [
  [
    { time: 1, value: 10 },
    { time: 2, value: 20 },
  ],
  [
    { time: 1, value: 100 },
    { time: 2, value: 200 },
  ],
];

const threeLayerBars = [[{ time: 1, value: 10 }], [{ time: 1, value: 100 }], [{ time: 1, value: 1000 }]];

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await tick();
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
}

function installSizePatch(width = 800, height = 400): () => void {
  const origRect = HTMLDivElement.prototype.getBoundingClientRect;
  HTMLDivElement.prototype.getBoundingClientRect = function patched() {
    const r = origRect.call(this);
    if (r.width > 0 && r.height > 0) return r;
    return { x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) } as DOMRect;
  };
  // Capture descriptors for *both* patched properties so the cleanup fully
  // restores the prototype — otherwise a leaked clientHeight getter causes
  // order-dependent failures in later tests.
  const origWidthDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const origHeightDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => height });
  return () => {
    HTMLDivElement.prototype.getBoundingClientRect = origRect;
    if (origWidthDesc) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', origWidthDesc);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
    }
    if (origHeightDesc) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', origHeightDesc);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
    }
  };
}

describe('Svelte <Legend> parity', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    restore();
  });

  it('renders one item per layer even when declared before the series (seriesChange catch-up)', async () => {
    const { unmount } = render(LegendHarness, {
      props: { variant: 'ordered-line', lineData: twoLayerLine },
    });
    await settle();

    // Portal moves the legend into its anchor inside ChartContainer, query
    // document.body so the post-teleport DOM is reachable regardless of
    // which branch testing-library's `container` reflects.
    const legend = document.body.querySelector('[data-legend]') as HTMLElement | null;
    expect(legend, 'Legend should render its items').not.toBeNull();
    const items = legend!.querySelectorAll('button');
    expect(items.length).toBe(twoLayerLine.length);

    unmount();
  });

  it('toggle mode: click flips the corresponding legend item visual state', async () => {
    const { unmount } = render(LegendHarness, {
      props: { variant: 'toggle-line', lineData: twoLayerLine },
    });
    await settle();

    const buttons = document.body.querySelectorAll('[data-legend] button');
    expect(buttons.length).toBe(twoLayerLine.length);

    (buttons[0] as HTMLButtonElement).click();
    await settle();

    expect((buttons[0] as HTMLButtonElement).style.opacity).toBe('0.35');
    expect((buttons[1] as HTMLButtonElement).style.opacity).toBe('1');

    unmount();
  });

  it('solo mode: second click on the same item restores all layers', async () => {
    const { unmount } = render(LegendHarness, {
      props: { variant: 'solo-bars', barData: threeLayerBars },
    });
    await settle();

    const buttons = () => document.body.querySelectorAll('[data-legend] button');
    expect(buttons().length).toBe(threeLayerBars.length);

    // Solo on index 1 → only layer 1 visible (others dimmed).
    (buttons()[1] as HTMLButtonElement).click();
    await settle();
    expect((buttons()[0] as HTMLButtonElement).style.opacity).toBe('0.35');
    expect((buttons()[1] as HTMLButtonElement).style.opacity).toBe('1');
    expect((buttons()[2] as HTMLButtonElement).style.opacity).toBe('0.35');

    // Second click on the solo'd item restores everything.
    (buttons()[1] as HTMLButtonElement).click();
    await settle();
    expect((buttons()[0] as HTMLButtonElement).style.opacity).toBe('1');
    expect((buttons()[1] as HTMLButtonElement).style.opacity).toBe('1');
    expect((buttons()[2] as HTMLButtonElement).style.opacity).toBe('1');

    unmount();
  });

  it('position="right" teleports into the right-side anchor', async () => {
    const { unmount } = render(LegendHarness, {
      props: { variant: 'right-position', lineData: twoLayerLine },
    });
    await settle();

    const rightAnchor = document.body.querySelector('[data-legend-right-anchor]');
    const bottomAnchor = document.body.querySelector('[data-legend-anchor]');
    expect(rightAnchor).not.toBeNull();
    expect(bottomAnchor).not.toBeNull();

    const legend = document.body.querySelector('[data-legend="right"]') as HTMLElement;
    expect(legend).not.toBeNull();
    expect(rightAnchor!.contains(legend)).toBe(true);
    expect(bottomAnchor!.contains(legend)).toBe(false);

    unmount();
  });
});

describe('installSizePatch cleanup', () => {
  // Regression: an earlier version patched HTMLElement.prototype.clientWidth +
  // clientHeight but only restored clientWidth in its cleanup, leaking the
  // clientHeight getter across test files and causing order-dependent
  // failures. This asserts cleanup fully restores prototype state.
  it('restores both clientWidth and clientHeight descriptors after cleanup', () => {
    const origWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const origHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

    const cleanup = installSizePatch(1234, 567);
    // While patched, both getters return the injected values.
    const probe = document.createElement('div');
    expect(probe.clientWidth).toBe(1234);
    expect(probe.clientHeight).toBe(567);

    cleanup();

    // Descriptors match the pre-patch state: either both present and equal, or
    // both undefined (jsdom default). No stray getters left behind.
    const afterWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const afterHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    expect(afterWidth).toEqual(origWidth);
    expect(afterHeight).toEqual(origHeight);
  });
});

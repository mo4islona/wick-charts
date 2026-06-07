import { cleanup, render } from '@testing-library/svelte';
import type { ChartInstance } from '@wick-charts/core';
import { catppuccin, oneDarkPro } from '@wick-charts/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CrosshairHarness from './CrosshairHarness.svelte';

/**
 * Svelte `<Crosshair>` parity fixes (mirrors the Vue suite):
 *   - V1: the time pill formats at the axis's *resolved* tick interval
 *     (`timeScale.niceTickValues`) and re-resolves on crosshair move (zoom),
 *     not the raw data interval frozen at first render.
 *   - V2: label colors track a runtime `setTheme` swap (driven off
 *     `overlayChange`) instead of freezing on the first-render snapshot.
 */

const lineData = [Array.from({ length: 30 }, (_, i) => ({ time: i + 1, value: i * 10 + 5 }))];

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

/** The time pill is the absolutely-positioned label translated -50% on X.
 *  Scoped to this render's container so a sibling test can't leak a stale pill. */
function timePill(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[style*="translateX(-50%)"]');
}

function mountHarness(): { chart: () => ChartInstance; container: HTMLElement } {
  let captured: ChartInstance | undefined;
  const { container } = render(CrosshairHarness, {
    props: {
      lineData,
      onChart: (c: ChartInstance) => {
        captured = c;
      },
    },
  });

  return {
    container,
    chart: () => {
      if (!captured) throw new Error('probe did not run');

      return captured;
    },
  };
}

describe('Svelte <Crosshair>', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    cleanup();
    restore();
    vi.restoreAllMocks();
  });

  it('formats the time pill at the resolved tick interval, not the raw data interval (V1)', async () => {
    const { chart } = mountHarness();
    await settle();
    const c = chart();

    const niceSpy = vi.spyOn(c.timeScale, 'niceTickValues');
    const dataInterval = c.getDataInterval();

    c.setCrosshair({ time: 15, y: 150 });
    await settle();

    // Resolves the granularity through niceTickValues at the *live* data
    // interval (1 here), not the pre-data 60_000 default frozen at mount.
    expect(niceSpy).toHaveBeenCalledWith(dataInterval);
  });

  it('re-resolves the tick interval on every crosshair move (V1 — not frozen on zoom)', async () => {
    const { chart } = mountHarness();
    await settle();
    const c = chart();

    const niceSpy = vi.spyOn(c.timeScale, 'niceTickValues');

    c.setCrosshair({ time: 10, y: 100 });
    await settle();
    const afterFirst = niceSpy.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    c.setCrosshair({ time: 20, y: 100 });
    await settle();
    expect(niceSpy.mock.calls.length).toBeGreaterThan(afterFirst);
  });

  it('updates label colors when the theme is swapped at runtime (V2)', async () => {
    const { chart, container } = mountHarness();
    await settle();
    const c = chart();

    c.setCrosshair({ time: 15, y: 150 });
    await settle();

    expect(timePill(container)).not.toBeNull();
    const before = timePill(container)?.getAttribute('style') ?? '';
    expect(before).toContain(catppuccin.theme.crosshair.labelTextColor);

    // Guard the premise — the swap is only observable if the colors differ.
    expect(catppuccin.theme.crosshair.labelTextColor).not.toBe(oneDarkPro.theme.crosshair.labelTextColor);

    c.setTheme(oneDarkPro.theme);
    await settle();

    const after = timePill(container)?.getAttribute('style') ?? '';
    expect(after).not.toBe(before);
    expect(after).toContain(oneDarkPro.theme.crosshair.labelTextColor);
  });
});

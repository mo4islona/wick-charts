import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import CustomRenderHarness from './CustomRenderHarness.svelte';

/**
 * Phase B: Svelte `InfoBar` / `Tooltip` expose a default scoped slot that
 * replaces the built-in UI. Assert the slot receives snapshots, that the
 * default UI still works without a slot, and that Tooltip stays hover-only.
 */

const OHLC = Array.from({ length: 10 }, (_, i) => ({
  time: (i + 1) * 60_000,
  open: 100 + i,
  high: 110 + i,
  low: 90 + i,
  close: 105 + i,
}));

const MULTI_LINE = [
  Array.from({ length: 10 }, (_, i) => ({ time: (i + 1) * 60_000, value: 10 + i })),
  Array.from({ length: 10 }, (_, i) => ({ time: (i + 1) * 60_000, value: 20 + i })),
];

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

describe('Svelte overlay custom-render slots', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    restore();
  });

  it('<InfoBar> default slot receives snapshots and `isHover: false` at rest', async () => {
    const captured: { count: number; isHover: boolean }[] = [];
    const { unmount } = render(CustomRenderHarness, {
      props: {
        variant: 'infobar-slot',
        lineData: MULTI_LINE,
        onBarSlot: (ctx: { snapshots: readonly { seriesId: string }[]; isHover: boolean }) =>
          captured.push({ count: ctx.snapshots.length, isHover: ctx.isHover }),
      },
    });
    await settle();

    const bar = document.body.querySelector('[data-testid="custom-bar"]');
    expect(bar, 'custom bar rendered').not.toBeNull();
    expect(captured.length).toBeGreaterThan(0);
    const last = captured[captured.length - 1];
    expect(last.count).toBe(MULTI_LINE.length);
    expect(last.isHover).toBe(false);

    unmount();
  });

  it('<InfoBar> default UI renders when no slot is provided', async () => {
    const { unmount } = render(CustomRenderHarness, {
      props: { variant: 'infobar-default', candlestickData: OHLC },
    });
    await settle();

    const bar = document.body.querySelector('[data-tooltip-legend]');
    expect(bar, 'default InfoBar UI renders').not.toBeNull();
    expect(bar?.textContent ?? '').toMatch(/O.*H.*L.*C/);

    unmount();
  });

  it('<Tooltip> slot is NOT invoked without a crosshair (hover-only)', async () => {
    const counter = { count: 0 };
    const { unmount } = render(CustomRenderHarness, {
      props: { variant: 'tooltip-slot', lineData: MULTI_LINE, tooltipSlotInvocations: counter },
    });
    await settle();

    expect(counter.count).toBe(0);
    expect(document.body.querySelector('[data-testid="custom-tooltip"]')).toBeNull();

    unmount();
  });
});

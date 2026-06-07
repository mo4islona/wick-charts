import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CanvasRecorder } from '../../../core/src/__tests__/helpers/recording-context';
import PainterOptionsHarness from './PainterOptionsHarness.svelte';

/**
 * PR6 — Svelte painter-option propagation. The wrapper re-runs
 * `updateSeriesOptions` when the `options` object is reassigned, so a new object
 * carrying a different `cornerRadius` / `curve` reaches the renderer (in-place
 * mutation would not — that's the documented contract). These pin it.
 */

const bars = [
  [
    { time: 1, value: 40 },
    { time: 2, value: 80 },
    { time: 3, value: 60 },
  ],
  [
    { time: 1, value: 20 },
    { time: 2, value: 30 },
    { time: 3, value: 25 },
  ],
];

const lineData = [
  [
    { time: 1, value: 10 },
    { time: 2, value: 40 },
    { time: 3, value: 20 },
    { time: 4, value: 50 },
  ],
];

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
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
  const patchEl = (el: HTMLElement) => {
    Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  };
  const observer = new MutationObserver((records) => {
    for (const rec of records) {
      for (const node of rec.addedNodes) {
        if (node instanceof HTMLElement) {
          patchEl(node);
          for (const child of node.querySelectorAll('div')) patchEl(child as HTMLElement);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    HTMLDivElement.prototype.getBoundingClientRect = origRect;
    observer.disconnect();
  };
}

function mainSpy(container: HTMLElement): CanvasRecorder {
  const main = container.querySelectorAll('canvas')[0] as HTMLCanvasElement | undefined;
  if (!main) throw new Error('main canvas missing');

  main.getContext('2d');
  const spy = main.__spy;
  if (!spy) throw new Error('canvas.__spy missing — is the root test-setup loaded?');

  return spy;
}

describe('Svelte painter-option propagation (options reassignment)', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    cleanup();
    restore();
  });

  it('reassigning options with a new cornerRadius reaches the renderer (0 → 8 starts rounding)', async () => {
    const result = render(PainterOptionsHarness, { variant: 'bar', data: bars, options: { cornerRadius: 0 } });
    await settle();
    expect(mainSpy(result.container).countOf('arcTo')).toBe(0);

    await result.component.$set({ options: { cornerRadius: 8 } });
    await settle();
    expect(mainSpy(result.container).countOf('arcTo')).toBeGreaterThan(0);
  });

  it('reassigning options with a new curve reaches the renderer (straight → smooth starts curving)', async () => {
    const result = render(PainterOptionsHarness, { variant: 'line', data: lineData, options: { curve: 'straight' } });
    await settle();
    expect(mainSpy(result.container).countOf('bezierCurveTo')).toBe(0);

    await result.component.$set({ options: { curve: 'smooth' } });
    await settle();
    expect(mainSpy(result.container).countOf('bezierCurveTo')).toBeGreaterThan(0);
  });
});

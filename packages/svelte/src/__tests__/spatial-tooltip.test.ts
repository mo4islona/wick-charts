import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import SpatialTooltipHarness from './SpatialTooltipHarness.svelte';

/** Svelte `<PieTooltip>` / `<HeatmapTooltip>` follow the pointer, as in React and Vue. */

const WIDTH = 400;
const HEIGHT = 400;

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await tick();
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
}

function installSizePatch(): () => void {
  const origRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function patched() {
    const r = origRect.call(this);
    // An empty header must measure 0, or it pads the plot down by a full chart height.
    if (this.hasAttribute('data-chart-top-overlay')) return r;
    if (r.width > 0 && r.height > 0) return r;

    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: HEIGHT,
      right: WIDTH,
      width: WIDTH,
      height: HEIGHT,
      toJSON: () => ({}),
    } as DOMRect;
  };
  const origWidthDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const origHeightDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => WIDTH });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => HEIGHT });

  return () => {
    HTMLElement.prototype.getBoundingClientRect = origRect;
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

/** Pointer events land on the top (overlay) canvas; jsdom has no `offsetX`. */
function hover(container: HTMLElement, x: number, y: number): void {
  const canvases = container.querySelectorAll('canvas');
  const overlay = canvases[canvases.length - 1];
  if (!overlay) throw new Error('overlay canvas not found');

  const event = new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'offsetX', { value: x });
  Object.defineProperty(event, 'offsetY', { value: y });
  overlay.dispatchEvent(event);
}

describe('Svelte spatial tooltips', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    cleanup();
    restore();
  });

  it('<PieTooltip> shows the hovered slice', async () => {
    const { container } = render(SpatialTooltipHarness, { props: { variant: 'pie' } });
    await settle();
    expect(container.textContent).not.toContain('Beta');

    // Below the center: inside Beta's wedge (60%, clockwise from 12 o'clock after Alpha).
    hover(container, WIDTH / 2, HEIGHT / 2 + 50);
    await settle();

    expect(container.textContent).toContain('Beta');
  });

  it('<HeatmapTooltip> shows the hovered cell and follows the pointer to the next one', async () => {
    const { container } = render(SpatialTooltipHarness, { props: { variant: 'heatmap' } });
    await settle();

    hover(container, WIDTH / 4, HEIGHT / 4);
    await settle();
    const first = container.textContent ?? '';

    hover(container, (WIDTH * 3) / 4, (HEIGHT * 3) / 4);
    await settle();
    const second = container.textContent ?? '';

    expect(first).toMatch(/Mon.*AM|AM.*Mon/);
    expect(second).toMatch(/Tue.*PM|PM.*Tue/);
  });
});

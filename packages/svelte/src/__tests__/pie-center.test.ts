import { cleanup, render } from '@testing-library/svelte';
import type { ChartInstance } from '@wick-charts/core';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import PieCenterHarness from './PieCenterHarness.svelte';

const WIDTH = 400;
const HEIGHT = 400;

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await tick();
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
}

// jsdom lays nothing out: every element reports the chart size, as in the spatial tooltip test.
function installSizePatch(): () => void {
  const origRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function patched() {
    const r = origRect.call(this);
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

describe('Svelte <PieCenter>', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    cleanup();
    restore();
  });

  it('shows the total and the label in the hole', async () => {
    const { container } = render(PieCenterHarness);
    await settle();

    const center = container.querySelector('[data-chart-pie-center]');
    expect(center?.textContent).toContain('100 visits');
    expect(center?.textContent).toContain('Total sessions');
  });

  it('sits on the hole that the renderer reports', async () => {
    let chart: ChartInstance | null = null;
    const { container } = render(PieCenterHarness, {
      onChart: (c: ChartInstance) => {
        chart = c;
      },
    });
    await settle();

    const hole = (chart as ChartInstance | null)?.getPieHole('pie');
    const center = container.querySelector<HTMLElement>('[data-chart-pie-center]');
    if (!hole || !center) throw new Error('no hole or no center');

    const size = hole.innerRadius * Math.SQRT2;
    expect(Number.parseFloat(center.style.left)).toBeCloseTo(hole.x - size / 2, 3);
    expect(Number.parseFloat(center.style.width)).toBeCloseTo(size, 3);
  });

  it('passes the total and the hole to the default slot', async () => {
    const { container } = render(PieCenterHarness, { variant: 'slot' });
    await settle();

    expect(container.querySelector('[data-probe]')?.textContent).toBe('100|2|true');
  });
});

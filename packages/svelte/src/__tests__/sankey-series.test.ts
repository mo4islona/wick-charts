import { cleanup, render } from '@testing-library/svelte';
import type { ChartInstance, SankeyLink, SankeyNode } from '@wick-charts/core';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import SankeySeriesHarness from './SankeySeriesHarness.svelte';

/**
 * `<SankeySeries>` lifecycle: mount registers a sankey series with the initial
 * graph, the reactive block re-sends a changed graph, and unmount removes the
 * series. `<SankeyTooltip>` follows the pointer. Mirrors the Vue `sankey-series.test`.
 */

const WIDTH = 800;
const HEIGHT = 400;

const NODES: SankeyNode[] = [
  { id: 'a', label: 'Ads', color: '#ff0000' },
  { id: 'b', label: 'Signup', color: '#00ff00' },
  { id: 'c', color: '#0000ff' },
];
const B_TO_C: SankeyLink[] = [{ source: 'b', target: 'c', value: 1 }];

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
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

function mountSankey(links: SankeyLink[]) {
  let captured: ChartInstance | null = null;
  const view = render(SankeySeriesHarness, {
    props: {
      nodes: NODES,
      links,
      onChart: (c: ChartInstance) => {
        captured = c;
      },
    },
  });

  const chart = (): ChartInstance => {
    if (!captured) throw new Error('probe did not run');

    return captured;
  };

  return { ...view, chart };
}

describe('Svelte <SankeySeries>', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    cleanup();
    restore();
  });

  it('mounts a sankey series with the initial graph', async () => {
    const { chart } = mountSankey(B_TO_C);
    await settle();

    expect(chart().getSeriesIdsByType('sankey')).toEqual(['flow']);
    expect(chart().getSeriesColor('flow')).toBe('#00ff00');
  });

  it('re-sends the graph when the links change', async () => {
    const { chart, rerender } = mountSankey(B_TO_C);
    await settle();

    await rerender({ links: [{ source: 'a', target: 'b', value: 1 }, ...B_TO_C] });
    await settle();

    expect(chart().getSeriesColor('flow')).toBe('#ff0000');
  });

  it('removes the series when the component unmounts', async () => {
    const { chart, rerender } = mountSankey(B_TO_C);
    await settle();
    expect(chart().getSeriesIds()).toContain('flow');

    await rerender({ show: false });
    await settle();

    expect(chart().getSeriesIds()).not.toContain('flow');
  });

  it('<SankeyTooltip> shows the hovered node and link', async () => {
    const { container } = mountSankey([{ source: 'a', target: 'b', value: 10 }]);
    await settle();

    hover(container, 6, HEIGHT / 2);
    await settle();
    expect(container.textContent).toContain('Ads');
    expect(container.textContent).toContain('100.0%');

    hover(container, WIDTH / 2, HEIGHT / 2);
    await settle();
    expect(container.textContent).toContain('Ads → Signup');
  });
});

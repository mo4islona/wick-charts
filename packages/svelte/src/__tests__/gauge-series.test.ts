import { cleanup, render } from '@testing-library/svelte';
import type { ChartInstance, GaugeZone, PieSliceInput } from '@wick-charts/core';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import GaugeSeriesHarness from './GaugeSeriesHarness.svelte';

/**
 * `<GaugeSeries>` / `<RadialProgressSeries>` lifecycle: mount registers the
 * series with its first data, a prop change re-sends it, and unmount removes
 * the series. Mirrors the Vue `gauge-series.test`.
 */

const WIDTH = 800;
const HEIGHT = 400;

const ZONES: GaugeZone[] = [
  { to: 50, color: '#00ff00' },
  { to: 100, color: '#ff0000' },
];
const RINGS: PieSliceInput[] = [
  { label: 'CPU', value: 72 },
  { label: 'Disk', value: 31 },
];

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

function mountGauges(props: { value: number; rings: PieSliceInput[] }) {
  let captured: ChartInstance | null = null;
  const view = render(GaugeSeriesHarness, {
    props: {
      ...props,
      zones: ZONES,
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

describe('Svelte <GaugeSeries> / <RadialProgressSeries>', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    cleanup();
    restore();
  });

  it('mounts both series with their first data, and <PieLegend> lists the rings', async () => {
    const { chart, container } = mountGauges({ value: 30, rings: RINGS });
    await settle();

    expect(chart().getSeriesIdsByType('gauge')).toEqual(['load']);
    expect(chart().getSeriesColor('load')).toBe('#00ff00');
    expect(
      chart()
        .getSliceInfo('rings')
        ?.map((slice) => slice.percent),
    ).toEqual([72, 31]);

    const legend = container.querySelector('[data-chart-pie-legend]')?.textContent ?? '';
    expect(legend.replace(/\s+/g, '')).toBe('CPU72.0%Disk31.0%');
  });

  it('re-sends the value and the rings when the props change', async () => {
    const { chart, rerender } = mountGauges({ value: 30, rings: RINGS });
    await settle();

    await rerender({ value: 80, rings: [{ label: 'CPU', value: 10 }] });
    await settle();

    expect(chart().getSeriesColor('load')).toBe('#ff0000');
    expect(
      chart()
        .getSliceInfo('rings')
        ?.map((slice) => slice.value),
    ).toEqual([10]);
  });

  it('removes the series when the components unmount', async () => {
    const { chart, rerender } = mountGauges({ value: 30, rings: RINGS });
    await settle();

    await rerender({ show: false });
    await settle();

    expect(chart().getSeriesIds()).toEqual([]);
  });
});

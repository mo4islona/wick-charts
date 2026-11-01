import { cleanup, render } from '@testing-library/svelte';
import type { ChartInstance, CrosshairPosition, HoverInfo, RadarLayer } from '@wick-charts/core';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import RadarSeriesHarness from './RadarSeriesHarness.svelte';

/**
 * `<RadarSeries>` lifecycle: mount registers the series with its axes and
 * layers, a prop change re-sends them, and unmount removes the series.
 * Mirrors the Vue `radar-series.test`.
 */

const WIDTH = 800;
const HEIGHT = 400;

const AXES = ['Speed', 'Power', 'Range'];
const LAYERS: RadarLayer[] = [
  { label: 'Alpha', data: [3, 5, 2] },
  { label: 'Beta', data: [4, 1, 5] },
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

function mountRadar(props: { data: RadarLayer[]; options?: { colors?: string[] } }) {
  let captured: ChartInstance | null = null;
  const view = render(RadarSeriesHarness, {
    props: {
      ...props,
      axes: AXES,
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

function layerLabels(chart: ChartInstance): (string | undefined)[] {
  const count = chart.getSeriesLayers('skills')?.length ?? 0;

  return Array.from({ length: count }, (_, i) => chart.getLayerLabel('skills', i));
}

function hover(chart: ChartInstance, info: HoverInfo): void {
  const pos: CrosshairPosition = { time: 0, x: 0, mediaX: 200, mediaY: 200, y: 0 };

  (chart as { getHoverInfo: (id: string) => HoverInfo | null }).getHoverInfo = () => info;
  (chart as { getCrosshairPosition: () => CrosshairPosition | null }).getCrosshairPosition = () => pos;

  type EmitFn = (event: 'crosshairMove', value: CrosshairPosition | null) => void;
  (chart as unknown as { emit: EmitFn }).emit('crosshairMove', pos);
}

describe('Svelte <RadarSeries>', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    cleanup();
    restore();
  });

  it('mounts the series with its axes and layers, and <Legend> lists the layers', async () => {
    const { chart, container } = mountRadar({ data: LAYERS });
    await settle();

    expect(chart().getSeriesIdsByType('radar')).toEqual(['skills']);
    expect(layerLabels(chart())).toEqual(['Alpha', 'Beta']);
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('Beta');
  });

  it('re-sends the layers and the options when the props change', async () => {
    const { chart, rerender } = mountRadar({ data: LAYERS, options: { colors: ['#111111', '#222222'] } });
    await settle();

    expect(chart().getSeriesLayers('skills')).toEqual([{ color: '#111111' }, { color: '#222222' }]);

    await rerender({
      data: [...LAYERS, { label: 'Gamma', data: [1, 1, 1] }],
      options: { colors: ['#333333', '#444444', '#555555'] },
    });
    await settle();

    expect(layerLabels(chart())).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(chart().getSeriesLayers('skills')).toEqual([
      { color: '#333333' },
      { color: '#444444' },
      { color: '#555555' },
    ]);
  });

  it('<RadarTooltip> lists every axis value of the hovered polygon', async () => {
    const { chart, container } = mountRadar({ data: LAYERS });
    await settle();

    hover(chart(), {
      label: 'Hovered polygon',
      value: 0,
      percent: 0,
      color: '#888',
      rows: [
        { label: 'Speed', value: 1234, percent: 50 },
        { label: 'Power', value: null, percent: null },
      ],
    });
    await settle();

    const text = container.textContent ?? '';
    expect(text).toContain('Hovered polygon');
    expect(text).toContain('1.234K');
    expect(text).toContain('—');
  });

  it('removes the series when the component unmounts', async () => {
    const { chart, rerender } = mountRadar({ data: LAYERS });
    await settle();

    await rerender({ show: false });
    await settle();

    expect(chart().getSeriesIds()).toEqual([]);
  });
});

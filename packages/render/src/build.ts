import {
  type BandData,
  BandSeriesDef,
  BarSeriesDef,
  CandlestickSeriesDef,
  ChartInstance,
  type ChartOptions,
  type ChartSurface,
  type ChartTheme,
  DepthSeriesDef,
  EMPTY_SYNC_STATE,
  type FadeConfig,
  GaugeSeriesDef,
  HeatmapSeriesDef,
  HistogramSeriesDef,
  LineSeriesDef,
  type MultiLayerData,
  type OHLCInput,
  PieSeriesDef,
  RadarSeriesDef,
  RadialProgressSeriesDef,
  SankeySeriesDef,
  syncHistogramLayers,
  syncLayers,
  syncSeriesLayer,
  toHistogramLayers,
  toLayers,
} from '@wick-charts/core';

import type { ChartSpec, SeriesSpec } from './spec';

/** `ChartContainer`'s default top padding, CSS px. */
const DEFAULT_PADDING_TOP = 20;

/** How far past the header the auto top fade runs, CSS px (`ChartContainer` `FADE_AUTO_BAND`). */
const FADE_AUTO_BAND = 24;

/** Frames a settled chart can need: the first lands the data, the next lands the axis columns it sized. */
const MAX_SETTLE_FRAMES = 8;

export interface BuildParams {
  spec: ChartSpec;
  theme: ChartTheme;
  surface: ChartSurface;
  /** Height of the floating title, CSS px; `0` without one. */
  headerHeight: number;
  /** SVG cannot erase, so it gets no fades. */
  fades: boolean;
}

/** Build the chart the way `ChartContainer` and its children would, with every animation off. */
export function buildChart(params: BuildParams): ChartInstance {
  const { spec, theme, surface, headerHeight } = params;
  const fade = params.fades ? spec.fade : false;
  const header = resolveHeader({ fade, headerHeight });

  const options: ChartOptions = {
    theme,
    animations: false,
    interactive: false,
    accessibility: false,
    padding: { ...spec.padding, top: (spec.padding?.top ?? DEFAULT_PADDING_TOP) + header.paddingExtra },
    fade: resolveFade({ fade, top: header.fadeTop }),
  };
  if (spec.axis !== undefined) options.axis = spec.axis;
  if (spec.scales !== undefined) options.scales = spec.scales;
  if (spec.viewport !== undefined) options.viewport = spec.viewport;
  if (spec.grid !== undefined) options.grid = spec.grid;
  if (spec.locale !== undefined) options.locale = spec.locale;
  if (spec.timeZone !== undefined) options.timeZone = spec.timeZone;

  const chart = new ChartInstance(surface, options);
  chart.setHeaderHeight(headerHeight);
  applyAxes(chart, spec);

  chart.batch(() => {
    for (const series of spec.series) {
      addSeries(chart, series);
    }
  });

  addAnnotations(chart, spec);
  if (spec.visibleRange !== undefined) chart.setVisibleRange(spec.visibleRange);

  return chart;
}

/** Paint until the chart rests. With animations off, that takes a frame or two. */
export function settle(chart: ChartInstance): void {
  for (let frame = 0; frame < MAX_SETTLE_FRAMES; frame++) {
    chart.flush();
    if (!chart.getAnimationState().animating) return;
  }
}

/** `ChartContainer` folds a floating header into the top padding, minus the part a top fade lets data run under. */
function resolveHeader(params: { fade: ChartSpec['fade']; headerHeight: number }): {
  paddingExtra: number;
  fadeTop: number;
} {
  const { fade, headerHeight } = params;
  const conf = typeof fade === 'object' ? fade : {};
  const topRequested = typeof fade === 'object' ? fade.top !== undefined || fade.overlap !== undefined : fade === true;
  const topEnabled = fade !== false && topRequested;

  const overlap = topEnabled ? Math.max(0, conf.overlap ?? headerHeight / 2) : 0;
  const autoTop = headerHeight > 0 ? headerHeight + FADE_AUTO_BAND : FADE_AUTO_BAND;

  return {
    paddingExtra: Math.max(0, headerHeight - overlap),
    fadeTop: topEnabled ? (conf.top ?? autoTop) : 0,
  };
}

function resolveFade(params: { fade: ChartSpec['fade']; top: number }): FadeConfig {
  const { fade, top } = params;
  if (fade === false) return { top: 0, right: 0, left: 0 };

  const resolved: FadeConfig = { top };
  if (typeof fade === 'object' && fade.right !== undefined) resolved.right = fade.right;
  if (typeof fade === 'object' && fade.left !== undefined) resolved.left = fade.left;

  return resolved;
}

function applyAxes(chart: ChartInstance, spec: ChartSpec): void {
  const { xAxis, yAxis } = spec;

  if (xAxis) {
    if (xAxis.format !== undefined) chart.setXAxisFormat(xAxis.format);
    chart.setTimeAxisLabelDensity({ labelCount: xAxis.labelCount, minLabelSpacing: xAxis.minLabelSpacing });
  }

  if (yAxis) {
    // `normalizeSpec` has turned a template string into a formatter.
    if (typeof yAxis.format === 'function') chart.setYAxisFormat({ format: yAxis.format });
    chart.setYAxisLabelDensity({ labelCount: yAxis.labelCount, minLabelSpacing: yAxis.minLabelSpacing });
  }
}

/** One series, set up as its framework component sets it up. */
function addSeries(chart: ChartInstance, series: SeriesSpec): void {
  const id = addSeriesOnly(chart, series);
  if (series.visible === false) chart.setSeriesVisible(id, false);
}

function addSeriesOnly(chart: ChartInstance, series: SeriesSpec): string {
  switch (series.type) {
    case 'line': {
      const layers = toLayers(series.data).length;
      const id = chart.addSeries(LineSeriesDef, { ...series.options, id: series.id, scale: series.scale, layers });

      return syncLayered({ chart, id, data: series.data, layers });
    }

    case 'bar': {
      const layers = toLayers(series.data).length;
      const id = chart.addSeries(BarSeriesDef, { ...series.options, id: series.id, scale: series.scale, layers });

      return syncLayered({ chart, id, data: series.data, layers });
    }

    case 'band': {
      const layers = toLayers(series.data).length;
      const id = chart.addSeries(BandSeriesDef, { ...series.options, id: series.id, scale: series.scale, layers });

      return syncLayered({ chart, id, data: series.data, layers });
    }

    case 'candlestick': {
      const layer = toLayers<OHLCInput>(series.data)[0];
      const id = chart.addSeries(CandlestickSeriesDef, {
        ...series.options,
        id: series.id,
        scale: series.scale,
        label: layer.label,
      });
      chart.setSeriesLabels(id, [layer.label]);
      syncSeriesLayer({ chart, id, data: layer.data, prev: EMPTY_SYNC_STATE });

      return id;
    }

    case 'histogram': {
      const layers = toHistogramLayers(series.data).length;
      const id = chart.addSeries(HistogramSeriesDef, { ...series.options, id: series.id, scale: series.scale, layers });
      syncHistogramLayers({ chart, id, data: series.data, prev: [] });

      return id;
    }

    case 'pie': {
      const id = chart.addSeries(PieSeriesDef, { ...series.options, id: series.id });

      return setData({ chart, id, data: series.data });
    }

    case 'radialProgress': {
      const id = chart.addSeries(RadialProgressSeriesDef, { ...series.options, id: series.id });

      return setData({ chart, id, data: series.data });
    }

    case 'gauge': {
      const id = chart.addSeries(GaugeSeriesDef, { ...series.options, id: series.id });

      return setData({ chart, id, data: series.value });
    }

    case 'heatmap': {
      const id = chart.addSeries(HeatmapSeriesDef, { ...series.options, id: series.id });

      return setData({ chart, id, data: series.data });
    }

    case 'depth': {
      const id = chart.addSeries(DepthSeriesDef, { ...series.options, id: series.id });

      return setData({ chart, id, data: { bids: series.bids, asks: series.asks } });
    }

    case 'radar': {
      const id = chart.addSeries(RadarSeriesDef, { ...series.options, id: series.id });

      return setData({ chart, id, data: { axes: series.axes, series: series.data } });
    }

    case 'sankey': {
      const id = chart.addSeries(SankeySeriesDef, { ...series.options, id: series.id });

      return setData({ chart, id, data: { nodes: series.nodes, links: series.links } });
    }
  }
}

function syncLayered(params: {
  chart: ChartInstance;
  id: string;
  data: MultiLayerData | BandData;
  layers: number;
}): string {
  const { chart, id, data } = params;
  const prev = new Array(params.layers).fill(EMPTY_SYNC_STATE);
  syncLayers({ chart, id, data, prev });

  return id;
}

function setData(params: { chart: ChartInstance; id: string; data: unknown }): string {
  params.chart.setSeriesData(params.id, params.data);

  return params.id;
}

function addAnnotations(chart: ChartInstance, spec: ChartSpec): void {
  for (const region of spec.regions ?? []) {
    chart.addRegion(region);
  }

  for (const line of spec.lines ?? []) {
    chart.addLine(line);
  }

  for (const marker of spec.markers ?? []) {
    chart.addMarker(marker);
  }
}

import { type YAxisConfig, logScale } from '@wick-charts/core';

import { RenderSpecError } from './errors';
import { templateFormatter } from './format-template';
import type { ChartSpec, SeriesSpec } from './spec';

/** Nested option objects whose `format` takes a number: bar value labels, heatmap cells, Sankey labels. */
const LABEL_OPTION_KEYS = ['valueLabels', 'cellLabels', 'labels'];

/** Series types whose points carry a `time`. */
const TIMED_SERIES = new Set<SeriesSpec['type']>(['line', 'bar', 'band', 'candlestick']);

/**
 * JSON has no `Date` and no functions. Accept what a JSON spec writes instead:
 * ISO 8601 strings for times, `"log"` for a log Y scale, and templates such
 * as `"{value}%"` for number formats.
 */
export function normalizeSpec(spec: ChartSpec): ChartSpec {
  const { locale } = spec;
  const series = spec.series.map((entry, i) => {
    const path = `series[${i}]`;
    const withFormats = normalizeSeriesFormats({ series: entry, locale, path });
    if (!TIMED_SERIES.has(entry.type) || !('data' in withFormats)) return withFormats;

    return { ...withFormats, data: mapPoints({ data: withFormats.data, path: `${path}.data` }) } as SeriesSpec;
  });

  const normalized: ChartSpec = { ...spec, series };
  if (spec.yAxis && typeof spec.yAxis.format === 'string') {
    const format = templateFormatter({ template: spec.yAxis.format, locale, path: 'yAxis.format' });
    normalized.yAxis = { ...spec.yAxis, format };
  }

  if (spec.axis?.y !== undefined) normalized.axis = { ...spec.axis, y: normalizeScale(spec.axis.y) };
  if (spec.scales !== undefined) {
    normalized.scales = Object.fromEntries(Object.entries(spec.scales).map(([id, conf]) => [id, normalizeScale(conf)]));
  }

  if (spec.markers !== undefined) {
    normalized.markers = spec.markers.map((marker, i) => ({
      ...marker,
      time: toTime({ value: marker.time, path: `markers[${i}].time` }),
    }));
  }

  if (spec.lines !== undefined) {
    normalized.lines = spec.lines.map((line, i) =>
      line.time === undefined ? line : { ...line, time: toTime({ value: line.time, path: `lines[${i}].time` }) },
    );
  }

  const range = spec.visibleRange;
  if (typeof range === 'object' && range !== null) {
    const from = toTime({ value: range.from, path: 'visibleRange.from' });
    normalized.visibleRange =
      'to' in range ? { ...range, from, to: toTime({ value: range.to, path: 'visibleRange.to' }) } : { ...range, from };
  }

  if (spec.regions !== undefined) {
    normalized.regions = spec.regions.map((region, i) => ({
      ...region,
      from: toTime({ value: region.from, path: `regions[${i}].from` }),
      to: typeof region.to === 'string' ? toTime({ value: region.to, path: `regions[${i}].to` }) : region.to,
    }));
  }

  return normalized;
}

/** Template strings in `options.format` and in the label options' `format` become formatters. */
function normalizeSeriesFormats(params: { series: SeriesSpec; locale: string | undefined; path: string }): SeriesSpec {
  const { series, locale, path } = params;
  const options = series.options as Record<string, unknown> | undefined;
  if (options === undefined) return series;

  const next: Record<string, unknown> = { ...options };
  if (typeof options.format === 'string') {
    next.format = templateFormatter({ template: options.format, locale, path: `${path}.options.format` });
  }

  for (const key of LABEL_OPTION_KEYS) {
    const labels = options[key];
    const isObject = typeof labels === 'object' && labels !== null;
    if (!isObject || !('format' in labels) || typeof labels.format !== 'string') continue;

    const template = labels.format;
    const format = templateFormatter({ template, locale, path: `${path}.options.${key}.format` });
    next[key] = { ...labels, format };
  }

  return { ...series, options: next } as SeriesSpec;
}

function normalizeScale(conf: YAxisConfig): YAxisConfig {
  const scale: unknown = conf.scale;
  if (scale === 'log') return { ...conf, scale: logScale() };

  return conf;
}

function toTime<T>(params: { value: T; path: string }): T | number {
  const { value, path } = params;
  if (typeof value !== 'string') return value;

  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new RenderSpecError(`${path}: "${value}" is not an ISO 8601 date.`);

  return time;
}

/** Walk one layer, an array of layers, or `{ data }` layer objects, and convert each point's `time`. */
function mapPoints(params: { data: unknown; path: string }): unknown {
  const { data, path } = params;

  if (Array.isArray(data)) {
    return data.map((item, i) => mapPoints({ data: item, path: `${path}[${i}]` }));
  }

  if (typeof data !== 'object' || data === null) return data;

  const record = data as Record<string, unknown>;
  if ('data' in record) return { ...record, data: mapPoints({ data: record.data, path: `${path}.data` }) };
  if (typeof record.time !== 'string') return record;

  return { ...record, time: toTime({ value: record.time, path: `${path}.time` }) };
}

import { RenderSpecError } from './errors';
import type { RenderOptions } from './render';
import type { ChartSpec, SeriesType } from './spec';

export const DEFAULT_WIDTH = 800;
export const DEFAULT_HEIGHT = 400;
const DEFAULT_PIXEL_RATIO = 2;
const MIN_SIZE = 16;
const MAX_SIZE = 4096;
const MAX_PIXEL_RATIO = 4;
/** Device pixels in one image: 4096 × 4096 at ratio 2 would need 256 MB of bitmap. */
const MAX_PIXELS = 33_554_432;

/** Fields each series type needs, besides `type`. */
const REQUIRED_FIELDS: Record<SeriesType, readonly string[]> = {
  line: ['data'],
  bar: ['data'],
  band: ['data'],
  candlestick: ['data'],
  histogram: ['data'],
  pie: ['data'],
  radialProgress: ['data'],
  gauge: ['value'],
  heatmap: ['data'],
  depth: ['bids', 'asks'],
  radar: ['axes', 'data'],
  sankey: ['nodes', 'links'],
};

const SERIES_TYPES = Object.keys(REQUIRED_FIELDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkSize(params: { field: string; value: unknown }): void {
  const { field, value } = params;
  if (value === undefined) return;

  const valid = typeof value === 'number' && Number.isInteger(value) && value >= MIN_SIZE && value <= MAX_SIZE;
  if (!valid) throw new RenderSpecError(`${field}: expected an integer from ${MIN_SIZE} to ${MAX_SIZE}, got ${value}.`);
}

/**
 * Check the shape a spec from JSON can get wrong. Types check the rest at
 * compile time; a field of the wrong type inside series options reaches the
 * chart as is.
 */
export function validateSpec(spec: ChartSpec, options: RenderOptions): void {
  if (!isRecord(spec)) throw new RenderSpecError('spec: expected an object.');

  checkSize({ field: 'width', value: spec.width });
  checkSize({ field: 'height', value: spec.height });

  const format = options.format ?? 'png';
  if (format !== 'png' && format !== 'svg') {
    throw new RenderSpecError(`format: expected "png" or "svg", got "${format}".`);
  }

  const given = options.pixelRatio;
  const givenValid = given === undefined || (typeof given === 'number' && given > 0 && given <= MAX_PIXEL_RATIO);
  if (!givenValid) throw new RenderSpecError(`pixelRatio: expected a number above 0, up to ${MAX_PIXEL_RATIO}.`);

  // The ratio the render will use, default included, so the cap holds for an omitted ratio too.
  const ratio = resolvePixelRatio(options);
  const pixels = (spec.width ?? DEFAULT_WIDTH) * (spec.height ?? DEFAULT_HEIGHT) * ratio * ratio;
  if (format === 'png' && pixels > MAX_PIXELS) {
    throw new RenderSpecError(`width × height × pixelRatio²: ${pixels} px is above the limit of ${MAX_PIXELS}.`);
  }

  if (!Array.isArray(spec.series) || spec.series.length === 0) {
    throw new RenderSpecError('series: expected an array with at least one series.');
  }

  spec.series.forEach((series: unknown, i) => {
    validateSeries({ series, path: `series[${i}]` });
  });
}

/** Device pixels per CSS px. An SVG is in CSS px. */
export function resolvePixelRatio(options: RenderOptions): number {
  if (options.format === 'svg') return 1;

  return options.pixelRatio ?? DEFAULT_PIXEL_RATIO;
}

function validateSeries(params: { series: unknown; path: string }): void {
  const { series, path } = params;
  if (!isRecord(series)) throw new RenderSpecError(`${path}: expected an object.`);

  const type = series.type;
  if (typeof type !== 'string' || !SERIES_TYPES.includes(type)) {
    throw new RenderSpecError(`${path}.type: expected one of ${SERIES_TYPES.join(', ')}, got ${JSON.stringify(type)}.`);
  }

  for (const field of REQUIRED_FIELDS[type as SeriesType]) {
    if (series[field] === undefined) throw new RenderSpecError(`${path}.${field}: required for a ${type} series.`);
  }

  if (type === 'gauge' && !Number.isFinite(series.value)) {
    throw new RenderSpecError(`${path}.value: expected a finite number.`);
  }

  if (series.options !== undefined && !isRecord(series.options)) {
    throw new RenderSpecError(`${path}.options: expected an object.`);
  }
}

import { type Canvas, type SKRSContext2D, SvgExportFlag, createCanvas } from '@napi-rs/canvas';
import type { ChartDescription, ChartInstance, ChartSurface, ChartTheme } from '@wick-charts/core';

import { buildChart, settle } from './build';
import { RenderSpecError } from './errors';
import { registerBundledFonts } from './fonts';
import { normalizeSpec } from './normalize';
import { paintAxisLabels } from './paint/axes';
import {
  type LegendEntry,
  type LegendLayout,
  layoutLegend,
  legendEntries,
  measureHeader,
  paintBackground,
  paintLegend,
  paintTitle,
} from './paint/chrome';
import type { ChartSpec, LegendSpec, TitleSpec } from './spec';
import { resolveTheme } from './themes';
import { DEFAULT_HEIGHT, DEFAULT_WIDTH, resolvePixelRatio, validateSpec } from './validate';

export type RenderFormat = 'png' | 'svg';

export interface RenderOptions {
  /** Default: `'png'`. */
  format?: RenderFormat;
  /** Device px per CSS px of a PNG. Default: `2`. An SVG has no pixels and ignores it. */
  pixelRatio?: number;
}

export interface RenderResult {
  /** PNG bytes, or SVG text as UTF-8 bytes. */
  data: Buffer;
  mimeType: 'image/png' | 'image/svg+xml';
  /** Image size in CSS px. A PNG has `pixelRatio` times as many pixels. */
  width: number;
  height: number;
  /** What the chart shows, and likely mistakes in the spec: `chart.describe()` of the rendered chart. */
  description: ChartDescription;
}

/** The smallest plot a legend can leave, in CSS px. */
const MIN_PLOT_SIZE = 32;

interface Layout {
  width: number;
  height: number;
  header: number;
  title: TitleSpec | null;
  legend: { position: NonNullable<LegendSpec['position']>; layout: LegendLayout } | null;
  /** The part of the image the chart itself fills, CSS px, from the top-left corner. */
  chart: { width: number; height: number };
}

/**
 * Render a chart to a PNG or an SVG, with no browser. The spec takes the
 * props of `ChartContainer` and of its children, so the image matches the
 * chart the app draws from the same data.
 *
 * @throws {RenderSpecError} when the spec has a field the renderer cannot use.
 */
export async function renderChart(input: ChartSpec, options: RenderOptions = {}): Promise<RenderResult> {
  validateSpec(input, options);
  registerBundledFonts();

  const spec = normalizeSpec(input);
  const format = options.format ?? 'png';
  const ratio = resolvePixelRatio(options);
  const theme = resolveTheme(spec.theme);
  const layout = planLayout({ spec, theme });

  const output = createOutput({ format, layout, ratio });
  output.ctx.save();
  output.ctx.scale(ratio, ratio);
  paintBackground({
    ctx: output.ctx,
    theme,
    width: layout.width,
    height: layout.height,
    color: spec.background,
    gradient: spec.gradient ?? false,
  });
  output.ctx.restore();

  const chart = drawChart({ spec, theme, layout, ratio, output });

  output.ctx.save();
  output.ctx.scale(ratio, ratio);
  paintChrome({ ctx: output.ctx, chart, spec, theme, layout });
  output.ctx.restore();

  const description = chart.describe();
  chart.destroy();

  return {
    data: await encode({ format, canvas: output.canvas }),
    mimeType: format === 'svg' ? 'image/svg+xml' : 'image/png',
    width: layout.width,
    height: layout.height,
    description,
  };
}

interface Output {
  canvas: Canvas;
  ctx: SKRSContext2D;
  svg: boolean;
}

function createOutput(params: { format: RenderFormat; layout: Layout; ratio: number }): Output {
  const { format, layout, ratio } = params;

  // Text becomes paths: the SVG then looks the same where the viewer lacks the font.
  const canvas =
    format === 'svg'
      ? (createCanvas(layout.width, layout.height, SvgExportFlag.ConvertTextToPaths) as unknown as Canvas)
      : createCanvas(Math.round(layout.width * ratio), Math.round(layout.height * ratio));

  return { canvas, ctx: canvas.getContext('2d'), svg: format === 'svg' };
}

/**
 * The chart paints onto a transparent layer of its own, as on the page: its
 * edge fades erase what is under them, and the background must survive. An
 * SVG cannot erase, so there the chart paints straight onto the output.
 */
function drawChart(params: {
  spec: ChartSpec;
  theme: ChartTheme;
  layout: Layout;
  ratio: number;
  output: Output;
}): ChartInstance {
  const { spec, theme, layout, ratio, output } = params;
  const size = { width: layout.chart.width, height: layout.chart.height, pixelRatio: ratio };

  if (output.svg) {
    const surface = asSurface({ ...size, ctx: output.ctx });
    const chart = buildChart({ spec, theme, surface, headerHeight: layout.header, fades: false });
    settle(chart);

    return chart;
  }

  const layer = createCanvas(Math.round(size.width * ratio), Math.round(size.height * ratio));
  const surface = asSurface({ ...size, ctx: layer.getContext('2d') });
  const chart = buildChart({ spec, theme, surface, headerHeight: layout.header, fades: true });
  settle(chart);
  output.ctx.drawImage(layer, 0, 0);

  return chart;
}

/** The napi-rs context implements the 2D canvas API the chart draws with, under its own type. */
function asSurface(params: { width: number; height: number; pixelRatio: number; ctx: SKRSContext2D }): ChartSurface {
  const { ctx, ...size } = params;

  return { ...size, context: ctx as unknown as CanvasRenderingContext2D };
}

function paintChrome(params: {
  ctx: SKRSContext2D;
  chart: ChartInstance;
  spec: ChartSpec;
  theme: ChartTheme;
  layout: Layout;
}): void {
  const { ctx, chart, spec, theme, layout } = params;

  paintAxisLabels({ ctx, chart, x: spec.xAxis !== false, y: spec.yAxis !== false });
  if (layout.title !== null) paintTitle({ ctx, title: layout.title, theme });

  const legend = layout.legend;
  if (legend === null) return;

  const origin = legend.position === 'right' ? { x: layout.chart.width, y: 0 } : { x: 0, y: layout.chart.height };
  paintLegend({ ctx, layout: legend.layout, origin, theme });
}

/**
 * Split the image between the chart and the legend, and measure the header.
 * The legend lists what the chart's series resolve to, so a throwaway chart
 * builds them first.
 */
function planLayout(params: { spec: ChartSpec; theme: ChartTheme }): Layout {
  const { spec, theme } = params;
  const width = spec.width ?? DEFAULT_WIDTH;
  const height = spec.height ?? DEFAULT_HEIGHT;
  const measure = createCanvas(1, 1).getContext('2d');

  const title = resolveTitle(spec.title);
  const header = title === null ? 0 : measureHeader({ ctx: measure, title, theme });

  const legendSpec = resolveLegend(spec.legend);
  if (legendSpec === null) return { width, height, header, title, legend: null, chart: { width, height } };

  const position = legendSpec.position ?? 'bottom';
  const entries = legendSpec.items?.map((item) => ({ ...item, disabled: false })) ?? probeLegend({ spec, theme });
  const legendLayout = layoutLegend({ ctx: measure, entries, position, width, theme });
  const legend = entries.length > 0 ? { position, layout: legendLayout } : null;

  const chart =
    legend === null
      ? { width, height }
      : position === 'right'
        ? { width: width - legendLayout.size, height }
        : { width, height: height - legendLayout.size };

  const plotFits = chart.width >= MIN_PLOT_SIZE && chart.height >= MIN_PLOT_SIZE;
  if (!plotFits) {
    throw new RenderSpecError(
      `legend: it leaves ${chart.width}×${chart.height} px for the plot in a ${width}×${height} image. ` +
        'Make the image larger, use fewer items, or set legend: false.',
    );
  }

  return { width, height, header, title, legend, chart };
}

function probeLegend(params: { spec: ChartSpec; theme: ChartTheme }): LegendEntry[] {
  const ctx = createCanvas(1, 1).getContext('2d');
  const surface = asSurface({ width: 1, height: 1, pixelRatio: 1, ctx });
  const chart = buildChart({ ...params, surface, headerHeight: 0, fades: false });
  const entries = legendEntries(chart);
  chart.destroy();

  return entries;
}

function resolveTitle(title: ChartSpec['title']): TitleSpec | null {
  const resolved = typeof title === 'string' ? { text: title } : (title ?? null);
  if (resolved === null || (!resolved.text && !resolved.sub)) return null;

  return resolved;
}

function resolveLegend(legend: ChartSpec['legend']): LegendSpec | null {
  if (legend === undefined || legend === false) return null;

  return legend === true ? {} : legend;
}

async function encode(params: { format: RenderFormat; canvas: Canvas }): Promise<Buffer> {
  const { format, canvas } = params;
  if (format === 'png') return canvas.encode('png');

  return (canvas as unknown as { getContent(): Buffer }).getContent();
}

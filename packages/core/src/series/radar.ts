import { DEFAULT_RADAR_ENTRY, DEFAULT_RADAR_UPDATE } from '../animation/config';
import { easeInOutCubic, easeOutCubic } from '../animation/easing';
import { prefersReducedMotion } from '../animation/reduced-motion';
import type { ChartTheme } from '../theme/types';
import type { RadarData, RadarLayer, RadarSeriesOptions } from '../types';
import { hexToRgba, isLightColor } from '../utils/color';
import { formatLabelNumber } from '../utils/format';
import { clamp, lerp } from '../utils/math';
import { warnDataOnce } from '../utils/poisoned-data-reporter';
import type { SeriesDefinition } from './definition';
import { type RadarIntroDirectives, type RadarIntroFn, radarGrowIntro } from './radar-intro';
import { ValueTween, bearingToCanvas, drawingBox } from './radial';
import type { HoverInfo, RadarSeriesRenderer, SeriesRenderContext } from './types';

interface ResolvedRadarOptions {
  min: number;
  max: number | undefined;
  rings: number;
  gridShape: 'polygon' | 'circle';
  startAngle: number;
  fillOpacity: number;
  lineWidth: number;
  dotRadius: number;
  axisLabels: boolean;
  ringLabels: boolean;
  hoverValues: boolean;
  glow: boolean;
  format: (value: number) => string;
  colors?: string[];
  gridColor?: string;
  labelColor?: string;
  introAnimation: RadarIntroFn;
  entryMs: number;
  updateMs: number;
}

const DEFAULT_OPTIONS: ResolvedRadarOptions = {
  min: 0,
  max: undefined,
  rings: 4,
  gridShape: 'polygon',
  startAngle: 0,
  fillOpacity: 0.22,
  lineWidth: 2,
  dotRadius: 3,
  axisLabels: true,
  ringLabels: true,
  hoverValues: true,
  glow: true,
  format: formatLabelNumber,
  introAnimation: radarGrowIntro(),
  entryMs: DEFAULT_RADAR_ENTRY,
  updateMs: DEFAULT_RADAR_UPDATE,
};

/** Opacity share a polygon keeps while another one is hovered. */
const DIMMED = 0.16;
/** Gap between the outer ring and an axis name, CSS px. */
const LABEL_GAP = 10;
/** How far off a polygon's outline the pointer still hovers it, CSS px. */
const EDGE_REACH = 6;
/** An axis name is cut with an ellipsis past this share of the box width. */
const MAX_LABEL_SHARE = 0.32;

// Entry timeline, as shares of `entryMs`.
const SPOKE_SPAN = 0.4;
const RING_STAGGER = 0.03;
/** Width of the scan beam's fading trail, radians. */
const BEAM_TRAIL = 0.9;
/** Longest frame the entry clock counts, ms: a stall (mount, layout) pauses the entry instead of jumping it. */
const MAX_ENTRY_STEP = 34;

interface LayerState {
  label: string;
  color: string | undefined;
  /** Index in the data the layer last arrived at — picks its palette color. */
  colorIndex: number;
  values: (number | null)[];
  /** Per axis, the vertex radius as a share of the web radius. */
  fractions: ValueTween[];
  /** 1 shown, 0 collapsed into the center: the legend toggle, a new and a removed layer. */
  presence: ValueTween;
  /** 1 normal, 0 dimmed while another layer is hovered. */
  focus: ValueTween;
  /** 1 while this layer is hovered. */
  lift: ValueTween;
  visible: boolean;
  exiting: boolean;
}

interface Point {
  x: number;
  y: number;
}

/** One polygon as drawn this frame. */
interface DrawnLayer {
  points: Point[];
  layer: LayerState;
  color: string;
  /** Intro opacity of the polygon and of its dots. */
  alpha: number;
  dots: number;
  /** Share of the turn drawn from the first axis; 1 draws the whole polygon. */
  reveal: number;
}

interface Geometry {
  cx: number;
  cy: number;
  radius: number;
  pixelRatio: number;
  /** Drawn vertices of each shown layer, keyed by the layer so a reorder in `setData` keeps them right. */
  shapes: { layer: LayerState; points: Point[] }[];
}

interface LabelBox {
  text: string;
  width: number;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
}

/** Merge `incoming` over `base`; a key set to `undefined` goes back to its default. */
function normalize(base: ResolvedRadarOptions, incoming: Partial<RadarSeriesOptions>): ResolvedRadarOptions {
  const merged = { ...base, ...incoming };
  const rings = Math.round(merged.rings ?? DEFAULT_OPTIONS.rings);

  return {
    min: merged.min ?? DEFAULT_OPTIONS.min,
    max: merged.max,
    rings: Number.isFinite(rings) ? Math.max(1, rings) : DEFAULT_OPTIONS.rings,
    gridShape: merged.gridShape ?? DEFAULT_OPTIONS.gridShape,
    startAngle: merged.startAngle ?? DEFAULT_OPTIONS.startAngle,
    fillOpacity: clamp(merged.fillOpacity ?? DEFAULT_OPTIONS.fillOpacity, 0, 1),
    lineWidth: Math.max(0, merged.lineWidth ?? DEFAULT_OPTIONS.lineWidth),
    dotRadius: Math.max(0, merged.dotRadius ?? DEFAULT_OPTIONS.dotRadius),
    axisLabels: merged.axisLabels ?? DEFAULT_OPTIONS.axisLabels,
    ringLabels: merged.ringLabels ?? DEFAULT_OPTIONS.ringLabels,
    hoverValues: merged.hoverValues ?? DEFAULT_OPTIONS.hoverValues,
    glow: merged.glow ?? DEFAULT_OPTIONS.glow,
    format: merged.format ?? DEFAULT_OPTIONS.format,
    colors: merged.colors,
    gridColor: merged.gridColor,
    labelColor: merged.labelColor,
    introAnimation: merged.introAnimation ?? DEFAULT_OPTIONS.introAnimation,
    entryMs: Math.max(0, merged.entryMs ?? DEFAULT_OPTIONS.entryMs),
    updateMs: Math.max(0, merged.updateMs ?? DEFAULT_OPTIONS.updateMs),
  };
}

/** A round outer value at or above `top`, so each of `rings` steps from `min` is round too. */
export function niceRadarMax(args: { min: number; top: number; rings: number }): number {
  const { min, top, rings } = args;
  const span = top - min;
  if (!(span > 0)) return min + rings;

  const raw = span / rings;
  const magnitude = 10 ** Math.floor(Math.log10(raw));

  for (const multiple of [1, 2, 2.5, 5, 10]) {
    const step = multiple * magnitude;
    if (step >= raw * (1 - 1e-9)) return min + step * rings;
  }

  return min + 10 * magnitude * rings;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Whether `point` lies inside the closed `polygon` (even-odd rule). */
function containsPoint(polygon: Point[], point: Point): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = a.y > point.y !== b.y > point.y;
    if (!crosses) continue;

    const xAtY = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < xAtY) inside = !inside;
  }

  return inside;
}

function polygonArea(polygon: Point[]): number {
  let doubled = 0;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    doubled += polygon[j].x * polygon[i].y - polygon[i].x * polygon[j].y;
  }

  return Math.abs(doubled) / 2;
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0 ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1) : 0;

  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function distanceToOutline(polygon: Point[], point: Point): number {
  let nearest = Number.POSITIVE_INFINITY;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    nearest = Math.min(nearest, distanceToSegment(point, polygon[j], polygon[i]));
  }

  return nearest;
}

/** `text` cut with an ellipsis to fit `maxWidth` in the context's current font. */
function fitText(context: CanvasRenderingContext2D, args: { text: string; maxWidth: number }): string {
  const { text, maxWidth } = args;
  if (context.measureText(text).width <= maxWidth) return text;

  let end = text.length;
  while (end > 1 && context.measureText(`${text.slice(0, end)}…`).width > maxWidth) {
    end--;
  }

  return `${text.slice(0, end)}…`;
}

/** Translucent `color`, or `null` when the color can't be parsed (named, hsl()). */
function withAlpha(color: string, alpha: number): string | null {
  const result = hexToRgba(color, alpha);

  return result === color ? null : result;
}

export class RadarRenderer implements RadarSeriesRenderer {
  readonly kind = 'radar' as const;

  #options: ResolvedRadarOptions;
  #theme: ChartTheme;
  #paletteIndex: number;
  #axes: string[] = [];
  /** Current layers in data order, then the layers still collapsing out. */
  #layers: LayerState[] = [];
  #hover = -1;
  #alpha = new ValueTween(1);
  /** Time the first-data growth has played, ms; stalled frames count as {@link MAX_ENTRY_STEP}. */
  #entryElapsed = 0;
  /** Time of the entry's last frame; `null` until its first one. */
  #entryLast: number | null = null;
  #entryActive = false;
  #geometry: Geometry | null = null;
  #dataListeners: Array<() => void> = [];

  constructor(args: { options?: Partial<RadarSeriesOptions>; theme: ChartTheme; paletteIndex?: number }) {
    this.#options = normalize(DEFAULT_OPTIONS, args.options ?? {});
    this.#theme = args.theme;
    this.#paletteIndex = args.paletteIndex ?? 0;
  }

  // --- Data ------------------------------------------------------------------

  getData(): RadarData {
    return {
      axes: this.#axes.slice(),
      series: this.#current().map((layer) => ({ label: layer.label, data: layer.values.slice(), color: layer.color })),
    };
  }

  /**
   * Replace the axes and the polygons. Layers keep their label across calls: a kept one
   * morphs to its new values, a new one grows from the center, a dropped one collapses
   * into it. New axes replay the entry.
   */
  setData(data: unknown): void {
    const input = (data ?? {}) as Partial<RadarData>;
    const axes = Array.isArray(input.axes) ? input.axes.map((axis) => String(axis)) : [];
    const rows = Array.isArray(input.series) ? input.series : [];
    this.#reportRaggedRows({ axes, rows });

    const axesChanged = axes.length !== this.#axes.length || axes.some((axis, i) => axis !== this.#axes[i]);
    const fresh = axesChanged || this.#current().length === 0;
    const now = performance.now();

    if (fresh) {
      this.#layers = rows.map((row, index) => this.#createLayer({ row, index, axisCount: axes.length }));
      this.#axes = axes;
      this.#hover = -1;
      this.#entryElapsed = 0;
      this.#entryLast = null;
      this.#entryActive = rows.length > 0 && this.#options.entryMs > 0 && !prefersReducedMotion();
    } else {
      this.#axes = axes;
      this.#mergeLayers({ rows, now });
    }

    // Fresh layers start at their values: the entry grows them, or nothing does.
    this.#retargetFractions({ now, snap: fresh });
    this.#notify();
  }

  #reportRaggedRows(args: { axes: string[]; rows: RadarLayer[] }): void {
    const ragged = args.rows.find((row) => !Array.isArray(row?.data) || row.data.length !== args.axes.length);
    if (ragged === undefined) return;

    warnDataOnce({
      token: this,
      topic: 'radar-ragged',
      message:
        `radar: series "${String(ragged?.label)}" has ${Array.isArray(ragged?.data) ? ragged.data.length : 0} ` +
        `value(s) for ${args.axes.length} axes. A missing value draws at the center; extra values are dropped.`,
    });
  }

  #createLayer(args: { row: RadarLayer; index: number; axisCount: number }): LayerState {
    const { row, index, axisCount } = args;

    return {
      label: String(row?.label ?? ''),
      color: row?.color,
      colorIndex: index,
      values: this.#readValues({ row, axisCount }),
      fractions: Array.from({ length: axisCount }, () => new ValueTween(0)),
      presence: new ValueTween(1),
      focus: new ValueTween(1),
      lift: new ValueTween(0),
      visible: true,
      exiting: false,
    };
  }

  #readValues(args: { row: RadarLayer; axisCount: number }): (number | null)[] {
    const raw = Array.isArray(args.row?.data) ? args.row.data : [];

    return Array.from({ length: args.axisCount }, (_, i) => finiteOrNull(raw[i]));
  }

  /** Match the new rows to the layers on screen by label. */
  #mergeLayers(args: { rows: RadarLayer[]; now: number }): void {
    const { rows, now } = args;
    const axisCount = this.#axes.length;
    const pool = new Map<string, LayerState>();
    for (const layer of this.#layers) {
      if (!layer.exiting && !pool.has(layer.label)) pool.set(layer.label, layer);
    }

    const next = rows.map((row, index) => {
      const label = String(row?.label ?? '');
      const kept = pool.get(label);

      if (kept === undefined) {
        const layer = this.#createLayer({ row, index, axisCount });
        layer.presence = new ValueTween(0);
        layer.presence.retarget({ to: 1, durationMs: this.#options.updateMs, now });

        return layer;
      }

      pool.delete(label);
      kept.color = row?.color;
      kept.colorIndex = index;
      kept.values = this.#readValues({ row, axisCount });

      return kept;
    });

    const exiting = [...pool.values(), ...this.#layers.filter((layer) => layer.exiting)];
    for (const layer of exiting) {
      if (layer.exiting) continue;

      layer.exiting = true;
      layer.presence.retarget({ to: 0, durationMs: this.#options.updateMs, now });
    }

    const hovered = this.#current()[this.#hover];
    this.#layers = [...next, ...exiting];
    this.#hover = hovered === undefined ? -1 : next.indexOf(hovered);
    this.#syncFocus(now);
  }

  /** Point every vertex at its value on the current scale; `snap` skips the glide. */
  #retargetFractions(args: { now: number; snap: boolean }): void {
    const { now, snap } = args;
    const { min } = this.#options;
    const max = this.#resolvedMax();
    const span = max - min;

    for (const layer of this.#layers) {
      if (layer.exiting) continue;

      layer.fractions = layer.values.map((value, i) => {
        const tween = layer.fractions[i] ?? new ValueTween(0);
        const fraction = value === null || !(span > 0) ? 0 : clamp((value - min) / span, 0, 1);
        if (tween.target === fraction) return tween;

        tween.retarget({ to: fraction, durationMs: this.#options.updateMs, now, easing: easeInOutCubic });
        if (snap) tween.settle();

        return tween;
      });
    }
  }

  #notify(): void {
    for (const listener of this.#dataListeners) {
      listener();
    }
  }

  onDataChanged(listener: () => void): () => void {
    this.#dataListeners.push(listener);

    return () => {
      const index = this.#dataListeners.indexOf(listener);
      if (index >= 0) this.#dataListeners.splice(index, 1);
    };
  }

  /** The value of the outer ring: `max`, or a round number above every value. */
  #resolvedMax(): number {
    const { min, max, rings } = this.#options;
    if (max !== undefined && max > min) return max;

    let top = min;
    for (const layer of this.#layers) {
      if (layer.exiting) continue;

      for (const value of layer.values) {
        if (value !== null && value > top) top = value;
      }
    }

    return niceRadarMax({ min, top, rings });
  }

  // --- Options & theme -------------------------------------------------------

  updateOptions(options: Partial<RadarSeriesOptions>): void {
    const prev = this.#options;
    this.#options = normalize(prev, options ?? {});

    const scaleMoved =
      prev.min !== this.#options.min || prev.max !== this.#options.max || prev.rings !== this.#options.rings;
    if (scaleMoved) this.#retargetFractions({ now: performance.now(), snap: false });

    const updatesTurnedOff = prev.updateMs > 0 && this.#options.updateMs === 0;
    if (updatesTurnedOff) this.#settleAll();
  }

  applyTheme(theme: ChartTheme): void {
    this.#theme = theme;
  }

  // --- Layers ----------------------------------------------------------------

  /** Layers of the current data, without the ones collapsing out. */
  #current(): LayerState[] {
    return this.#layers.filter((layer) => !layer.exiting);
  }

  getLayerCount(): number {
    return Math.max(1, this.#current().length);
  }

  setLayerVisible(index: number, visible: boolean): void {
    const layer = this.#current()[index];
    if (layer === undefined) return;

    layer.visible = visible;
    if (!visible && this.#hover === index) this.setHoverIndex(-1);
  }

  isLayerVisible(index: number): boolean {
    return this.#current()[index]?.visible ?? true;
  }

  setLayerAlpha(index: number, target: number, durationMs: number): void {
    const layer = this.#current()[index];
    if (layer === undefined) return;

    layer.presence.retarget({ to: clamp(target, 0, 1), durationMs, now: performance.now() });
  }

  getLayerAlpha(index: number): number {
    return this.#current()[index]?.presence.valueAt(performance.now()) ?? 1;
  }

  setAlpha(target: number, durationMs: number): void {
    this.#alpha.retarget({ to: clamp(target, 0, 1), durationMs, now: performance.now() });
  }

  getAlpha(): number {
    return this.#alpha.valueAt(performance.now());
  }

  getLayerColors(): string[] {
    const layers = this.#current();
    if (layers.length === 0) return [this.#paletteColor(0)];

    return layers.map((layer) => this.#layerColor(layer));
  }

  getLayerLabel(index: number): string | undefined {
    return this.#current()[index]?.label;
  }

  #paletteColor(index: number): string {
    const own = this.#options.colors?.[index];
    if (own !== undefined) return own;

    const palette = this.#theme.seriesColors;

    return palette[(this.#paletteIndex + index) % palette.length] ?? this.#theme.line.color;
  }

  #layerColor(layer: LayerState): string {
    return layer.color ?? this.#paletteColor(layer.colorIndex);
  }

  // --- Hover -----------------------------------------------------------------

  hitTest(bx: number, by: number): number {
    const geometry = this.#geometry;
    if (geometry === null) return -1;

    const point = { x: bx, y: by };
    const reach = EDGE_REACH * geometry.pixelRatio;
    let best = -1;
    let bestArea = Number.POSITIVE_INFINITY;
    let nearest = -1;
    let nearestDistance = reach;

    const current = this.#current();

    for (const shape of geometry.shapes) {
      const index = current.indexOf(shape.layer);
      const polygon = shape.points;
      if (index < 0 || !shape.layer.visible || polygon.length < 3) continue;

      if (containsPoint(polygon, point)) {
        // The smallest polygon under the pointer wins: a larger one around it is still reachable at its own edge.
        const area = polygonArea(polygon);
        if (area < bestArea) {
          best = index;
          bestArea = area;
        }

        continue;
      }

      const distance = distanceToOutline(polygon, point);
      if (distance <= nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    }

    // An outline within reach beats the area of a polygon behind it.
    if (nearest >= 0) return nearest;

    return best;
  }

  setHoverIndex(index: number): boolean {
    if (index === this.#hover) return false;

    this.#hover = index;
    this.#syncFocus(performance.now());

    return true;
  }

  #syncFocus(now: number): void {
    const durationMs = this.#options.updateMs * 0.5;

    this.#current().forEach((layer, index) => {
      const hovered = index === this.#hover;
      const focus = this.#hover < 0 || hovered ? 1 : 0;
      const lift = hovered ? 1 : 0;
      if (layer.focus.target !== focus) layer.focus.retarget({ to: focus, durationMs, now });
      if (layer.lift.target !== lift) layer.lift.retarget({ to: lift, durationMs, now });
    });
  }

  /**
   * The hovered polygon: its label and color, every axis value in `rows`, and the
   * mean of its values in `value`, with that mean's share of the scale in `percent`.
   */
  getHoverInfo(_theme: ChartTheme): HoverInfo | null {
    const layer = this.#current()[this.#hover];
    if (layer === undefined) return null;

    const readings = layer.values.filter((value): value is number => value !== null);
    const mean = readings.length > 0 ? readings.reduce((sum, value) => sum + value, 0) / readings.length : 0;
    const { min } = this.#options;
    const span = this.#resolvedMax() - min;

    return {
      label: layer.label,
      value: mean,
      percent: span > 0 ? ((mean - min) / span) * 100 : 0,
      color: this.#layerColor(layer),
      rows: this.#axes.map((axis, i) => {
        const value = layer.values[i] ?? null;
        const percent = value === null || !(span > 0) ? null : clamp(((value - min) / span) * 100, 0, 100);

        return { label: axis, value, percent };
      }),
    };
  }

  // --- Animation -------------------------------------------------------------

  get needsAnimation(): boolean {
    if (this.#entryActive || this.#alpha.active) return true;

    return this.#layers.some(
      (layer) =>
        layer.presence.active ||
        layer.focus.active ||
        layer.lift.active ||
        layer.fractions.some((tween) => tween.active),
    );
  }

  cancelEntranceAnimations(): void {
    // Pan and zoom don't apply to a radar; the entry plays out.
  }

  #settleAll(): void {
    this.#entryActive = false;
    for (const layer of this.#layers) {
      layer.presence.settle();
      layer.focus.settle();
      layer.lift.settle();
      for (const tween of layer.fractions) {
        tween.settle();
      }
    }

    this.#layers = this.#current();
  }

  dispose(): void {
    this.#dataListeners = [];
    this.#layers = [];
    this.#axes = [];
    this.#geometry = null;
    this.#entryActive = false;
  }

  /** Linear share of the entry played at `now`, `1` once it has finished. */
  #entryProgress(now: number): number {
    if (!this.#entryActive) return 1;

    if (this.#entryLast !== null) this.#entryElapsed += clamp(now - this.#entryLast, 0, MAX_ENTRY_STEP);
    this.#entryLast = now;
    const progress = clamp(this.#entryElapsed / this.#options.entryMs, 0, 1);
    if (progress >= 1) this.#entryActive = false;

    return progress;
  }

  // --- Render ----------------------------------------------------------------

  render(ctx: SeriesRenderContext): void {
    const { scope, theme, padding } = ctx;
    const { context, bitmapSize, horizontalPixelRatio: pr, verticalPixelRatio: vpr } = scope;
    this.#theme = theme;

    const now = performance.now();
    this.#tick(now);

    const axisCount = this.#axes.length;
    if (axisCount === 0) {
      this.#geometry = null;
      this.#entryActive = false;

      return;
    }

    const box = drawingBox({
      bitmapWidth: bitmapSize.width,
      bitmapHeight: bitmapSize.height,
      padding: { top: padding.top * vpr, bottom: padding.bottom * vpr },
      pixelRatio: pr,
    });

    const { startAngle, gridShape } = this.#options;
    const angles = this.#axes.map((_, i) => bearingToCanvas(startAngle + (360 * i) / axisCount));
    const fontSize = theme.typography.fontSize * pr;
    const labelFont = `500 ${fontSize}px ${theme.typography.fontFamily}`;
    const labels = this.#measureLabels({ context, angles, font: labelFont, maxWidth: box.width * MAX_LABEL_SHARE });
    const lineHeight = fontSize * 1.25;
    const gap = LABEL_GAP * pr;

    const layout = solveLayout({
      box,
      angles,
      labels,
      lineHeight,
      gap,
      circle: gridShape === 'circle',
    });
    if (layout.radius <= 0) {
      this.#geometry = null;

      return;
    }

    const { cx, cy, radius } = layout;
    const entry = this.#entryProgress(now);
    const alpha = this.#alpha.valueAt(now);
    const collapse = easeOutCubic(alpha);
    const baseAlpha = context.globalAlpha;

    this.#drawGrid({ context, cx, cy, radius, angles, entry, pr });

    const polygons = this.#drawLayers({ context, cx, cy, radius: radius * collapse, angles, entry, pr, now });

    if (this.#options.axisLabels) {
      context.globalAlpha = baseAlpha;
      this.#drawAxisLabels({ context, cx, cy, radius, angles, labels, gap, lineHeight, font: labelFont, entry });
    }

    if (this.#options.ringLabels) {
      context.globalAlpha = baseAlpha;
      this.#drawRingLabels({ context, cx, cy, radius, angle: angles[0], entry, pr, now });
    }

    if (this.#options.hoverValues) {
      context.globalAlpha = baseAlpha;
      this.#drawHoverValues({ context, cx, cy, polygons, pr, now });
    }

    context.globalAlpha = baseAlpha;
    const shapes = polygons.filter((drawn): drawn is DrawnLayer => drawn !== null);
    this.#geometry = { cx, cy, radius, pixelRatio: pr, shapes };
  }

  /** Advance the tweens and drop the layers that finished collapsing out. */
  #tick(now: number): void {
    this.#alpha.tick(now);

    for (const layer of this.#layers) {
      layer.presence.tick(now);
      layer.focus.tick(now);
      layer.lift.tick(now);
      for (const tween of layer.fractions) {
        tween.tick(now);
      }
    }

    this.#layers = this.#layers.filter((layer) => !layer.exiting || layer.presence.active);
  }

  #measureLabels(args: {
    context: CanvasRenderingContext2D;
    angles: number[];
    font: string;
    maxWidth: number;
  }): LabelBox[] {
    const { context, angles, font, maxWidth } = args;
    if (!this.#options.axisLabels)
      return angles.map(() => ({ text: '', width: 0, align: 'center', baseline: 'middle' }));

    context.font = font;

    return this.#axes.map((axis, i) => {
      const text = fitText(context, { text: axis, maxWidth });
      const cos = Math.cos(angles[i]);
      const sin = Math.sin(angles[i]);
      const align: CanvasTextAlign = Math.abs(cos) < 0.2 ? 'center' : cos > 0 ? 'left' : 'right';
      const baseline: CanvasTextBaseline = Math.abs(sin) < 0.2 ? 'middle' : sin > 0 ? 'top' : 'bottom';

      return { text, width: context.measureText(text).width, align, baseline };
    });
  }

  #drawGrid(args: {
    context: CanvasRenderingContext2D;
    cx: number;
    cy: number;
    radius: number;
    angles: number[];
    entry: number;
    pr: number;
  }): void {
    const { context, cx, cy, radius, angles, entry, pr } = args;
    const { rings, gridShape } = this.#options;
    const color = this.#options.gridColor ?? this.#theme.grid.color;
    const baseAlpha = context.globalAlpha;

    // Adds to the current path, so a band can trace two rings and fill between them.
    const traceRing = (r: number) => {
      if (gridShape === 'circle') {
        context.moveTo(cx + r, cy);
        context.arc(cx, cy, r, 0, Math.PI * 2);

        return;
      }

      angles.forEach((angle, i) => {
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
    };
    const ringGrowth = (k: number) => easeOutCubic(clamp((entry - RING_STAGGER * (k - 1)) / SPOKE_SPAN, 0, 1));

    // Every other band gets a faint wash, so the rings read as levels.
    context.fillStyle = color;
    for (let k = rings; k >= 1; k -= 2) {
      const grow = ringGrowth(k);
      if (grow <= 0) continue;

      context.globalAlpha = baseAlpha * 0.35 * grow;
      context.beginPath();
      traceRing((radius * k * grow) / rings);
      traceRing((radius * (k - 1) * grow) / rings);
      context.fill('evenodd');
    }

    context.strokeStyle = color;
    context.lineWidth = Math.max(1, Math.round(pr));
    for (let k = 1; k <= rings; k++) {
      const grow = ringGrowth(k);
      if (grow <= 0) continue;

      context.globalAlpha = baseAlpha * grow;
      context.beginPath();
      traceRing((radius * k * grow) / rings);
      context.stroke();
    }

    const spoke = easeOutCubic(clamp(entry / SPOKE_SPAN, 0, 1));
    context.globalAlpha = baseAlpha * spoke;
    context.beginPath();
    for (const angle of angles) {
      context.moveTo(cx, cy);
      context.lineTo(cx + radius * spoke * Math.cos(angle), cy + radius * spoke * Math.sin(angle));
    }
    context.stroke();

    context.globalAlpha = baseAlpha;
  }

  /** Draw every layer, the hovered one last; return the drawn vertices of each current layer. */
  #drawLayers(args: {
    context: CanvasRenderingContext2D;
    cx: number;
    cy: number;
    radius: number;
    angles: number[];
    entry: number;
    pr: number;
    now: number;
  }): (DrawnLayer | null)[] {
    const { context, cx, cy, radius, angles, entry, pr, now } = args;
    const current = this.#current();
    const intro = this.#entryActive || entry < 1 ? this.#options.introAnimation : null;

    const drawn = this.#layers.map((layer): DrawnLayer | null => {
      const presence = easeOutCubic(layer.presence.valueAt(now));
      if (presence <= 0.001) return null;

      const fractions = angles.map((_, i) => layer.fractions[i]?.valueAt(now) ?? 0);
      const directives: RadarIntroDirectives =
        intro === null
          ? {}
          : intro({
              progress: entry,
              layer: Math.max(0, current.indexOf(layer)),
              layerCount: current.length,
              axisCount: angles.length,
            });
      const mean = fractions.length > 0 ? fractions.reduce((sum, value) => sum + value, 0) / fractions.length : 0;
      const rotation = directives.rotation ?? 0;

      const points = angles.map((angle, axis) => {
        const fraction = fractions[axis];
        const shown = directives.vertex === undefined ? fraction : directives.vertex({ axis, fraction, mean });
        const r = radius * presence * Math.max(0, shown);

        return { x: cx + r * Math.cos(angle + rotation), y: cy + r * Math.sin(angle + rotation) };
      });

      return {
        points,
        layer,
        color: this.#layerColor(layer),
        alpha: clamp(directives.alpha ?? 1, 0, 1),
        dots: clamp(directives.dots ?? 1, 0, 1),
        reveal: clamp(directives.reveal ?? 1, 0, 1),
      };
    });

    const hovered = current[this.#hover];
    const order = drawn
      .filter((item): item is DrawnLayer => item !== null)
      .sort((a, b) => Number(a.layer === hovered) - Number(b.layer === hovered));

    for (const item of order) {
      this.#drawPolygon({ context, cx, cy, radius, start: angles[0], item, pr, now });
    }

    const beam = Math.min(1, ...order.map((item) => item.reveal));
    if (beam < 1 && order.length > 0) {
      this.#drawBeam({ context, center: { x: cx, y: cy }, radius, start: angles[0], reveal: beam, pr });
    }

    return current.map((layer) => {
      const item = drawn[this.#layers.indexOf(layer)];
      const hidden = !layer.visible || item === null;

      return hidden ? null : item;
    });
  }

  /** The scan beam at the edge of a reveal: a bright spoke with a fading trail behind it. */
  #drawBeam(args: {
    context: CanvasRenderingContext2D;
    center: Point;
    radius: number;
    start: number;
    reveal: number;
    pr: number;
  }): void {
    const { context, radius, start, reveal, pr } = args;
    const { x: cx, y: cy } = args.center;
    if (reveal <= 0) return;

    const edge = start + reveal * Math.PI * 2;
    const trail = Math.min(BEAM_TRAIL, reveal * Math.PI * 2);
    const color = this.#theme.line.color;
    const baseAlpha = context.globalAlpha;
    // The beam fades out over the last stretch, so the reveal ends without a cut.
    const fadeOut = clamp((1 - reveal) / 0.08, 0, 1);
    const steps = 18;

    context.fillStyle = color;
    for (let step = 0; step < steps; step++) {
      const from = edge - (trail * (step + 1)) / steps;
      const to = edge - (trail * step) / steps;
      context.globalAlpha = baseAlpha * fadeOut * 0.28 * (1 - step / steps) ** 2;
      context.beginPath();
      context.moveTo(cx, cy);
      context.arc(cx, cy, radius, from, to);
      context.closePath();
      context.fill();
    }

    context.globalAlpha = baseAlpha * fadeOut;
    context.strokeStyle = color;
    context.lineWidth = Math.max(1, 1.5 * pr);
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(cx + radius * Math.cos(edge), cy + radius * Math.sin(edge));
    context.stroke();
    context.globalAlpha = baseAlpha;
  }

  #drawPolygon(args: {
    context: CanvasRenderingContext2D;
    cx: number;
    cy: number;
    radius: number;
    start: number;
    item: DrawnLayer;
    pr: number;
    now: number;
  }): void {
    const { context, cx, cy, radius, start, item, pr, now } = args;
    const { points, layer, color } = item;
    const { fillOpacity, lineWidth, dotRadius, glow } = this.#options;
    const baseAlpha = context.globalAlpha;

    const presence = layer.presence.valueAt(now);
    const focus = layer.focus.valueAt(now);
    const lift = layer.lift.valueAt(now);
    const alpha = baseAlpha * presence * item.alpha * lerp(DIMMED, 1, focus);
    if (alpha <= 0) return;

    // A partial reveal draws the sector from the first axis to the beam.
    const clipped = item.reveal < 1;
    if (clipped) {
      if (item.reveal <= 0) return;

      context.save();
      context.beginPath();
      context.moveTo(cx, cy);
      context.arc(cx, cy, radius * 1.5 + 20 * pr, start, start + item.reveal * Math.PI * 2);
      context.closePath();
      context.clip();
    }

    const path = () => {
      context.beginPath();
      points.forEach((point, i) => {
        if (i === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.closePath();
    };

    // The fill deepens toward the rim, so the shape reads as a solid with an edge.
    const edgeOpacity = clamp(fillOpacity * (1 + 0.6 * lift), 0, 1);
    const rim = withAlpha(color, edgeOpacity);
    const core = withAlpha(color, edgeOpacity * 0.3);
    if (rim !== null && core !== null && radius > 0) {
      const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, core);
      gradient.addColorStop(1, rim);
      context.fillStyle = gradient;
      context.globalAlpha = alpha;
    } else {
      context.fillStyle = color;
      context.globalAlpha = alpha * edgeOpacity;
    }
    path();
    context.fill();

    context.globalAlpha = alpha;
    if (lineWidth > 0) {
      const glowing = glow && lift > 0.01;
      if (glowing) {
        context.shadowColor = withAlpha(color, 0.7 * lift) ?? color;
        context.shadowBlur = 18 * pr * lift;
      }

      context.strokeStyle = color;
      context.lineWidth = lineWidth * pr * (1 + 0.4 * lift);
      context.lineJoin = 'round';
      path();
      context.stroke();

      if (glowing) {
        context.shadowColor = 'transparent';
        context.shadowBlur = 0;
      }
    }

    if (dotRadius > 0) {
      const background = this.#theme.background;
      points.forEach((point, i) => {
        if (layer.values[i] === null) return;

        const appear = item.dots;
        if (appear <= 0) return;

        const r = dotRadius * pr * lerp(0.5, 1, appear) * (1 + 0.35 * lift);
        context.globalAlpha = alpha * appear;
        context.beginPath();
        context.arc(point.x, point.y, r, 0, Math.PI * 2);
        context.fillStyle = lift > 0.5 ? color : background;
        context.fill();
        context.strokeStyle = color;
        context.lineWidth = Math.max(1, 1.5 * pr);
        context.stroke();
      });
    }

    context.globalAlpha = baseAlpha;
    if (clipped) context.restore();
  }

  #drawAxisLabels(args: {
    context: CanvasRenderingContext2D;
    cx: number;
    cy: number;
    radius: number;
    angles: number[];
    labels: LabelBox[];
    gap: number;
    lineHeight: number;
    font: string;
    entry: number;
  }): void {
    const { context, cx, cy, radius, angles, labels, gap, font, entry } = args;
    const baseAlpha = context.globalAlpha;
    context.font = font;
    context.fillStyle = this.#options.labelColor ?? this.#theme.axis.textColor;

    labels.forEach((label, i) => {
      const fade = clamp((entry - 0.1 - (0.25 * i) / labels.length) / 0.25, 0, 1);
      if (fade <= 0 || label.text === '') return;

      const reach = radius + gap;
      context.globalAlpha = baseAlpha * fade;
      context.textAlign = label.align;
      context.textBaseline = label.baseline;
      context.fillText(label.text, cx + reach * Math.cos(angles[i]), cy + reach * Math.sin(angles[i]));
    });

    context.globalAlpha = baseAlpha;
  }

  #drawRingLabels(args: {
    context: CanvasRenderingContext2D;
    cx: number;
    cy: number;
    radius: number;
    angle: number;
    entry: number;
    pr: number;
    now: number;
  }): void {
    const { context, cx, cy, radius, angle, entry, pr, now } = args;
    // The hover values take over: a vertex pill on the first axis would cover a ring value.
    const lift = this.#options.hoverValues
      ? Math.max(0, ...this.#current().map((layer) => layer.lift.valueAt(now)))
      : 0;
    const fade = clamp((entry - 0.55) / 0.3, 0, 1) * (1 - lift);
    if (fade <= 0) return;

    const { min, rings, format } = this.#options;
    const max = this.#resolvedMax();
    const theme = this.#theme;
    // Beside the spoke, on the clockwise side.
    const side = angle + Math.PI / 2;
    const offset = 4 * pr;
    const dx = Math.cos(side);
    const dy = Math.sin(side);

    context.globalAlpha *= fade;
    context.font = `${(theme.axis.fontSize - 1) * pr}px ${theme.typography.fontFamily}`;
    context.textAlign = Math.abs(dx) < 0.2 ? 'center' : dx > 0 ? 'left' : 'right';
    context.textBaseline = Math.abs(dy) < 0.2 ? 'middle' : dy > 0 ? 'top' : 'bottom';
    context.lineJoin = 'round';
    context.lineWidth = 3 * pr;
    context.strokeStyle = theme.background;
    context.fillStyle = this.#options.labelColor ?? theme.axis.textColor;

    for (let k = 1; k <= rings; k++) {
      const r = (radius * k) / rings;
      const x = cx + r * Math.cos(angle) + offset * dx;
      const y = cy + r * Math.sin(angle) + offset * dy;
      const text = format(min + ((max - min) * k) / rings);

      // A halo in the background color keeps the value legible over a polygon.
      context.strokeText(text, x, y);
      context.fillText(text, x, y);
    }
  }

  #drawHoverValues(args: {
    context: CanvasRenderingContext2D;
    cx: number;
    cy: number;
    polygons: ({ points: Point[]; layer: LayerState; color: string } | null)[];
    pr: number;
    now: number;
  }): void {
    const { context, cx, cy, polygons, pr, now } = args;
    const theme = this.#theme;
    const fontSize = (theme.axis.fontSize - 0.5) * pr;
    const baseAlpha = context.globalAlpha;
    context.font = `600 ${fontSize}px ${theme.typography.fontFamily}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    for (const item of polygons) {
      if (item === null) continue;

      const lift = item.layer.lift.valueAt(now);
      if (lift <= 0.01) continue;

      const ink = isLightColor(item.color) ? '#111' : '#fff';
      const height = fontSize + 6 * pr;
      const dotRoom = (this.#options.dotRadius + 4) * pr;

      item.points.forEach((point, i) => {
        const value = item.layer.values[i];
        if (value === null) return;

        const text = this.#options.format(value);
        const width = context.measureText(text).width + 10 * pr;
        const dx = point.x - cx;
        const dy = point.y - cy;
        const length = Math.hypot(dx, dy);
        const ux = length > 0 ? dx / length : 0;
        const uy = length > 0 ? dy / length : -1;
        // Pills of vertices near the rim go inward, clear of the axis names.
        const fraction = item.layer.fractions[i]?.target ?? 0;
        const direction = fraction > 0.78 ? -1 : 1;
        const extent = Math.abs(ux) * (width / 2) + Math.abs(uy) * (height / 2);
        const reach = (dotRoom + extent) * direction * lift;
        const x = point.x + ux * reach;
        const y = point.y + uy * reach;

        context.globalAlpha = baseAlpha * lift;
        context.fillStyle = item.color;
        context.beginPath();
        context.roundRect(x - width / 2, y - height / 2, width, height, height / 2);
        context.fill();
        context.fillStyle = ink;
        context.fillText(text, x, y + 0.5 * pr);
      });
    }

    context.globalAlpha = baseAlpha;
  }
}

/**
 * The largest web radius whose axis names still fit the box, and the center that puts
 * the web with its names in the middle of it.
 */
export function solveLayout(args: {
  box: { left: number; top: number; width: number; height: number };
  angles: number[];
  labels: LabelBox[];
  lineHeight: number;
  gap: number;
  circle: boolean;
}): { cx: number; cy: number; radius: number } {
  const { box, angles, labels, lineHeight, gap, circle } = args;

  const boundsAt = (radius: number) => {
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    const include = (x: number, y: number) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    };

    if (circle) {
      include(-radius, -radius);
      include(radius, radius);
    }

    angles.forEach((angle, i) => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      include(radius * cos, radius * sin);

      const label = labels[i];
      if (label === undefined || label.text === '') return;

      const x = (radius + gap) * cos;
      const y = (radius + gap) * sin;
      const left = label.align === 'center' ? x - label.width / 2 : label.align === 'left' ? x : x - label.width;
      const top = label.baseline === 'middle' ? y - lineHeight / 2 : label.baseline === 'top' ? y : y - lineHeight;
      include(left, top);
      include(left + label.width, top + lineHeight);
    });

    return { minX, maxX, minY, maxY };
  };

  const fits = (radius: number) => {
    const bounds = boundsAt(radius);

    return bounds.maxX - bounds.minX <= box.width && bounds.maxY - bounds.minY <= box.height;
  };

  let low = 0;
  let high = Math.max(0, Math.min(box.width, box.height) / 2);
  if (fits(high)) low = high;
  for (let i = 0; i < 30 && high - low > 0.25; i++) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }

  const bounds = boundsAt(low);

  return {
    radius: low,
    cx: box.left + box.width / 2 - (bounds.minX + bounds.maxX) / 2,
    cy: box.top + box.height / 2 - (bounds.minY + bounds.maxY) / 2,
  };
}

/** Series definition for `chart.addSeries` — hosts that never draw a radar don't bundle this module. */
export const RadarSeriesDef: SeriesDefinition<RadarSeriesOptions> = {
  type: 'radar',
  create: (env, options) =>
    new RadarRenderer({ options: { ...options }, theme: env.theme, paletteIndex: env.paletteIndex }),
};

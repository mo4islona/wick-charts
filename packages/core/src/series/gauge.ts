import { DEFAULT_GAUGE_ENTRY, DEFAULT_GAUGE_UPDATE } from '../animation/config';
import { easeInOutCubic } from '../animation/easing';
import type { ChartTheme } from '../theme/types';
import type { GaugeSeriesOptions, GaugeZone } from '../types';
import { mixColors, sampleRamp } from '../utils/color';
import { formatCompact } from '../utils/format';
import { clamp } from '../utils/math';
import { warnDataOnce } from '../utils/poisoned-data-reporter';
import type { SeriesDefinition } from './definition';
import {
  type Bounds,
  TRACK_FADE_SHARE,
  ValueTween,
  bearingToCanvas,
  drawingBox,
  includeArc,
  includePoint,
  resolveGaugeTheme,
  strokeArc,
} from './radial';
import type { GaugeSeriesRenderer, SeriesRenderContext } from './types';

interface ResolvedGaugeOptions {
  min: number;
  max: number;
  startAngle: number;
  endAngle: number;
  /** Sorted by `to`. */
  zones: GaugeZone[];
  zoneColor: 'target' | 'morph';
  style: 'arc' | 'needle';
  label?: string;
  format?: (value: number) => string;
  color?: string;
  trackColor?: string;
  rangeLabels: boolean;
  entryMs: number;
  updateMs: number;
}

const DEFAULT_OPTIONS: ResolvedGaugeOptions = {
  min: 0,
  max: 100,
  startAngle: -120,
  endAngle: 120,
  zones: [],
  zoneColor: 'target',
  style: 'arc',
  rangeLabels: true,
  entryMs: DEFAULT_GAUGE_ENTRY,
  updateMs: DEFAULT_GAUGE_UPDATE,
};

// Proportions in units of the gauge's outer radius.
const TRACK_WIDTH = 0.16;
const ZONE_WIDTH = 0.035;
const ZONE_GAP = 0.035;
const HUB_RADIUS = 0.07;
const NEEDLE_WIDTH = 0.035;
/** Room between the needle tip and the inner edge of the track. */
const NEEDLE_CLEARANCE = 0.04;
const RANGE_FONT = 0.075;
const RANGE_GAP = 0.04;
/** Least gap of the arc, in degrees, for range labels: in a smaller one the two labels, pushed past their caps, meet. */
const MIN_RANGE_LABEL_GAP = 60;
const ARC_LABEL = { valueFont: 0.3, captionFont: 0.1, valueY: -0.06, captionY: 0.2 };
/** In needle style the label sits next to the hub, smaller, so the needle never crosses it. */
const NEEDLE_LABEL = { valueFont: 0.2, captionFont: 0.085, top: HUB_RADIUS + 0.06, captionGap: 0.03 };
/** Least half width the needle leaves a value row next to the hub; with less, the label moves. */
const MIN_NEEDLE_ROW = 0.12;
/** Room between the dial and a needle-style label under it. */
const DIAL_GAP = 0.06;
/** Share of the track's inner radius the center label may span. */
const LABEL_WIDTH_SHARE = 0.8;
const MIN_FONT_PX = 8;
/** With `zoneColor: 'morph'`, the color blends over this share of the narrower zone on each side of a border. */
const MORPH_BAND = 0.25;

/** Whole numbers as they are, others compact (`1.2K`). */
function defaultGaugeFormat(value: number): string {
  return Number.isInteger(value) ? value.toString() : formatCompact(value);
}

/** Decimal places `value` is written with, or `null` in exponent notation. */
function fractionDigits(value: number): number | null {
  const text = String(value);
  if (text.includes('e')) return null;

  return text.split('.')[1]?.length ?? 0;
}

/** A tweening value rounded to the precision of its target, so the count-up reads `71`, not `71.0342`. */
function displayValue(drawn: number, target: number): number {
  if (drawn === target) return target;

  const digits = fractionDigits(target);
  if (digits === null) return drawn;

  return Number(drawn.toFixed(digits));
}

/** Merge `incoming` over `base`; a key set to `undefined` goes back to its default. */
function normalize(base: ResolvedGaugeOptions, incoming: Partial<GaugeSeriesOptions>): ResolvedGaugeOptions {
  const merged = { ...base, ...incoming };
  const zones = [...(merged.zones ?? [])].sort((a, b) => a.to - b.to);

  return {
    min: merged.min ?? DEFAULT_OPTIONS.min,
    max: merged.max ?? DEFAULT_OPTIONS.max,
    startAngle: merged.startAngle ?? DEFAULT_OPTIONS.startAngle,
    endAngle: merged.endAngle ?? DEFAULT_OPTIONS.endAngle,
    zones,
    zoneColor: merged.zoneColor ?? DEFAULT_OPTIONS.zoneColor,
    style: merged.style ?? DEFAULT_OPTIONS.style,
    label: merged.label,
    format: merged.format,
    color: merged.color,
    trackColor: merged.trackColor,
    rangeLabels: merged.rangeLabels ?? DEFAULT_OPTIONS.rangeLabels,
    entryMs: Math.max(0, merged.entryMs ?? DEFAULT_OPTIONS.entryMs),
    updateMs: Math.max(0, merged.updateMs ?? DEFAULT_OPTIONS.updateMs),
  };
}

interface LabelRow {
  /** Center of the row, below the gauge center. */
  y: number;
  font: number;
  /** Half the width the text may take. */
  halfWidth: number;
}

/** The gauge in units of its outer radius, centered on (0, 0). */
interface GaugeShape {
  start: number;
  end: number;
  trackRadius: number;
  /** Centerline of the thin zone band outside the track, or `null` when the zones paint on the track. */
  zoneRadius: number | null;
  needleLength: number;
  value: LabelRow;
  caption: LabelRow | null;
  /** Where each range label starts, past its arc end; `null` when they are off or the gap cannot hold them. */
  rangeLabels: { start: RangeAnchor; end: RangeAnchor } | null;
  bounds: Bounds;
}

/** A point just past an arc end's round cap, and the unit direction from the end into the arc's gap. */
interface RangeAnchor {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** Center of a label box pushed from `anchor` along its direction until the whole box is past the anchor. */
function rangeLabelCenter(anchor: RangeAnchor, half: { width: number; height: number }): { x: number; y: number } {
  const reach = Math.abs(anchor.dx) * half.width + Math.abs(anchor.dy) * half.height;

  return { x: anchor.x + anchor.dx * reach, y: anchor.y + anchor.dy * reach };
}

function gaugeShape(options: ResolvedGaugeOptions): GaugeShape {
  const sweep = clamp(options.endAngle - options.startAngle, 0, 360);
  const start = bearingToCanvas(options.startAngle);
  const end = bearingToCanvas(options.startAngle + sweep);

  const zoneBand = options.style === 'arc' && options.zones.length > 0;
  const trackOuter = zoneBand ? 1 - ZONE_WIDTH - ZONE_GAP : 1;
  const trackRadius = trackOuter - TRACK_WIDTH / 2;
  const trackInner = trackOuter - TRACK_WIDTH;
  const halfTrack = TRACK_WIDTH / 2;

  const bounds: Bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  includeArc(bounds, { start, end, radius: 1 });

  const ends = [start, end].map((angle) => ({ x: trackRadius * Math.cos(angle), y: trackRadius * Math.sin(angle) }));
  for (const point of ends) {
    includePoint(bounds, point.x - halfTrack, point.y - halfTrack);
    includePoint(bounds, point.x + halfTrack, point.y + halfTrack);
  }

  let rangeLabels: GaugeShape['rangeLabels'] = null;
  const gapHoldsLabels = 360 - sweep >= MIN_RANGE_LABEL_GAP;
  if (options.rangeLabels && gapHoldsLabels) {
    // Along the arc's tangent: counter-clockwise past the start, clockwise past the end.
    const anchorPast = (angle: number, side: 1 | -1): RangeAnchor => {
      const dx = -Math.sin(angle) * side;
      const dy = Math.cos(angle) * side;
      const clear = halfTrack + RANGE_GAP;

      return { x: trackRadius * Math.cos(angle) + dx * clear, y: trackRadius * Math.sin(angle) + dy * clear, dx, dy };
    };
    rangeLabels = { start: anchorPast(start, -1), end: anchorPast(end, 1) };

    // Sized for a label about two glyphs wide; the paint clamps a wider one into the box.
    const half = { width: RANGE_FONT, height: RANGE_FONT / 2 };
    for (const anchor of [rangeLabels.start, rangeLabels.end]) {
      const center = rangeLabelCenter(anchor, half);
      includePoint(bounds, center.x - half.width, center.y - half.height);
      includePoint(bounds, center.x + half.width, center.y + half.height);
    }
  }

  const hasCaption = options.label !== undefined && options.label !== '';
  const labelWidth = trackInner * LABEL_WIDTH_SHARE;
  let value: LabelRow;
  let caption: LabelRow | null = null;

  if (options.style === 'needle') {
    includePoint(bounds, -HUB_RADIUS, -HUB_RADIUS);
    includePoint(bounds, HUB_RADIUS, HUB_RADIUS);

    ({ value, caption } = needleRows({ start, end, hasCaption, labelWidth, dialBottom: bounds.maxY }));
  } else {
    value = { y: ARC_LABEL.valueY, font: ARC_LABEL.valueFont, halfWidth: labelWidth };
    if (hasCaption) caption = { y: ARC_LABEL.captionY, font: ARC_LABEL.captionFont, halfWidth: labelWidth };
  }

  // The paint shrinks a row's text to its half width, so a narrow or turned arc must still leave that room.
  const rows = caption === null ? [value] : [value, caption];
  for (const row of rows) {
    includePoint(bounds, -row.halfWidth, row.y - row.font / 2);
    includePoint(bounds, row.halfWidth, row.y + row.font / 2);
  }

  return {
    start,
    end,
    trackRadius,
    zoneRadius: zoneBand ? 1 - ZONE_WIDTH / 2 : null,
    needleLength: trackInner - NEEDLE_CLEARANCE,
    value,
    caption,
    rangeLabels,
    bounds,
  };
}

/** The sweep from `start` to `end`, clockwise, passes `angle` (canvas radians). */
function sweepHolds(args: { start: number; end: number; angle: number }): boolean {
  const turns = Math.ceil((args.start - args.angle) / (Math.PI * 2));

  return args.angle + turns * Math.PI * 2 <= args.end;
}

/**
 * Half the width a text row keeps clear of the needle anywhere on the sweep. The row's
 * near edge is `near` from the center, below it (`side` 1) or above it (-1). A needle
 * crosses the row at `near · |dx| / |dy|`, closest at the arc end nearest the vertical,
 * and through the middle when it can point straight at the row.
 */
function needleClearWidth(args: { start: number; end: number; near: number; side: 1 | -1 }): number {
  const { start, end, near, side } = args;
  if (sweepHolds({ start, end, angle: (side * Math.PI) / 2 })) return 0;

  let half = Number.POSITIVE_INFINITY;
  for (const angle of [start, end]) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle) * side;
    if (dy <= 0.05) continue;

    half = Math.min(half, (near * Math.abs(dx)) / dy - NEEDLE_WIDTH);
  }

  return Math.max(0, half);
}

/**
 * The value and caption rows of the needle style, where the needle never crosses them:
 * under the hub, else over it, else under the whole dial when the needle points both ways.
 */
function needleRows(args: {
  start: number;
  end: number;
  hasCaption: boolean;
  labelWidth: number;
  dialBottom: number;
}): { value: LabelRow; caption: LabelRow | null } {
  const { start, end, hasCaption, labelWidth } = args;
  const { valueFont, captionFont, top, captionGap } = NEEDLE_LABEL;
  const halfWidth = (near: number, side: 1 | -1) => Math.min(labelWidth, needleClearWidth({ start, end, near, side }));

  const captionBelow = top + valueFont + captionGap;
  const valueBelow = { y: top + valueFont / 2, font: valueFont, halfWidth: halfWidth(top, 1) };
  if (valueBelow.halfWidth >= MIN_NEEDLE_ROW) {
    const caption = { y: captionBelow + captionFont / 2, font: captionFont, halfWidth: halfWidth(captionBelow, 1) };

    return { value: valueBelow, caption: hasCaption ? caption : null };
  }

  // Over the hub the caption sits next to it, so the value still reads first.
  const valueAbove = hasCaption ? top + captionFont + captionGap : top;
  const valueOver = { y: -(valueAbove + valueFont / 2), font: valueFont, halfWidth: halfWidth(valueAbove, -1) };
  if (valueOver.halfWidth >= MIN_NEEDLE_ROW) {
    const caption = { y: -(top + captionFont / 2), font: captionFont, halfWidth: halfWidth(top, -1) };

    return { value: valueOver, caption: hasCaption ? caption : null };
  }

  const valueTop = args.dialBottom + DIAL_GAP;
  const captionTop = valueTop + valueFont + captionGap;
  const value = { y: valueTop + valueFont / 2, font: valueFont, halfWidth: labelWidth };
  const caption = { y: captionTop + captionFont / 2, font: captionFont, halfWidth: labelWidth };

  return { value, caption: hasCaption ? caption : null };
}

interface ZoneSpan {
  from: number;
  to: number;
  color: string;
}

export class GaugeRenderer implements GaugeSeriesRenderer {
  readonly kind = 'gauge' as const;

  #options: ResolvedGaugeOptions;
  #theme: ChartTheme;
  #paletteIndex: number;
  #value: number | null = null;
  #tween = new ValueTween(0);
  /** Opacity of the track and the labels; 0 → 1 on the first data. */
  #fade = new ValueTween(1);
  /** Value color a glide blends from; `null` paints the target's color, so the entrance never changes color. */
  #colorFrom: string | null = null;
  #shownColor: string | null = null;
  #dataListeners: Array<() => void> = [];

  constructor(args: { options?: Partial<GaugeSeriesOptions>; theme: ChartTheme; paletteIndex?: number }) {
    this.#options = normalize(DEFAULT_OPTIONS, args.options ?? {});
    this.#theme = args.theme;
    this.#paletteIndex = args.paletteIndex ?? 0;
  }

  getData(): number | null {
    return this.#value;
  }

  /** Set the value. The arc glides from what is on screen; the first value sweeps up from `min`. */
  setData(data: unknown): void {
    const next = typeof data === 'number' && Number.isFinite(data) ? data : null;
    if (next === null && data !== null && data !== undefined) {
      warnDataOnce({
        token: this,
        topic: 'gauge-value',
        message: `gauge: ${String(data)} is not a finite number, so the gauge draws no value.`,
      });
    }
    if (next === this.#value) return;

    const now = performance.now();
    const first = this.#value === null;
    this.#value = next;

    if (next !== null && first) {
      const { min, entryMs } = this.#options;
      this.#tween = new ValueTween(min);
      this.#tween.retarget({ to: next, durationMs: entryMs, now, easing: easeInOutCubic });
      this.#fade = new ValueTween(0);
      this.#fade.retarget({ to: 1, durationMs: entryMs * TRACK_FADE_SHARE, now });
      this.#colorFrom = null;
    } else if (next !== null) {
      this.#tween.retarget({ to: next, durationMs: this.#options.updateMs, now });
      this.#colorFrom = this.#shownColor;
    }

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

  updateOptions(options: Partial<GaugeSeriesOptions>): void {
    const wasAnimated = this.#options.updateMs > 0;
    this.#options = normalize(this.#options, options ?? {});

    // The data can change in the same render, before its options arrive; it must not glide then.
    const updatesTurnedOff = wasAnimated && this.#options.updateMs === 0;
    if (updatesTurnedOff) this.#tween.settle();
  }

  applyTheme(theme: ChartTheme): void {
    this.#theme = theme;
  }

  getLayerCount(): number {
    return 1;
  }

  setLayerVisible(_index: number, _visible: boolean): void {
    // A gauge has no layers.
  }

  isLayerVisible(_index: number): boolean {
    return true;
  }

  getLayerColors(): string[] {
    const value = this.#value ?? this.#options.min;
    const zones = this.#zoneSpans(this.#theme);
    const morph = this.#options.zoneColor === 'morph';

    return [morph ? this.#morphColor({ value, zones }) : this.#valueColor({ value, zones })];
  }

  get needsAnimation(): boolean {
    return this.#tween.active || this.#fade.active;
  }

  dispose(): void {
    this.#dataListeners = [];
    this.#value = null;
    this.#tween.settle();
    this.#fade.settle();
  }

  #fraction(value: number): number {
    const { min, max } = this.#options;
    const span = max - min;
    if (!(span > 0)) return 0;

    return clamp((value - min) / span, 0, 1);
  }

  #angleOf(value: number, shape: GaugeShape): number {
    return shape.start + (shape.end - shape.start) * this.#fraction(value);
  }

  /** Zones clipped to the range; a zone starts where the one before it ends. */
  #zoneSpans(theme: ChartTheme): ZoneSpan[] {
    const { min, max, zones } = this.#options;
    const ramp = resolveGaugeTheme(theme).zoneColors;
    const spans: ZoneSpan[] = [];

    let from = min;
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      const to = clamp(zone.to, min, max);
      const rampAt = zones.length === 1 ? 0 : i / (zones.length - 1);
      if (to > from) spans.push({ from, to, color: zone.color ?? sampleRamp(ramp, rampAt) });

      from = Math.max(from, to);
    }

    return spans;
  }

  #fallbackColor(): string {
    if (this.#options.color !== undefined) return this.#options.color;

    const palette = this.#theme.seriesColors;

    return palette[this.#paletteIndex % palette.length] ?? '#888';
  }

  /** The zones, then the `color` option (else the series' palette color) from the last zone up to `max`. */
  #colorSpans(zones: ZoneSpan[]): ZoneSpan[] {
    const { min, max } = this.#options;
    const coveredTo = zones.length > 0 ? zones[zones.length - 1].to : min;
    if (coveredTo >= max) return zones;

    return [...zones, { from: coveredTo, to: max, color: this.#fallbackColor() }];
  }

  /** The color of the zone `value` ends in, else the `color` option, else the series' palette color. */
  #valueColor(args: { value: number; zones: ZoneSpan[] }): string {
    const { min, max } = this.#options;
    const clamped = clamp(args.value, min, max);
    const span = this.#colorSpans(args.zones).find((candidate) => clamped >= candidate.from && clamped <= candidate.to);

    return span?.color ?? this.#fallbackColor();
  }

  /** `zoneColor: 'morph'`: the zone color, blended into the next zone across a band around each border. */
  #morphColor(args: { value: number; zones: ZoneSpan[] }): string {
    const { min, max } = this.#options;
    const clamped = clamp(args.value, min, max);
    const spans = this.#colorSpans(args.zones);

    for (let i = 0; i + 1 < spans.length; i++) {
      const left = spans[i];
      const right = spans[i + 1];
      const half = MORPH_BAND * Math.min(left.to - left.from, right.to - right.from);
      const bandStart = left.to - half;
      const inBand = half > 0 && clamped >= bandStart && clamped <= left.to + half;
      if (inBand) return mixColors(left.color, right.color, (clamped - bandStart) / (2 * half));
    }

    return this.#valueColor(args);
  }

  /** `zoneColor: 'target'`: the target's zone color, so a sweep across zones keeps one color; a glide blends into it. */
  #targetColor(args: { target: number; zones: ZoneSpan[]; now: number }): string {
    const targetColor = this.#valueColor({ value: args.target, zones: args.zones });
    const glide = this.#tween.progressAt(args.now);
    const colorFrom = this.#colorFrom;

    return colorFrom !== null && glide < 1 ? mixColors(colorFrom, targetColor, glide) : targetColor;
  }

  render(ctx: SeriesRenderContext): void {
    const { scope, theme, padding } = ctx;
    const { context, bitmapSize, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
    this.#theme = theme;

    const value = this.#value;
    if (value === null) {
      this.#tween.settle();
      this.#fade.settle();

      return;
    }

    const box = drawingBox({
      bitmapWidth: bitmapSize.width,
      bitmapHeight: bitmapSize.height,
      padding: { top: padding.top * vpr, bottom: padding.bottom * vpr },
      pixelRatio: hpr,
    });
    const shape = gaugeShape(this.#options);
    const { bounds } = shape;
    const radius = Math.min(box.width / (bounds.maxX - bounds.minX), box.height / (bounds.maxY - bounds.minY));
    if (!(radius > 0)) {
      this.#tween.settle();
      this.#fade.settle();

      return;
    }

    const cx = box.left + box.width / 2 - ((bounds.minX + bounds.maxX) / 2) * radius;
    const cy = box.top + box.height / 2 - ((bounds.minY + bounds.maxY) / 2) * radius;

    const now = performance.now();
    this.#tween.tick(now);
    this.#fade.tick(now);
    const drawn = this.#tween.valueAt(now);
    const fade = this.#fade.valueAt(now);

    const zones = this.#zoneSpans(theme);
    const morph = this.#options.zoneColor === 'morph';
    const valueColor = morph
      ? this.#morphColor({ value: drawn, zones })
      : this.#targetColor({ target: value, zones, now });
    this.#shownColor = valueColor;
    const trackColor = this.#options.trackColor ?? resolveGaugeTheme(theme).trackColor;
    const trackWidth = TRACK_WIDTH * radius;
    const trackRadius = shape.trackRadius * radius;
    const baseAlpha = context.globalAlpha;

    // Zones painted on the track end square, so a round track cap would poke out past them.
    const zonesOnTrack = shape.zoneRadius === null && zones.length > 0;
    context.globalAlpha = baseAlpha * fade;
    strokeArc(context, {
      cx,
      cy,
      radius: trackRadius,
      from: shape.start,
      to: shape.end,
      width: trackWidth,
      color: trackColor,
      cap: zonesOnTrack ? 'butt' : 'round',
    });

    const zoneRadius = shape.zoneRadius === null ? trackRadius : shape.zoneRadius * radius;
    const zoneWidth = shape.zoneRadius === null ? trackWidth : ZONE_WIDTH * radius;
    for (const zone of zones) {
      strokeArc(context, {
        cx,
        cy,
        radius: zoneRadius,
        from: this.#angleOf(zone.from, shape),
        to: this.#angleOf(zone.to, shape),
        width: zoneWidth,
        color: zone.color,
        cap: 'butt',
      });
    }

    if (this.#options.style === 'needle') {
      this.#drawNeedle(context, {
        cx,
        cy,
        radius,
        angle: this.#angleOf(drawn, shape),
        length: shape.needleLength,
        color: valueColor,
      });
    } else {
      context.globalAlpha = baseAlpha;
      strokeArc(context, {
        cx,
        cy,
        radius: trackRadius,
        from: shape.start,
        to: this.#angleOf(drawn, shape),
        width: trackWidth,
        color: valueColor,
        cap: 'round',
      });
    }

    context.globalAlpha = baseAlpha;
    this.#drawLabels(context, { cx, cy, radius, shape, drawn, fade, hpr, box });
    context.globalAlpha = baseAlpha;
  }

  #drawNeedle(
    context: CanvasRenderingContext2D,
    args: { cx: number; cy: number; radius: number; angle: number; length: number; color: string },
  ): void {
    const { cx, cy, radius, angle, length, color } = args;
    const tipX = cx + Math.cos(angle) * length * radius;
    const tipY = cy + Math.sin(angle) * length * radius;

    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = NEEDLE_WIDTH * radius;
    context.lineCap = 'round';

    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(tipX, tipY);
    context.stroke();

    context.beginPath();
    context.arc(cx, cy, HUB_RADIUS * radius, 0, Math.PI * 2);
    context.fill();
  }

  #drawLabels(
    context: CanvasRenderingContext2D,
    args: {
      cx: number;
      cy: number;
      radius: number;
      shape: GaugeShape;
      drawn: number;
      fade: number;
      hpr: number;
      box: { left: number; top: number; width: number; height: number };
    },
  ): void {
    const { cx, cy, radius, shape, drawn, fade, hpr, box } = args;
    const theme = this.#theme;
    const format = this.#options.format ?? defaultGaugeFormat;
    const family = theme.typography.fontFamily;
    const baseAlpha = context.globalAlpha;
    const target = this.#value ?? drawn;

    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const valueText = format(displayValue(drawn, target));
    context.fillStyle = theme.tooltip.textColor;
    this.#fillFitted(context, {
      text: valueText,
      x: cx,
      y: cy + shape.value.y * radius,
      row: shape.value,
      radius,
      font: (size) => `500 ${size}px ${family}`,
      hpr,
    });

    context.globalAlpha = baseAlpha * fade;
    context.fillStyle = theme.axis.textColor;

    const caption = this.#options.label;
    if (shape.caption !== null && caption !== undefined) {
      this.#fillFitted(context, {
        text: caption,
        x: cx,
        y: cy + shape.caption.y * radius,
        row: shape.caption,
        radius,
        font: (size) => `${size}px ${family}`,
        hpr,
      });
    }

    if (shape.rangeLabels !== null) {
      const size = Math.max(MIN_FONT_PX * hpr, RANGE_FONT * radius);
      context.font = `${size}px ${family}`;

      const { start, end } = shape.rangeLabels;
      const labels = [
        { text: format(this.#options.min), anchor: start },
        { text: format(this.#options.max), anchor: end },
      ];
      // The layout sizes the labels for a short text; a wide one slides back into the box.
      for (const { text, anchor } of labels) {
        const maxWidth = box.width / 2;
        const half = { width: Math.min(context.measureText(text).width, maxWidth) / 2, height: size / 2 };
        const pixelAnchor = { ...anchor, x: cx + anchor.x * radius, y: cy + anchor.y * radius };
        const center = rangeLabelCenter(pixelAnchor, half);
        const x = clamp(center.x, box.left + half.width, box.left + box.width - half.width);
        const y = clamp(center.y, box.top + half.height, box.top + box.height - half.height);
        context.fillText(text, x, y, maxWidth);
      }
    }

    context.globalAlpha = baseAlpha;
  }

  /**
   * Fill `text` centered on its row, shrinking the font until the text fits the row's width;
   * a text that overflows even at the readable minimum is left out.
   */
  #fillFitted(
    context: CanvasRenderingContext2D,
    args: {
      text: string;
      x: number;
      y: number;
      row: LabelRow;
      radius: number;
      font: (size: number) => string;
      hpr: number;
    },
  ): void {
    const { text, x, y, row, radius, font, hpr } = args;
    const nominal = row.font * radius;
    context.font = font(nominal);

    const maxWidth = 2 * row.halfWidth * radius;
    const width = context.measureText(text).width;
    const fitted = width > maxWidth ? (nominal * maxWidth) / width : nominal;
    const minSize = MIN_FONT_PX * hpr;
    const overflows = fitted < minSize && (width * minSize) / nominal > maxWidth;
    if (overflows) return;

    const size = Math.max(minSize, fitted);
    if (size !== nominal) context.font = font(size);

    context.fillText(text, x, y);
  }
}

/** Series definition for `chart.addSeries` — hosts that never draw a gauge don't bundle this module. */
export const GaugeSeriesDef: SeriesDefinition<GaugeSeriesOptions> = {
  type: 'gauge',
  create: (env, options) =>
    new GaugeRenderer({ options: { ...options }, theme: env.theme, paletteIndex: env.paletteIndex }),
};

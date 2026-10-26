import { easeOutBack, easeOutCubic } from '../animation/easing';
import { mixColors } from '../utils/color';
import { clamp } from '../utils/math';
import { fillRoundedRect } from './painters/canvas-path';
import type { PaintEnv } from './painters/types';
import { strokeArc } from './radial';

// Pluggable parts of a radial progress series: where the rings sit, how each ring is
// painted, and the text in the middle or next to the rings. Each part is a plain
// function passed to the series options; there is no name registry.

const FULL_TURN = Math.PI * 2;
const MIN_FONT_PX = 8;

/** One ring's place, in bitmap px. */
export interface RingSlot {
  /** Radius of the ring's centerline. */
  radius: number;
  /** Stroke width. */
  width: number;
}

/** What a {@link RadialLayout} sizes the rings in. */
export interface RadialLayoutFrame {
  /** Number of rings, outermost first. */
  count: number;
  /** Outer radius of the drawing, bitmap px. */
  outer: number;
  /** Device-pixel ratio, for sizes given in CSS px. */
  pixelRatio: number;
}

/** Places the rings: one slot per item, outermost first. */
export type RadialLayout = (frame: RadialLayoutFrame) => RingSlot[];

/** One ring as a {@link RadialLabelPainter} sees it, at the value drawn on screen. */
export interface RadialItem {
  label: string;
  /** The drawn value; it glides with its ring. */
  value: number;
  /** `value / max × 100`. */
  percent: number;
  color: string;
}

/** Arguments handed to a {@link RingPainter}: once for the track, then once for the value. */
export interface RingPaintArgs {
  /**
   * `'track'` paints the empty ring, with the entrance fade already in
   * `ctx.globalAlpha`; `'value'` paints the filled part.
   */
  element: 'track' | 'value';
  /** Ring index, outermost first. */
  index: number;
  cx: number;
  cy: number;
  radius: number;
  width: number;
  /** Where the track starts, canvas radians. The track runs clockwise to `endAngle`. */
  startAngle: number;
  endAngle: number;
  /** Where the drawn value reaches, between `startAngle` and `endAngle`. */
  valueAngle: number;
  /** Drawn share of the track, 0…1. */
  fraction: number;
  color: string;
  trackColor: string;
  /** Entrance fade of the track, 0 → 1. */
  entrance: number;
  /** `performance.now()` of this frame. */
  now: number;
  /**
   * `false` when the series has no motion: `entryMs` and `updateMs` are both 0, as with
   * `animations={false}`, or the viewer prefers reduced motion. A painter then draws its settled state.
   */
  animate: boolean;
  /** State this ring keeps between frames, for a painter that animates on its own. */
  memo: Record<string, unknown>;
}

/**
 * Paints one element of one ring. Return `true` while the ring still animates on its
 * own, so the chart draws another frame. A painter may scale `ctx.globalAlpha` down
 * for a part of its drawing, but must restore it.
 */
export type RingPainter = (env: PaintEnv, args: RingPaintArgs) => boolean;

/** One ring's place for a {@link RadialLabelPainter}. A ring with no room has `radius` 0. */
export interface RadialLabelRing {
  radius: number;
  width: number;
  /** Where the drawn value reaches, canvas radians. */
  valueAngle: number;
  item: RadialItem;
}

/** Arguments handed to a {@link RadialLabelPainter} once a frame, with the entrance fade in `ctx.globalAlpha`. */
export interface RadialLabelArgs {
  cx: number;
  cy: number;
  /** Radius of the free hole inside the innermost ring. */
  hole: number;
  /** Track start and end, canvas radians. */
  startAngle: number;
  endAngle: number;
  /** Outermost first. */
  rings: RadialLabelRing[];
  /** Where the chart may draw, bitmap px: inside the padding of titles and info bars. */
  area: { left: number; top: number; width: number; height: number };
}

/** Paints the text of the rings: in the middle, next to each ring, or both. */
export type RadialLabelPainter = (env: PaintEnv, args: RadialLabelArgs) => void;

/** One tick at its moment, for a {@link TickAnimation}. */
export interface TickFrame {
  /** Milliseconds since the value reached this tick or, when `leaving`, since it dropped below it. */
  age: number;
  /** The last filled tick. */
  isHead: boolean;
  /** The value dropped below this tick: the style takes it away, back to the empty tick under it. */
  leaving: boolean;
}

/** How a filled tick looks at its moment. A field left out means no change. */
export interface TickStyle {
  /** Length as a share of the settled length. Default: 1. */
  scale?: number;
  /** Default: 1. */
  alpha?: number;
  /** Shift along the radius as a share of the ring radius; negative is toward the center. Default: 0. */
  offset?: number;
  /** Glow blur in CSS px. Default: 0. */
  glow?: number;
  /** Blend toward the theme text color, 0…1. Default: 0. */
  flash?: number;
}

/**
 * How a tick of a {@link tickRing} arrives when the value reaches it, and goes when the
 * value drops below it. A leaving tick is drawn for 800 ms at most.
 */
export type TickAnimation = (tick: TickFrame) => TickStyle;

/** Hero text sizes and the widest lines, in units of the hole radius. The last line sits lower, where the hole is wider. */
const HERO = { valueFont: 0.5, captionFont: 0.13, restFont: 0.11, width: 1.5, restWidth: 1.7 };

function fontOf(env: PaintEnv, args: { size: number; weight?: number }): string {
  const weight = args.weight ?? 400;

  return `${weight} ${args.size}px ${env.theme.typography.fontFamily}`;
}

/**
 * Largest size up to `size` at which `text` fits `maxWidth`, never under the readable
 * minimum; `null` when the text overflows even at the minimum, so it is left out.
 */
function fittedSize(
  env: PaintEnv,
  args: { text: string; size: number; maxWidth: number; weight?: number },
): number | null {
  const { ctx } = env;
  const minSize = MIN_FONT_PX * env.horizontalPixelRatio;
  ctx.font = fontOf(env, { size: args.size, weight: args.weight });
  const width = ctx.measureText(args.text).width;
  const fitted = width > args.maxWidth ? (args.size * args.maxWidth) / width : args.size;

  const overflows = fitted < minSize && (width * minSize) / args.size > args.maxWidth;
  if (overflows) return null;

  return Math.max(minSize, fitted);
}

/** The bottom of the circle is outside the arc, so text can sit on the arc's base. */
function opensAtBottom(args: { startAngle: number; endAngle: number }): boolean {
  const bottom = Math.PI / 2;
  const turns = Math.ceil((args.startAngle - bottom) / FULL_TURN);
  const firstBottom = bottom + turns * FULL_TURN;

  return firstBottom > args.endAngle;
}

const RING_PITCH = 0.15;
/** Share of the radius all rings together may take, so a hole stays in the middle. */
const RINGS_SPAN = 0.78;
/** Share of the pitch a ring's stroke takes; the rest is the gap. */
const RING_FILL = 0.72;

/** Equal rings, outermost first, leaving a hole in the middle. The default layout. */
export function ringsLayout(): RadialLayout {
  return ({ count, outer }) => {
    const pitch = outer * Math.min(RING_PITCH, RINGS_SPAN / Math.max(1, count));
    const width = pitch * RING_FILL;

    return Array.from({ length: count }, (_, i) => ({ radius: outer - width / 2 - i * pitch, width }));
  };
}

const HERO_WIDTH = 0.15;
const HERO_GAP = 0.05;
/** The hole the thin rings leave for {@link heroCenter}, as a share of the outer radius. */
const HERO_MIN_HOLE = 0.55;
const THIN_PITCH = 2.6;

/**
 * The first item as a thick outer ring, the others as thin rings inside it. Many thin
 * rings get thinner, so the hole keeps room for {@link heroCenter}.
 */
export function heroLayout(options: { thinWidth?: number } = {}): RadialLayout {
  return ({ count, outer, pixelRatio }) => {
    const hero = outer * HERO_WIDTH;
    const band = outer * (1 - HERO_WIDTH - HERO_GAP - HERO_MIN_HOLE);
    const fullPitch = Math.min(hero / 2, (options.thinWidth ?? 4) * pixelRatio) * THIN_PITCH;
    const pitch = count > 1 ? Math.min(fullPitch, band / (count - 1)) : fullPitch;
    const thin = pitch / THIN_PITCH;
    const slots: RingSlot[] = [{ radius: outer - hero / 2, width: hero }];

    for (let i = 1; i < count; i++) {
      slots.push({ radius: outer - hero - outer * HERO_GAP - thin / 2 - (i - 1) * pitch, width: thin });
    }

    return slots;
  };
}

/** A solid track and a solid arc with round ends. The default ring painter. */
export function solidRing(): RingPainter {
  return (env, ring) => {
    const arc = { cx: ring.cx, cy: ring.cy, radius: ring.radius, width: ring.width, from: ring.startAngle };

    if (ring.element === 'track') {
      // A round cap on a closed track would poke past the value arc where the two meet.
      const closed = ring.endAngle - ring.startAngle >= FULL_TURN - 1e-6;
      strokeArc(env.ctx, { ...arc, to: ring.endAngle, color: ring.trackColor, cap: closed ? 'butt' : 'round' });

      return false;
    }

    strokeArc(env.ctx, { ...arc, to: ring.valueAngle, color: ring.color, cap: 'round' });

    return false;
  };
}

/** Time a tick animation may take: a reached tick older than this is drawn settled, a leaving one is gone. */
const TICK_SETTLE_MS = 800;
const HEAD_SCALE = 1.3;
const IDLE_SCALE = 0.55;
/** Share of the ring an empty tick's fade-in spans as the track writes itself around. */
const TRACK_WRITE_SPAN = 0.25;
/** A ring thinner than this, CSS px, is too short for ticks and draws solid. */
const MIN_TICK_LENGTH = 8;

/** Per tick of a ring, kept in the ring's memo under `key`: when it was reached or left, `NaN` for never. */
function tickTimes(args: { memo: Record<string, unknown>; key: string; count: number }): Float64Array {
  const { memo, key, count } = args;
  const stored = memo[key];
  if (stored instanceof Float64Array && stored.length === count) return stored;

  const fresh = new Float64Array(count).fill(Number.NaN);
  memo[key] = fresh;

  return fresh;
}

/**
 * The ring as a row of ticks, like a watch bezel: empty ticks short and gray, filled
 * ticks in the ring color, the head tick longer. A tick plays `animation` when the value
 * reaches it and again, leaving, when the value drops below it, at the first data and on
 * every update. `count` is ticks per full turn. A ring too thin for ticks, like the inner
 * rings of {@link heroLayout}, draws solid.
 */
export function tickRing(options: { count?: number; animation?: TickAnimation } = {}): RingPainter {
  const perTurn = Math.max(4, Math.round(options.count ?? 60));
  const animation = options.animation ?? popTicks();
  const solid = solidRing();

  return (env, ring) => {
    if (ring.width < MIN_TICK_LENGTH * env.horizontalPixelRatio) return solid(env, ring);

    const { ctx } = env;
    const sweep = ring.endAngle - ring.startAngle;
    const count = Math.max(1, Math.round((perTurn * sweep) / FULL_TURN));
    const step = sweep / count;
    const filled = Math.min(count, Math.floor(ring.fraction * count + 1e-6));
    const gapWidth = ring.radius * step;
    const tickWidth = clamp(gapWidth * 0.35, 1.5 * env.horizontalPixelRatio, ring.width * 0.3);
    const baseAlpha = ctx.globalAlpha;
    ctx.lineCap = 'round';

    const tick = (args: { index: number; length: number; offset: number }) => {
      const angle = ring.startAngle + (args.index + 0.5) * step;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const center = ring.radius + args.offset;

      ctx.beginPath();
      ctx.moveTo(ring.cx + (center - args.length / 2) * cos, ring.cy + (center - args.length / 2) * sin);
      ctx.lineTo(ring.cx + (center + args.length / 2) * cos, ring.cy + (center + args.length / 2) * sin);
      ctx.stroke();
    };

    if (ring.element === 'track') {
      ctx.strokeStyle = ring.trackColor;
      ctx.lineWidth = tickWidth * 0.7;

      // The track writes itself around the ring as the entrance fades it in.
      for (let k = 0; k < count; k++) {
        const written = clamp((ring.entrance * (1 + TRACK_WRITE_SPAN) - k / count) / TRACK_WRITE_SPAN, 0, 1);
        if (written <= 0) break;

        ctx.globalAlpha = baseAlpha * written;
        tick({ index: k, length: ring.width * IDLE_SCALE, offset: 0 });
      }
      ctx.globalAlpha = baseAlpha;

      return false;
    }

    const reached = tickTimes({ memo: ring.memo, key: 'reachedAt', count });
    const left = tickTimes({ memo: ring.memo, key: 'leftAt', count });
    const settled = !ring.animate;
    let animating = false;

    for (let k = 0; k < count; k++) {
      const leaving = k >= filled;

      if (leaving) {
        // Without motion a tick the value drops below is gone at once.
        const wasReached = !Number.isNaN(reached[k]);
        if (wasReached) left[k] = settled ? Number.NaN : ring.now;
        reached[k] = Number.NaN;
      } else {
        if (Number.isNaN(reached[k])) reached[k] = settled ? ring.now - TICK_SETTLE_MS : ring.now;
        left[k] = Number.NaN;
      }

      const since = leaving ? left[k] : reached[k];
      if (Number.isNaN(since)) continue;

      const age = ring.now - since;
      const moving = age < TICK_SETTLE_MS;
      if (leaving && !moving) continue;

      const isHead = k === filled - 1;
      const style = moving ? animation({ age, isHead, leaving }) : {};
      animating ||= moving;

      const flash = style.flash ?? 0;
      const color = flash > 0 ? mixColors(ring.color, env.theme.tooltip.textColor, flash) : ring.color;
      const glow = style.glow ?? 0;

      ctx.globalAlpha = baseAlpha * clamp(style.alpha ?? 1, 0, 1);
      ctx.strokeStyle = color;
      ctx.lineWidth = tickWidth;
      if (glow > 0) {
        ctx.shadowColor = color;
        ctx.shadowBlur = glow * env.horizontalPixelRatio;
      }

      const length = ring.width * (style.scale ?? 1) * (isHead ? HEAD_SCALE : 1);
      tick({ index: k, length, offset: (style.offset ?? 0) * ring.radius });

      if (glow > 0) ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = baseAlpha;

    return animating;
  };
}

const POP_MS = 320;
/** Share of the pop over which the fresh tick flashes. */
const POP_FLASH_SHARE = 0.35;

/**
 * A reached tick springs out from nothing past its length and settles, with a short
 * flash; a leaving tick plays the pop backwards, without the flash. The default.
 */
export function popTicks(): TickAnimation {
  return ({ age, leaving }) => {
    const t = clamp(age / POP_MS, 0, 1);
    const p = leaving ? 1 - t : t;
    const flash = !leaving && p < POP_FLASH_SHARE ? 0.45 * (1 - p / POP_FLASH_SHARE) : 0;

    return { scale: Math.max(0.05, easeOutBack(p)), alpha: Math.min(1, p * 4), flash };
  };
}

const RADAR_COOL_MS = 260;

/** The head glows and leaves a trail of ticks that cool down behind it; a leaving tick dims out in its last glow. */
export function radarTicks(): TickAnimation {
  return ({ age, leaving }) => {
    const heat = Math.exp(-age / RADAR_COOL_MS);
    if (leaving) return { alpha: heat, glow: 8 * heat };

    return { scale: 1 + 0.45 * heat, flash: 0.55 * heat, glow: 14 * heat };
  };
}

const FLY_MS = 420;
/** How far toward the center a tick starts, as a share of the ring radius. */
const FLY_REACH = 0.55;

/** A reached tick flies out from the center into its place; a leaving tick flies back. */
export function flyTicks(): TickAnimation {
  return ({ age, leaving }) => {
    const t = clamp(age / FLY_MS, 0, 1);
    const p = easeOutCubic(leaving ? 1 - t : t);

    return { alpha: p, offset: -(1 - p) * FLY_REACH };
  };
}

/** `72%`: the share of `max`, rounded. */
function percentText(item: RadialItem): string {
  return `${Math.round(item.percent)}%`;
}

/**
 * The first item large in the middle with its label under it, and the other items in
 * one colored line below. On an arc open at the bottom the number sits on the base.
 * Pairs with {@link heroLayout}.
 */
export function heroCenter(
  options: { format?: (item: RadialItem) => string; rest?: boolean } = {},
): RadialLabelPainter {
  const format = options.format ?? percentText;
  const showRest = options.rest ?? true;

  return (env, args) => {
    const { ctx, theme } = env;
    const [hero, ...rest] = args.rings.map((ring) => ring.item);
    if (hero === undefined || args.hole <= 0) return;

    const { cx, cy, hole } = args;
    const onBase = opensAtBottom(args);
    const rows = onBase ? { value: -0.3, caption: 0.04, rest: 0.22 } : { value: -0.14, caption: 0.22, rest: 0.45 };
    const maxWidth = hole * HERO.width;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const valueText = format(hero);
    const valueSize = fittedSize(env, { text: valueText, size: hole * HERO.valueFont, maxWidth, weight: 600 });
    if (valueSize !== null) {
      ctx.font = fontOf(env, { size: valueSize, weight: 600 });
      ctx.fillStyle = theme.tooltip.textColor;
      ctx.fillText(valueText, cx, cy + rows.value * hole);
    }

    const captionSize = fittedSize(env, { text: hero.label, size: hole * HERO.captionFont, maxWidth });
    if (captionSize !== null) {
      ctx.font = fontOf(env, { size: captionSize });
      ctx.fillStyle = theme.axis.textColor;
      ctx.fillText(hero.label, cx, cy + rows.caption * hole);
    }

    if (!showRest || rest.length === 0) return;

    const parts = rest.map((item) => ({ text: `${item.label} ${format(item)}`, color: item.color }));
    const fitted = fitLine(env, { parts, size: hole * HERO.restFont, maxWidth: hole * HERO.restWidth });
    ctx.font = fontOf(env, { size: fitted.size });

    let x = cx - ctx.measureText(fitted.line).width / 2;
    ctx.textAlign = 'left';
    for (const part of fitted.parts) {
      ctx.fillStyle = part.color;
      ctx.fillText(part.text, x, cy + rows.rest * hole);
      x += ctx.measureText(part.text + LINE_GAP).width;
    }
  };
}

const LINE_GAP = '   ';

interface LinePart {
  text: string;
  color: string;
}

/**
 * The longest head of `parts` that fits `maxWidth` on one line, with a `+N` part for
 * the rest, and its font size: at most `size`, never under the readable minimum. No
 * parts when not even the count fits.
 */
function fitLine(
  env: PaintEnv,
  args: { parts: LinePart[]; size: number; maxWidth: number },
): { parts: LinePart[]; line: string; size: number } {
  const { theme } = env;
  const total = args.parts.length;

  for (let shown = total; shown >= 0; shown--) {
    const parts = args.parts.slice(0, shown);
    if (shown < total) parts.push({ text: `+${total - shown}`, color: theme.axis.textColor });

    const line = parts.map((part) => part.text).join(LINE_GAP);
    const size = fittedSize(env, { text: line, size: args.size, maxWidth: args.maxWidth });
    if (size !== null) return { parts, line, size };
  }

  return { parts: [], line: '', size: args.size };
}

const LIST_MAX_FONT_PX = 16;
/** Line height of a list row, in font sizes. */
const LIST_LINE = 1.4;
/** Share of the hole radius the corners of the text may reach, so the text keeps off the innermost ring. */
const LIST_REACH = 0.9;

interface ListRow {
  item: RadialItem;
  value: string;
}

/** Widths of the label column, the value column, the gap between them, and all three. */
function listColumns(
  env: PaintEnv,
  args: { rows: ListRow[]; size: number },
): { label: number; value: number; gap: number; width: number } {
  const { ctx } = env;
  ctx.font = fontOf(env, { size: args.size });
  const label = Math.max(0, ...args.rows.map((row) => ctx.measureText(row.item.label).width));
  ctx.font = fontOf(env, { size: args.size, weight: 600 });
  const value = Math.max(0, ...args.rows.map((row) => ctx.measureText(row.value).width));
  const gap = args.size * 0.35;

  return { label, value, gap, width: label + value + 2 * gap };
}

/** The widest line of a list: the two columns, or the line that counts the rows left out. */
function listWidth(env: PaintEnv, args: { rows: ListRow[]; more?: string; size: number }): number {
  const columns = args.rows.length > 0 ? listColumns(env, args).width : 0;
  if (args.more === undefined) return columns;

  env.ctx.font = fontOf(env, { size: args.size });

  return Math.max(columns, env.ctx.measureText(args.more).width);
}

/**
 * Font size at which the block of rows has its corners inside the hole, up to body-text
 * size: standing on the base, or centered.
 */
function listSize(env: PaintEnv, args: { rows: ListRow[]; more?: string; hole: number; onBase: boolean }): number {
  const pr = env.horizontalPixelRatio;
  const probe = MIN_FONT_PX * pr;
  // In font sizes, as the text widths grow with the font.
  const width = listWidth(env, { rows: args.rows, more: args.more, size: probe }) / probe;
  const lines = args.rows.length + (args.more === undefined ? 0 : 1);
  const height = lines * LIST_LINE;
  const corner = Math.hypot(width / 2, args.onBase ? height : height / 2);

  return Math.min((args.hole * LIST_REACH) / corner, LIST_MAX_FONT_PX * pr);
}

/** The most rows that fit the hole at a readable size, with a `+N more` line for the rest; `null` when not one fits. */
function fitList(
  env: PaintEnv,
  args: { rows: ListRow[]; hole: number; onBase: boolean },
): { rows: ListRow[]; more?: string; size: number } | null {
  const total = args.rows.length;

  for (let shown = total; shown >= 1; shown--) {
    const rows = args.rows.slice(0, shown);
    const more = shown < total ? `+${total - shown} more` : undefined;
    const size = listSize(env, { rows, more, hole: args.hole, onBase: args.onBase });
    if (size >= MIN_FONT_PX * env.horizontalPixelRatio) return { rows, more, size };
  }

  return null;
}

/**
 * Every item as a `label value` row in the middle, the value in its ring color, as large
 * as the hole holds. On an arc open at the bottom the rows sit on the base. Rows that do
 * not fit become `+N more`; a hole too small for one row gets no text.
 */
export function listCenter(options: { format?: (item: RadialItem) => string } = {}): RadialLabelPainter {
  const format = options.format ?? percentText;

  return (env, args) => {
    const { ctx, theme } = env;
    const onBase = opensAtBottom(args);
    const all = args.rings.map((ring) => ({ item: ring.item, value: format(ring.item) }));
    // Text over the rings reads worse than no text.
    const fitted = fitList(env, { rows: all, hole: args.hole, onBase });
    if (fitted === null) return;

    const { rows, more, size } = fitted;
    const lines = rows.length + (more === undefined ? 0 : 1);
    const line = size * LIST_LINE;
    const firstRow = onBase ? args.cy - (lines - 0.5) * line : args.cy - ((lines - 1) * line) / 2;
    const columns = listColumns(env, { rows, size });
    // Labels end where values start; the split moves so the two columns center as one block.
    const split = args.cx + (columns.label - columns.value) / 2;
    ctx.textBaseline = 'middle';

    rows.forEach((row, i) => {
      const y = firstRow + i * line;
      ctx.textAlign = 'right';
      ctx.font = fontOf(env, { size });
      ctx.fillStyle = theme.axis.textColor;
      ctx.fillText(row.item.label, split - columns.gap, y);

      ctx.textAlign = 'left';
      ctx.font = fontOf(env, { size, weight: 600 });
      ctx.fillStyle = row.item.color;
      ctx.fillText(row.value, split + columns.gap, y);
    });

    if (more === undefined) return;

    ctx.textAlign = 'center';
    ctx.font = fontOf(env, { size });
    ctx.fillStyle = theme.axis.textColor;
    ctx.fillText(more, args.cx, firstRow + rows.length * line);
  };
}

/** Line height of a start label, in font sizes. */
const START_LINE = 1.2;

/** The smallest distance between two neighbour rings, or `Infinity` for one ring. */
function closestPitch(rings: RadialLabelRing[]): number {
  let pitch = Number.POSITIVE_INFINITY;
  for (let i = 1; i < rings.length; i++) {
    pitch = Math.min(pitch, Math.abs(rings[i - 1].radius - rings[i].radius));
  }

  return pitch;
}

/**
 * `label value` just before the start of each ring, along the ring. Needs a gap
 * before the start, e.g. `endAngle: 270`, or the text lands on the last ring's end.
 * Rings too close for readable text get no labels.
 */
export function startLabels(options: { format?: (item: RadialItem) => string } = {}): RadialLabelPainter {
  const format = options.format ?? percentText;

  return (env, args) => {
    const { ctx, theme } = env;
    const pr = env.horizontalPixelRatio;
    // Back along the ring from its start, past the round cap.
    const backX = Math.sin(args.startAngle);
    const backY = -Math.cos(args.startAngle);
    const toLeft = backX <= 0;
    const rings = args.rings.filter((ring) => ring.radius > 0);
    const room = closestPitch(rings) / START_LINE;
    if (room < MIN_FONT_PX * pr) return;

    ctx.textBaseline = 'middle';

    for (const ring of rings) {
      const size = Math.min(room, clamp(ring.width * 1.1, MIN_FONT_PX * pr, 18 * pr));
      const valueText = format(ring.item);
      const reach = ring.width * 0.7;
      const x = args.cx + ring.radius * Math.cos(args.startAngle) + backX * reach;
      const y = args.cy + ring.radius * Math.sin(args.startAngle) + backY * reach;

      ctx.font = fontOf(env, { size, weight: 600 });
      const valueWidth = ctx.measureText(valueText).width;
      ctx.font = fontOf(env, { size });
      const labelWidth = ctx.measureText(ring.item.label).width;
      const labelGap = size * 0.5;

      ctx.textAlign = toLeft ? 'right' : 'left';
      ctx.fillStyle = theme.axis.textColor;
      ctx.fillText(ring.item.label, toLeft ? x - valueWidth - labelGap : x, y);

      ctx.font = fontOf(env, { size, weight: 600 });
      ctx.fillStyle = theme.tooltip.textColor;
      ctx.fillText(valueText, toLeft ? x : x + labelWidth + labelGap, y);
    }
  };
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlaps(a: Box, b: Box): boolean {
  const apartX = a.x + a.width <= b.x || b.x + b.width <= a.x;
  const apartY = a.y + a.height <= b.y || b.y + b.height <= a.y;

  return !apartX && !apartY;
}

/** A pill in the ring color at the head of each ring, with `label value` in it. A pill that would cover an earlier one is left out. */
export function headTags(options: { format?: (item: RadialItem) => string } = {}): RadialLabelPainter {
  const format = options.format ?? percentText;

  return (env, args) => {
    const { ctx, theme } = env;
    const pr = env.horizontalPixelRatio;
    ctx.font = fontOf(env, { size: 11 * pr, weight: 600 });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const placed: Box[] = [];

    for (const ring of args.rings) {
      if (ring.radius <= 0) continue;

      const text = `${ring.item.label} ${format(ring.item)}`;
      const height = Math.max(18 * pr, ring.width * 1.2);
      const width = ctx.measureText(text).width + 12 * pr;
      const x = args.cx + ring.radius * Math.cos(ring.valueAngle);
      const y = args.cy + ring.radius * Math.sin(ring.valueAngle);
      // Pushed inside the drawing area, so a tag at the edge is not cut off.
      const { area } = args;
      const box = {
        x: clamp(x - width / 2, area.left, area.left + area.width - width),
        y: clamp(y - height / 2, area.top, area.top + area.height - height),
        width,
        height,
      };
      if (placed.some((other) => overlaps(box, other))) continue;

      placed.push(box);
      ctx.fillStyle = ring.item.color;
      fillRoundedRect(ctx, { ...box, radius: height / 2, corners: { tl: true, tr: true, br: true, bl: true } });

      ctx.fillStyle = theme.background;
      ctx.fillText(text, box.x + width / 2, box.y + height / 2);
    }
  };
}

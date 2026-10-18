import { DEFAULT_DEPTH_INTRO, DEFAULT_DEPTH_UPDATE } from '../animation/config';
import { easeOutCubic } from '../animation/easing';
import { IntroWave } from '../animation/intro-wave';
import { prefersReducedMotion } from '../animation/reduced-motion';
import { resolveAxisFontSize, resolveAxisTextColor, resolveCandlestickBodyColor } from '../theme/resolve';
import type { ChartTheme } from '../theme/types';
import type { DepthBook, DepthBookDelta, DepthLevel, DepthSeriesOptions, TimePoint } from '../types';
import { hexToRgba } from '../utils/color';
import { clamp, lerp, smoothToward } from '../utils/math';
import type { SeriesDefinition } from './definition';
import { fillRoundedRect } from './painters/canvas-path';
import type { LayerSnapshot, OverlayRenderContext, SeriesRenderContext, TimeSeriesRenderer, XFocus } from './types';

const BIDS = 0;
const ASKS = 1;
type Side = typeof BIDS | typeof ASKS;
const SIDES: readonly Side[] = [BIDS, ASKS];

/**
 * One side's cumulative depth as a step function of the outward distance from
 * mid — `-price` for bids, `price` for asks, so both sides grow with the key.
 * `values[i]` holds from `keys[i]` up to the next key, the last one onward;
 * the depth is 0 before `keys[0]`.
 */
export interface DepthStepShape {
  keys: number[];
  values: number[];
}

type SideShapes = readonly [DepthStepShape, DepthStepShape];

const EMPTY_SHAPE: DepthStepShape = { keys: [], values: [] };
const FULL_HEIGHT = (): number => 1;

interface ResolvedDepthOptions {
  span?: number;
  bidColor?: string;
  askColor?: string;
  strokeWidth: number;
  introMs: number;
  updateMs: number;
}

const DEFAULT_OPTIONS: ResolvedDepthOptions = {
  strokeWidth: 1,
  introMs: DEFAULT_DEPTH_INTRO,
  updateMs: DEFAULT_DEPTH_UPDATE,
};

/** The fill's top stop alpha; the hover highlight adds {@link HOVER_FILL_ALPHA} on top. */
const FILL_ALPHA = 0.3;
const HOVER_FILL_ALPHA = 0.22;
const MAX_LABEL_DECIMALS = 10;
/** A step under this fraction of the side's depth is below a pixel on any chart. */
const SIMPLIFY_TOLERANCE = 1e-4;

/** In-flight morph from the shape on screen when the update landed to the current target. */
interface Morph {
  from: SideShapes;
  midFrom: number | null;
  start: number;
  durationMs: number;
}

/** What one frame draws: each side's shape and the mid price, both mid-morph. */
interface DepthFrame {
  shapes: SideShapes;
  mid: number | null;
}

function toKey(price: number, side: Side): number {
  return side === BIDS ? -price : price;
}

function toPrice(key: number, side: Side): number {
  return side === BIDS ? -key : key;
}

function levelMap(levels: readonly DepthLevel[] | undefined): Map<number, number> {
  const map = new Map<number, number>();
  for (const [price, size] of levels ?? []) {
    if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) continue;

    map.set(price, size);
  }

  return map;
}

function mergeLevels(map: Map<number, number>, levels: readonly DepthLevel[] | undefined): void {
  for (const [price, size] of levels ?? []) {
    if (!Number.isFinite(price) || Number.isNaN(size)) continue;

    if (size > 0) {
      map.set(price, size);
    } else {
      map.delete(price);
    }
  }
}

/** Sort one side's levels outward from mid and accumulate their sizes. */
export function cumulativeShape(args: { levels: ReadonlyMap<number, number>; side: Side }): DepthStepShape {
  const { levels, side } = args;
  const entries = [...levels].map(([price, size]) => ({ key: toKey(price, side), size }));
  entries.sort((a, b) => a.key - b.key);

  const keys: number[] = [];
  const values: number[] = [];
  let total = 0;
  for (const entry of entries) {
    total += entry.size;
    keys.push(entry.key);
    values.push(total);
  }

  return { keys, values };
}

/** Index of the step holding `key` — the last breakpoint at or before it — or `-1` before the first. */
function stepIndex(shape: DepthStepShape, key: number): number {
  let lo = 0;
  let hi = shape.keys.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (shape.keys[mid] <= key) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return found;
}

function valueAt(shape: DepthStepShape, key: number): number {
  const index = stepIndex(shape, key);

  return index < 0 ? 0 : shape.values[index];
}

/**
 * Blend two step functions at `t` on the union of their breakpoints, so a
 * level only one of them has grows in (or flattens out) with the rest.
 */
export function blendShapes(args: { from: DepthStepShape; to: DepthStepShape; t: number }): DepthStepShape {
  const { from, to, t } = args;
  const keys: number[] = [];
  const values: number[] = [];
  let i = 0;
  let j = 0;
  let fromValue = 0;
  let toValue = 0;

  while (i < from.keys.length || j < to.keys.length) {
    const fromKey = i < from.keys.length ? from.keys[i] : Number.POSITIVE_INFINITY;
    const toKeyValue = j < to.keys.length ? to.keys[j] : Number.POSITIVE_INFINITY;
    const key = Math.min(fromKey, toKeyValue);
    if (fromKey === key) {
      fromValue = from.values[i];
      i++;
    }
    if (toKeyValue === key) {
      toValue = to.values[j];
      j++;
    }

    const value = lerp(fromValue, toValue, t);
    const previous = values.length > 0 ? values[values.length - 1] : 0;
    if (value === previous) continue;

    keys.push(key);
    values.push(value);
  }

  return { keys, values };
}

/**
 * Drop the steps whose change is too small to see, so a level that faded out
 * across a chain of retargets leaves no breakpoint behind.
 */
function simplifyShape(shape: DepthStepShape): DepthStepShape {
  const total = shape.values.length > 0 ? Math.max(...shape.values.map(Math.abs)) : 0;
  const tolerance = total * SIMPLIFY_TOLERANCE;
  const keys: number[] = [];
  const values: number[] = [];
  let previous = 0;
  for (let i = 0; i < shape.keys.length; i++) {
    if (Math.abs(shape.values[i] - previous) <= tolerance) continue;

    keys.push(shape.keys[i]);
    values.push(shape.values[i]);
    previous = shape.values[i];
  }

  return { keys, values };
}

/** Digits after the decimal point of `value` as written, capped. */
function decimalsOf(value: number): number {
  const text = String(value);
  if (text.includes('e')) return MAX_LABEL_DECIMALS;

  const dot = text.indexOf('.');
  if (dot < 0) return 0;

  return Math.min(MAX_LABEL_DECIMALS, text.length - dot - 1);
}

/**
 * Order book: cumulative bid size stepping down to the best bid on the
 * left of mid and cumulative ask size stepping up from the best ask on the
 * right, on a numeric X axis. Bids are layer 0, asks layer 1.
 */
export class DepthRenderer implements TimeSeriesRenderer {
  readonly kind = 'depth' as const;

  #options: ResolvedDepthOptions;
  #theme: ChartTheme;

  /** Size by price, per side — the book `updateData` deltas merge into. */
  #levels: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  #target: SideShapes = [EMPTY_SHAPE, EMPTY_SHAPE];
  #mid: number | null = null;
  #spread: number | null = null;
  /** Decimals the mid label prints the best prices with. */
  #priceDecimals = 0;
  #morph: Morph | null = null;
  #intro = new IntroWave();
  #reducedMotion = false;
  #visible: [boolean, boolean] = [true, true];

  /** The hovered side and price; kept while the highlight fades out. */
  #hover: { side: Side; price: number } | null = null;
  #hoverAmount = 0;
  /** Time of the last hover ease step; `0` while the highlight rests at 0. */
  #hoverClock = 0;

  #dataListeners: Array<() => void> = [];

  constructor(args: { options?: Partial<DepthSeriesOptions>; theme: ChartTheme }) {
    this.#options = DepthRenderer.#normalize(DEFAULT_OPTIONS, args.options ?? {});
    this.#theme = args.theme;
  }

  /** Merge `incoming` over `base`; a key set to `undefined` goes back to its default. */
  static #normalize(base: ResolvedDepthOptions, incoming: Partial<DepthSeriesOptions>): ResolvedDepthOptions {
    const merged = { ...base, ...incoming };

    return {
      ...merged,
      strokeWidth: Math.max(0, merged.strokeWidth ?? DEFAULT_OPTIONS.strokeWidth),
      introMs: Math.max(0, merged.introMs ?? DEFAULT_OPTIONS.introMs),
      updateMs: Math.max(0, merged.updateMs ?? DEFAULT_OPTIONS.updateMs),
    };
  }

  // --- Data ingest -----------------------------------------------------------

  /** Replace the book with a `{ bids, asks }` snapshot; the drawn book morphs to it. */
  setData(data: unknown): void {
    const book = (data ?? {}) as Partial<DepthBook>;
    this.#levels = [levelMap(book.bids), levelMap(book.asks)];
    this.#retarget();
  }

  /** Merge a `{ bids?, asks? }` delta into the book; a size of 0 removes the level. */
  updateLastPoint(point: unknown): void {
    const delta = (point ?? {}) as DepthBookDelta;
    mergeLevels(this.#levels[BIDS], delta.bids);
    mergeLevels(this.#levels[ASKS], delta.asks);
    this.#retarget();
  }

  #retarget(): void {
    const now = performance.now();
    const hadData = this.#hasData();
    const onScreen = hadData ? this.#frame(now) : null;

    this.#target = [
      cumulativeShape({ levels: this.#levels[BIDS], side: BIDS }),
      cumulativeShape({ levels: this.#levels[ASKS], side: ASKS }),
    ];
    this.#updateMid();
    this.#reducedMotion = prefersReducedMotion();

    const animate = this.#options.updateMs > 0 && !this.#reducedMotion;
    if (onScreen !== null && animate) {
      const from: SideShapes = [simplifyShape(onScreen.shapes[BIDS]), simplifyShape(onScreen.shapes[ASKS])];
      this.#morph = { from, midFrom: onScreen.mid, start: now, durationMs: this.#options.updateMs };
    } else {
      this.#morph = null;
    }

    if (!hadData && this.#hasData()) this.#intro.arm(this.#options.introMs);

    for (const listener of this.#dataListeners) {
      listener();
    }
  }

  #updateMid(): void {
    const [bids, asks] = this.#target;
    const bestBid = bids.keys.length > 0 ? toPrice(bids.keys[0], BIDS) : null;
    const bestAsk = asks.keys.length > 0 ? toPrice(asks.keys[0], ASKS) : null;

    if (bestBid !== null && bestAsk !== null) {
      this.#mid = (bestBid + bestAsk) / 2;
      this.#spread = bestAsk - bestBid;
      this.#priceDecimals = Math.max(decimalsOf(bestBid), decimalsOf(bestAsk));

      return;
    }

    this.#mid = bestBid ?? bestAsk;
    this.#spread = null;
    this.#priceDecimals = this.#mid === null ? 0 : decimalsOf(this.#mid);
  }

  #hasData(): boolean {
    return this.#target[BIDS].keys.length > 0 || this.#target[ASKS].keys.length > 0;
  }

  /** The mid on screen at `now` — the frame's mid without blending the walls. */
  #drawnMid(now: number): number | null {
    const morph = this.#morph;
    if (morph === null) return this.#mid;

    const t = easeOutCubic(clamp((now - morph.start) / morph.durationMs, 0, 1));
    const midFrom = morph.midFrom ?? this.#mid;
    const midTo = this.#mid ?? midFrom;

    return midFrom === null || midTo === null ? null : lerp(midFrom, midTo, t);
  }

  /** The shapes and mid on screen at `now`. */
  #frame(now: number): DepthFrame {
    const morph = this.#morph;
    if (morph === null) return { shapes: this.#target, mid: this.#mid };

    const t = easeOutCubic(clamp((now - morph.start) / morph.durationMs, 0, 1));
    const shapes: SideShapes = [
      blendShapes({ from: morph.from[BIDS], to: this.#target[BIDS], t }),
      blendShapes({ from: morph.from[ASKS], to: this.#target[ASKS], t }),
    ];

    return { shapes, mid: this.#drawnMid(now) };
  }

  onDataChanged(listener: () => void): () => void {
    this.#dataListeners.push(listener);

    return () => {
      const index = this.#dataListeners.indexOf(listener);
      if (index >= 0) this.#dataListeners.splice(index, 1);
    };
  }

  updateOptions(options: Partial<DepthSeriesOptions>): void {
    this.#options = DepthRenderer.#normalize(this.#options, options ?? {});

    if (this.#options.introMs === 0) this.#intro.finish();
    if (this.#options.updateMs === 0) this.#morph = null;
  }

  applyTheme(theme: ChartTheme): void {
    this.#theme = theme;
  }

  // --- Layers ------------------------------------------------------------------

  getLayerCount(): number {
    return 2;
  }

  setLayerVisible(index: number, visible: boolean): void {
    if (index === BIDS || index === ASKS) this.#visible[index] = visible;
  }

  isLayerVisible(index: number): boolean {
    return index === BIDS || index === ASKS ? this.#visible[index] : true;
  }

  getLayerColors(): string[] {
    return [this.#sideColor(BIDS), this.#sideColor(ASKS)];
  }

  #sideColor(side: Side): string {
    if (side === BIDS) return this.#options.bidColor ?? resolveCandlestickBodyColor(this.#theme.candlestick.up.body);

    return this.#options.askColor ?? resolveCandlestickBodyColor(this.#theme.candlestick.down.body);
  }

  getTotalLength(): number {
    return this.#levels[BIDS].size + this.#levels[ASKS].size;
  }

  // --- Time-series queries (X is price) -------------------------------------------

  getTimeBounds(): { first: number; last: number } | null {
    const prices: number[] = [];
    for (const side of SIDES) {
      const { keys } = this.#target[side];
      if (keys.length === 0) continue;

      prices.push(toPrice(keys[0], side), toPrice(keys[keys.length - 1], side));
    }
    if (prices.length === 0) return null;

    return { first: Math.min(...prices), last: Math.max(...prices) };
  }

  getLastDataPoint(): TimePoint | null {
    return null;
  }

  getSecondLastDataPoint(): TimePoint | null {
    return null;
  }

  /** Level prices in ascending order — the chart reads the price step from them. */
  sampleTimes(maxCount: number, from: 'start' | 'end' = 'start'): number[] {
    const bids = this.#target[BIDS].keys.map((key) => toPrice(key, BIDS)).reverse();
    const asks = this.#target[ASKS].keys.map((key) => toPrice(key, ASKS));
    const prices = [...bids, ...asks];

    return from === 'end' ? prices.slice(Math.max(0, prices.length - maxCount)) : prices.slice(0, maxCount);
  }

  getVisibleDataPoints(): readonly TimePoint[] {
    return [];
  }

  /** From 0 to the deepest cumulative size inside `[from, to]`, which sits at the window's edges. */
  getValueRange(from: number, to: number): { min: number; max: number } | null {
    if (!this.#hasData()) return null;

    const deepestBid = this.#visible[BIDS] ? valueAt(this.#target[BIDS], toKey(from, BIDS)) : 0;
    const deepestAsk = this.#visible[ASKS] ? valueAt(this.#target[ASKS], toKey(to, ASKS)) : 0;

    return { min: 0, max: Math.max(deepestBid, deepestAsk) };
  }

  /** The level under `price` on its side of mid: the hovered side's row for the tooltip. */
  getLayerSnapshots(time: number): LayerSnapshot[] | null {
    const level = this.#levelAt(time);
    if (level === null) return null;

    return [
      {
        layerIndex: level.side,
        time: level.price,
        value: level.cumulative,
        color: this.#sideColor(level.side),
        x: level.price,
      },
    ];
  }

  /** The best bid and the best ask with their sizes. */
  getLayerLastSnapshots(): LayerSnapshot[] | null {
    const snapshots: LayerSnapshot[] = [];
    for (const side of SIDES) {
      const shape = this.#target[side];
      if (!this.#visible[side] || shape.keys.length === 0) continue;

      const price = toPrice(shape.keys[0], side);
      snapshots.push({ layerIndex: side, time: price, value: shape.values[0], color: this.#sideColor(side), x: price });
    }

    return snapshots.length > 0 ? snapshots : null;
  }

  #levelAt(price: number): { side: Side; price: number; cumulative: number } | null {
    if (this.#mid === null) return null;

    const side: Side = price <= this.#mid ? BIDS : ASKS;
    if (!this.#visible[side]) return null;

    const shape = this.#target[side];
    const index = stepIndex(shape, toKey(price, side));
    if (index < 0) return null;

    return { side, price: toPrice(shape.keys[index], side), cumulative: shape.values[index] };
  }

  getXFocus(): XFocus | null {
    const mid = this.#mid;
    if (mid === null) return null;

    const drawnCenter = this.#drawnMid(performance.now()) ?? mid;
    if (this.#options.span !== undefined && this.#options.span > 0) {
      return { center: mid, drawnCenter, halfWidth: Math.abs(mid) * this.#options.span };
    }

    const reaches: number[] = [];
    for (const side of SIDES) {
      const { keys } = this.#target[side];
      if (keys.length > 0) reaches.push(Math.abs(toPrice(keys[keys.length - 1], side) - mid));
    }

    const halfWidth = Math.min(...reaches);
    const fallback = Math.abs(mid) * 0.01 || 1;

    return { center: mid, drawnCenter, halfWidth: halfWidth > 0 ? halfWidth : fallback };
  }

  // --- Animation ---------------------------------------------------------------

  get needsAnimation(): boolean {
    return this.#intro.active || this.#morph !== null;
  }

  getIntroFront(): number {
    return this.#intro.sweep();
  }

  /** The highlight keeps the overlay ticking while it eases in or out. */
  get overlayNeedsAnimation(): boolean {
    return this.#hoverAmount > 0 && this.#hoverAmount < 1;
  }

  dispose(): void {
    this.#dataListeners = [];
    this.#levels = [new Map(), new Map()];
    this.#target = [EMPTY_SHAPE, EMPTY_SHAPE];
    this.#morph = null;
  }

  // --- Render --------------------------------------------------------------------

  render(ctx: SeriesRenderContext): void {
    const now = performance.now();
    this.#intro.tick(now);

    // Only the main pass settles the morph, so its last frame is the one drawn.
    const morphDone = this.#morph !== null && now - this.#morph.start >= this.#morph.durationMs;
    if (morphDone) this.#morph = null;

    const frame = this.#frame(now);
    if (frame.mid === null) return;

    const { bitmapSize } = ctx.scope;
    const midX = ctx.timeScale.timeToBitmapXExact(frame.mid);
    const front = this.#intro.sweep();
    const heightAt = this.#introHeights({ ctx, mid: frame.mid });
    const reach = front < 1 ? Math.max(midX, bitmapSize.width - midX) * front : undefined;

    for (const side of SIDES) {
      if (!this.#visible[side]) continue;

      this.#drawWall({ ctx, side, frame, heightAt, reach });
    }

    this.#drawMidMarker({ ctx, mid: frame.mid, alpha: front });
  }

  /**
   * Height factor per level during the intro: a level rises once the wave
   * travelling out from mid reaches it, so the walls grow from the middle.
   */
  #introHeights(args: { ctx: SeriesRenderContext; mid: number }): (price: number) => number {
    if (!this.#intro.active) return FULL_HEIGHT;

    const { from, to } = args.ctx.timeScale.getRange();
    const reach = Math.max(args.mid - from, to - args.mid);

    return (price) => this.#intro.progressAt(reach > 0 ? Math.abs(price - args.mid) / reach : 0);
  }

  /**
   * Trace one wall's step line from mid out to the pane edge — or to `reach`
   * bitmap px from mid, the intro's reveal front; `closed` drops it back to 0 for the fill.
   */
  #traceWall(args: {
    ctx: SeriesRenderContext | OverlayRenderContext;
    side: Side;
    frame: DepthFrame;
    heightAt: (price: number) => number;
    reach?: number;
    closed: boolean;
  }): void {
    const { ctx, side, frame, heightAt, reach, closed } = args;
    const { context, bitmapSize, horizontalPixelRatio } = ctx.scope;
    const { timeScale, yScale } = ctx;
    const shape = frame.shapes[side];
    const baseY = yScale.valueToBitmapYExact(0);
    const midX = timeScale.timeToBitmapXExact(frame.mid ?? 0);
    const overhang = this.#options.strokeWidth * horizontalPixelRatio;
    const paneEdgeX = side === BIDS ? -overhang : bitmapSize.width + overhang;
    const frontX = side === BIDS ? midX - (reach ?? 0) : midX + (reach ?? 0);
    const edgeX = reach === undefined ? paneEdgeX : frontX;

    // Mid-morph a fading level can sit across mid: pin it to mid so each wall
    // keeps to its own half and still rises from 0 there.
    const ownHalf = (x: number) => (side === BIDS ? Math.min(x, midX) : Math.max(x, midX));

    context.beginPath();
    context.moveTo(midX, baseY);

    // The intro grows each level's own size, so a lagging outer level never dips below an inner one.
    let previousY = baseY;
    let previousValue = 0;
    let drawn = 0;
    for (let i = 0; i < shape.keys.length; i++) {
      const price = toPrice(shape.keys[i], side);
      const x = ownHalf(timeScale.timeToBitmapXExact(price));
      // Past the end the step's riser would show; the flat run to the end stays at the last height.
      const beyond = side === BIDS ? x < edgeX : x > edgeX;
      if (beyond) break;

      drawn += (shape.values[i] - previousValue) * heightAt(price);
      previousValue = shape.values[i];
      const y = yScale.valueToBitmapYExact(drawn);
      context.lineTo(x, previousY);
      context.lineTo(x, y);
      previousY = y;
    }
    context.lineTo(edgeX, previousY);

    if (!closed) return;

    context.lineTo(edgeX, baseY);
    context.closePath();
  }

  #drawWall(args: {
    ctx: SeriesRenderContext;
    side: Side;
    frame: DepthFrame;
    heightAt: (price: number) => number;
    reach: number | undefined;
  }): void {
    const { ctx, side } = args;
    if (args.frame.shapes[side].keys.length === 0) return;

    const { context, verticalPixelRatio, horizontalPixelRatio } = ctx.scope;
    const color = this.#sideColor(side);
    const baseY = ctx.yScale.valueToBitmapYExact(0);

    const gradient = context.createLinearGradient(0, ctx.padding.top * verticalPixelRatio, 0, baseY);
    gradient.addColorStop(0, hexToRgba(color, FILL_ALPHA));
    gradient.addColorStop(1, hexToRgba(color, 0.04));
    this.#traceWall({ ...args, closed: true });
    context.fillStyle = gradient;
    context.fill();

    if (this.#options.strokeWidth <= 0) return;

    this.#traceWall({ ...args, closed: false });
    context.strokeStyle = color;
    context.lineWidth = this.#options.strokeWidth * horizontalPixelRatio;
    context.lineJoin = 'miter';
    context.stroke();
  }

  /** Dashed vertical line at mid with a `mid · spread` pill at the top of the plot. */
  #drawMidMarker(args: { ctx: SeriesRenderContext; mid: number; alpha: number }): void {
    const { ctx, mid, alpha } = args;
    if (alpha <= 0) return;

    const { scope, theme, timeScale, yScale } = ctx;
    const { context, bitmapSize, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
    const x = Math.round(timeScale.timeToBitmapXExact(mid)) + 0.5;
    const baseY = yScale.valueToBitmapYExact(0);

    const fontSize = resolveAxisFontSize(theme);
    const pillHeight = (fontSize + 10) * vpr;
    // Below the header (Title / InfoBar fold their height into padding.top), where the walls are lowest.
    const pillTop = (ctx.padding.top + 2) * vpr;

    context.save();
    context.globalAlpha *= alpha;

    context.save();
    context.beginPath();
    context.moveTo(x, pillTop + pillHeight);
    context.lineTo(x, baseY);
    context.setLineDash([4 * vpr, 4 * vpr]);
    context.strokeStyle = resolveAxisTextColor(theme);
    context.lineWidth = Math.max(1, Math.round(hpr));
    context.globalAlpha *= 0.7;
    context.stroke();
    context.restore();

    context.font = `${fontSize * hpr}px ${theme.typography.fontFamily}`;
    const text = this.#midLabel(timeScale.getLocale());
    const textWidth = context.measureText(text).width;
    const pillWidth = textWidth + 16 * hpr;
    const pillLeft = clamp(x - pillWidth / 2, 0, Math.max(0, bitmapSize.width - pillWidth));

    context.fillStyle = theme.tooltip.background;
    fillRoundedRect(context, {
      x: pillLeft,
      y: pillTop,
      width: pillWidth,
      height: pillHeight,
      radius: 6 * hpr,
      corners: { tl: true, tr: true, br: true, bl: true },
    });

    context.fillStyle = theme.tooltip.textColor;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, pillLeft + pillWidth / 2, pillTop + pillHeight / 2);
    context.restore();
  }

  #midLabel(locale: string | undefined): string {
    const format = (value: number, decimals: number) =>
      value.toLocaleString(locale ?? 'en-US', { maximumFractionDigits: decimals });

    const mid = `mid ${format(this.#mid ?? 0, this.#priceDecimals + 1)}`;
    if (this.#spread === null) return mid;

    return `${mid} · spread ${format(this.#spread, this.#priceDecimals)}`;
  }

  // --- Hover -----------------------------------------------------------------------

  /** Highlight the area from mid to the hovered price on its side, and put a dot on the step's level. */
  drawOverlay(ctx: OverlayRenderContext): void {
    const now = performance.now();
    const frame = this.#frame(now);
    if (frame.mid === null) {
      // No book, no wall to glow: rest at 0 so the overlay stops ticking.
      this.#hoverAmount = 0;
      this.#hoverClock = 0;

      return;
    }

    // Ahead of the intro's reveal front there is no wall to hover.
    if (this.#intro.active) return;

    const hovered = this.#hoveredStep({ ctx, frame });
    if (hovered !== null) this.#hover = { side: hovered.side, price: hovered.price };
    this.#easeHover({ now, target: hovered === null ? 0 : 1 });

    if (this.#hover !== null && this.#hoverAmount > 0) {
      this.#drawHighlight({ ctx, frame, hover: this.#hover });
    }

    if (hovered === null) return;

    // Pinned to the wall's side of mid, as #traceWall pins a level fading across it.
    const dotPrice = hovered.side === BIDS ? Math.min(hovered.level, frame.mid) : Math.max(hovered.level, frame.mid);
    const { context, horizontalPixelRatio: hpr } = ctx.scope;
    const x = ctx.timeScale.timeToBitmapXExact(dotPrice);
    const y = ctx.yScale.valueToBitmapYExact(hovered.value);
    const radius = 4 * hpr;
    const color = this.#sideColor(hovered.side);

    context.save();
    context.globalAlpha *= 0.25;
    context.beginPath();
    context.arc(x, y, radius + 3 * hpr, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.restore();

    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
  }

  /**
   * The drawn step under the crosshair — the pointer `price`, and the `level`
   * whose corner tops the step — or `null` off the walls (the spread, a hidden side).
   */
  #hoveredStep(args: {
    ctx: OverlayRenderContext;
    frame: DepthFrame;
  }): { side: Side; price: number; level: number; value: number } | null {
    const { ctx, frame } = args;
    if (ctx.crosshair === null || frame.mid === null) return null;

    const price = ctx.crosshair.time;
    const side: Side = price <= frame.mid ? BIDS : ASKS;
    if (!this.#visible[side]) return null;

    const shape = frame.shapes[side];
    const index = stepIndex(shape, toKey(price, side));
    if (index < 0 || shape.values[index] <= 0) return null;

    return { side, price, level: toPrice(shape.keys[index], side), value: shape.values[index] };
  }

  #easeHover(args: { now: number; target: number }): void {
    const { now, target } = args;
    const animate = this.#options.updateMs > 0 && !this.#reducedMotion;
    if (!animate) {
      this.#hoverAmount = target;

      return;
    }

    // From rest the previous overlay frame is long gone; step one nominal frame.
    const dt = this.#hoverClock === 0 ? 1 / 60 : Math.min(0.05, (now - this.#hoverClock) / 1000);
    const next = smoothToward(this.#hoverAmount, target, 3000 / this.#options.updateMs, dt);
    const settled = Math.abs(next - target) < 0.01;
    this.#hoverAmount = settled ? target : next;
    this.#hoverClock = this.#hoverAmount === 0 ? 0 : now;
  }

  #drawHighlight(args: { ctx: OverlayRenderContext; frame: DepthFrame; hover: { side: Side; price: number } }): void {
    const { ctx, frame, hover } = args;
    if (frame.mid === null || !this.#visible[hover.side]) return;

    const { context, bitmapSize, horizontalPixelRatio } = ctx.scope;
    const midX = ctx.timeScale.timeToBitmapXExact(frame.mid);
    const hoverX = ctx.timeScale.timeToBitmapXExact(hover.price);
    const color = this.#sideColor(hover.side);

    context.save();
    context.beginPath();
    context.rect(Math.min(midX, hoverX), 0, Math.abs(hoverX - midX), bitmapSize.height);
    context.clip();

    this.#traceWall({ ctx, side: hover.side, frame, heightAt: FULL_HEIGHT, closed: true });
    context.fillStyle = hexToRgba(color, HOVER_FILL_ALPHA * this.#hoverAmount);
    context.fill();

    this.#traceWall({ ctx, side: hover.side, frame, heightAt: FULL_HEIGHT, closed: false });
    context.strokeStyle = color;
    context.lineWidth = (this.#options.strokeWidth + 1) * horizontalPixelRatio;
    context.globalAlpha *= this.#hoverAmount;
    context.stroke();
    context.restore();
  }
}

/** Series definition for `chart.addSeries` — plots on a numeric (price) X axis only. */
export const DepthSeriesDef: SeriesDefinition<DepthSeriesOptions> = {
  type: 'depth',
  xTypes: ['numeric'],
  layerLabels: ['Bids', 'Asks'],
  create: (env, options) => new DepthRenderer({ options, theme: env.theme }),
};

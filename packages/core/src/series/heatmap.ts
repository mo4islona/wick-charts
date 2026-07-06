import { DEFAULT_HEATMAP_ENTRY, DEFAULT_HEATMAP_UPDATE } from '../animation/config';
import { easeOutCubic } from '../animation/easing';
import { resolveAxisFontSize, resolveAxisTextColor } from '../theme/resolve';
import type { ChartTheme } from '../theme/types';
import type { HeatmapCellData, HeatmapCellLabelsOptions, HeatmapSeriesOptions } from '../types';
import { deriveHeatmapRamp, isLightColor, mixColors, sampleRamp } from '../utils/color';
import { formatCompact } from '../utils/format';
import { clamp, smoothToward } from '../utils/math';
import type { SeriesDefinition } from './definition';
import { fillRoundedRect } from './painters/canvas-path';
import type { HeatmapSeriesRenderer, HoverInfo, RenderPadding, SeriesRenderContext } from './types';

/**
 * Resolved per-cell label config. `false` when labels are off; `format`
 * stays optional — when absent the renderer picks decimals adaptively from
 * the value domain (2 for unit-scale domains like correlations, integers
 * for wide ones, compact past 1000).
 */
type ResolvedCellLabels = false | ({ fontSize: number } & Pick<HeatmapCellLabelsOptions, 'format'>);

const DEFAULT_CELL_LABELS: { fontSize: number } = {
  fontSize: 10,
};

/** Domain-aware default label format — see {@link ResolvedCellLabels}. */
function defaultCellFormat(value: number, span: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return formatCompact(value);
  if (span <= 2) return value.toFixed(2);
  if (span <= 20) return value.toFixed(1);

  return Math.round(value).toString();
}

/**
 * Concrete option state the renderer works against. `colors` / `min` / `max`
 * stay optional — they resolve against the theme / data at render time so a
 * theme swap or data update re-derives them without an options round-trip.
 */
interface ResolvedHeatmapOptions {
  colors?: string[];
  min?: number;
  max?: number;
  gap: number;
  cornerRadius: number;
  axisLabels: boolean;
  cellLabels: ResolvedCellLabels;
  columns?: string[];
  rows?: string[];
  entryMs: number;
  updateMs: number;
}

const DEFAULT_OPTIONS: ResolvedHeatmapOptions = {
  gap: 2,
  cornerRadius: 3,
  axisLabels: true,
  cellLabels: false,
  entryMs: DEFAULT_HEATMAP_ENTRY,
  updateMs: DEFAULT_HEATMAP_UPDATE,
};

/** Resolve the `cellLabels` boolean-or-object option. */
function resolveCellLabels(raw: HeatmapSeriesOptions['cellLabels']): ResolvedCellLabels {
  if (raw === undefined || raw === false) return false;
  if (raw === true) return DEFAULT_CELL_LABELS;

  return { ...DEFAULT_CELL_LABELS, ...raw };
}

/** Normalize the public partial options onto a resolved base. */
function normalize(base: ResolvedHeatmapOptions, incoming: Partial<HeatmapSeriesOptions>): ResolvedHeatmapOptions {
  const merged: ResolvedHeatmapOptions = {
    ...base,
    ...incoming,
    cellLabels: incoming.cellLabels === undefined ? base.cellLabels : resolveCellLabels(incoming.cellLabels),
  };

  merged.gap = Math.max(0, merged.gap);
  merged.cornerRadius = Math.max(0, merged.cornerRadius);
  merged.entryMs = Math.max(0, merged.entryMs);
  merged.updateMs = Math.max(0, merged.updateMs);

  return merged;
}

/** One placed cell: the datum plus its resolved grid coordinates. */
interface PlacedCell {
  x: string;
  y: string;
  value: number;
  color?: string;
  col: number;
  row: number;
  /** `cellKey(x, y)`, computed once at grid build and reused by the render /
   *  tick / displayed-value lookups so no key string is rebuilt per frame. */
  key: string;
}

/** Inputs to {@link computeHeatmapGeometry}. All values in bitmap pixels. */
interface HeatmapGeometryInput {
  bitmapWidth: number;
  bitmapHeight: number;
  padTop: number;
  padBottom: number;
  /** Horizontal reserve on the left for row labels (0 when labels are off). */
  gutterLeft: number;
  /** Vertical reserve at the bottom for column labels (0 when labels are off). */
  gutterBottom: number;
  cols: number;
  rows: number;
}

/** Resolved grid frame: origin of the cell area plus per-slot dimensions. */
interface HeatmapGeometry {
  originX: number;
  originY: number;
  /** Full slot width including the inter-cell gap. */
  slotW: number;
  /** Full slot height including the inter-cell gap. */
  slotH: number;
}

/**
 * Compute the grid frame inside the padded bitmap. Shared by `render` and
 * `hitTest` so pointer math always matches the painted geometry. Padding is
 * clamped the same way pie clamps it — malformed values must not push the
 * grid off-bitmap.
 */
function computeHeatmapGeometry(input: HeatmapGeometryInput): HeatmapGeometry | null {
  const { bitmapWidth, bitmapHeight, gutterLeft, gutterBottom, cols, rows } = input;
  if (cols <= 0 || rows <= 0) return null;

  const top = Math.min(Math.max(0, input.padTop), bitmapHeight);
  const bottom = Math.min(Math.max(0, input.padBottom), bitmapHeight - top);
  const usableWidth = Math.max(0, bitmapWidth - gutterLeft);
  const usableHeight = Math.max(0, bitmapHeight - top - bottom - gutterBottom);
  if (usableWidth <= 0 || usableHeight <= 0) return null;

  return {
    originX: gutterLeft,
    originY: top,
    slotW: usableWidth / cols,
    slotH: usableHeight / rows,
  };
}

/** Composite key for the per-cell displayed-value map. `\u0000` can't appear in normal labels. */
function cellKey(x: string, y: string): string {
  return `${x}\u0000${y}`;
}

export class HeatmapRenderer implements HeatmapSeriesRenderer {
  readonly kind = 'heatmap' as const;

  #data: HeatmapCellData[] = [];
  #options: ResolvedHeatmapOptions;

  /** Column keys in display order (left → right). */
  #cols: string[] = [];
  /** Row keys in display order (top → bottom). */
  #rows: string[] = [];
  /** Cells with resolved grid coordinates. Last datum wins on (x, y) collisions. */
  #cells: PlacedCell[] = [];
  /** Grid-position → index into {@link #cells}, or -1 for an empty slot. */
  #cellAt: number[] = [];

  /**
   * Animated value per cell key. Targets live in {@link #cells}; these chase
   * them when a same-shape `setData` lands, so live matrix updates morph
   * colors instead of snapping.
   */
  #displayed = new Map<string, number>();
  /** True while any displayed value is still chasing its target. */
  #valuesSettling = false;

  /** Hover lift per grid position (0..1), eased toward the hovered index. */
  #hoverOffsets: number[] = [];
  /** Grid position of the hovered cell (-1 = none). */
  #hoverIndex = -1;

  /**
   * Entrance-wave clock. `0` = armed but not started (first render stamps
   * it); the wave replays on initial seed and grid-shape changes only.
   */
  #entryStart = 0;
  #entryDone = false;

  #lastRenderTime = 0;

  /**
   * Cached left/bottom label gutters in bitmap pixels, keyed by the measured
   * font. `hitTest` runs between renders and reuses the last measurement —
   * same trade-off as pie's label reserve.
   */
  #gutterCache: { font: string; left: number; bottom: number } | null = null;

  /** Subscribers notified on setData (no TimeSeriesStore to piggy-back on). */
  #dataListeners: Array<() => void> = [];

  /**
   * Active theme snapshot — seeded from the create env and refreshed by
   * {@link applyTheme}. Lets between-render queries (`getLayerColors` for
   * legends) resolve the same ramp the canvas paints with.
   */
  #theme: ChartTheme | null;

  /** Data extent cached by {@link #rebuildGrid} — see {@link #domain}. */
  #dataExtent: { min: number; max: number } = { min: 0, max: 1 };

  constructor(options?: Partial<HeatmapSeriesOptions>, theme?: ChartTheme) {
    this.#options = normalize(DEFAULT_OPTIONS, options ?? {});
    this.#entryDone = this.#options.entryMs === 0;
    this.#theme = theme ?? null;
  }

  // --- Data ingest -----------------------------------------------------------

  setData(data: unknown): void {
    const prevShape = this.#shapeKey();
    const hadData = this.#cells.length > 0;

    this.#data = (data ?? []) as HeatmapCellData[];
    this.#rebuildGrid();

    const sameShape = hadData && this.#shapeKey() === prevShape;
    if (sameShape) {
      // In-place update: keep displayed values and let render tween them
      // toward the new targets. Keys that just appeared snap.
      for (const cell of this.#cells) {
        if (!this.#displayed.has(cell.key)) this.#displayed.set(cell.key, cell.value);
      }
      this.#valuesSettling = this.#options.updateMs > 0;
    } else {
      // Fresh grid: snap values and replay the entrance wave.
      this.#displayed = new Map(this.#cells.map((cell) => [cell.key, cell.value]));
      this.#valuesSettling = false;
      this.#entryStart = 0;
      this.#entryDone = this.#options.entryMs === 0;
    }

    this.#gutterCache = null;
    for (const listener of this.#dataListeners) {
      listener();
    }
  }

  getData(): HeatmapCellData[] {
    return this.#data;
  }

  onDataChanged(listener: () => void): () => void {
    this.#dataListeners.push(listener);
    return () => {
      const i = this.#dataListeners.indexOf(listener);
      if (i >= 0) this.#dataListeners.splice(i, 1);
    };
  }

  updateOptions(options: Partial<HeatmapSeriesOptions>): void {
    const prevColumns = this.#options.columns;
    const prevRows = this.#options.rows;
    this.#options = normalize(this.#options, options ?? {});

    if (this.#options.columns !== prevColumns || this.#options.rows !== prevRows) {
      this.#rebuildGrid();
    }

    // A mid-wave switch to `entryMs: 0` must complete the entrance, or
    // `needsAnimation` would keep the RAF loop alive waiting on a wave the
    // render pass no longer advances.
    if (this.#options.entryMs === 0) this.#entryDone = true;
    if (this.#options.updateMs === 0) this.#valuesSettling = false;

    this.#gutterCache = null;
  }

  // --- Layer model (single-layer no-ops, mirroring pie) ----------------------

  getLayerCount(): number {
    return 1;
  }

  setLayerVisible(_index: number, _visible: boolean): void {
    // Heatmap doesn't have layers.
  }

  isLayerVisible(_index: number): boolean {
    return true;
  }

  getLayerColors(): string[] {
    // Legend swatch: the ramp's high stop — the color the strongest cell
    // paints with. '#888' only when no theme has reached the renderer yet
    // (direct instantiation outside a chart).
    if (this.#theme) {
      const stops = this.#rampStops(this.#theme);

      return [stops[stops.length - 1]];
    }

    return [this.#options.colors?.[this.#options.colors.length - 1] ?? '#888'];
  }

  applyTheme(theme: ChartTheme, prev: ChartTheme): void {
    // Colors resolve against the live theme at render time. The measured
    // gutters depend on the axis font, so a typography change busts the cache.
    this.#theme = theme;
    if (theme.typography.fontFamily !== prev.typography.fontFamily) {
      this.#gutterCache = null;
    }
  }

  getTotalLength(): number {
    return this.#data.length;
  }

  // --- Hover ------------------------------------------------------------------

  hitTest(bx: number, by: number, bitmapWidth: number, bitmapHeight: number, padding?: RenderPadding): number {
    const geo = computeHeatmapGeometry({
      bitmapWidth,
      bitmapHeight,
      padTop: padding?.top ?? 0,
      padBottom: padding?.bottom ?? 0,
      gutterLeft: this.#gutterCache?.left ?? 0,
      gutterBottom: this.#gutterCache?.bottom ?? 0,
      cols: this.#cols.length,
      rows: this.#rows.length,
    });
    if (!geo) return -1;

    const col = Math.floor((bx - geo.originX) / geo.slotW);
    const row = Math.floor((by - geo.originY) / geo.slotH);
    if (col < 0 || col >= this.#cols.length || row < 0 || row >= this.#rows.length) return -1;

    const position = row * this.#cols.length + col;

    return this.#cellAt[position] >= 0 ? position : -1;
  }

  setHoverIndex(index: number): boolean {
    if (this.#hoverIndex === index) return false;

    this.#hoverIndex = index;

    return true;
  }

  getHoverIndex(): number {
    return this.#hoverIndex;
  }

  getHoverInfo(theme: ChartTheme): HoverInfo | null {
    const cell = this.#cellAtPosition(this.#hoverIndex);
    if (!cell) return null;

    const { min, max } = this.#domain();
    const span = max - min;
    const t = span > 0 ? clamp((cell.value - min) / span, 0, 1) : 0;

    return {
      label: `${cell.y} · ${cell.x}`,
      value: cell.value,
      percent: t * 100,
      color: cell.color ?? sampleRamp(this.#rampStops(theme), t),
    };
  }

  // --- Animation --------------------------------------------------------------

  get needsAnimation(): boolean {
    if (this.#cells.length === 0) return false;
    if (!this.#entryDone) return true;
    if (this.#valuesSettling) return true;

    if (this.#options.updateMs > 0) {
      for (let i = 0; i < this.#hoverOffsets.length; i++) {
        const target = i === this.#hoverIndex ? 1 : 0;
        if (Math.abs(this.#hoverOffsets[i] - target) > 0.01) return true;
      }
    }

    return false;
  }

  dispose(): void {
    this.#dataListeners = [];
    this.#data = [];
    this.#cells = [];
    this.#cellAt = [];
    this.#cols = [];
    this.#rows = [];
    this.#displayed.clear();
    this.#hoverOffsets = [];
    this.#lastRenderTime = 0;
  }

  /**
   * @internal Test-only accessor for the animated per-cell values (keyed by
   * `x\u0000y`). The backing map is ECMAScript-private, so the animation
   * regression tests read convergence through this. Do not call from
   * production code.
   */
  _inspectDisplayedValues(): ReadonlyMap<string, number> {
    return this.#displayed;
  }

  // --- Grid resolution ---------------------------------------------------------

  /** Identity of the grid shape — same key means cells map to the same slots. */
  #shapeKey(): string {
    return `${this.#cols.join('\u0000')}\u0001${this.#rows.join('\u0000')}`;
  }

  /**
   * Resolve column/row orders (explicit option order, else first appearance)
   * and place every datum. On duplicate (x, y) coordinates the last datum
   * wins — matching "latest sample replaces" streaming intuition.
   */
  #rebuildGrid(): void {
    const prevShape = this.#shapeKey();
    const cols = this.#options.columns ? [...this.#options.columns] : [];
    const rows = this.#options.rows ? [...this.#options.rows] : [];
    const colIndex = new Map<string, number>(cols.map((key, i) => [key, i]));
    const rowIndex = new Map<string, number>(rows.map((key, i) => [key, i]));

    for (const datum of this.#data) {
      if (!this.#options.columns && !colIndex.has(datum.x)) {
        colIndex.set(datum.x, cols.length);
        cols.push(datum.x);
      }
      if (!this.#options.rows && !rowIndex.has(datum.y)) {
        rowIndex.set(datum.y, rows.length);
        rows.push(datum.y);
      }
    }

    this.#cols = cols;
    this.#rows = rows;
    this.#cells = [];
    this.#cellAt = new Array(cols.length * rows.length).fill(-1);

    for (const datum of this.#data) {
      const col = colIndex.get(datum.x);
      const row = rowIndex.get(datum.y);
      if (col === undefined || row === undefined) continue;

      const position = row * cols.length + col;
      const existing = this.#cellAt[position];
      const placed: PlacedCell = {
        x: datum.x,
        y: datum.y,
        value: datum.value,
        color: datum.color,
        col,
        row,
        key: cellKey(datum.x, datum.y),
      };
      if (existing >= 0) {
        this.#cells[existing] = placed;
      } else {
        this.#cellAt[position] = this.#cells.length;
        this.#cells.push(placed);
      }
    }

    // Any shape change (resize, transpose, reorder) invalidates the hover
    // position — a same-length reshape would otherwise leave the index
    // pointing at a different cell than the one under the cursor.
    if (this.#shapeKey() !== prevShape) {
      this.#hoverOffsets = new Array(this.#cellAt.length).fill(0);
      this.#hoverIndex = -1;
    }

    this.#dataExtent = this.#computeExtent();
  }

  /**
   * Scan the placed cells for the finite-value extent. Called once per
   * {@link #rebuildGrid} — render / tooltip / tick paths read the cached
   * {@link #dataExtent} instead of rescanning every frame.
   */
  #computeExtent(): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;
    for (const cell of this.#cells) {
      if (!Number.isFinite(cell.value)) continue;
      if (cell.value < min) min = cell.value;
      if (cell.value > max) max = cell.value;
    }
    if (min === Infinity) {
      min = 0;
      max = 1;
    }

    return { min, max };
  }

  #cellAtPosition(position: number): PlacedCell | null {
    if (position < 0 || position >= this.#cellAt.length) return null;

    const index = this.#cellAt[position];

    return index >= 0 ? this.#cells[index] : null;
  }

  /** Value domain: explicit option bounds win, else the cached data extent. */
  #domain(): { min: number; max: number } {
    const { min, max } = this.#dataExtent;

    return {
      min: this.#options.min ?? min,
      max: this.#options.max ?? Math.max(max, this.#options.min ?? min),
    };
  }

  /** Ramp stops: options override → theme token → accent-over-surface derivation. */
  #rampStops(theme: ChartTheme): readonly string[] {
    if (this.#options.colors && this.#options.colors.length > 0) return this.#options.colors;
    if (theme.heatmap && theme.heatmap.colors.length > 0) return theme.heatmap.colors;

    return deriveHeatmapRamp(theme.background, theme.line.color);
  }

  // --- Render -------------------------------------------------------------------

  render(ctx: SeriesRenderContext): void {
    if (this.#cells.length === 0) return;

    const { scope, theme, padding } = ctx;
    const { context, bitmapSize, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;

    const now = performance.now();
    // Same dt clamp as pie: after an idle stretch an unclamped dt would snap
    // every ease to its target in one frame.
    const dt = this.#lastRenderTime ? Math.min(0.05, (now - this.#lastRenderTime) / 1000) : 0;
    this.#lastRenderTime = now;
    if (this.#entryStart === 0) this.#entryStart = now;

    this.#tickValues(dt);
    this.#tickHover(dt);

    const { min, max } = this.#domain();
    const span = max - min;
    const stops = this.#rampStops(theme);

    const axisFontSize = resolveAxisFontSize(theme);
    const axisFont = `${axisFontSize * hpr}px ${theme.typography.fontFamily}`;
    const gutters = this.#options.axisLabels
      ? this.#computeGutters({ context, font: axisFont, fontSize: axisFontSize, hpr, vpr })
      : { left: 0, bottom: 0 };

    const geo = computeHeatmapGeometry({
      bitmapWidth: bitmapSize.width,
      bitmapHeight: bitmapSize.height,
      padTop: padding.top * vpr,
      padBottom: padding.bottom * vpr,
      gutterLeft: gutters.left,
      gutterBottom: gutters.bottom,
      cols: this.#cols.length,
      rows: this.#rows.length,
    });
    if (!geo) return;

    const gapX = this.#options.gap * hpr;
    const gapY = this.#options.gap * vpr;
    const radius = this.#options.cornerRadius * hpr;
    const baseAlpha = context.globalAlpha;

    // Entrance wave: cells reveal along the (col + row) diagonal. Each cell
    // tweens for `entryMs`; starts are staggered across roughly one extra
    // entryMs so the full wave lasts ~2× the per-cell duration.
    const { entryMs } = this.#options;
    const diagSpan = Math.max(1, this.#cols.length + this.#rows.length - 2);
    let allEntered = true;

    const labels = this.#options.cellLabels;
    const cellFont = labels ? `${labels.fontSize * hpr}px ${theme.typography.fontFamily}` : '';

    for (const cell of this.#cells) {
      let entry = 1;
      if (entryMs > 0 && !this.#entryDone) {
        const delay = ((cell.col + cell.row) / diagSpan) * entryMs;
        const p = clamp((now - this.#entryStart - delay) / entryMs, 0, 1);
        if (p < 1) allEntered = false;
        entry = easeOutCubic(p);
        if (entry <= 0) continue;
      }

      const displayed = this.#displayed.get(cell.key) ?? cell.value;
      // A non-finite value has no magnitude — pin it to the low stop instead
      // of letting NaN walk into the ramp index math.
      const t = Number.isFinite(displayed) && span > 0 ? clamp((displayed - min) / span, 0, 1) : 0;
      let fill = cell.color ?? sampleRamp(stops, t);

      const position = cell.row * this.#cols.length + cell.col;
      const hover = this.#hoverOffsets[position] ?? 0;
      if (hover > 0.01) {
        // Lift: brighten toward the tooltip ink and cast a soft shadow. The
        // 2px surface gap stays the separator — no strokes.
        fill = mixColors(fill, theme.tooltip.textColor, 0.1 * hover);
        context.shadowColor = 'rgba(0, 0, 0, 0.3)';
        context.shadowBlur = 12 * hpr * hover;
        context.shadowOffsetY = 3 * vpr * hover;
      }

      // Slot → inner rect (gap inset) → entrance/hover scale around center.
      const innerW = Math.max(0, geo.slotW - gapX);
      const innerH = Math.max(0, geo.slotH - gapY);
      const scale = (0.82 + 0.18 * entry) * (1 + 0.04 * hover);
      const w = innerW * scale;
      const h = innerH * scale;
      const cx = geo.originX + cell.col * geo.slotW + geo.slotW / 2;
      const cy = geo.originY + cell.row * geo.slotH + geo.slotH / 2;

      context.globalAlpha = baseAlpha * entry;
      context.fillStyle = fill;
      fillRoundedRect(context, {
        x: cx - w / 2,
        y: cy - h / 2,
        width: w,
        height: h,
        radius,
        corners: { tl: true, tr: true, br: true, bl: true },
      });

      if (hover > 0.01) {
        context.shadowColor = 'transparent';
        context.shadowBlur = 0;
        context.shadowOffsetY = 0;
      }

      if (labels) {
        this.#drawCellLabel({
          context,
          cell: { fill, displayed, cx, cy, innerW, innerH, span },
          labels,
          font: cellFont,
          hpr,
        });
      }
    }

    if (entryMs > 0 && !this.#entryDone && allEntered) this.#entryDone = true;

    context.globalAlpha = baseAlpha;
    if (this.#options.axisLabels) {
      this.#drawAxisLabels({ context, theme, geo, font: axisFont, hpr, vpr });
    }
  }

  /** Chase displayed values toward their targets; clears the settling flag on convergence. */
  #tickValues(dt: number): void {
    if (!this.#valuesSettling) return;

    const { min, max } = this.#domain();
    const epsilon = Math.max(1e-9, (max - min) * 1e-3);
    const rate = 3000 / this.#options.updateMs;
    let settled = true;

    for (const cell of this.#cells) {
      const current = this.#displayed.get(cell.key) ?? cell.value;
      const next = smoothToward(current, cell.value, rate, dt);
      if (Math.abs(next - cell.value) > epsilon) {
        settled = false;
        this.#displayed.set(cell.key, next);
      } else {
        this.#displayed.set(cell.key, cell.value);
      }
    }

    if (settled) this.#valuesSettling = false;
  }

  /** Ease per-cell hover lift toward the hovered position (or snap when updates are off). */
  #tickHover(dt: number): void {
    const animate = this.#options.updateMs > 0;
    for (let i = 0; i < this.#hoverOffsets.length; i++) {
      const target = i === this.#hoverIndex ? 1 : 0;
      this.#hoverOffsets[i] = animate ? smoothToward(this.#hoverOffsets[i], target, 12, dt) : target;
    }
  }

  /**
   * Measure the row-label gutter (widest row key) and column-label gutter.
   * Cached by font string until data / options / typography change.
   */
  #computeGutters(args: {
    context: CanvasRenderingContext2D;
    font: string;
    fontSize: number;
    hpr: number;
    vpr: number;
  }): { left: number; bottom: number } {
    const { context, font, fontSize, hpr, vpr } = args;
    if (this.#gutterCache && this.#gutterCache.font === font) {
      return { left: this.#gutterCache.left, bottom: this.#gutterCache.bottom };
    }

    const prevFont = context.font;
    context.font = font;
    let maxWidth = 0;
    for (const row of this.#rows) {
      const w = context.measureText(row).width;
      if (w > maxWidth) maxWidth = w;
    }
    context.font = prevFont;

    const left = maxWidth > 0 ? maxWidth + 8 * hpr : 0;
    const bottom = fontSize * vpr + 8 * vpr;
    this.#gutterCache = { font, left, bottom };

    return { left, bottom };
  }

  /** Value text inside a cell — skipped when the rendered text doesn't fit. */
  #drawCellLabel(args: {
    context: CanvasRenderingContext2D;
    cell: { fill: string; displayed: number; cx: number; cy: number; innerW: number; innerH: number; span: number };
    labels: Exclude<ResolvedCellLabels, false>;
    font: string;
    hpr: number;
  }): void {
    const { context, cell, labels, font, hpr } = args;

    const minHeight = labels.fontSize * 1.4 * hpr;
    if (cell.innerH < minHeight) return;

    context.font = font;
    const text = labels.format ? labels.format(cell.displayed) : defaultCellFormat(cell.displayed, cell.span);
    const width = context.measureText(text).width;
    if (width > cell.innerW - 6 * hpr) return;

    context.fillStyle = isLightColor(cell.fill) ? '#1f2328' : '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, cell.cx, cell.cy);
  }

  /** Row labels down the left edge; column labels along the bottom, density-thinned. */
  #drawAxisLabels(args: {
    context: CanvasRenderingContext2D;
    theme: ChartTheme;
    geo: HeatmapGeometry;
    font: string;
    hpr: number;
    vpr: number;
  }): void {
    const { context, theme, geo, font, hpr, vpr } = args;

    context.font = font;
    context.fillStyle = resolveAxisTextColor(theme);

    context.textAlign = 'right';
    context.textBaseline = 'middle';
    for (let row = 0; row < this.#rows.length; row++) {
      const y = geo.originY + row * geo.slotH + geo.slotH / 2;
      context.fillText(this.#rows[row], geo.originX - 6 * hpr, y);
    }

    // Thin column labels when slots are narrower than the widest label —
    // every Nth key keeps the axis readable instead of interleaving collisions.
    let maxColWidth = 0;
    for (const col of this.#cols) {
      const w = context.measureText(col).width;
      if (w > maxColWidth) maxColWidth = w;
    }
    const step = Math.max(1, Math.ceil((maxColWidth + 6 * hpr) / geo.slotW));

    context.textAlign = 'center';
    context.textBaseline = 'top';
    const labelY = geo.originY + this.#rows.length * geo.slotH + 6 * vpr;
    for (let col = 0; col < this.#cols.length; col += step) {
      const x = geo.originX + col * geo.slotW + geo.slotW / 2;
      context.fillText(this.#cols[col], x, labelY);
    }
  }
}

/** Series definition for `chart.addSeries` — keeps the chart renderer-agnostic
 *  so hosts that never render heatmaps don't bundle this module. */
export const HeatmapSeriesDef: SeriesDefinition<HeatmapSeriesOptions> = {
  type: 'heatmap',
  create: (env, options) => new HeatmapRenderer({ ...options }, env.theme),
};

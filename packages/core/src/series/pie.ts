import type { ChartTheme } from '../theme/types';
import type { PieSeriesOptions, PieSliceData } from '../types';
import { smoothToward } from '../utils/math';
import type { HoverInfo, RenderPadding, SeriesRenderContext, SeriesRenderer, SliceInfo } from './types';

const DEFAULT_OPTIONS: PieSeriesOptions = {
  innerRadiusRatio: 0,
  padAngle: 0.02,
  strokeColor: 'transparent',
  strokeWidth: 0,
};

const TWO_PI = Math.PI * 2;

/**
 * Compute pie geometry inside an area shrunk by `padTop` / `padBottom`. The
 * pie is centered horizontally on the full width and vertically inside the
 * usable band — that's how it shifts down when a Title overlay reserves space.
 *
 * Inputs and outputs are all in bitmap pixels so the same helper drives both
 * `render` (which paints) and `hitTest` (which interprets pointer coords).
 */
function computePieGeometry(
  bitmapWidth: number,
  bitmapHeight: number,
  padTop: number,
  padBottom: number,
): { cx: number; cy: number; maxR: number } {
  // Clamp padding so it never exceeds the bitmap. Without the upper bound a
  // malformed setPadding can push `cy` past the bottom edge — the resulting
  // pie has zero radius and would render off-screen anyway, but keeping `cy`
  // inside the bitmap avoids surprising downstream math (shadows, gradients,
  // future overlays that read the center).
  const top = Math.min(Math.max(0, padTop), bitmapHeight);
  const bottom = Math.min(Math.max(0, padBottom), bitmapHeight - top);
  const usableHeight = bitmapHeight - top - bottom;
  const cx = bitmapWidth / 2;
  const cy = top + usableHeight / 2;
  const maxR = (Math.min(bitmapWidth, usableHeight) / 2) * 0.85;
  return { cx, cy, maxR };
}

function isLightColor(hex: string): boolean {
  if (!hex.startsWith('#')) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

function lightenColor(hex: string, amount: number): string {
  if (!hex.startsWith('#')) return hex;
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export class PieRenderer implements SeriesRenderer {
  private data: PieSliceData[] = [];
  private options: PieSeriesOptions;
  /** Index of the hovered slice (-1 = none). Set via {@link setHoverIndex}. */
  #hoverIndex = -1;
  /** Animated offset per slice (0..1), smoothly interpolated toward target. */
  private sliceOffsets: number[] = [];
  private lastRenderTime = 0;
  /** Subscribers notified on setData (pie has no TimeSeriesStore to piggy-back on). */
  #dataListeners: Array<() => void> = [];

  constructor(options?: Partial<PieSeriesOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  getData(): PieSliceData[] {
    return this.data;
  }

  setData(data: unknown): void {
    const slices = (data ?? []) as PieSliceData[];
    this.data = slices;
    this.sliceOffsets = new Array(slices.length).fill(0);
    for (const l of this.#dataListeners) l();
  }

  onDataChanged(listener: () => void): () => void {
    this.#dataListeners.push(listener);
    return () => {
      const i = this.#dataListeners.indexOf(listener);
      if (i >= 0) this.#dataListeners.splice(i, 1);
    };
  }

  updateOptions(options: Partial<PieSeriesOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getColor(): string {
    return this.data[0]?.color ?? this.options.colors?.[0] ?? '#888';
  }

  getLayerCount(): number {
    return 1;
  }

  setLayerVisible(_index: number, _visible: boolean): void {
    // Pie doesn't have layers.
  }

  isLayerVisible(_index: number): boolean {
    return true;
  }

  getLayerColors(): string[] {
    return [this.getColor()];
  }

  applyTheme(_theme: ChartTheme, _prev: ChartTheme): void {
    // Pie derives colors from the active theme at render time via the palette.
  }

  /** Hit-test: which slice is at this bitmap coordinate? Returns index or -1. */
  hitTest(bx: number, by: number, bitmapWidth: number, bitmapHeight: number, padding?: RenderPadding): number {
    if (this.data.length === 0) return -1;
    const total = this.data.reduce((sum, d) => sum + d.value, 0);
    if (total <= 0) return -1;

    const { cx, cy, maxR } = computePieGeometry(bitmapWidth, bitmapHeight, padding?.top ?? 0, padding?.bottom ?? 0);
    const outerR = maxR;
    const innerR = outerR * this.options.innerRadiusRatio;

    const dx = bx - cx;
    const dy = by - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > outerR || dist < innerR) return -1;

    // Angle from top (matching render start)
    let mouseAngle = Math.atan2(dy, dx) + Math.PI / 2;
    if (mouseAngle < 0) mouseAngle += TWO_PI;

    let angle = 0;
    for (let i = 0; i < this.data.length; i++) {
      const sliceAngle = (this.data[i].value / total) * TWO_PI;
      if (mouseAngle >= angle && mouseAngle < angle + sliceAngle) return i;
      angle += sliceAngle;
    }
    return -1;
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
    if (this.#hoverIndex < 0) return null;
    const slice = this.data[this.#hoverIndex];
    if (!slice) return null;
    const total = this.data.reduce((sum, d) => sum + d.value, 0);
    const palette = this.options.colors ?? theme.seriesColors;
    return {
      label: slice.label,
      value: slice.value,
      percent: total > 0 ? (slice.value / total) * 100 : 0,
      color: slice.color ?? palette[this.#hoverIndex % palette.length],
    };
  }

  getSliceInfo(theme: ChartTheme): SliceInfo[] | null {
    if (this.data.length === 0) return null;
    const total = this.data.reduce((sum, d) => sum + d.value, 0);
    const palette = this.options.colors ?? theme.seriesColors;
    return this.data.map((d, i) => ({
      label: d.label,
      value: d.value,
      percent: total > 0 ? (d.value / total) * 100 : 0,
      color: d.color ?? palette[i % palette.length],
    }));
  }

  /** Returns true if animation is still in progress. */
  get needsAnimation(): boolean {
    for (let i = 0; i < this.sliceOffsets.length; i++) {
      const target = i === this.#hoverIndex ? 1 : 0;
      if (Math.abs(this.sliceOffsets[i] - target) > 0.01) return true;
    }
    return false;
  }

  dispose(): void {
    this.#dataListeners = [];
    this.data = [];
    this.sliceOffsets = [];
    this.lastRenderTime = 0;
  }

  render(ctx: SeriesRenderContext): void {
    if (this.data.length === 0) return;
    const { scope, theme, padding } = ctx;
    const { context, bitmapSize, horizontalPixelRatio, verticalPixelRatio } = scope;

    const now = performance.now();
    // Clamp dt: when the renderer goes idle (animation finished, no markDirty),
    // `lastRenderTime` is stale by however long the user paused. An unclamped dt
    // makes the next hover snap to its target in one frame — which looks like
    // "animation stopped working" after the first burst of activity.
    const dt = this.lastRenderTime ? Math.min(0.05, (now - this.lastRenderTime) / 1000) : 0;
    this.lastRenderTime = now;

    const total = this.data.reduce((sum, d) => sum + d.value, 0);
    if (total <= 0) return;

    // Animate slice offsets toward 1 (hovered) or 0 (resting).
    const rate = 12; // exponential decay rate; higher = snappier
    while (this.sliceOffsets.length < this.data.length) this.sliceOffsets.push(0);
    for (let i = 0; i < this.data.length; i++) {
      const target = i === this.#hoverIndex ? 1 : 0;
      this.sliceOffsets[i] = smoothToward(this.sliceOffsets[i], target, rate, dt);
    }

    const palette = this.options.colors ?? theme.seriesColors;
    // Padding arrives in CSS pixels; geometry is in bitmap pixels.
    const { cx, cy, maxR } = computePieGeometry(
      bitmapSize.width,
      bitmapSize.height,
      padding.top * verticalPixelRatio,
      padding.bottom * verticalPixelRatio,
    );
    const outerR = maxR;
    const innerR = outerR * this.options.innerRadiusRatio;
    const pad = this.options.padAngle;
    const { strokeColor, strokeWidth } = this.options;
    const explodeDistance = 8 * horizontalPixelRatio;

    let angle = -Math.PI / 2;

    // Draw slices
    for (let i = 0; i < this.data.length; i++) {
      const slice = this.data[i];
      const sliceAngle = (slice.value / total) * TWO_PI;
      const startAngle = angle + pad / 2;
      const endAngle = angle + sliceAngle - pad / 2;
      const midAngle = angle + sliceAngle / 2;
      const color = slice.color ?? palette[i % palette.length];

      // Explode offset
      const offset = this.sliceOffsets[i] * explodeDistance;
      const ox = Math.cos(midAngle) * offset;
      const oy = Math.sin(midAngle) * offset;
      const sliceCx = cx + ox;
      const sliceCy = cy + oy;

      context.beginPath();
      context.arc(sliceCx, sliceCy, outerR, startAngle, endAngle);
      if (innerR > 0) {
        context.arc(sliceCx, sliceCy, innerR, endAngle, startAngle, true);
      } else {
        context.lineTo(sliceCx, sliceCy);
      }
      context.closePath();

      // Radial gradient for depth
      const grad = context.createRadialGradient(sliceCx, sliceCy, innerR || 0, sliceCx, sliceCy, outerR);
      grad.addColorStop(0, lightenColor(color, 0.15));
      grad.addColorStop(1, color);
      context.fillStyle = grad;
      if (this.sliceOffsets[i] > 0.01) {
        context.shadowColor = 'rgba(0,0,0,0.25)';
        context.shadowBlur = 12 * horizontalPixelRatio * this.sliceOffsets[i];
        context.shadowOffsetX = ox * 0.3;
        context.shadowOffsetY = oy * 0.3;
      }
      context.fill();
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;

      if (strokeWidth > 0 && strokeColor !== 'transparent') {
        context.strokeStyle = strokeColor;
        context.lineWidth = strokeWidth;
        context.stroke();
      }

      angle += sliceAngle;
    }

    // Labels
    angle = -Math.PI / 2;
    const labelR = innerR > 0 ? (outerR + innerR) / 2 : outerR * 0.65;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `${11 * horizontalPixelRatio}px ${theme.typography.fontFamily}`;

    for (let i = 0; i < this.data.length; i++) {
      const slice = this.data[i];
      const sliceAngle = (slice.value / total) * TWO_PI;
      if (sliceAngle > 0.3) {
        const midAngle = angle + sliceAngle / 2;
        const offset = this.sliceOffsets[i] * explodeDistance;
        const lx = cx + Math.cos(midAngle) * (labelR + offset);
        const ly = cy + Math.sin(midAngle) * (labelR + offset);
        const sliceColor = slice.color ?? palette[i % palette.length];
        context.fillStyle = isLightColor(sliceColor) ? '#000000' : '#ffffff';
        context.fillText(slice.label, lx, ly);
      }
      angle += sliceAngle;
    }
  }
}

import type { PieSeriesOptions, PieSliceData } from '../types';
import type { SeriesRenderContext, SeriesRenderer } from './types';

const DEFAULT_OPTIONS: PieSeriesOptions = {
  innerRadiusRatio: 0,
  padAngle: 0.02,
  strokeColor: 'transparent',
  strokeWidth: 0,
};

const TWO_PI = Math.PI * 2;

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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, t);
}

export class PieRenderer implements SeriesRenderer {
  private data: PieSliceData[] = [];
  private options: PieSeriesOptions;
  /** Index of the hovered slice (-1 = none). Set externally by chart. */
  hoverIndex = -1;
  /** Animated offset per slice (0..1), smoothly interpolated toward target. */
  private sliceOffsets: number[] = [];
  private lastRenderTime = 0;

  constructor(options?: Partial<PieSeriesOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  getData(): PieSliceData[] {
    return this.data;
  }

  setData(data: PieSliceData[]): void {
    this.data = data;
    this.sliceOffsets = new Array(data.length).fill(0);
  }

  updateOptions(options: Partial<PieSeriesOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getColor(): string {
    return this.data[0]?.color ?? this.options.colors?.[0] ?? '#888';
  }

  /** Hit-test: which slice is at this bitmap coordinate? Returns index or -1. */
  hitTest(bx: number, by: number, bitmapWidth: number, bitmapHeight: number): number {
    if (this.data.length === 0) return -1;
    const total = this.data.reduce((sum, d) => sum + d.value, 0);
    if (total <= 0) return -1;

    const cx = bitmapWidth / 2;
    const cy = bitmapHeight / 2;
    const maxR = (Math.min(bitmapWidth, bitmapHeight) / 2) * 0.85;
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

  /** Returns true if animation is still in progress. */
  get needsAnimation(): boolean {
    for (let i = 0; i < this.sliceOffsets.length; i++) {
      const target = i === this.hoverIndex ? 1 : 0;
      if (Math.abs(this.sliceOffsets[i] - target) > 0.01) return true;
    }
    return false;
  }

  render(ctx: SeriesRenderContext): void {
    if (this.data.length === 0) return;
    const { scope, theme } = ctx;
    const { context, bitmapSize, horizontalPixelRatio } = scope;

    const now = performance.now();
    const dt = this.lastRenderTime ? (now - this.lastRenderTime) / 1000 : 0;
    this.lastRenderTime = now;

    const total = this.data.reduce((sum, d) => sum + d.value, 0);
    if (total <= 0) return;

    // Animate slice offsets
    const speed = 10; // higher = faster animation
    while (this.sliceOffsets.length < this.data.length) this.sliceOffsets.push(0);
    for (let i = 0; i < this.data.length; i++) {
      const target = i === this.hoverIndex ? 1 : 0;
      this.sliceOffsets[i] = lerp(this.sliceOffsets[i], target, speed * dt);
    }

    const palette = this.options.colors ?? theme.seriesColors;
    const cx = bitmapSize.width / 2;
    const cy = bitmapSize.height / 2;
    const maxR = (Math.min(bitmapSize.width, bitmapSize.height) / 2) * 0.85;
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

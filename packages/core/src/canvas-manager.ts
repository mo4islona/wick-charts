import { EventEmitter } from './events';
import type { PerfMonitor } from './perf/perf-monitor';
import type { CanvasSize } from './types';

interface CanvasManagerEvents {
  resize: (size: CanvasSize) => void;
}

/**
 * A fixed-size drawing target with no DOM, for a chart that renders outside a
 * browser. Both layers draw into `context`, so a frame paints the main layer
 * and then the overlay on top of it.
 */
export interface ChartSurface {
  /** Chart width in CSS px. */
  readonly width: number;
  /** Chart height in CSS px. */
  readonly height: number;
  /** Device px per CSS px. Default: `1`. */
  readonly pixelRatio?: number;
  /** A 2D context on a transparent bitmap of at least `width × pixelRatio` by `height × pixelRatio` device px. */
  readonly context: CanvasRenderingContext2D;
}

export function isChartSurface(target: HTMLElement | ChartSurface): target is ChartSurface {
  return 'context' in target && !('nodeType' in target);
}

export interface BitmapCoordinateSpace {
  context: CanvasRenderingContext2D;
  bitmapSize: { width: number; height: number };
  mediaSize: { width: number; height: number };
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
}

function createCanvas(container: HTMLElement, zIndex: number, alpha: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.zIndex = String(zIndex);
  container.appendChild(canvas);
  return canvas;
}

export class CanvasManager extends EventEmitter<CanvasManagerEvents> {
  /** Bottom layer: background, grid, series (redraws only on data/viewport change). `null` on a {@link ChartSurface}. */
  readonly mainCanvas: HTMLCanvasElement | null;
  private mainCtx: CanvasRenderingContext2D;

  /** Top layer: crosshair (redraws on mousemove, cheap). `null` on a {@link ChartSurface}. */
  readonly overlayCanvas: HTMLCanvasElement | null;
  private overlayCtx: CanvasRenderingContext2D;

  private resizeObserver: ResizeObserver | null = null;
  private _size: CanvasSize;
  private supportsDevicePixelContentBox = false;
  /** Both layers share one bitmap: the overlay must not clear the main layer under it. */
  private readonly sharedBitmap: boolean;

  constructor(target: HTMLElement | ChartSurface, perfMonitor?: PerfMonitor) {
    super();

    if (isChartSurface(target)) {
      const ratio = target.pixelRatio ?? 1;
      const context = perfMonitor ? perfMonitor.wrapContext(target.context, 'main') : target.context;
      this.mainCanvas = null;
      this.overlayCanvas = null;
      this.mainCtx = context;
      this.overlayCtx = context;
      this.sharedBitmap = true;
      this._size = {
        media: { width: target.width, height: target.height },
        bitmap: { width: Math.round(target.width * ratio), height: Math.round(target.height * ratio) },
        horizontalPixelRatio: ratio,
        verticalPixelRatio: ratio,
      };

      return;
    }

    const container = target;
    this.sharedBitmap = false;

    const mainCanvas = createCanvas(container, 0, true);
    const overlayCanvas = createCanvas(container, 1, true);
    this.mainCanvas = mainCanvas;
    this.overlayCanvas = overlayCanvas;

    const rawMain = mainCanvas.getContext('2d', { alpha: true });
    const rawOverlay = overlayCanvas.getContext('2d', { alpha: true });
    if (!rawMain || !rawOverlay) {
      throw new Error('CanvasManager: failed to acquire 2D rendering context');
    }
    this.mainCtx = perfMonitor ? perfMonitor.wrapContext(rawMain, 'main') : rawMain;
    this.overlayCtx = perfMonitor ? perfMonitor.wrapContext(rawOverlay, 'overlay') : rawOverlay;

    const dpr = window.devicePixelRatio || 1;
    this._size = {
      media: { width: 0, height: 0 },
      bitmap: { width: 0, height: 0 },
      horizontalPixelRatio: dpr,
      verticalPixelRatio: dpr,
    };

    const resizeObserver = new ResizeObserver((entries) => {
      this.handleResize(entries[0]);
    });
    this.resizeObserver = resizeObserver;

    try {
      resizeObserver.observe(container, { box: 'device-pixel-content-box' as ResizeObserverBoxOptions });
      this.supportsDevicePixelContentBox = true;
    } catch {
      resizeObserver.observe(container, { box: 'content-box' });
    }

    // Measure initial size synchronously — forces layout reflow but ensures
    // yScale has valid dimensions before children's useLayoutEffects load data.
    // Subsequent size changes arrive via ResizeObserver.
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const dprW = window.devicePixelRatio || 1;
      const dprH = dprW;
      const bw = Math.round(rect.width * dprW);
      const bh = Math.round(rect.height * dprH);
      mainCanvas.width = bw;
      mainCanvas.height = bh;
      overlayCanvas.width = bw;
      overlayCanvas.height = bh;
      this._size = {
        media: { width: rect.width, height: rect.height },
        bitmap: { width: bw, height: bh },
        horizontalPixelRatio: bw / rect.width,
        verticalPixelRatio: bh / rect.height,
      };
    }
  }

  private handleResize(entry: ResizeObserverEntry): void {
    const { mainCanvas, overlayCanvas } = this;
    if (mainCanvas === null || overlayCanvas === null) return;

    let bitmapWidth: number;
    let bitmapHeight: number;
    let mediaWidth: number;
    let mediaHeight: number;

    if (this.supportsDevicePixelContentBox && entry.devicePixelContentBoxSize?.[0]) {
      const dpBox = entry.devicePixelContentBoxSize[0];
      bitmapWidth = dpBox.inlineSize;
      bitmapHeight = dpBox.blockSize;
      const contentBox = entry.contentBoxSize[0];
      mediaWidth = contentBox.inlineSize;
      mediaHeight = contentBox.blockSize;
    } else {
      const contentBox = entry.contentBoxSize?.[0];
      if (contentBox) {
        mediaWidth = contentBox.inlineSize;
        mediaHeight = contentBox.blockSize;
      } else {
        const rect = entry.contentRect;
        mediaWidth = rect.width;
        mediaHeight = rect.height;
      }
      const dpr = window.devicePixelRatio || 1;
      bitmapWidth = Math.round(mediaWidth * dpr);
      bitmapHeight = Math.round(mediaHeight * dpr);
    }

    if (bitmapWidth === 0 || bitmapHeight === 0) return;

    mainCanvas.width = bitmapWidth;
    mainCanvas.height = bitmapHeight;
    overlayCanvas.width = bitmapWidth;
    overlayCanvas.height = bitmapHeight;

    const hpr = bitmapWidth / mediaWidth;
    const vpr = bitmapHeight / mediaHeight;

    this._size = {
      media: { width: mediaWidth, height: mediaHeight },
      bitmap: { width: bitmapWidth, height: bitmapHeight },
      horizontalPixelRatio: hpr,
      verticalPixelRatio: vpr,
    };

    this.emit('resize', this._size);
  }

  get size(): CanvasSize {
    return this._size;
  }

  /** Draw on the main (bottom) layer — series, grid, background */
  useMainLayer(callback: (scope: BitmapCoordinateSpace) => void): void {
    this.mainCtx.save();
    callback({
      context: this.mainCtx,
      bitmapSize: this._size.bitmap,
      mediaSize: this._size.media,
      horizontalPixelRatio: this._size.horizontalPixelRatio,
      verticalPixelRatio: this._size.verticalPixelRatio,
    });
    this.mainCtx.restore();
  }

  /** Draw on the overlay (top) layer — crosshair */
  useOverlayLayer(callback: (scope: BitmapCoordinateSpace) => void): void {
    const { width, height } = this._size.bitmap;
    if (!this.sharedBitmap) this.overlayCtx.clearRect(0, 0, width, height);

    this.overlayCtx.save();
    callback({
      context: this.overlayCtx,
      bitmapSize: this._size.bitmap,
      mediaSize: this._size.media,
      horizontalPixelRatio: this._size.horizontalPixelRatio,
      verticalPixelRatio: this._size.verticalPixelRatio,
    });
    this.overlayCtx.restore();
  }

  // Keep backward compat for now
  get canvas(): HTMLCanvasElement | null {
    return this.overlayCanvas; // interactions attach to the top layer
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.mainCanvas?.remove();
    this.overlayCanvas?.remove();
    this.removeAllListeners();
  }
}

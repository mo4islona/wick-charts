import { EventEmitter } from './events';
import type { CanvasSize } from './types';

interface CanvasManagerEvents {
  resize: (size: CanvasSize) => void;
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
  /** Bottom layer: background, grid, series (redraws only on data/viewport change) */
  readonly mainCanvas: HTMLCanvasElement;
  private mainCtx: CanvasRenderingContext2D;

  /** Top layer: crosshair (redraws on mousemove, cheap) */
  readonly overlayCanvas: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;

  private resizeObserver: ResizeObserver;
  private _size: CanvasSize;
  private supportsDevicePixelContentBox = false;

  constructor(container: HTMLElement) {
    super();

    this.mainCanvas = createCanvas(container, 0, false);
    this.overlayCanvas = createCanvas(container, 1, true);

    this.mainCtx = this.mainCanvas.getContext('2d', { alpha: false })!;
    this.overlayCtx = this.overlayCanvas.getContext('2d', { alpha: true })!;

    const dpr = window.devicePixelRatio || 1;
    this._size = {
      media: { width: 0, height: 0 },
      bitmap: { width: 0, height: 0 },
      horizontalPixelRatio: dpr,
      verticalPixelRatio: dpr,
    };

    this.resizeObserver = new ResizeObserver((entries) => {
      this.handleResize(entries[0]);
    });

    try {
      this.resizeObserver.observe(container, { box: 'device-pixel-content-box' as ResizeObserverBoxOptions });
      this.supportsDevicePixelContentBox = true;
    } catch {
      this.resizeObserver.observe(container, { box: 'content-box' });
    }
  }

  private handleResize(entry: ResizeObserverEntry): void {
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

    this.mainCanvas.width = bitmapWidth;
    this.mainCanvas.height = bitmapHeight;
    this.overlayCanvas.width = bitmapWidth;
    this.overlayCanvas.height = bitmapHeight;

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
    this.overlayCtx.clearRect(0, 0, width, height);
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
  get canvas(): HTMLCanvasElement {
    return this.overlayCanvas; // interactions attach to the top layer
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.mainCanvas.remove();
    this.overlayCanvas.remove();
    this.removeAllListeners();
  }
}

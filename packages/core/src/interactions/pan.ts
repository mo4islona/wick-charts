import type { TimeScale } from '../scales/time-scale';
import type { Viewport } from '../viewport';

export class PanHandler {
  private dragging = false;
  private lastX = 0;

  constructor(
    private viewport: Viewport,
    private timeScale: TimeScale,
    private canvas: HTMLCanvasElement,
  ) {}

  handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.canvas.style.cursor = 'grabbing';
  }

  handleMouseMove(e: MouseEvent): void {
    if (!this.dragging) return;
    const deltaX = e.clientX - this.lastX;
    this.lastX = e.clientX;
    const timeDelta = this.timeScale.pixelDeltaToTimeDelta(-deltaX);
    this.viewport.pan(timeDelta);
  }

  handleMouseUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.canvas.style.cursor = 'crosshair';
  }

  isDragging(): boolean {
    return this.dragging;
  }
}

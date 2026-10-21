import type { XScale } from '../scales/x-scale';
import { clamp } from '../utils/math';
import type { PanZoomTarget } from './pan-zoom-target';

/** A wheel has no release, so this long without a wheel event ends its gesture. */
export const WHEEL_IDLE_MS = 250;

export class ZoomHandler {
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private target: PanZoomTarget,
    private timeScale: XScale,
  ) {}

  handleWheel(e: WheelEvent): void {
    e.preventDefault();

    const delta = normalizeWheelDelta(e.deltaY, e.deltaMode);

    // Smooth proportional zoom: small trackpad gestures = small zoom.
    const sensitivity = 0.005;
    const factor = Math.exp(delta * sensitivity);

    // Clamp the cursor to the chart area (exclude the Y axis on either side).
    const chartWidth = this.timeScale.getMediaWidth();
    const x = clamp(e.offsetX - (this.target.plotLeft ?? 0), 0, chartWidth);
    const cursorTime = this.timeScale.xToTime(x);

    this.target.zoomAt(cursorTime, factor, chartWidth);
    this.scheduleGestureEnd();
  }

  /** Drop a pending wheel-idle gesture end — a drag that starts now ends the gesture itself. */
  cancelPendingEnd(): void {
    if (this.idleTimer === null) return;

    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private scheduleGestureEnd(): void {
    this.cancelPendingEnd();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.target.endGesture?.();
    }, WHEEL_IDLE_MS);
  }
}

function normalizeWheelDelta(deltaY: number, deltaMode: number): number {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) return deltaY * 8;
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return deltaY * 24;
  // DOM_DELTA_PIXEL — already in pixels, just dampen large values.
  return deltaY;
}

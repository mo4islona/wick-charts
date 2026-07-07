import { EventEmitter } from '../events';
import type { XScale } from '../scales/x-scale';
import type { YScale } from '../scales/y-scale';
import type { CrosshairPosition } from '../types';
import { clamp } from '../utils/math';
import { PanHandler } from './pan';
import type { PanZoomTarget } from './pan-zoom-target';
import { ZoomHandler } from './zoom';

interface InteractionEvents {
  crosshairMove: (pos: CrosshairPosition | null) => void;
  click: (pos: CrosshairPosition) => void;
  dblclick: (pos: CrosshairPosition) => void;
}

/** Euclidean finger spread. Using only the X projection (the old behavior)
 *  collapses to ~0 for a vertical pinch — yielding a divide-by-near-zero zoom
 *  factor — and reads a 45° pinch as ~0.7x. */
function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;

  return Math.hypot(dx, dy);
}

/** A pointer that travels further than this between down and up reads as a drag, not a click. */
const CLICK_MOVE_TOLERANCE = 5;
/** A touch held longer than this reads as a long-press, not a tap. */
const TAP_MAX_DURATION_MS = 500;

export class InteractionHandler extends EventEmitter<InteractionEvents> {
  private zoom: ZoomHandler;
  private pan: PanHandler;
  private canvas: HTMLCanvasElement;
  private timeScale: XScale;
  private yScale: YScale;
  private target: PanZoomTarget;

  constructor(canvas: HTMLCanvasElement, target: PanZoomTarget, timeScale: XScale, yScale: YScale) {
    super();
    this.canvas = canvas;
    this.target = target;
    this.timeScale = timeScale;
    this.yScale = yScale;
    this.zoom = new ZoomHandler(target, timeScale);
    this.pan = new PanHandler(target, timeScale, canvas);

    canvas.style.cursor = 'crosshair';
    this.syncPanZoomMode();

    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('mouseleave', this.onMouseLeave);
    canvas.addEventListener('click', this.onClick);
    canvas.addEventListener('dblclick', this.onDblClick);

    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd);
    canvas.addEventListener('touchcancel', this.onTouchCancel);
  }

  /** Live read of the target's capability — series can be added or removed at any time. */
  private panZoomEnabled(): boolean {
    return this.target.canPanZoom?.() ?? true;
  }

  /**
   * Reflect the target's pan/zoom capability into the canvas CSS. While
   * pan/zoomable, `touch-action: none` hands every touch gesture to the
   * chart; on a spatial-only target native scrolling stays enabled so the
   * chart doesn't trap the page. The host re-invokes this whenever the
   * series mix changes.
   */
  syncPanZoomMode(): void {
    this.canvas.style.touchAction = this.panZoomEnabled() ? 'none' : 'auto';
  }

  private onWheel = (e: WheelEvent): void => {
    // No time axis to zoom — skip preventDefault so the wheel bubbles on
    // and the page scrolls as it would anywhere else.
    if (!this.panZoomEnabled()) return;

    this.zoom.handleWheel(e);
  };

  private onMouseDown = (e: MouseEvent): void => {
    // A drag takes over from any pending wheel-idle rebound — otherwise the
    // timer would fire mid-drag and snap the viewport back (potentially
    // emitting a bogus edgeReached along the way).
    this.zoom.cancelPendingRebound();

    // Spatial-only charts have nothing to pan; skipping the drag also keeps
    // the cursor from flipping to 'grabbing'. `downClient` is still recorded
    // — click/tap detection stays live for slice/cell clicks.
    if (this.panZoomEnabled()) {
      this.pan.handleMouseDown(e);
    }

    this.downClient = { x: e.clientX, y: e.clientY };
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.pan.isDragging()) {
      this.pan.handleMouseMove(e);
    }
    this.emitCrosshair(e.offsetX, e.offsetY);
  };

  private onMouseUp = (): void => {
    this.pan.handleMouseUp();
  };

  private onMouseLeave = (): void => {
    this.pan.handleMouseUp();
    this.emit('crosshairMove', null);
  };

  // Pointer-down origin (mouse or the single touch that started a tap),
  // used to tell a click/tap from a drag that happened to end over the canvas.
  private downClient: { x: number; y: number } | null = null;

  private onClick = (e: MouseEvent): void => {
    if (this.movedBeyondClickTolerance(e.clientX, e.clientY)) return;

    // `detail` is the click count: the second click of a double-click carries
    // `detail === 2`. Suppress it so double-click-to-fit (`onDblClick`) doesn't
    // also fire a second `pointClick` on top of the first.
    if (e.detail > 1) return;

    this.emit('click', this.posFromOffset(e.offsetX, e.offsetY));
  };

  private onDblClick = (e: MouseEvent): void => {
    this.emit('dblclick', this.posFromOffset(e.offsetX, e.offsetY));
  };

  private movedBeyondClickTolerance(clientX: number, clientY: number): boolean {
    if (!this.downClient) return false;

    return Math.hypot(clientX - this.downClient.x, clientY - this.downClient.y) > CLICK_MOVE_TOLERANCE;
  }

  // Touch handling
  private lastTouchDist = 0;
  private touchCount = 0;
  private touchDownTime = 0;
  // True once a gesture has ever held two fingers (a pinch). A pinch is never a
  // tap, even after it decays to one finger, so this gates tap synthesis in
  // onTouchEnd — otherwise lifting both fingers in quick succession would
  // synthesize a phantom 'click'.
  private gestureHadTwoFingers = false;

  private onTouchStart = (e: TouchEvent): void => {
    // Spatial-only charts don't own touch gestures: without preventDefault
    // the page scrolls past the chart, and the browser's own tap-to-click
    // synthesis (suppressed below on time charts) delivers taps through the
    // regular 'click' listener instead of the hand-rolled path in onTouchEnd.
    if (!this.panZoomEnabled()) return;

    e.preventDefault();
    // Touch gesture takes over from any pending wheel-idle rebound — see
    // onMouseDown for the same reasoning.
    this.zoom.cancelPendingRebound();
    this.touchCount = e.touches.length;
    if (e.touches.length === 1) {
      this.pan.handleMouseDown({
        button: 0,
        clientX: e.touches[0].clientX,
      } as MouseEvent);
      this.downClient = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this.touchDownTime = Date.now();
      this.gestureHadTwoFingers = false;
    } else if (e.touches.length === 2) {
      this.lastTouchDist = touchDistance(e.touches[0], e.touches[1]);
      this.gestureHadTwoFingers = true;
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    // See onTouchStart — spatial-only charts leave touch gestures to the page.
    if (!this.panZoomEnabled()) return;

    e.preventDefault();
    if (e.touches.length === 1 && this.touchCount === 1) {
      this.pan.handleMouseMove({
        clientX: e.touches[0].clientX,
      } as MouseEvent);
    } else if (e.touches.length === 2) {
      const dist = touchDistance(e.touches[0], e.touches[1]);
      const center = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const rect = this.canvas.getBoundingClientRect();

      // Guard the denominator (a collapsed pinch → `dist` 0 → Infinity factor)
      // and clamp so a noisy single-frame spread can't snap the viewport.
      if (dist > 0 && this.lastTouchDist > 0) {
        const factor = clamp(this.lastTouchDist / dist, 0.1, 10);
        const centerTime = this.timeScale.xToTime(center - rect.left);
        this.target.zoomAt(centerTime, factor, this.timeScale.getMediaWidth());
      }

      this.lastTouchDist = dist;
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    if (e.touches.length === 0) {
      // Native 'click' never fires here — `preventDefault()` on touchstart/move
      // (needed to block scroll/pinch-zoom) suppresses the browser's synthetic
      // click after a tap, so a short, low-movement single-finger touch is
      // synthesized into 'click' by hand. Double-tap → dblclick is not
      // synthesized (no matching native gesture to mirror).
      // A pinch (even one that decayed to a single finger) is never a tap.
      const tap = e.changedTouches[0];
      if (
        this.touchCount === 1 &&
        !this.gestureHadTwoFingers &&
        tap &&
        !this.movedBeyondClickTolerance(tap.clientX, tap.clientY)
      ) {
        const elapsed = Date.now() - this.touchDownTime;
        if (elapsed <= TAP_MAX_DURATION_MS) {
          const rect = this.canvas.getBoundingClientRect();
          this.emit('click', this.posFromOffset(tap.clientX - rect.left, tap.clientY - rect.top));
        }
      }

      this.pan.handleMouseUp();
      this.touchCount = 0;
      this.lastTouchDist = 0;
      this.downClient = null;
      this.gestureHadTwoFingers = false;
      this.emit('crosshairMove', null);

      return;
    }

    // Lifting one finger of a pinch leaves a single touch. Without handling
    // this the handler stays in 2-finger mode (`touchCount` 2) and the next
    // `onTouchMove` matches neither branch — so "pinch then drag with one
    // finger" goes completely dead until all fingers lift. Drop to
    // single-finger mode and re-seed the pan from the remaining touch (the
    // 2-finger start never began a pan drag, so a fresh mousedown is needed).
    // Only for a captured pinch: on a spatial-only chart touchstart never
    // ran (`touchCount` stays 0), and re-seeding here would arm the tap
    // timer — a two-finger tap would then synthesize a phantom 'click'.
    if (e.touches.length === 1 && this.touchCount === 2) {
      this.touchCount = 1;
      this.lastTouchDist = 0;
      this.pan.handleMouseDown({ button: 0, clientX: e.touches[0].clientX } as MouseEvent);
      // A pinch never counts as a tap candidate — re-arm from here so lifting
      // the remaining finger right away doesn't fall back on the stale origin
      // recorded before the pinch started.
      this.downClient = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this.touchDownTime = Date.now();
    }
  };

  private onTouchCancel = (): void => {
    this.pan.handleMouseUp();
    this.touchCount = 0;
    this.lastTouchDist = 0;
    this.downClient = null;
    this.gestureHadTwoFingers = false;
    this.emit('crosshairMove', null);
  };

  private posFromOffset(offsetX: number, offsetY: number): CrosshairPosition {
    return {
      mediaX: offsetX,
      mediaY: offsetY,
      time: this.timeScale.xToTime(offsetX),
      y: this.yScale.yToValue(offsetY),
    };
  }

  private emitCrosshair(offsetX: number, offsetY: number): void {
    this.emit('crosshairMove', this.posFromOffset(offsetX, offsetY));
  }

  destroy(): void {
    this.zoom.cancelPendingRebound();
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('dblclick', this.onDblClick);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.onTouchCancel);
    this.removeAllListeners();
  }
}

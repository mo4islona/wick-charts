import type { Unsubscribe } from '../animation-clock';
import type { ChartInstance } from '../chart';
import { TimeScale } from '../scales/time-scale';
import { YScale } from '../scales/y-scale';
import type { VisibleRange, YRange } from '../types';
import { smoothToward } from '../utils/math';
import { decimateCandles, decimateLinear } from './decimate';
import { type NavigatorGesture, computePan, computeResize, computeSnapCenter, hitTest } from './interactions';
import {
  type WindowGeometry,
  computeWindowGeometry,
  renderBackground,
  renderMiniBar,
  renderMiniCandlestick,
  renderMiniLine,
} from './render';
import type { NavigatorData, NavigatorLinePoint, NavigatorOptions } from './types';

/** Time-extent convergence epsilon (ms). Stops the smoothing chase loop when
 * displayed and target are within half a millisecond — well below one bar
 * interval at any sane refresh rate. The default `valueDiffers` epsilon
 * scales with `|target|`, which for a Unix-ms timestamp is ~17000 s — useless
 * for this domain. */
const NAVIGATOR_TIME_EPSILON = 0.5;

export interface NavigatorControllerParams {
  container: HTMLElement;
  chart: ChartInstance;
  data: NavigatorData;
  options?: NavigatorOptions;
}

/**
 * Drives the navigator strip rendered below the main chart.
 *
 * Layout: the container holds a canvas (series miniature) and a DOM overlay
 * with five absolutely-positioned divs — left mask, right mask, window body,
 * left handle, right handle. The overlay is purely visual; pointer input is
 * captured on the canvas and hit-tested against the current window geometry.
 *
 * Both layers reserve `chart.yAxisWidth` on the right so the navigator's
 * active zone aligns with the main chart's plot area (matches the TimeAxis).
 *
 * Event topology — navigator is a pure listener on the chart side, never emits:
 *   chart.viewportChange → reposition window DOM + redraw on next frame
 *   chart.overlayChange  → full redraw (catches data + theme swaps)
 *   ResizeObserver       → resize canvas + full redraw
 */
export class NavigatorController {
  readonly #container: HTMLElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #chart: ChartInstance;

  readonly #overlay: HTMLDivElement;
  readonly #maskLeft: HTMLDivElement;
  readonly #maskRight: HTMLDivElement;
  readonly #window: HTMLDivElement;
  readonly #handleLeft: HTMLDivElement;
  readonly #handleRight: HTMLDivElement;

  #data: NavigatorData;
  #options: NavigatorOptions;

  // Own scales — both cover the full data span. The main chart's scales move
  // with the viewport; these don't.
  readonly #timeScale = new TimeScale();
  readonly #yScale = new YScale();

  #mediaWidth = 0;
  #mediaHeight = 0;
  #pixelRatio = 1;

  #dirty = true;
  /** Smoothed displayed data extent — chases `#resolveDataRange()` exponentially
   * so streaming ticks slide the mini-chart instead of snapping each frame.
   * `null` until first seed (mount or `dataReplaced`). */
  #displayedDataStart: number | null = null;
  #displayedDataEnd: number | null = null;
  /** Subscription to the chart's animation clock — fires once per RAF. */
  #unsubscribeFrame: Unsubscribe | null = null;
  /** Listener for the chart's `dataReplaced` event — snaps `displayed*` to
   * targets so a `setData` call doesn't read as a 100ms slide across the
   * whole new dataset. */
  readonly #onDataReplaced: () => void;

  #resizeObserver: ResizeObserver;

  // Active-drag state — null when idle.
  #drag: {
    pointerId: number;
    gesture: NavigatorGesture;
    startX: number;
    startVisible: VisibleRange;
    pixelsPerTime: number;
  } | null = null;

  // Bound listeners so we can remove the same references on destroy.
  readonly #onViewportChange: () => void;
  readonly #onOverlayChange: () => void;
  readonly #onPointerDown: (e: PointerEvent) => void;
  readonly #onPointerMove: (e: PointerEvent) => void;
  readonly #onPointerUp: (e: PointerEvent) => void;
  readonly #onPointerLeave: (e: PointerEvent) => void;

  constructor(params: NavigatorControllerParams) {
    this.#container = params.container;
    this.#chart = params.chart;
    this.#data = params.data;
    this.#options = params.options ?? {};

    // Absolute-positioned children require a non-static container.
    const computed = window.getComputedStyle(this.#container);
    if (computed.position === 'static') {
      this.#container.style.position = 'relative';
    }

    this.#canvas = document.createElement('canvas');
    this.#canvas.style.position = 'absolute';
    this.#canvas.style.left = '0';
    this.#canvas.style.top = '0';
    this.#canvas.style.height = '100%';
    this.#canvas.style.touchAction = 'none';
    this.#container.appendChild(this.#canvas);

    const ctx = this.#canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('NavigatorController: failed to acquire 2D context');
    this.#ctx = ctx;

    // DOM overlay — one parent div spanning the active zone, with five children
    // for the window, its two edge handles, and two mask halves. Overlay sits
    // above the canvas so the mask and window visually compose over the mini
    // series. `pointer-events: none` on every piece — the canvas alone owns
    // input so hit-testing flows through one coordinate space.
    this.#overlay = document.createElement('div');
    this.#overlay.dataset.chartNavigatorOverlay = '';
    this.#overlay.style.cssText = 'position:absolute;left:0;top:0;height:100%;pointer-events:none;';

    this.#maskLeft = document.createElement('div');
    this.#maskLeft.style.cssText = 'position:absolute;left:0;top:0;bottom:0;';
    this.#maskRight = document.createElement('div');
    this.#maskRight.style.cssText = 'position:absolute;top:0;bottom:0;';
    this.#window = document.createElement('div');
    this.#window.style.cssText = 'position:absolute;top:0;bottom:0;box-sizing:border-box;';
    this.#handleLeft = createHandle();
    this.#handleRight = createHandle();

    this.#overlay.append(this.#maskLeft, this.#maskRight, this.#window, this.#handleLeft, this.#handleRight);
    this.#container.appendChild(this.#overlay);

    this.#onViewportChange = () => this.#markDirty();
    this.#onOverlayChange = () => this.#markDirty();
    this.#onDataReplaced = () => {
      // Full data replacement (or history prepend through setData) — snap so
      // smoothing doesn't animate across what would be a discontinuity. Seed
      // values are populated lazily on the next #onFrame from the resolved
      // data range; we just clear the chase state here.
      this.#displayedDataStart = null;
      this.#displayedDataEnd = null;
      this.#markDirty();
    };
    this.#chart.on('viewportChange', this.#onViewportChange);
    this.#chart.on('overlayChange', this.#onOverlayChange);
    this.#chart.on('dataReplaced', this.#onDataReplaced);

    // Subscribe to the chart's frame clock — replaces our own RAF loop.
    // `#onFrame` advances smoothing chase, paints when dirty, and calls
    // `chart.scheduleNextFrame()` to keep RAF alive while still chasing.
    this.#unsubscribeFrame = this.#chart.subscribeFrame((frame) => this.#onFrame(frame));

    this.#onPointerDown = (e) => this.#handlePointerDown(e);
    this.#onPointerMove = (e) => this.#handlePointerMove(e);
    this.#onPointerUp = (e) => this.#handlePointerUp(e);
    this.#onPointerLeave = () => {
      if (this.#drag === null) this.#canvas.style.cursor = 'default';
    };
    this.#canvas.addEventListener('pointerdown', this.#onPointerDown);
    this.#canvas.addEventListener('pointermove', this.#onPointerMove);
    this.#canvas.addEventListener('pointerup', this.#onPointerUp);
    this.#canvas.addEventListener('pointercancel', this.#onPointerUp);
    this.#canvas.addEventListener('pointerleave', this.#onPointerLeave);

    this.#resizeObserver = new ResizeObserver((entries) => this.#handleResize(entries[0]));
    this.#resizeObserver.observe(this.#container);

    this.#applyHeightOption();

    // Synchronous initial measurement mirrors CanvasManager so the first render
    // has valid dimensions before the ResizeObserver callback fires.
    const rect = this.#container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.#applySize(rect.width, rect.height);
    }

    this.#markDirty();
  }

  setData(data: NavigatorData): void {
    this.#data = data;
    this.#markDirty();
  }

  setOptions(options: NavigatorOptions): void {
    this.#options = options;
    this.#applyHeightOption();
    this.#markDirty();
  }

  /** Push `options.height` (when set) onto the container's CSS height so
   *  direct core consumers see the option take effect. When the option is
   *  absent we leave the container alone — framework wrappers manage their
   *  own inline height via JSX, and overwriting it here would clobber the
   *  caller's value during the first layout effect. */
  #applyHeightOption(): void {
    const h = this.#options.height;
    if (h !== undefined) {
      this.#container.style.height = `${h}px`;
    }
  }

  destroy(): void {
    this.#chart.off('viewportChange', this.#onViewportChange);
    this.#chart.off('overlayChange', this.#onOverlayChange);
    this.#chart.off('dataReplaced', this.#onDataReplaced);
    this.#unsubscribeFrame?.();
    this.#unsubscribeFrame = null;
    this.#canvas.removeEventListener('pointerdown', this.#onPointerDown);
    this.#canvas.removeEventListener('pointermove', this.#onPointerMove);
    this.#canvas.removeEventListener('pointerup', this.#onPointerUp);
    this.#canvas.removeEventListener('pointercancel', this.#onPointerUp);
    this.#canvas.removeEventListener('pointerleave', this.#onPointerLeave);
    this.#resizeObserver.disconnect();
    this.#canvas.remove();
    this.#overlay.remove();
  }

  /** CSS pixel height of the strip — theme default unless overridden. */
  get height(): number {
    return this.#options.height ?? this.#chart.getTheme().navigator.height;
  }

  // --- internals ---------------------------------------------------------

  /** Effective drawing width — the navigator reserves the main chart's
   *  `yAxisWidth` on the right so its active zone lines up with the plot area. */
  get #activeWidth(): number {
    return Math.max(0, this.#mediaWidth - this.#chart.yAxisWidth);
  }

  #handleResize(entry: ResizeObserverEntry | undefined): void {
    if (!entry) return;
    const box = entry.contentBoxSize?.[0];
    const mediaWidth = box?.inlineSize ?? entry.contentRect.width;
    const mediaHeight = box?.blockSize ?? entry.contentRect.height;
    if (mediaWidth <= 0 || mediaHeight <= 0) return;

    this.#applySize(mediaWidth, mediaHeight);
    this.#markDirty();
  }

  #applySize(mediaWidth: number, mediaHeight: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.#mediaWidth = mediaWidth;
    this.#mediaHeight = mediaHeight;
    this.#pixelRatio = dpr;

    const activeWidth = this.#activeWidth;
    this.#canvas.width = Math.round(activeWidth * dpr);
    this.#canvas.height = Math.round(mediaHeight * dpr);
    this.#canvas.style.width = `${activeWidth}px`;
    this.#overlay.style.width = `${activeWidth}px`;
  }

  #markDirty(): void {
    this.#dirty = true;
    // Let the chart's clock schedule the next RAF — the navigator paints from
    // its own onFrame callback. No own dirty flag at chart-side, so main and
    // overlay paints stay independent of navigator state.
    this.#chart.scheduleNextFrame();
  }

  /** Per-frame heartbeat. Advances smoothing chase, repaints when dirty,
   * keeps RAF alive while still chasing. */
  #onFrame(frame: { now: DOMHighResTimeStamp; dt: number; frameId: number }): void {
    if (this.#activeWidth <= 0 || this.#mediaHeight <= 0) {
      if (this.#dirty) {
        this.#render();
        this.#dirty = false;
      }

      return;
    }

    const target = this.#resolveDataRange();
    const navigatorSmoothMs = this.#chart.getNavigatorSmoothMs();
    const rate = navigatorSmoothMs > 0 ? 1000 / navigatorSmoothMs : 0;

    // Seed on first frame after mount or after a snap event (`dataReplaced`).
    if (this.#displayedDataStart === null || this.#displayedDataEnd === null) {
      this.#displayedDataStart = target.from;
      this.#displayedDataEnd = target.to;
    } else if (rate <= 0 || frame.dt === 0) {
      // Smoothing disabled or first frame (`dt = 0`): snap.
      this.#displayedDataStart = target.from;
      this.#displayedDataEnd = target.to;
    } else {
      this.#displayedDataStart = smoothToward(this.#displayedDataStart, target.from, rate, frame.dt);
      this.#displayedDataEnd = smoothToward(this.#displayedDataEnd, target.to, rate, frame.dt);
    }

    // Convergence check uses an absolute ms epsilon (Unix timestamps make
    // multiplicative epsilons useless — see NAVIGATOR_TIME_EPSILON note).
    const stillChasing =
      Math.abs(this.#displayedDataEnd - target.to) > NAVIGATOR_TIME_EPSILON ||
      Math.abs(this.#displayedDataStart - target.from) > NAVIGATOR_TIME_EPSILON;

    if (this.#dirty || stillChasing) {
      this.#render();
      this.#dirty = false;
    }

    // Keep RAF alive while we're still chasing the target — without this the
    // clock goes idle after the viewport tween finishes and smoothing freezes
    // mid-step.
    if (stillChasing) this.#chart.scheduleNextFrame();
  }

  // --- input -------------------------------------------------------------

  /** Extract media-x from a pointer event, relative to the canvas. */
  #eventX(e: PointerEvent): number {
    const rect = this.#canvas.getBoundingClientRect();

    return e.clientX - rect.left;
  }

  /** Keep scales synced with current data bounds + size. Safe to call ahead of
   *  the first RAF-driven render — pointer handlers rely on this so hit-tests
   *  compute against primed scales even on the opening gesture.
   *
   *  Uses `#displayedDataStart` / `#displayedDataEnd` (the smoothed extent)
   *  when seeded; falls back to the raw target so first-frame and pointer-
   *  before-render paths still compute against valid coordinates. */
  #updateScales(): { dataRange: VisibleRange; yRange: YRange } {
    const target = this.#resolveDataRange();
    const dataRange: VisibleRange = {
      from: this.#displayedDataStart ?? target.from,
      to: this.#displayedDataEnd ?? target.to,
    };
    const yRange = this.#resolveYRange();
    this.#timeScale.update(dataRange, this.#activeWidth, this.#pixelRatio);
    this.#yScale.update(yRange, this.#mediaHeight, this.#pixelRatio);

    return { dataRange, yRange };
  }

  #currentWindowGeometry(): WindowGeometry {
    this.#updateScales();

    return computeWindowGeometry(this.#timeScale, this.#chart.getVisibleRange(), this.#resolveDataRange());
  }

  #pixelsPerTime(): number {
    const dataRange = this.#resolveDataRange();
    const span = dataRange.to - dataRange.from;
    if (span <= 0 || this.#activeWidth <= 0) return 0;

    return this.#activeWidth / span;
  }

  #handlePointerDown(e: PointerEvent): void {
    if (e.button !== undefined && e.button !== 0) return;

    const x = this.#eventX(e);
    const dataRange = this.#resolveDataRange();
    if (dataRange.to <= dataRange.from) return;

    const geom = this.#currentWindowGeometry();
    const hit = hitTest(x, geom);
    const pxPerTime = this.#pixelsPerTime();
    if (pxPerTime === 0) return;

    // Click-to-center: snap window to the pointer position, then let the
    // subsequent drag pan from the new anchor.
    let startVisible = this.#chart.getVisibleRange();
    if (hit.snapToCenter) {
      const time = this.#timeScale.xToTime(x);
      const next = computeSnapCenter({ time, startVisible, dataRange });
      this.#chart.setVisibleRange(next);
      startVisible = next;
    }

    this.#drag = {
      pointerId: e.pointerId,
      gesture: hit.gesture,
      startX: x,
      startVisible,
      pixelsPerTime: pxPerTime,
    };

    this.#canvas.setPointerCapture(e.pointerId);
    this.#canvas.style.cursor = cursorForGesture(hit.gesture, /*dragging*/ true);
    e.preventDefault();
  }

  #handlePointerMove(e: PointerEvent): void {
    const drag = this.#drag;
    if (drag === null) {
      // Hover feedback — cursor reflects the zone the pointer is over.
      this.#canvas.style.cursor = cursorForHover(this.#eventX(e), this.#currentWindowGeometry());

      return;
    }
    if (e.pointerId !== drag.pointerId) return;

    const deltaPx = this.#eventX(e) - drag.startX;
    const dataRange = this.#resolveDataRange();

    let next: VisibleRange;
    if (drag.gesture === 'pan') {
      next = computePan({
        startVisible: drag.startVisible,
        deltaPx,
        pixelsPerTime: drag.pixelsPerTime,
        dataRange,
      });
    } else {
      const edge = drag.gesture === 'resize-left' ? 'left' : 'right';
      next = computeResize({
        edge,
        startVisible: drag.startVisible,
        deltaPx,
        pixelsPerTime: drag.pixelsPerTime,
        dataRange,
        minSpan: 2 * this.#chart.getDataInterval(),
      });
    }

    this.#chart.setVisibleRange(next);
  }

  #handlePointerUp(e: PointerEvent): void {
    const drag = this.#drag;
    if (drag === null || e.pointerId !== drag.pointerId) return;

    this.#drag = null;
    if (this.#canvas.hasPointerCapture(e.pointerId)) {
      this.#canvas.releasePointerCapture(e.pointerId);
    }
    this.#canvas.style.cursor = cursorForHover(this.#eventX(e), this.#currentWindowGeometry());
  }

  // --- render ------------------------------------------------------------

  #render(): void {
    if (this.#activeWidth <= 0 || this.#mediaHeight <= 0) return;

    const theme = this.#chart.getTheme().navigator;
    const { dataRange } = this.#updateScales();

    // Recompute canvas pixel size — yAxisWidth may have changed since the last
    // resize event (e.g. axis config update), and the canvas needs to shrink
    // accordingly before we draw.
    this.#canvas.width = Math.round(this.#activeWidth * this.#pixelRatio);
    this.#canvas.height = Math.round(this.#mediaHeight * this.#pixelRatio);
    this.#canvas.style.width = `${this.#activeWidth}px`;
    this.#overlay.style.width = `${this.#activeWidth}px`;

    const ctx = this.#ctx;
    const bw = this.#canvas.width;
    const bh = this.#canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, bw, bh);
    ctx.scale(this.#pixelRatio, this.#pixelRatio);

    const rc = {
      ctx,
      timeScale: this.#timeScale,
      yScale: this.#yScale,
      mediaWidth: this.#activeWidth,
      mediaHeight: this.#mediaHeight,
      theme,
    };

    // Inset top + bottom hairlines via box-shadow on the canvas — the canvas
    // is sized to the active zone (full width minus the chart's y-axis reserve),
    // so the border tracks the strip's actual content instead of bleeding into
    // the empty y-axis column on the right.
    this.#canvas.style.boxShadow = `inset 0 1px 0 ${theme.borderColor}, inset 0 -1px 0 ${theme.borderColor}`;

    renderBackground(rc);

    // Miniature series — decimated to ~1 bucket per pixel of active width.
    // Line/bar callers may pass either a single `points` array or `series` for
    // multi-series overlays; the candlestick path stays single-series.
    const buckets = Math.max(1, Math.round(this.#activeWidth));
    const data = this.#data;
    if (data.type === 'candlestick') {
      renderMiniCandlestick(rc, decimateCandles(data.points, buckets));
    } else {
      const seriesList = lineSeriesList(data);
      const drawArea = seriesList.length === 1; // multiple stacked area fills muddy the strip
      for (const seriesPoints of seriesList) {
        const decimated = decimateLinear(seriesPoints, buckets);
        if (data.type === 'bar') {
          renderMiniBar(rc, decimated);
        } else {
          renderMiniLine(rc, decimated, drawArea);
        }
      }
    }

    ctx.restore();

    // Window + mask + handles live in DOM, not on canvas.
    this.#updateOverlayDom(theme, dataRange);
  }

  #updateOverlayDom(theme: ReturnType<ChartInstance['getTheme']>['navigator'], dataRange: VisibleRange): void {
    if (dataRange.to <= dataRange.from) return;

    const visible = this.#chart.getVisibleRange();
    const fromClamped = Math.max(dataRange.from, Math.min(dataRange.to, visible.from));
    const toClamped = Math.max(dataRange.from, Math.min(dataRange.to, visible.to));
    const x1 = this.#timeScale.timeToX(fromClamped);
    const x2 = this.#timeScale.timeToX(toClamped);
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const width = Math.max(1, right - left);

    // Mask halves — left spans [0, left], right spans [left+width, activeWidth].
    this.#maskLeft.style.width = `${left}px`;
    this.#maskLeft.style.background = theme.mask.fill;
    this.#maskLeft.style.display = left > 0 ? 'block' : 'none';

    const rightMaskWidth = Math.max(0, this.#activeWidth - (left + width));
    this.#maskRight.style.left = `${left + width}px`;
    this.#maskRight.style.width = `${rightMaskWidth}px`;
    this.#maskRight.style.background = theme.mask.fill;
    this.#maskRight.style.display = rightMaskWidth > 0 ? 'block' : 'none';

    // Window body — translucent fill + border.
    this.#window.style.left = `${left}px`;
    this.#window.style.width = `${width}px`;
    this.#window.style.background = theme.window.fill;
    this.#window.style.border =
      theme.window.borderWidth > 0 ? `${theme.window.borderWidth}px solid ${theme.window.border}` : 'none';

    // Edge handles — pill-shaped, with three vertical dots inside that pick up
    // the page bg so they read as indents in the chrome regardless of whether
    // the strip itself is painted (`theme.navigator.background` may be
    // 'transparent', so we anchor on the root `theme.background` instead).
    const hw = theme.handle.width;
    const radius = Math.max(1, hw / 2);
    const dotColor = this.#chart.getTheme().background;

    this.#handleLeft.style.left = `${left - hw / 2}px`;
    this.#handleLeft.style.width = `${hw}px`;
    this.#handleLeft.style.background = theme.handle.color;
    this.#handleLeft.style.borderRadius = `${radius}px`;
    this.#handleRight.style.left = `${left + width - hw / 2}px`;
    this.#handleRight.style.width = `${hw}px`;
    this.#handleRight.style.background = theme.handle.color;
    this.#handleRight.style.borderRadius = `${radius}px`;

    for (const dot of this.#handleLeft.children) {
      (dot as HTMLElement).style.background = dotColor;
    }
    for (const dot of this.#handleRight.children) {
      (dot as HTMLElement).style.background = dotColor;
    }
  }

  #resolveDataRange(): VisibleRange {
    // Source of truth — caller-supplied points span the navigator's x extent.
    const data = this.#data;
    let firstTime = Number.POSITIVE_INFINITY;
    let lastTime = Number.NEGATIVE_INFINITY;
    let count = 0;

    if (data.type === 'candlestick') {
      count = data.points.length;
      if (count > 0) {
        firstTime = data.points[0].time;
        lastTime = data.points[count - 1].time;
      }
    } else {
      for (const series of lineSeriesList(data)) {
        if (series.length === 0) continue;
        count += series.length;
        if (series[0].time < firstTime) firstTime = series[0].time;
        if (series[series.length - 1].time > lastTime) lastTime = series[series.length - 1].time;
      }
    }

    if (count >= 2 && lastTime > firstTime) {
      return { from: firstTime, to: lastTime };
    }
    if (count === 1) {
      // Degenerate single-point case — widen to viewport so layout stays stable.
      return { ...this.#chart.getVisibleRange() };
    }

    // Fall back to chart's tracked data bounds if data hasn't been wired yet.
    const dr = this.#chart.getDataRange();
    if (dr && dr.to > dr.from) return dr;

    return { ...this.#chart.getVisibleRange() };
  }

  #resolveYRange(): YRange {
    const data = this.#data;
    let min = Infinity;
    let max = -Infinity;

    if (data.type === 'candlestick') {
      for (const p of data.points) {
        if (p.low < min) min = p.low;
        if (p.high > max) max = p.high;
      }
    } else {
      for (const series of lineSeriesList(data)) {
        for (const p of series) {
          if (p.value < min) min = p.value;
          if (p.value > max) max = p.value;
        }
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
    if (min === max) {
      // Pad a flat series so the miniature doesn't collapse to a single line.
      const pad = Math.abs(min) * 0.05 || 1;
      return { min: min - pad, max: max + pad };
    }
    // Leave breathing room at top/bottom so wicks and line strokes don't kiss
    // the edges of the (typically short) strip. Bigger than the main chart's
    // padding because compressing 48px of height without margins reads as
    // "crushed".
    const pad = (max - min) * 0.2;

    return { min: min - pad, max: max + pad };
  }
}

/** Normalize a line/bar NavigatorData entry into an array of point arrays.
 *  Single-series shorthand `points` becomes a one-element list. */
function lineSeriesList(
  data: Extract<NavigatorData, { type: 'line' | 'bar' }>,
): readonly (readonly NavigatorLinePoint[])[] {
  return 'series' in data ? data.series : [data.points];
}

function cursorForGesture(gesture: NavigatorGesture, dragging: boolean): string {
  if (gesture === 'resize-left' || gesture === 'resize-right') return 'ew-resize';

  return dragging ? 'grabbing' : 'grab';
}

function cursorForHover(x: number, geom: WindowGeometry): string {
  return cursorForGesture(hitTestGesture(x, geom), false);
}

function hitTestGesture(x: number, geom: WindowGeometry): NavigatorGesture {
  return hitTest(x, geom).gesture;
}

/** Build a handle div with 3 stacked dots — a pill-shaped grip indicator. */
function createHandle(): HTMLDivElement {
  const handle = document.createElement('div');
  handle.style.cssText =
    'position:absolute;top:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;';

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.style.cssText = 'width:2px;height:2px;border-radius:50%;flex-shrink:0;';
    handle.appendChild(dot);
  }

  return handle;
}

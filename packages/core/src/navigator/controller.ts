import { Animator, easeOutCubic } from '../animation';
import { DEFAULT_LINE_ENTRY } from '../animation/config';
import type { ChartInstance } from '../chart';
import { XScale } from '../scales/x-scale';
import { YScale } from '../scales/y-scale';
import type { XRange, YRange } from '../types';
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
 *   chart.viewportChange → reposition window DOM on next frame (canvas untouched)
 *   chart.tickFrame      → reposition window DOM on next frame (window glide)
 *   chart.overlayChange  → full redraw (catches data + theme swaps)
 *   ResizeObserver       → resize canvas + full redraw
 *
 * The canvas miniature depends only on data / theme / size, so per-frame
 * viewport signals take the light DOM-only path — a wheel-zoom or pan never
 * re-decimates the dataset or repaints the strip.
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
  readonly #timeScale = new XScale();
  readonly #yScale = new YScale();

  #mediaWidth = 0;
  #mediaHeight = 0;
  #pixelRatio = 1;

  #rafHandle: number | null = null;
  /** A full canvas render is owed. A queued frame with `#dirty === false`
   *  came from {@link #markWindowDirty} and only repositions the window DOM. */
  #dirty = true;

  /**
   * Memoized decimation results keyed by source array ref. Cleared on
   * `setData` (guards in-place mutation of a re-passed array); a buckets
   * mismatch (resize) recomputes per entry.
   */
  readonly #decimationCache = new Map<object, { buckets: number; result: unknown }>();

  /**
   * Eases the alpha of the trailing bar/candle/line-segment from 0 → 1 over
   * `DEFAULT_LINE_ENTRY` whenever {@link setData} reports a new last point
   * (a `time` we haven't seen before). Mirrors the per-point entrance
   * animation that the main chart's series renderers run, so a streaming
   * tick reads as a smooth fade-in here too instead of a redraw pop.
   *
   * `null` means "no entrance in flight, draw the tail at full alpha".
   */
  #tailEntrance: Animator<number> | null = null;
  /** `time` of the last point we've ever seen — initialises after the first
   * `setData`/render so the first paint doesn't trigger a fade-in. */
  #lastSeenTime: number | null = null;
  /** Series index in `lineSeriesList(data)` that owns the newest last-time,
   * so the tail fade applies to the series that actually grew — not always
   * the last entry in the stack. -1 for candlestick (single-series). */
  #tailSeriesIndex = -1;

  #resizeObserver: ResizeObserver;

  // Active-drag state — null when idle.
  #drag: {
    pointerId: number;
    gesture: NavigatorGesture;
    startX: number;
    startVisible: XRange;
    pixelsPerTime: number;
  } | null = null;

  // Bound listeners so we can remove the same references on destroy.
  readonly #onViewportChange: () => void;
  readonly #onOverlayChange: () => void;
  readonly #onTickFrame: () => void;
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

    // Viewport moves only affect the window DOM — the miniature canvas keys
    // off data/theme/size, so both per-frame signals take the light path.
    this.#onViewportChange = () => this.#markWindowDirty();
    this.#onOverlayChange = () => this.#markDirty();
    // tickFrame fires every animation frame (the same per-frame signal the DOM
    // axis labels ride); subscribing lets the brush window glide with the eased
    // canvas instead of only updating on discrete viewport/overlay commits.
    this.#onTickFrame = () => this.#markWindowDirty();
    this.#chart.on('viewportChange', this.#onViewportChange);
    this.#chart.on('overlayChange', this.#onOverlayChange);
    this.#chart.on('tickFrame', this.#onTickFrame);

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
    const tail = tailOfData(data);
    const newLastTime = tail?.time ?? null;
    if (newLastTime !== null && this.#lastSeenTime !== null && newLastTime !== this.#lastSeenTime) {
      // A new point at a previously-unseen time — start fading the tail in.
      // Drop any in-flight entrance and start fresh; back-to-back streaming
      // ticks each restart the curve from the current alpha so the visual
      // continuity is preserved by the Animator's retarget contract.
      const prev = this.#tailEntrance?.current ?? 0;
      this.#tailEntrance = new Animator<number>({
        initial: prev,
        duration: DEFAULT_LINE_ENTRY,
        easing: easeOutCubic,
        lerp: (a, b, t) => a + (b - a) * t,
      });
      this.#tailEntrance.setTarget(1);
    }
    this.#lastSeenTime = newLastTime;
    this.#tailSeriesIndex = tail?.seriesIndex ?? -1;
    this.#data = data;
    this.#decimationCache.clear();
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
    this.#chart.off('tickFrame', this.#onTickFrame);
    this.#canvas.removeEventListener('pointerdown', this.#onPointerDown);
    this.#canvas.removeEventListener('pointermove', this.#onPointerMove);
    this.#canvas.removeEventListener('pointerup', this.#onPointerUp);
    this.#canvas.removeEventListener('pointercancel', this.#onPointerUp);
    this.#canvas.removeEventListener('pointerleave', this.#onPointerLeave);
    this.#resizeObserver.disconnect();
    if (this.#rafHandle !== null) {
      cancelAnimationFrame(this.#rafHandle);
      this.#rafHandle = null;
    }
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
    this.#mediaWidth = mediaWidth;
    this.#mediaHeight = mediaHeight;
    this.#pixelRatio = window.devicePixelRatio || 1;

    this.#syncCanvasSize();
  }

  /**
   * Write canvas backing-store / CSS sizes only when they actually changed —
   * any assignment to `canvas.width`/`height`, even with the same value,
   * resets the backing store (full clear + realloc), which is pure waste on
   * a repaint where nothing resized.
   */
  #syncCanvasSize(): void {
    const bitmapWidth = Math.round(this.#activeWidth * this.#pixelRatio);
    const bitmapHeight = Math.round(this.#mediaHeight * this.#pixelRatio);
    if (this.#canvas.width !== bitmapWidth) this.#canvas.width = bitmapWidth;
    if (this.#canvas.height !== bitmapHeight) this.#canvas.height = bitmapHeight;

    const cssWidth = `${this.#activeWidth}px`;
    if (this.#canvas.style.width !== cssWidth) {
      this.#canvas.style.width = cssWidth;
      this.#overlay.style.width = cssWidth;
    }
  }

  #markDirty(): void {
    this.#dirty = true;
    this.#scheduleFrame();
  }

  /** Queue a window-DOM-only frame — a queued full render takes precedence. */
  #markWindowDirty(): void {
    this.#scheduleFrame();
  }

  #scheduleFrame(): void {
    if (this.#rafHandle !== null) return;

    this.#rafHandle = requestAnimationFrame(() => {
      this.#rafHandle = null;
      const full = this.#dirty;
      this.#dirty = false;

      if (full) {
        this.#render();
      } else {
        this.#renderWindow();
      }
    });
  }

  // --- input -------------------------------------------------------------

  /** Extract media-x from a pointer event, relative to the canvas. */
  #eventX(e: PointerEvent): number {
    const rect = this.#canvas.getBoundingClientRect();

    return e.clientX - rect.left;
  }

  /** Keep scales synced with current data bounds + size. Safe to call ahead of
   *  the first RAF-driven render — pointer handlers rely on this so hit-tests
   *  compute against primed scales even on the opening gesture. */
  #updateScales(): { xRange: XRange; yRange: YRange } {
    const xRange = this.#resolveXRange();
    const yRange = this.#resolveYRange();
    this.#timeScale.update(xRange, this.#activeWidth, this.#pixelRatio);
    this.#yScale.update(yRange, this.#mediaHeight, this.#pixelRatio);

    return { xRange, yRange };
  }

  /**
   * X range for the brush window. While the user drags the brush we track the
   * committed logical target so the window follows the cursor 1:1; otherwise we
   * follow the engine's eased visual so the window glides with the canvas
   * instead of snapping to a wheel-zoom / pan destination while the chart eases.
   */
  #windowRange(): XRange {
    if (this.#drag !== null) return this.#chart.getVisibleRange();

    return this.#chart.getAnimationState().xRange;
  }

  #currentWindowGeometry(): WindowGeometry {
    this.#updateScales();

    return computeWindowGeometry(this.#timeScale, this.#windowRange(), this.#resolveXRange());
  }

  #pixelsPerTime(): number {
    const dataRange = this.#resolveXRange();
    const span = dataRange.to - dataRange.from;
    if (span <= 0 || this.#activeWidth <= 0) return 0;

    return this.#activeWidth / span;
  }

  #handlePointerDown(e: PointerEvent): void {
    if (e.button !== undefined && e.button !== 0) return;

    const x = this.#eventX(e);
    const xRange = this.#resolveXRange();
    if (xRange.to <= xRange.from) return;

    const geom = this.#currentWindowGeometry();
    const hit = hitTest(x, geom);
    const pxPerTime = this.#pixelsPerTime();
    if (pxPerTime === 0) return;

    // Click-to-center: snap window to the pointer position, then let the
    // subsequent drag pan from the new anchor.
    let startVisible = this.#chart.getVisibleRange();
    if (hit.snapToCenter) {
      const time = this.#timeScale.xToTime(x);
      const next = computeSnapCenter({ time, startVisible, xRange });
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
    const dataRange = this.#resolveXRange();

    let next: XRange;
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
    const { xRange } = this.#updateScales();

    // Recompute canvas pixel size — yAxisWidth may have changed since the last
    // resize event (e.g. axis config update), and the canvas needs to shrink
    // accordingly before we draw.
    this.#syncCanvasSize();

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

    // Tail entrance alpha — eases the trailing bar/candle/line segment from
    // 0 to 1 when a new point streamed in via setData. While in flight,
    // request another frame so the fade-in reads as continuous motion.
    let tailAlpha = 1;
    if (this.#tailEntrance !== null) {
      this.#tailEntrance.tick(performance.now());
      tailAlpha = this.#tailEntrance.current;
      if (this.#tailEntrance.animating) {
        this.#markDirty();
      } else {
        this.#tailEntrance = null;
      }
    }

    // Miniature series — decimated to ~1 bucket per pixel of active width.
    // Line/bar callers may pass either a single `points` array or `series` for
    // multi-series overlays; the candlestick path stays single-series.
    const buckets = Math.max(1, Math.round(this.#activeWidth));
    const data = this.#data;
    if (data.type === 'candlestick') {
      renderMiniCandlestick(rc, this.#memoDecimate(data.points, buckets, decimateCandles), tailAlpha);
    } else {
      const seriesList = lineSeriesList(data);
      const drawArea = seriesList.length === 1; // multiple stacked area fills muddy the strip
      // Tail-fade applies only to the series whose last point is the newest
      // (`#tailSeriesIndex`, set in `setData`). Falling back to "last in the
      // stack" would fade the wrong series whenever a non-last series receives
      // an update, which is visually confusing on overlapping strokes.
      const tailIndex = this.#tailSeriesIndex >= 0 ? this.#tailSeriesIndex : seriesList.length - 1;
      for (let s = 0; s < seriesList.length; s++) {
        const decimated = this.#memoDecimate(seriesList[s], buckets, decimateLinear);
        const alpha = s === tailIndex ? tailAlpha : 1;
        if (data.type === 'bar') {
          renderMiniBar(rc, decimated, alpha);
        } else {
          renderMiniLine(rc, decimated, drawArea, alpha);
        }
      }
    }

    ctx.restore();

    // Window + mask + handles live in DOM, not on canvas.
    this.#updateOverlayDom(theme, xRange);
  }

  /**
   * Light per-frame path — reposition the window / masks / handles against
   * the eased viewport without touching the canvas. Escalates to a full
   * render when the canvas size went stale (e.g. `yAxisWidth` changed without
   * a resize event).
   */
  #renderWindow(): void {
    if (this.#activeWidth <= 0 || this.#mediaHeight <= 0) return;

    const bitmapWidth = Math.round(this.#activeWidth * this.#pixelRatio);
    if (this.#canvas.width !== bitmapWidth) {
      this.#render();

      return;
    }

    const theme = this.#chart.getTheme().navigator;
    const { xRange } = this.#updateScales();
    this.#updateOverlayDom(theme, xRange);
  }

  /** Decimate `points` into `buckets`, reusing the cached result while the
   *  source array ref and bucket count are unchanged. */
  #memoDecimate<P extends object>(
    points: readonly P[],
    buckets: number,
    decimate: (points: readonly P[], buckets: number) => readonly P[],
  ): readonly P[] {
    const cached = this.#decimationCache.get(points);
    if (cached !== undefined && cached.buckets === buckets) {
      return cached.result as readonly P[];
    }

    const result = decimate(points, buckets);
    this.#decimationCache.set(points, { buckets, result });

    return result;
  }

  #updateOverlayDom(theme: ReturnType<ChartInstance['getTheme']>['navigator'], xRange: XRange): void {
    if (xRange.to <= xRange.from) return;

    const visible = this.#windowRange();
    const fromClamped = Math.max(xRange.from, Math.min(xRange.to, visible.from));
    const toClamped = Math.max(xRange.from, Math.min(xRange.to, visible.to));
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

  #resolveXRange(): XRange {
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

/** The newest tail across every point/series in `data`, or `null` for empty
 * data. Used to detect "a new last point arrived" in {@link
 * NavigatorController.setData}; the `seriesIndex` tells the renderer which
 * series owns that tail so the fade-in alpha is applied to the right stroke
 * (multi-series line/bar). `seriesIndex` is `-1` for candlestick. */
function tailOfData(data: NavigatorData): { time: number; seriesIndex: number } | null {
  if (data.type === 'candlestick') {
    const n = data.points.length;
    if (n === 0) return null;

    return { time: data.points[n - 1].time, seriesIndex: -1 };
  }
  const seriesList = 'series' in data ? data.series : [data.points];
  let maxTime: number | null = null;
  let maxIndex = -1;
  for (let i = 0; i < seriesList.length; i++) {
    const points = seriesList[i];
    if (points.length === 0) continue;
    const t = points[points.length - 1].time;
    if (maxTime === null || t > maxTime) {
      maxTime = t;
      maxIndex = i;
    }
  }
  if (maxTime === null) return null;

  return { time: maxTime, seriesIndex: maxIndex };
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

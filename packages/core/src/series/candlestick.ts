import { Animator } from '../animation/animator';
import { DEFAULT_CANDLESTICK_ENTRY, DEFAULT_CANDLESTICK_INTRO, DEFAULT_CANDLESTICK_SMOOTH } from '../animation/config';
import { easeOutCubic } from '../animation/easing';
import { IntroWave } from '../animation/intro-wave';
import { ScalarSpring } from '../animation/scalar-spring';
import { decimateOHLCData } from '../data/decimation';
import { TimeSeriesStore } from '../data/store';
import { resolveCandlestickBodyColor } from '../theme/resolve';
import type { ChartTheme } from '../theme/types';
import type { CandlestickSeriesOptions, OHLCData, OHLCInput } from '../types';
import { hexToRgba } from '../utils/color';
import { clamp, lerp } from '../utils/math';
import { isPoisonedNumber, reportPoisonedData } from '../utils/poisoned-data-reporter';
import { normalizeOHLCArray, normalizeTime } from '../utils/time';
import type { SeriesDefinition } from './definition';
import { fillRoundedRect } from './painters/canvas-path';
import { resolveCandlePainter } from './painters/resolve';
import type { CandlePainter, CornerMask, PaintEnv } from './painters/types';
import type { SeriesRenderContext, TimeSeriesRenderer } from './types';

/** Internal resolved shape: `entryMs` / `smoothMs` are concrete numbers
 *  (`false` from the public surface gets normalized to `0` at the merge
 *  boundary, so downstream reads never see the disable sentinel). */
type ResolvedCandlestickOptions = Omit<CandlestickSeriesOptions, 'entryMs' | 'smoothMs' | 'introMs'> & {
  entryMs: number;
  smoothMs: number;
  introMs: number;
};

/** Per-candle entrance state — start wall-time so progress is `(now - startTime) / entryMs`. */
interface EntryState {
  startTime: number;
}

/**
 * Per-frame EMA factor for the volume scale (`maxVol`). Volume bars are scaled
 * to the tallest bar in the *visible window*, so a zoom that changes the window
 * changes that max — without smoothing the whole volume band snaps in a single
 * frame while the candles ease via the engine's sticky-Y baseline, reading as a
 * jump. Easing `maxVol` toward the raw window max lets volume re-scale in
 * lockstep with the price axis. 0.15 ≈ 4.3-frame half-life (~72 ms @ 60 fps):
 * snappy enough to track a zoom gesture, slow enough to kill the snap.
 */
const VOL_SCALE_ALPHA = 0.15;

/** Relative gap below which the volume scale counts as settled (stops requesting frames). */
const VOL_SCALE_SETTLE_EPS = 0.005;

/**
 * Velocity-continuous chase for the live candle's OHLC (and volume) — one
 * {@link ScalarSpring} per field. Replaces the easing `Animator<OHLCData>` so
 * rapid intra-bar `updateLastPoint` ticks don't restart the curve (the
 * easeOutCubic "kick") on every retarget.
 */
class OHLCSpring {
  readonly #open: ScalarSpring;
  readonly #high: ScalarSpring;
  readonly #low: ScalarSpring;
  readonly #close: ScalarSpring;
  readonly #volume: ScalarSpring;
  #time: number;
  // Sticky once any seen candle carries volume — mirrors the old lerp, which
  // only emitted `volume` when a side had it, so a volume-less candle stays
  // volume-less and the histogram keeps skipping it.
  #hasVolume: boolean;

  constructor(initial: OHLCData) {
    this.#open = new ScalarSpring(initial.open);
    this.#high = new ScalarSpring(initial.high);
    this.#low = new ScalarSpring(initial.low);
    this.#close = new ScalarSpring(initial.close);
    this.#volume = new ScalarSpring(initial.volume ?? 0);
    this.#time = initial.time;
    this.#hasVolume = initial.volume !== undefined;
  }

  retarget(target: OHLCData, opts: { now?: number; settleMs?: number } = {}): void {
    this.#time = target.time;
    if (target.volume !== undefined) this.#hasVolume = true;
    this.#open.retarget(target.open, opts);
    this.#high.retarget(target.high, opts);
    this.#low.retarget(target.low, opts);
    this.#close.retarget(target.close, opts);
    this.#volume.retarget(target.volume ?? 0, opts);
  }

  tick(now: number): boolean {
    // Tick every side (no short-circuit — all must advance), then OR.
    const o = this.#open.tick(now);
    const h = this.#high.tick(now);
    const l = this.#low.tick(now);
    const c = this.#close.tick(now);
    const v = this.#volume.tick(now);

    return o || h || l || c || v;
  }

  get current(): OHLCData {
    const r: OHLCData = {
      time: this.#time,
      open: this.#open.current,
      high: this.#high.current,
      low: this.#low.current,
      close: this.#close.current,
    };
    if (this.#hasVolume) r.volume = this.#volume.current;

    return r;
  }
}

/** Default body corner radius in CSS px. `0` is byte-identical to the prior
 *  square `fillRect` output (see {@link fillRoundedRect}). Kept subtle — bodies
 *  are narrow, so even a small radius reads clearly; clamps to flat on dojis. */
const DEFAULT_CORNER_RADIUS = 2;

/** Candle bodies have no baseline, so every corner rounds. */
const ALL_CORNERS: CornerMask = { tl: true, tr: true, br: true, bl: true };

/** Volume bars grow up from the baseline, so only the free (top) end rounds. */
const VOLUME_TOP_CORNERS: CornerMask = { tl: true, tr: true, br: false, bl: false };

const DEFAULT_OPTIONS: ResolvedCandlestickOptions = {
  up: { body: '#26a69a', wick: '#26a69a' },
  down: { body: '#ef5350', wick: '#ef5350' },
  bodyWidthRatio: 0.6,
  cornerRadius: DEFAULT_CORNER_RADIUS,
  entryMs: DEFAULT_CANDLESTICK_ENTRY,
  smoothMs: DEFAULT_CANDLESTICK_SMOOTH,
  introMs: DEFAULT_CANDLESTICK_INTRO,
};

/** Per-render drawing context, resolved once in {@link CandlestickRenderer.render}
 *  so the per-candle body loop doesn't re-resolve the painter or rebuild the env. */
interface CandlePass {
  painter: CandlePainter;
  env: PaintEnv;
  /** Corner radius in bitmap px (CSS px × horizontalPixelRatio), before the
   *  per-body clamp applied at the fill site. */
  radius: number;
}

function normalize(options: CandlestickSeriesOptions): ResolvedCandlestickOptions {
  return {
    ...options,
    entryMs: options.entryMs === false ? 0 : (options.entryMs ?? DEFAULT_CANDLESTICK_ENTRY),
    smoothMs: options.smoothMs === false ? 0 : (options.smoothMs ?? DEFAULT_CANDLESTICK_SMOOTH),
    introMs: options.introMs === false ? 0 : (options.introMs ?? DEFAULT_CANDLESTICK_INTRO),
  };
}

export class CandlestickRenderer implements TimeSeriesRenderer {
  readonly kind = 'candlestick' as const;
  readonly store: TimeSeriesStore<OHLCData>;
  private options: ResolvedCandlestickOptions;

  // --- Animation state ----------------------------------------------------
  /** Smoothed OHLC for the live last candle. Reset on `appendPoint` (new
   *  candle → identity snap) and chased on `updateLastPoint`. */
  protected displayedLast: OHLCData | null = null;
  /** Per-candle entrance registry. Single-layer, so no per-layer split. */
  protected readonly entries: Map<number, EntryState> = new Map();
  #liveAnimator: OHLCSpring | null = null;
  /** EMA-smoothed volume scale (tallest visible bar). `null` re-seeds (snaps)
   *  on the next frame — set on construction and bulk data replacement. */
  #displayedMaxVol: number | null = null;
  /** False while {@link #displayedMaxVol} is still chasing the raw window max —
   *  feeds {@link needsAnimation} so frames keep flowing until it converges. */
  #volScaleSettled = true;
  /** Whether the previous frame was rendering decimated (bucketed) candles.
   *  Crossing this boundary changes `volume` semantics (per-candle ↔ summed
   *  bucket), so the volume scale snaps rather than easing — otherwise the EMA
   *  clamps every bar to full band height for ~30 frames. */
  #prevDecimated = false;
  /** Series-level alpha for visibility cross-fade. Chart calls {@link setAlpha} on hide. */
  readonly #alphaAnimator: Animator<number> = new Animator<number>({
    initial: 1,
    duration: 0,
    lerp: (a, b, t) => a + (b - a) * t,
  });
  /** Initial-load reveal clock — armed on the first empty → non-empty seed;
   *  candles unfold in a left-to-right wave across the visible window. */
  protected readonly introWave = new IntroWave();
  /** Body gradients keyed by `top|bottom|height` — built once at y=0..h and
   *  positioned per candle via `ctx.translate`, instead of a fresh
   *  `createLinearGradient` for every body on every frame. */
  readonly #bodyGradientCache = new Map<string, CanvasGradient>();

  constructor(store: TimeSeriesStore<OHLCData>, options?: Partial<CandlestickSeriesOptions>) {
    this.store = store;
    this.options = normalize({ ...DEFAULT_OPTIONS, ...options });
    // Seed `displayedLast` from the (possibly pre-populated) store — `setData`
    // doesn't run when the caller pre-loaded the store before construction,
    // so without this seed the first `updateLastPoint` would lazily anchor
    // its chase at the target and visually snap.
    this.displayedLast = store.last() ?? null;
  }

  private isEntryEnabled(): boolean {
    return (this.options.entryAnimation ?? 'unfold') !== 'none';
  }

  updateOptions(options: Partial<CandlestickSeriesOptions>): void {
    this.options = normalize({ ...this.options, ...options });
  }

  getColor(): string {
    return resolveCandlestickBodyColor(this.options.up.body);
  }

  // --- SeriesRenderer interface implementation ------------------------------

  setData(data: unknown): void {
    const hadData = this.store.length > 0;
    this.store.setData(normalizeOHLCArray((data ?? []) as OHLCInput[]));

    // First seed only (empty → non-empty): arm the initial reveal. Bulk
    // re-seeds of a live series must never replay the intro.
    if (!hadData && this.store.length > 0) {
      this.introWave.arm(this.options.introMs);
    }

    // Bulk replace — seed `displayedLast` to the new last candle, drop any
    // in-flight chase and per-candle entries so the next render paints the
    // canonical dataset with no leftover animation.
    const last = this.store.last();
    this.displayedLast = last ?? null;
    this.#liveAnimator = null;
    this.entries.clear();
    // Fresh dataset — re-seed the volume scale so it snaps to the new data's
    // max instead of easing from the previous dataset's (which would read as a
    // spurious volume animation on a plain `setData`).
    this.#displayedMaxVol = null;
  }

  appendPoint(point: unknown): void {
    const p = point as OHLCInput;
    const time = normalizeTime(p.time);
    const candle: OHLCData = { ...p, time };
    this.store.append(candle);

    // Identity snap on append: a new candle's first frame must show its
    // exact OHLC, not an interpolation from the previous candle's close.
    this.displayedLast = candle;
    this.#liveAnimator = null;

    const entryMs = this.options.entryMs;
    if (this.isEntryEnabled() && entryMs > 0) {
      this.entries.set(time, { startTime: performance.now() });
    }
  }

  updateLastPoint(point: unknown): void {
    const p = point as OHLCInput;
    const time = normalizeTime(p.time);
    const target: OHLCData = { ...p, time };
    this.store.updateLast(target);

    const smoothMs = this.options.smoothMs;
    if (smoothMs <= 0) {
      this.displayedLast = target;
      this.#liveAnimator = null;
      return;
    }

    let anim = this.#liveAnimator;
    if (anim === null) {
      const initial = this.displayedLast ?? target;
      anim = new OHLCSpring(initial);
      this.#liveAnimator = anim;
    }

    anim.retarget(target, { settleMs: smoothMs });
  }

  keepLast(count: number): void {
    if (count < 0) return;

    const drop = this.store.length - count;
    if (drop <= 0) return;

    this.store.trimStart(drop);
  }

  getLayerCount(): number {
    return 1;
  }

  setLayerVisible(_index: number, _visible: boolean): void {
    // Candlestick has a single layer; visibility is managed by the chart.
  }

  isLayerVisible(_index: number): boolean {
    return true;
  }

  getLayerColors(): string[] {
    return [resolveCandlestickBodyColor(this.options.up.body)];
  }

  applyTheme(theme: ChartTheme, _prev: ChartTheme): void {
    this.updateOptions({
      up: { ...theme.candlestick.up },
      down: { ...theme.candlestick.down },
    });
  }

  onDataChanged(listener: () => void): () => void {
    this.store.on('update', listener);
    return () => this.store.off('update', listener);
  }

  dispose(): void {
    this.store.removeAllListeners();
  }

  // --- Animation lifecycle ------------------------------------------------

  /**
   * Advance the live-OHLC chase + alpha fade against `now` and prune
   * fully-settled entrance entries. Called from `render()` once per frame.
   */
  private tickAnimations(now: number): void {
    this.introWave.tick(now);
    this.#alphaAnimator.tick(now);

    const anim = this.#liveAnimator;
    if (anim !== null) {
      const stillAnimating = anim.tick(now);
      this.displayedLast = anim.current;
      if (!stillAnimating) this.#liveAnimator = null;
    }

    const entryMs = this.options.entryMs;
    if (entryMs <= 0) {
      this.entries.clear();
      return;
    }

    for (const [time, state] of this.entries) {
      if (now - state.startTime >= entryMs) this.entries.delete(time);
    }
  }

  /** True while OHLC chase, any per-candle entrance, the initial reveal,
   *  alpha fade, or the volume scale is unsettled. */
  get needsAnimation(): boolean {
    return (
      this.introWave.active ||
      this.#alphaAnimator.animating ||
      this.#liveAnimator !== null ||
      this.entries.size > 0 ||
      !this.#volScaleSettled
    );
  }

  /** Abort in-flight per-candle entrance animations, including the initial
   *  reveal. Live-OHLC chase is left intact. */
  cancelEntranceAnimations(): void {
    this.introWave.finish();
    this.entries.clear();
  }

  setAlpha(target: number, durationMs: number): void {
    this.#alphaAnimator.setTarget(target, { duration: durationMs });
  }

  getAlpha(): number {
    return this.#alphaAnimator.current;
  }

  getLastValue(): number | null {
    const last = this.store.last();
    return last ? last.close : null;
  }

  getDataAtTime(time: number, interval: number): OHLCData | null {
    return this.store.findNearest(time, interval);
  }

  // --- TimeSeriesRenderer data queries --------------------------------------

  getTimeBounds(): { first: number; last: number } | null {
    const f = this.store.first();
    const l = this.store.last();
    if (!f || !l) return null;

    return { first: f.time, last: l.time };
  }

  getLastDataPoint(): OHLCData | null {
    return this.store.last() ?? null;
  }

  getSecondLastDataPoint(): OHLCData | null {
    const all = this.store.getAll();

    return all.length >= 2 ? all[all.length - 2] : null;
  }

  sampleTimes(maxCount: number): number[] {
    return this.store
      .getAll()
      .slice(0, maxCount)
      .map((d) => d.time);
  }

  getVisibleDataPoints(from: number, to: number): readonly OHLCData[] {
    return this.store.getVisibleData(from, to);
  }

  getValueRange(from: number, to: number): { min: number; max: number } | null {
    const visible = this.store.getVisibleData(from, to);

    // Independent finite guards per bound — mirrors the y-target fallback this
    // replaces, so a poisoned high/low (NaN / ±Infinity) can't corrupt the range.
    let min = Infinity;
    let max = -Infinity;
    for (const candle of visible) {
      if (Number.isFinite(candle.low) && candle.low < min) min = candle.low;
      if (Number.isFinite(candle.high) && candle.high > max) max = candle.high;
    }

    return min === Infinity || max === -Infinity ? null : { min, max };
  }

  render(ctx: SeriesRenderContext): void {
    this.tickAnimations(performance.now());

    const { scope, timeScale, yScale, dataInterval } = ctx;
    const { context, horizontalPixelRatio } = scope;
    const range = timeScale.getRange();

    let visibleData = this.store.getVisibleData(range.from, range.to);
    const pixelWidth = scope.mediaSize.width;
    const decimated = visibleData.length > pixelWidth * 2;
    if (decimated) {
      visibleData = decimateOHLCData(visibleData, Math.round(pixelWidth * 1.5));
    }
    if (visibleData.length === 0) return;

    // Substitute the smoothed OHLC for the live last candle so its body and
    // wick track the real last value without jumping. Decimation loses per-
    // `time` identity, so substitution is skipped on those frames.
    const displayedLast = this.displayedLast;
    if (!decimated && displayedLast !== null) {
      const lastIdx = visibleData.length - 1;
      if (visibleData[lastIdx].time === displayedLast.time) {
        visibleData = [...visibleData.slice(0, lastIdx), displayedLast];
      }
    }

    // Snapshot entrance progress per candle up-front so drawCandles batches
    // (bulls + bears) see a consistent value and we don't probe the entry
    // map twice per candle. `null` means no active entries this frame —
    // downstream branches read `entranceByTime?.get(time) ?? 1` and fast-path.
    // The initial-load wave folds into the same map: each candle takes the
    // min of its streaming entrance and its position-staggered intro.
    let entranceByTime: Map<number, number> | null = null;
    const introActive = this.introWave.active;
    if (this.entries.size > 0 || introActive) {
      const entryMs = this.options.entryMs;
      const now = performance.now();
      const rangeSpan = range.to - range.from;
      for (const c of visibleData) {
        let progress = 1;

        const state = this.entries.get(c.time);
        if (state !== undefined && entryMs > 0) {
          const elapsed = now - state.startTime;
          const linear = Math.min(1, Math.max(0, elapsed / entryMs));
          // Ease so the body/wick/volume unfold decelerates into place instead of
          // moving at constant velocity and hard-stopping at settle — matches the
          // line series' eased grow entrance.
          if (linear < 1) progress = easeOutCubic(linear);
        }

        if (introActive) {
          const position = rangeSpan > 0 ? (c.time - range.from) / rangeSpan : 0;
          progress = Math.min(progress, this.introWave.progressAt(position));
        }

        if (progress >= 1) continue;

        if (entranceByTime === null) entranceByTime = new Map();
        entranceByTime.set(c.time, progress);
      }
    }

    // Bar-slot width. Only cap when the visible range is *sparse* (≤ 2
    // candles) so `barWidthBitmap(dataInterval)` is producing a bogus
    // chart-wide slot. Legitimate zoom (user dragging in on 3+ candles)
    // must keep its wide bars — a blanket cap would crush intentional
    // magnification to thin slivers.
    const naturalBarWidth = timeScale.barWidthBitmap(dataInterval);
    const sparseCap = Math.round(30 * horizontalPixelRatio);
    const barWidth = visibleData.length <= 2 ? Math.min(sparseCap, naturalBarWidth) : naturalBarWidth;
    const wickWidth = Math.max(1, Math.round(horizontalPixelRatio));
    // Match body parity to wick parity so both rectangles have their
    // pixel-accurate centers on the same sub-pixel column. Without this,
    // `Math.floor(bodyWidth / 2)` can offset the body 0.5 bitmap-px sideways
    // relative to the wick (odd-vs-even width parity mismatch), which reads
    // as a visibly off-center wick — especially at small bar widths or DPR=1.
    let bodyWidth = Math.max(1, Math.round(barWidth * this.options.bodyWidthRatio) - 2);
    if ((bodyWidth & 1) !== (wickWidth & 1)) {
      // Down-trim by 1 when possible; when bodyWidth is already the minimum
      // (1) and the wick is even (DPR=2), bump UP to 2 so the parity match
      // holds instead of silently leaving a 0.5-bitmap-px offset.
      bodyWidth = bodyWidth > 1 ? bodyWidth - 1 : 2;
    }
    const halfBody = Math.floor(bodyWidth / 2);

    // Draw volume first (behind candles). Snap the volume scale on the frame
    // the decimation boundary is crossed — summed-bucket vs per-candle volume
    // differ by ~2x, and easing across it pins every bar to full band height
    // until the EMA catches up.
    const volScaleSnap = decimated !== this.#prevDecimated;
    this.#prevDecimated = decimated;
    const chartBitmapHeight = Math.round(yScale.getMediaHeight() * scope.verticalPixelRatio);
    this.drawVolume({
      ctx: context,
      data: visibleData,
      timeScale,
      chartHeight: chartBitmapHeight,
      barWidth,
      wickWidth,
      entranceByTime,
      snapVolScale: volScaleSnap,
      radius: (this.options.cornerRadius ?? DEFAULT_CORNER_RADIUS) * horizontalPixelRatio,
    });

    // Then candles on top
    // Filter out poisoned bars whose OHLC fields contain `NaN` or
    // `±Infinity`. Pre-`6e76ab5` (when bodies used a flat `fillStyle +
    // fillRect`) NaN coordinates were silently no-op'd by the canvas
    // API; once gradient bodies landed,
    // `ctx.createLinearGradient(NaN, ...)` started throwing mid-paint
    // and aborting the whole frame. `isPoisonedNumber` deliberately
    // lets `null` / `undefined` pass — they coerce to `0` through
    // `valueToY`'s arithmetic and master ships working behavior for
    // those (renders as a thin bar at the Y origin).
    const bullish: OHLCData[] = [];
    const bearish: OHLCData[] = [];
    const poisonedIndices: number[] = [];
    let firstPoisonedBar: OHLCData | null = null;
    for (let i = 0; i < visibleData.length; i++) {
      const candle = visibleData[i];
      if (
        isPoisonedNumber(candle.open) ||
        isPoisonedNumber(candle.close) ||
        isPoisonedNumber(candle.high) ||
        isPoisonedNumber(candle.low)
      ) {
        poisonedIndices.push(i);
        if (firstPoisonedBar === null) firstPoisonedBar = candle;
        continue;
      }
      if (candle.close >= candle.open) bullish.push(candle);
      else bearish.push(candle);
    }
    if (firstPoisonedBar !== null) {
      reportPoisonedData(this, 'candlestick', poisonedIndices, `time ${firstPoisonedBar.time}`);
    }

    const candlePass: CandlePass = {
      painter: resolveCandlePainter(this.options.candlePainter),
      env: {
        ctx: context,
        theme: ctx.theme,
        horizontalPixelRatio,
        verticalPixelRatio: scope.verticalPixelRatio,
      },
      radius: (this.options.cornerRadius ?? DEFAULT_CORNER_RADIUS) * horizontalPixelRatio,
    };

    const baseCandleArgs = {
      ctx: context,
      timeScale,
      yScale,
      halfBody,
      bodyWidth,
      wickWidth,
      entranceByTime,
      candlePass,
    };
    this.drawCandles({
      ...baseCandleArgs,
      candles: bullish,
      body: this.options.up.body,
      wickColor: this.options.up.wick,
    });
    this.drawCandles({
      ...baseCandleArgs,
      candles: bearish,
      body: this.options.down.body,
      wickColor: this.options.down.wick,
    });
  }

  private drawVolume({
    ctx,
    data,
    timeScale,
    chartHeight,
    barWidth,
    wickWidth,
    entranceByTime,
    snapVolScale,
    radius,
  }: {
    ctx: CanvasRenderingContext2D;
    data: OHLCData[];
    timeScale: import('../scales/x-scale').XScale;
    chartHeight: number;
    barWidth: number;
    wickWidth: number;
    entranceByTime: Map<number, number> | null;
    /** Snap (not ease) the volume scale this frame — set when the decimation
     *  boundary was just crossed and `volume` semantics changed. */
    snapVolScale: boolean;
    /** Free-end (top) corner radius in bitmap px; reuses the candle
     *  `cornerRadius`. `fillRoundedRect` clamps it per bar and falls back to a
     *  square `fillRect` on short bars / `0`, so volume stays crisp when tiny. */
    radius: number;
  }): void {
    // Find max volume for scaling. Filter non-finite values — `Infinity`
    // would poison `rawMax` (collapsing every real bar to ~1 px), `NaN`
    // slips past `>` comparisons silently, and `null` coerces to 0 but can
    // still reach the draw loop below.
    let rawMax = 0;
    for (const c of data) {
      if (Number.isFinite(c.volume) && (c.volume as number) > rawMax) rawMax = c.volume as number;
    }
    if (rawMax === 0) {
      // Nothing to scale — the scale is trivially settled. Drop the seed so
      // volume re-entering the window later snaps instead of easing up from 0.
      this.#displayedMaxVol = null;
      this.#volScaleSettled = true;

      return;
    }

    // Ease the scale toward `rawMax` so a zoom that changes the visible window
    // re-scales the volume band smoothly in lockstep with the sticky-Y price
    // axis instead of snapping in one frame. First frame (or post-`setData`)
    // seeds directly — no ease from a stale/zero baseline.
    if (this.#displayedMaxVol === null || snapVolScale) {
      this.#displayedMaxVol = rawMax;
    } else {
      this.#displayedMaxVol += (rawMax - this.#displayedMaxVol) * VOL_SCALE_ALPHA;
    }
    this.#volScaleSettled = Math.abs(rawMax - this.#displayedMaxVol) <= rawMax * VOL_SCALE_SETTLE_EPS;
    const maxVol = this.#displayedMaxVol;

    // Volume occupies bottom 20% of chart. Match the wick's parity so volume
    // bars and candles share a vertical axis of symmetry — same rationale as
    // the body/wick parity fix in `render`.
    const volumeMaxHeight = chartHeight * 0.2;
    let volBarWidth = Math.max(1, barWidth - 2);
    if ((volBarWidth & 1) !== (wickWidth & 1)) {
      volBarWidth = volBarWidth > 1 ? volBarWidth - 1 : 2;
    }
    const halfBar = Math.floor(volBarWidth / 2);

    const upVolumeColor = hexToRgba(resolveCandlestickBodyColor(this.options.up.body), 0.2);
    const downVolumeColor = hexToRgba(resolveCandlestickBodyColor(this.options.down.body), 0.2);

    const style = this.options.entryAnimation ?? 'unfold';

    for (const c of data) {
      // Same finiteness filter as the maxVol loop — catches undefined, 0,
      // NaN, ±Infinity, and null all at once.
      if (!Number.isFinite(c.volume) || (c.volume as number) <= 0) continue;

      const vol = c.volume as number;
      const cx = timeScale.timeToBitmapX(c.time);
      // Clamp to the band: while `maxVol` eases up toward a larger `rawMax`,
      // the bar that owns `rawMax` would otherwise scale past `volumeMaxHeight`.
      const h = Math.min(volumeMaxHeight, Math.max(1, (vol / maxVol) * volumeMaxHeight));
      const isUp = c.close >= c.open;

      ctx.fillStyle = isUp ? upVolumeColor : downVolumeColor;

      const progress = entranceByTime?.get(c.time) ?? 1;
      if (progress >= 1 || style === 'none') {
        fillRoundedRect(ctx, {
          x: cx - halfBar,
          y: chartHeight - h,
          width: volBarWidth,
          height: h,
          radius,
          corners: VOLUME_TOP_CORNERS,
        });
        continue;
      }

      // Mirror the candle body's entrance. Anchor grow/unfold from chartHeight
      // (baseline) so the bar rises from the bottom — matches the candle's
      // body unfold from openY.
      const t = applyCandleTransform(progress, style, {
        x: cx - halfBar,
        barWidth: volBarWidth,
        anchorY: chartHeight,
        topY: chartHeight - h,
        bottomY: chartHeight,
      });
      ctx.save();
      ctx.globalAlpha = t.alpha;
      fillRoundedRect(ctx, {
        x: t.x,
        y: t.topY,
        width: volBarWidth,
        height: Math.max(1, t.bottomY - t.topY),
        radius,
        corners: VOLUME_TOP_CORNERS,
      });
      ctx.restore();
    }
  }

  private drawCandles({
    ctx,
    candles,
    timeScale,
    yScale,
    halfBody,
    bodyWidth,
    wickWidth,
    body,
    wickColor,
    entranceByTime,
    candlePass,
  }: {
    ctx: CanvasRenderingContext2D;
    candles: OHLCData[];
    timeScale: import('../scales/x-scale').XScale;
    yScale: import('../scales/y-scale').YScale;
    halfBody: number;
    bodyWidth: number;
    wickWidth: number;
    body: string | [string, string];
    wickColor: string;
    entranceByTime: Map<number, number> | null;
    candlePass: CandlePass;
  }): void {
    if (candles.length === 0) return;

    const style = this.options.entryAnimation ?? 'unfold';
    const barWidth = bodyWidth + 2; // approximate slot width used for 'slide' horizontal offset

    // Wicks
    ctx.fillStyle = wickColor;
    for (const c of candles) {
      const progress = entranceByTime?.get(c.time) ?? 1;
      const cx = timeScale.timeToBitmapX(c.time);
      const openY = yScale.valueToBitmapY(c.open);
      const highY = yScale.valueToBitmapY(c.high);
      const lowY = yScale.valueToBitmapY(c.low);
      const wickX = cx - Math.floor(wickWidth / 2);

      if (progress >= 1 || style === 'none') {
        ctx.fillRect(wickX, highY, wickWidth, lowY - highY);
        continue;
      }

      const t = applyCandleTransform(progress, style, {
        x: wickX,
        barWidth,
        anchorY: openY,
        topY: highY,
        bottomY: lowY,
      });
      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.fillRect(t.x, t.topY, wickWidth, Math.max(1, t.bottomY - t.topY));
      ctx.restore();
    }

    // Bodies. `body` is a `[top, bottom]` tuple (2-stop gradient) or a single
    // color (flat fill). No auto-lift; presets that want the previous lightened
    // look should pass `autoGradient(color)` in their config.
    const drawsGradient = Array.isArray(body);

    for (const c of candles) {
      const progress = entranceByTime?.get(c.time) ?? 1;
      const cx = timeScale.timeToBitmapX(c.time);
      const openY = yScale.valueToBitmapY(c.open);
      const closeY = yScale.valueToBitmapY(c.close);
      const bodyTop = Math.min(openY, closeY);
      const bodyBottom = Math.max(openY, closeY);
      const bodyHeight = Math.max(1, bodyBottom - bodyTop);

      const needsTransform = progress < 1 && style !== 'none';

      let drawX = cx - halfBody;
      let drawTop = bodyTop;
      let drawHeight = bodyHeight;
      let alpha = 1;
      if (needsTransform) {
        const t = applyCandleTransform(progress, style, {
          x: cx - halfBody,
          barWidth,
          anchorY: openY,
          topY: bodyTop,
          bottomY: bodyBottom,
        });
        drawX = t.x;
        drawTop = t.topY;
        drawHeight = Math.max(1, t.bottomY - t.topY);
        alpha = t.alpha;
      }

      if (needsTransform) ctx.save();

      // Body fill. A ≤2px-tall candle can't show a gradient meaningfully, so
      // collapse both the tuple and single-color paths to a flat top-stop fill
      // — otherwise fillStyle would leak from the prior wick batch and the
      // body would render in the wick color. The painter receives this resolved
      // fillStyle and MUST NOT rebuild the gradient (the engine built it once).
      // Gradients come from a per-(colors,height) cache anchored at y=0, so
      // the body is drawn inside a `translate(0, drawTop)` frame — the painted
      // pixels are identical, but N same-height candles share one gradient.
      const bodyColor = Array.isArray(body) ? body[0] : body;
      const useGradient = drawsGradient && drawHeight > 2;
      const fillStyle: string | CanvasGradient = useGradient ? this.#bodyGradient(ctx, body, drawHeight) : bodyColor;
      ctx.fillStyle = fillStyle;

      if (needsTransform) ctx.globalAlpha = alpha;
      if (useGradient) ctx.translate(0, drawTop);
      const bodyY = useGradient ? 0 : drawTop;

      // Round the body via the resolved painter. radius<1 (after clamp) with no
      // custom painter routes back through the byte-identical fillRect path.
      const radius = clamp(candlePass.radius, 0, Math.min(bodyWidth, drawHeight) / 2);
      if (radius < 1 && !this.options.candlePainter) {
        ctx.fillRect(drawX, bodyY, bodyWidth, drawHeight);
      } else {
        candlePass.painter(candlePass.env, {
          geom: { x: drawX, y: bodyY, width: bodyWidth, height: drawHeight },
          fillStyle,
          color: bodyColor,
          corners: ALL_CORNERS,
          radius,
          progress,
          isBullish: c.close >= c.open,
        });
      }
      if (useGradient) ctx.translate(0, -drawTop);
      if (needsTransform) ctx.restore();
    }
  }

  /**
   * Cached 2-stop body gradient anchored at y = 0..height. Heights quantize
   * to whole device px (sub-pixel ramp drift is invisible) so same-height
   * bodies share one `CanvasGradient` instead of allocating per candle per
   * frame. The map is hard-bounded — entrance animations sweep heights
   * continuously, and a full clear is cheaper than an eviction policy.
   */
  #bodyGradient(ctx: CanvasRenderingContext2D, colors: [string, string], height: number): CanvasGradient {
    const quantized = Math.max(3, Math.round(height));
    const key = `${colors[0]}|${colors[1]}|${quantized}`;
    const cached = this.#bodyGradientCache.get(key);
    if (cached !== undefined) return cached;

    if (this.#bodyGradientCache.size >= 512) this.#bodyGradientCache.clear();

    const gradient = ctx.createLinearGradient(0, 0, 0, quantized);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1]);
    this.#bodyGradientCache.set(key, gradient);

    return gradient;
  }
}

interface CandleTransformInput {
  x: number;
  barWidth: number;
  /** Y-coordinate around which 'unfold' scales (typically openY). */
  anchorY: number;
  /** The unanimated top Y of the element (wick: highY; body: bodyTop). */
  topY: number;
  /** The unanimated bottom Y (wick: lowY; body: bodyBottom). */
  bottomY: number;
}

interface CandleTransformOutput {
  x: number;
  topY: number;
  bottomY: number;
  alpha: number;
}

/**
 * Map an entrance progress + style onto a candle element's geometry/alpha.
 * Centralized so adding a new style is one branch here instead of touching
 * every draw site.
 */
function applyCandleTransform(
  progress: number,
  style: NonNullable<CandlestickSeriesOptions['entryAnimation']>,
  g: CandleTransformInput,
): CandleTransformOutput {
  switch (style) {
    case 'none':
      return { x: g.x, topY: g.topY, bottomY: g.bottomY, alpha: 1 };
    case 'fade':
      return { x: g.x, topY: g.topY, bottomY: g.bottomY, alpha: progress };
    case 'unfold':
      return {
        x: g.x,
        topY: lerp(g.anchorY, g.topY, progress),
        bottomY: lerp(g.anchorY, g.bottomY, progress),
        alpha: 1,
      };
    case 'slide':
      return {
        x: g.x + (1 - progress) * g.barWidth,
        topY: g.topY,
        bottomY: g.bottomY,
        alpha: progress,
      };
    case 'fade-unfold':
      return {
        x: g.x,
        topY: lerp(g.anchorY, g.topY, progress),
        bottomY: lerp(g.anchorY, g.bottomY, progress),
        alpha: progress,
      };
  }
}

/** Series definition for `chart.addSeries` — keeps the chart renderer-agnostic
 *  so hosts that never render candles don't bundle this module. */
export const CandlestickSeriesDef: SeriesDefinition<CandlestickSeriesOptions> = {
  type: 'candlestick',
  create: ({ theme }, options) =>
    new CandlestickRenderer(new TimeSeriesStore<OHLCData>(), {
      up: { ...theme.candlestick.up },
      down: { ...theme.candlestick.down },
      ...options,
    }),
};

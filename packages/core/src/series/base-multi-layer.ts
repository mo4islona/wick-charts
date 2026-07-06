import { Animator } from '../animation/animator';
import { IntroWave } from '../animation/intro-wave';
import { ScalarSpring } from '../animation/scalar-spring';
import { TimeSeriesStore } from '../data/store';
import type { ChartTheme } from '../theme/types';
import type { TimePoint, TimePointInput, ValueColor } from '../types';
import { resolveColor } from '../utils/color';
import { normalizeTime, normalizeTimePointArray } from '../utils/time';
import { renderedStackPercentTop, renderedStackTop, sumStack } from './stack-math';
import type { SeriesRenderContext, TimeSeriesRenderer } from './types';

/**
 * Shape of the options that {@link BaseMultiLayerSeries} reads directly.
 * Subclasses store a narrower options object (with all their concrete
 * fields) and assign it to {@link BaseMultiLayerSeries.options}; structural
 * subtyping lets the base see only this slice.
 *
 * Durations are concrete numbers — subclasses normalize `false → 0` at
 * their option-merge boundary (constructor + `updateOptions`), so the base
 * never has to handle the disable sentinel.
 */
export interface CommonSeriesOptions {
  /** One resolver per layer. A function paints per datum (bar) / per segment (line) by value. */
  colors: ValueColor[];
  stacking: 'off' | 'normal' | 'percent';
  entryMs: number;
  smoothMs: number;
  introMs: number;
  historyRevealMs: number;
  /** Subclass-typed reveal fn (`BarIntroFn` / `LineIntroFn`); the base only
   *  ever compares against the `'none'` disable sentinel. */
  historyReveal?: unknown;
}

/** Per-point entrance animation state — start wall-time so `render` can
 *  derive progress as `(now - startTime) / entryMs`. */
interface EntryState {
  startTime: number;
}

const scalarLerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Abstract base for multi-layer time-series renderers (Bar, Line). Concentrates
 * the bookkeeping that those renderers share in full: multi-store ownership,
 * tooltip snapshots, stacked totals, lifecycle, and per-layer entrance /
 * live-value chase animations.
 *
 * Entrance and live-value smoothing are renderer-owned (not engine-routed):
 *   - `entries[layerIdx]: Map<time, EntryState>` — per-point intros, advanced
 *      via `(now - startTime) / entryMs` and pruned on settle.
 *   - `displayedLastValues[layerIdx]: number | null` — the latest rendered Y
 *      for the layer's last point, with a {@link Animator}-driven chase so
 *      `updateLastPoint` smooths instead of snapping.
 *
 * Concrete subclasses populate {@link options} with their own narrower
 * resolved-options shape; the base reads only the common slice declared
 * by {@link CommonSeriesOptions}.
 */
export abstract class BaseMultiLayerSeries<TData extends TimePoint> implements TimeSeriesRenderer {
  /** Concrete subclass discriminant — `'line'` or `'bar'`. */
  abstract readonly kind: 'line' | 'bar';

  /**
   * Common-slice view of the subclass's options. Each subclass widens the
   * field type in its own declaration (via `declare`) to its full resolved
   * shape and assigns the merged + normalized options in its constructor /
   * `updateOptions`.
   */
  protected abstract options: CommonSeriesOptions;

  protected readonly stores: TimeSeriesStore<TData>[];

  // --- Animation state (per layer) ----------------------------------------
  /**
   * Per-point entrance animation registry. Subclasses read it through
   * {@link entranceProgress}; tests reach in directly via type-cast (kept
   * `protected` rather than `#` so the existing test helper keeps working).
   */
  protected readonly entries: Array<Map<number, EntryState>>;
  /**
   * Latest rendered Y for each layer's last point, chased smoothly by
   * `updateLastPoint`. `null` while the store is empty.
   */
  protected readonly displayedLastValues: Array<number | null>;
  /** Per-layer chase spring. `null` when settled or when smoothing is off. */
  readonly #liveAnimators: Array<ScalarSpring | null>;
  /**
   * Chase displaced from the last slot by an append, still settling toward the
   * (now-penultimate) point's stored value. Pinned to that point's `time` so
   * {@link effectiveValue} keeps substituting the smoothed Y until it lands —
   * killing the spring on append would snap the vertex to its raw value the
   * very frame a new point arrives (a visible 1–2-frame kink at the line head).
   */
  readonly #pinnedChases: Array<{ time: number; anim: ScalarSpring } | null>;
  /**
   * Per-layer alpha for the visibility cross-fade. `setAlpha` (whole series)
   * fans out across the array; `setLayerAlpha` targets a single index. Render
   * loops multiply the layer's alpha into `globalAlpha` per draw.
   */
  readonly #layerAlphaAnimators: Animator<number>[];
  /**
   * Initial-load reveal clock — armed once when the dataset transitions
   * empty → non-empty in {@link setData}, shared across every layer so a
   * multi-layer seed rides one wave. Subclasses read it through
   * {@link introProgressAt} (per-element wave) or directly (line's sweep).
   */
  protected readonly introWave = new IntroWave();
  /** History-prepend reveal clock — armed by {@link prependPoints} so newly
   *  loaded older points wave in from the data boundary instead of popping.
   *  Shared across layers: a multi-layer prepend rides one wave. */
  protected readonly historyWave = new IntroWave();
  /** Prepended time span: `from` = deepest new point, `to` = the boundary
   *  (the pre-prepend first point). Stagger position is `0` at the boundary
   *  and `1` at the deepest point. */
  protected historyRange: { from: number; to: number } | null = null;

  constructor(layerCount: number) {
    this.stores = Array.from({ length: layerCount }, () => new TimeSeriesStore<TData>());
    this.entries = Array.from({ length: layerCount }, () => new Map<number, EntryState>());
    this.displayedLastValues = new Array(layerCount).fill(null);
    this.#liveAnimators = new Array(layerCount).fill(null);
    this.#pinnedChases = new Array(layerCount).fill(null);
    this.#layerAlphaAnimators = Array.from(
      { length: layerCount },
      () => new Animator<number>({ initial: 1, duration: 0, lerp: scalarLerp }),
    );
  }

  // --- Subclass hooks -------------------------------------------------------

  /**
   * Whether the subclass's entry-animation style is anything other than
   * `'none'`. Controls registration of new entries on `appendPoint`.
   */
  protected abstract isEntryEnabled(): boolean;

  // --- SeriesRenderer interface (abstract — subclass provides) --------------

  abstract render(ctx: SeriesRenderContext): void;
  abstract applyTheme(theme: ChartTheme, prev: ChartTheme): void;
  // biome-ignore lint/suspicious/noExplicitAny: each renderer narrows this in its concrete signature
  abstract updateOptions(options: any): void;

  // --- Color accessors ------------------------------------------------------

  /**
   * Per-layer color overrides carried in `data` (sparse — `undefined` leaves a
   * layer on the theme base in `options.colors`). Kept separate from the base so
   * a theme swap, which rewrites `options.colors`, leaves these untouched.
   */
  #colorOverrides: (ValueColor | undefined)[] = [];

  setColorOverrides(overrides: (ValueColor | undefined)[]): void {
    this.#colorOverrides = overrides;
  }

  /** The active resolver for a layer — the `data` override if set, else the theme base (cycled). */
  #layerResolver(layerIndex: number): ValueColor {
    const override = this.#colorOverrides[layerIndex];
    if (override !== undefined) return override;

    const base = this.options.colors;
    return base[layerIndex % base.length];
  }

  /** The first layer's color resolver (string or value-fn). */
  getColor(): ValueColor {
    return this.#layerResolver(0);
  }

  getColors(): ValueColor[] {
    return this.options.colors;
  }

  /** Resolve one layer's color for a given datum value. */
  resolveLayerColor(layerIndex: number, value: number): string {
    return resolveColor(this.#layerResolver(layerIndex), value);
  }

  // --- Data ingest ----------------------------------------------------------

  setData(data: unknown, layerIndex = 0): void {
    const store = this.stores[layerIndex];
    if (!store) return;

    let hadData = false;
    for (const s of this.stores) {
      if (s.length > 0) hadData = true;
    }

    const normalized = normalizeTimePointArray((data ?? []) as TimePointInput[]) as unknown as TData[];
    store.setData(normalized);

    // First seed only (empty → non-empty): arm the initial reveal. Bulk
    // re-seeds of a live series must never replay the intro — reconciler
    // data swaps would strobe the chart.
    if (!hadData && normalized.length > 0) {
      this.introWave.arm(this.options.introMs);
    }

    // Bulk replace — seed `displayedLast` to the new last value and clear any
    // in-flight chase / entrance entries so the next render paints the
    // canonical dataset without leftover animation state.
    const last = store.last();
    this.displayedLastValues[layerIndex] = last ? (last as unknown as { value: number }).value : null;
    this.#liveAnimators[layerIndex] = null;
    this.#pinnedChases[layerIndex] = null;
    this.entries[layerIndex].clear();

    // A bulk replace invalidates any in-flight history reveal — its range
    // refers to the previous dataset's boundary.
    this.historyWave.finish();
    this.historyRange = null;
  }

  appendPoint(point: unknown, layerIndex = 0): void {
    const store = this.stores[layerIndex];
    if (!store) return;

    const p = point as TimePointInput;
    const time = normalizeTime(p.time);
    const prevLast = store.last();
    const lengthBefore = store.length;
    store.append({ ...p, time } as unknown as TData);

    // Hand an in-flight live chase over to the point it was animating — now
    // the penultimate. Killing the spring here would snap that vertex from
    // its smoothed display Y to the raw stored value on the very frame the
    // new point lands: a 1–2-frame kink at the line head on every append of
    // a fast feed. The spring keeps settling toward the same target (the
    // point's final stored value); `effectiveValue` substitutes it by time
    // until it lands. Only pin when the store actually grew — a same-time
    // append degrades to `updateLast` and the old chase no longer maps to a
    // distinct point.
    const inFlight = this.#liveAnimators[layerIndex];
    if (inFlight !== null && prevLast !== undefined && store.length > lengthBefore) {
      this.#pinnedChases[layerIndex] = { time: prevLast.time, anim: inFlight };
    }

    // Snap `displayedLast` to the freshly-appended point. Live-chase across
    // distinct points would interpolate the trailing-segment Y between the
    // previous last and the new one — distinct from the per-point entrance,
    // which already owns the visual unfurl.
    this.displayedLastValues[layerIndex] = p.value;
    this.#liveAnimators[layerIndex] = null;

    const entryMs = this.options.entryMs;
    if (this.isEntryEnabled() && entryMs > 0) {
      this.entries[layerIndex].set(time, { startTime: performance.now() });
    }
  }

  prependPoints(points: unknown[], layerIndex = 0): void {
    const store = this.stores[layerIndex];
    if (!store || points.length === 0) return;

    // Insert older history at the front only. Deliberately leaves the
    // initial-load intro, per-point entries, live chase and
    // `displayedLastValues` alone — the visible suffix (including the last
    // point) didn't change, so none of the snap machinery `setData` runs
    // should fire. The new points get their own boundary-anchored reveal.
    const normalized = normalizeTimePointArray(points as TimePointInput[]) as unknown as TData[];
    const boundary = store.first()?.time;
    store.prepend(normalized);

    this.#armHistoryReveal(normalized[0]?.time, boundary);
  }

  /**
   * Arm (or extend) the history-reveal wave for freshly prepended points.
   * While a reveal is already in flight — including a same-frame prepend to
   * another layer — only the range grows; restarting the clock would snap
   * half-revealed points back to invisible.
   */
  #armHistoryReveal(deepestTime: number | undefined, boundary: number | undefined): void {
    const revealMs = this.options.historyRevealMs;
    if (this.options.historyReveal === 'none' || revealMs <= 0) return;
    if (deepestTime === undefined || boundary === undefined) return;

    if (this.historyWave.active && this.historyRange !== null) {
      this.historyRange = { from: Math.min(this.historyRange.from, deepestTime), to: this.historyRange.to };

      return;
    }

    this.historyRange = { from: deepestTime, to: boundary };
    this.historyWave.arm(revealMs);
  }

  updateLastPoint(point: unknown, layerIndex = 0): void {
    const store = this.stores[layerIndex];
    if (!store) return;

    const p = point as TimePointInput;
    store.updateLast({ ...p, time: normalizeTime(p.time) } as unknown as TData);

    const target = p.value as number;
    const smoothMs = this.options.smoothMs;
    if (smoothMs <= 0) {
      this.displayedLastValues[layerIndex] = target;
      this.#liveAnimators[layerIndex] = null;
      return;
    }

    let anim = this.#liveAnimators[layerIndex];
    if (anim === null) {
      const initial = this.displayedLastValues[layerIndex] ?? target;
      anim = new ScalarSpring(initial);
      this.#liveAnimators[layerIndex] = anim;
    }

    anim.retarget(target, { settleMs: smoothMs });
  }

  keepLast(count: number, layerIndex = 0): void {
    const store = this.stores[layerIndex];
    if (!store || count < 0) return;

    const drop = store.length - count;
    if (drop <= 0) return;

    store.trimStart(drop);
  }

  // --- Layer model ----------------------------------------------------------

  getLayerCount(): number {
    return this.stores.length;
  }

  setLayerVisible(index: number, visible: boolean): void {
    this.stores[index]?.setVisible(visible);
  }

  isLayerVisible(index: number): boolean {
    return this.stores[index]?.isVisible() ?? true;
  }

  /** Representative concrete color per layer — value-fns are resolved at the
   *  layer's last value, giving the legend swatch / color-change detection a
   *  stable string. Honors per-layer `data` overrides. */
  getLayerColors(): string[] {
    const colors: string[] = [];
    for (let i = 0; i < this.stores.length; i++) {
      const lastValue = this.stores[i]?.last()?.value ?? 0;
      colors.push(this.resolveLayerColor(i, lastValue));
    }

    return colors;
  }

  // --- Lifecycle ------------------------------------------------------------

  onDataChanged(listener: () => void): () => void {
    for (const s of this.stores) s.on('update', listener);

    return () => {
      for (const s of this.stores) s.off('update', listener);
    };
  }

  dispose(): void {
    for (const s of this.stores) s.removeAllListeners();
  }

  // --- Animation primitives — renderer-owned state --------------------------

  /**
   * Per-point entrance progress in `[0, 1]`. Reads the local entry registry,
   * returning `1` for a settled or absent entry (which matches the visual
   * default: nothing to fade in). Takes no render context — progress is a
   * pure function of wall time — so tooltip/last-value queries (which have
   * no context to hand) can read it too.
   */
  protected entranceProgress(layerIndex: number, time: number): number {
    const state = this.entries[layerIndex]?.get(time);
    if (state === undefined) return 1;

    const entryMs = this.options.entryMs;
    if (entryMs <= 0) return 1;

    const elapsed = performance.now() - state.startTime;
    if (elapsed <= 0) return 0;
    if (elapsed >= entryMs) return 1;

    return elapsed / entryMs;
  }

  /**
   * Initial-load reveal progress for a datum, keyed by its normalized
   * position across the *visible* time window — the wave sweeps whatever
   * the user actually sees, regardless of how much history sits off-screen.
   * `1` when no intro is in flight. Subclasses that animate per element
   * (bar) fold this into their {@link entranceProgress} override; the line
   * renders its own continuous sweep instead.
   */
  protected introProgressAt(ctx: SeriesRenderContext, time: number): number {
    if (!this.introWave.active) return 1;

    const range = ctx.timeScale.getRange();
    const span = range.to - range.from;
    const position = span > 0 ? (time - range.from) / span : 0;

    return this.introWave.progressAt(position);
  }

  /**
   * History-prepend reveal progress for a datum. Stagger position is
   * anchored at the data boundary — `0` there, `1` at the deepest prepended
   * point — so the wave travels into history. `1` for points outside the
   * prepended span or when no reveal is in flight.
   */
  protected historyProgressAt(time: number): number {
    const range = this.historyRange;
    if (!this.historyWave.active || range === null || time >= range.to) return 1;

    const span = range.to - range.from;
    const position = span > 0 ? (range.to - time) / span : 0;

    return this.historyWave.progressAt(position);
  }

  /**
   * Trailing data points whose entrance is still unsettled, oldest first.
   * Walks back from the store's last point and stops at the first settled
   * point — that point is the stable anchor a chained grow-lerp hangs off.
   *
   * A feed that appends faster than `entryMs` keeps several entrances in
   * flight at once; animating only the newest (and snapping the rest to
   * their raw spots) makes the head region jump a segment-fraction forward
   * on every append. Renderers lerp each chain link from the previous
   * link's *rendered* position instead, so geometry stays continuous.
   */
  protected unsettledTail(layerIndex: number): Array<{ time: number; progress: number }> {
    const all = this.stores[layerIndex]?.getAll();
    if (!all || all.length < 2) return [];

    const tail: Array<{ time: number; progress: number }> = [];
    // Index 0 has no predecessor to grow from — never part of a chain.
    for (let i = all.length - 1; i >= 1; i--) {
      const progress = this.entranceProgress(layerIndex, all[i].time);
      if (progress >= 1) break;

      tail.unshift({ time: all[i].time, progress });
    }

    return tail;
  }

  /**
   * Substitute the renderer-smoothed last value for `rawValue` when the
   * query `time` matches the layer's current last point, or the still-settling
   * pinned chase (see {@link appendPoint}) when it matches the penultimate.
   * Falls back to `rawValue` when the store is empty or no smoothing has
   * happened yet.
   */
  protected effectiveValue(_ctx: SeriesRenderContext, layerIndex: number, time: number, rawValue: number): number {
    return this.liveValue(layerIndex, time, rawValue);
  }

  /**
   * The ctx-independent core of {@link effectiveValue} — used directly by the
   * tooltip/last-value query methods below, which have no render context to
   * hand a subclass's ctx-dependent override (e.g. Line's intro value
   * transform). Those queries only need the live smoothing/chase this base
   * method already provides, never the intro's positional transform.
   */
  protected liveValue(layerIndex: number, time: number, rawValue: number): number {
    const lastT = this.stores[layerIndex]?.last()?.time;
    if (lastT !== undefined && time === lastT) {
      return this.displayedLastValues[layerIndex] ?? rawValue;
    }

    const pinned = this.#pinnedChases[layerIndex];
    if (pinned !== null && pinned.time === time) return pinned.anim.current;

    return rawValue;
  }

  /**
   * Value a last-value/tooltip query should report for `time` — defaults to
   * {@link liveValue}. Distinct from `liveValue` so a subclass can layer its
   * *entrance* animation's value-space equivalent on top (see Line's
   * override) without that lerp feeding back into `effectiveValue`, which
   * the renderer's own per-point draws use as an unlerp'd target.
   */
  protected snapshotValue(layerIndex: number, time: number, rawValue: number): number {
    return this.liveValue(layerIndex, time, rawValue);
  }

  // --- Animation lifecycle --------------------------------------------------

  /**
   * Advance owned animators against `now` and prune fully-settled entries.
   * Called by the subclass's `render()` once per frame, before drawing. The
   * subclass passes its own clock so test harnesses (which stub
   * `performance.now`) can drive progression deterministically.
   */
  protected tickAnimations(now: number): void {
    this.introWave.tick(now);
    this.historyWave.tick(now);
    for (const a of this.#layerAlphaAnimators) a.tick(now);

    for (let li = 0; li < this.stores.length; li++) {
      const anim = this.#liveAnimators[li];
      if (anim !== null) {
        const stillAnimating = anim.tick(now);
        this.displayedLastValues[li] = anim.current;
        if (!stillAnimating) this.#liveAnimators[li] = null;
      }

      // Pinned (displaced-by-append) chase: keep settling toward the
      // penultimate's stored value; once landed, the raw value takes over
      // seamlessly (the spring snaps to its exact target on settle).
      const pinned = this.#pinnedChases[li];
      if (pinned !== null && !pinned.anim.tick(now)) {
        this.#pinnedChases[li] = null;
      }

      const entryMs = this.options.entryMs;
      if (entryMs <= 0) {
        this.entries[li].clear();
        continue;
      }

      const map = this.entries[li];
      for (const [time, state] of map) {
        if (now - state.startTime >= entryMs) map.delete(time);
      }
    }
  }

  /** True while any layer has an active chase, unsettled entry, alpha fade,
   *  or the initial-load reveal is still sweeping. */
  get needsAnimation(): boolean {
    if (this.introWave.active || this.historyWave.active) return true;

    for (const a of this.#layerAlphaAnimators) {
      if (a.animating) return true;
    }
    for (const anim of this.#liveAnimators) {
      if (anim !== null) return true;
    }
    for (const pinned of this.#pinnedChases) {
      if (pinned !== null) return true;
    }
    for (const map of this.entries) {
      if (map.size > 0) return true;
    }

    return false;
  }

  /** Reveal-front position of the initial-load intro; `1` once settled. */
  getIntroFront(): number {
    return this.introWave.sweep();
  }

  /**
   * Abort in-flight per-point entrance animations on every layer, including
   * the initial-load reveal. Live-value chase (`displayedLastValues`) is
   * intentionally left alone — its motion is subtle and shouldn't jump when
   * the viewport moves.
   */
  cancelEntranceAnimations(): void {
    this.introWave.finish();
    for (const map of this.entries) map.clear();
  }

  /**
   * Start a series-wide fade toward `target` over `durationMs`. Fans out
   * across every per-layer animator so a `setSeriesVisible` toggle is just
   * "set every layer to the same target". `durationMs <= 0` snaps.
   */
  setAlpha(target: number, durationMs: number): void {
    for (const a of this.#layerAlphaAnimators) {
      a.setTarget(target, { duration: durationMs });
    }
  }

  /**
   * `1` while any layer has alpha > 0 OR is animating, `0` when every layer
   * has fully faded and is at rest. Per-layer alpha is composed into
   * `globalAlpha` by the renderer's own draw loops, so this stays a binary
   * skip-gate at the chart level.
   *
   * The `animating` check matters when every layer is at `current = 0` and
   * the user toggles one back in: `setLayerAlpha(idx, 1, ms)` flips the
   * animator to `animating = true` but `current` is still `0` until the next
   * `tick`. If chart skipped the render based on `current` alone, the
   * animator would never tick (render is what advances it), and the fade-in
   * would deadlock at `0`.
   */
  getAlpha(): number {
    for (const a of this.#layerAlphaAnimators) {
      if (a.current > 0 || a.animating) return 1;
    }

    return 0;
  }

  /**
   * Start a fade for a single layer toward `target` over `durationMs`.
   * Subclass draw loops multiply this into `globalAlpha` per layer so the
   * fade lives next to the geometry it affects.
   */
  setLayerAlpha(index: number, target: number, durationMs: number): void {
    this.#layerAlphaAnimators[index]?.setTarget(target, { duration: durationMs });
  }

  /** Latest rendered per-layer alpha. Defaults to 1 for out-of-range indices. */
  getLayerAlpha(index: number): number {
    return this.#layerAlphaAnimators[index]?.current ?? 1;
  }

  // --- Data queries ---------------------------------------------------------

  getLastValue(): number | null {
    for (let i = this.stores.length - 1; i >= 0; i--) {
      const last = this.stores[i].last();
      if (last) return last.value;
    }

    return null;
  }

  getDataAtTime(time: number, interval: number): TData | null {
    return this.stores[0]?.findNearest(time, interval) ?? null;
  }

  getLayerSnapshots(
    time: number,
    interval: number,
  ): { layerIndex: number; time: number; value: number; color: string }[] | null {
    if (this.stores.length <= 1) return null;

    const results: { layerIndex: number; time: number; value: number; color: string }[] = [];
    for (let li = 0; li < this.stores.length; li++) {
      if (!this.stores[li].isVisible()) continue;

      const data = this.stores[li].getVisibleData(time - interval, time + interval);
      if (data.length === 0) continue;

      let closest = data[0];
      let minDist = Math.abs(data[0].time - time);
      // Midpoint tie → later point wins. Matches `TimeSeriesStore.findNearest`
      // so single-layer (getDataAtTime) and multi-layer snapshots agree on
      // the same sample at exactly-between cursor times.
      for (let i = 1; i < data.length; i++) {
        const dist = Math.abs(data[i].time - time);
        if (dist <= minDist) {
          minDist = dist;
          closest = data[i];
        }
      }

      results.push({
        layerIndex: li,
        time: closest.time,
        // Routes through the same live/pinned-chase smoothing the renderer
        // paints, so hovering the live edge mid-animation doesn't jump ahead
        // to the raw target before the on-screen marker gets there.
        value: this.snapshotValue(li, closest.time, closest.value),
        // Resolve the layer's color at the hovered datum's value so a value-fn
        // colors the tooltip dot to match the bar / segment under the cursor.
        color: this.resolveLayerColor(li, closest.value),
      });
    }

    return results.length > 0 ? results : null;
  }

  getStackedLastValue(): { value: number; isLive: boolean } | null {
    if (this.stores.length <= 1) {
      const last = this.stores[0]?.last();

      return last ? { value: this.snapshotValue(0, last.time, last.value), isLive: true } : null;
    }

    const stacking = this.options.stacking;
    if (stacking === 'off') {
      // Non-stacked multi-layer: there's no single "top" — report the last
      // value of the last visible layer. Callers that want per-layer values
      // should use getLayerLastSnapshots.
      for (let i = this.stores.length - 1; i >= 0; i--) {
        if (!this.stores[i].isVisible()) continue;

        const last = this.stores[i].last();
        if (last) return { value: this.snapshotValue(i, last.time, last.value), isLive: true };
      }

      return null;
    }

    // Stacked renderers draw the top edge as the cumulative sum of visible
    // layers' most-recently-known values, mirroring renderStacked's
    // hold-last-value handling of ragged streams: a layer that hasn't ticked
    // as recently as its siblings still contributes its last reading instead
    // of dropping to 0, which would otherwise collapse the whole stack toward
    // whichever single layer just ticked.
    let sawAny = false;
    const values: number[] = [];
    for (let li = 0; li < this.stores.length; li++) {
      if (!this.stores[li].isVisible()) continue;

      const l = this.stores[li].last();
      if (!l) {
        values.push(0);
        continue;
      }

      sawAny = true;
      values.push(this.snapshotValue(li, l.time, l.value));
    }
    if (!sawAny) return null;

    const totals = sumStack(values);
    const value = stacking === 'percent' ? renderedStackPercentTop(totals) : renderedStackTop(totals);

    return { value, isLive: true };
  }

  getStackedValueAtTime(time: number, interval: number): number | null {
    if (this.stores.length <= 1) {
      const p = this.stores[0]?.findNearest(time, interval);

      return p ? this.snapshotValue(0, p.time, p.value) : null;
    }

    const stacking = this.options.stacking;
    if (stacking === 'off') {
      // Non-stacked multi-layer: report the nearest sample of the top visible
      // layer, matching getStackedLastValue's "last visible layer" head.
      for (let i = this.stores.length - 1; i >= 0; i--) {
        if (!this.stores[i].isVisible()) continue;

        const p = this.stores[i].findNearest(time, interval);
        if (p) return this.snapshotValue(i, p.time, p.value);
      }

      return null;
    }

    // Stacked: sum each visible layer's nearest sample, holding missing layers
    // at 0 — the same cumulative-top math getStackedLastValue paints, but at an
    // arbitrary time rather than the last point.
    let sawAny = false;
    const values: number[] = [];
    for (let li = 0; li < this.stores.length; li++) {
      if (!this.stores[li].isVisible()) continue;

      const p = this.stores[li].findNearest(time, interval);
      if (!p) {
        values.push(0);
        continue;
      }

      sawAny = true;
      values.push(this.snapshotValue(li, p.time, p.value));
    }
    if (!sawAny) return null;

    const totals = sumStack(values);

    return stacking === 'percent' ? renderedStackPercentTop(totals) : renderedStackTop(totals);
  }

  getLayerLastSnapshots(): { layerIndex: number; time: number; value: number; color: string }[] | null {
    if (this.stores.length <= 1) return null;

    const results: { layerIndex: number; time: number; value: number; color: string }[] = [];
    for (let li = 0; li < this.stores.length; li++) {
      if (!this.stores[li].isVisible()) continue;

      const last = this.stores[li].last();
      if (!last) continue;

      results.push({
        layerIndex: li,
        time: last.time,
        value: this.snapshotValue(li, last.time, last.value),
        color: this.resolveLayerColor(li, last.value),
      });
    }

    return results.length > 0 ? results : null;
  }

  getTotalLength(): number {
    let total = 0;
    for (const s of this.stores) total += s.length;

    return total;
  }

  // --- TimeSeriesRenderer data queries --------------------------------------

  /** Earliest first-sample / latest last-sample across ALL layers, skipping
   *  empty ones. Aggregating every layer (not just `stores[0]`) is what fixes
   *  the multi-layer time-range leak: a populated layer 1 with an empty layer 0
   *  still reports the real bounds. */
  getTimeBounds(): { first: number; last: number } | null {
    let first = Infinity;
    let last = -Infinity;
    for (const store of this.stores) {
      const f = store.first();
      if (!f) continue;

      const l = store.last() ?? f;
      if (f.time < first) first = f.time;
      if (l.time > last) last = l.time;
    }

    return first === Infinity ? null : { first, last };
  }

  /**
   * Last data point of **layer 0 (`stores[0]`) only** — preserves the behavior
   * of the deleted `get store()` getter. NOTE: this is intentionally NOT the
   * same as {@link getStackedLastValue}, which for non-stacked multi-layer
   * reports the top visible layer and for stacked reports the cumulative sum.
   * Last-data / previous-close semantics stay pinned to layer 0 for back-compat.
   */
  getLastDataPoint(): TData | null {
    return this.stores[0]?.last() ?? null;
  }

  /** Second-to-last point of layer 0 (`stores[0]`). See {@link getLastDataPoint}. */
  getSecondLastDataPoint(): TData | null {
    const all = this.stores[0]?.getAll();
    if (!all || all.length < 2) return null;

    return all[all.length - 2];
  }

  /** First `maxCount` sample times from the first populated layer. */
  sampleTimes(maxCount: number): number[] {
    for (const store of this.stores) {
      const all = store.getAll();
      if (all.length === 0) continue;

      return all.slice(0, maxCount).map((d) => d.time);
    }

    return [];
  }

  /** Visible points of layer 0 (`stores[0]`). See {@link getLastDataPoint}. */
  getVisibleDataPoints(from: number, to: number): readonly TData[] {
    return this.stores[0]?.getVisibleData(from, to) ?? [];
  }

  getValueRange(from: number, to: number): { min: number; max: number } | null {
    const stacking = this.options.stacking;
    if (stacking === 'percent') {
      return { min: 0, max: 100 };
    }

    const layers = this.stores.map((s) => (s.isVisible() ? s.getVisibleData(from, to) : []));

    if (stacking === 'off') {
      // Union of all layers' individual ranges. Skip non-finite values so
      // null / NaN / ±Infinity / undefined don't corrupt the range.
      let min = Infinity;
      let max = -Infinity;
      for (const data of layers) {
        for (const d of data) {
          if (!Number.isFinite(d.value)) continue;
          if (d.value < min) min = d.value;
          if (d.value > max) max = d.value;
        }
      }

      return min < Infinity ? { min, max } : null;
    }

    // Normal stacking: compute stacked totals. Non-finite values are treated
    // as 0 for the stack — don't crash the range because one layer has a gap.
    const timeMap = new Map<number, number[]>();
    for (let li = 0; li < layers.length; li++) {
      for (const d of layers[li]) {
        let arr = timeMap.get(d.time);
        if (!arr) {
          arr = new Array(layers.length).fill(0);
          timeMap.set(d.time, arr);
        }
        arr[li] = Number.isFinite(d.value) ? d.value : 0;
      }
    }

    let min = 0;
    let max = 0;
    for (const values of timeMap.values()) {
      let posSum = 0;
      let negSum = 0;
      for (const v of values) {
        if (v > 0) posSum += v;
        else negSum += v;
      }
      if (posSum > max) max = posSum;
      if (negSum < min) min = negSum;
    }

    return max > min ? { min, max } : null;
  }
}

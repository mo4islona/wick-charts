import { ChartInstance } from '../chart';
import { LineSeriesDef } from '../series/line';
import { createTheme } from '../theme/palettes';
import { type FrameTimingSample, PerfMonitor, type PerfMonitorOptions, type PerfStats } from './perf-monitor';

/**
 * Chart-ready perf configuration: a monitor plus an optional HUD mount.
 * Produced by {@link perfHud} (or hand-assembled); passed as the chart's
 * `perf` option. The chart itself never imports perf code — whatever the
 * config carries is all that ships in the bundle.
 */
export interface PerfConfig {
  /** Monitor that collects frame timing / draw calls for this chart. */
  monitor: PerfMonitor;
  /** Mounts the HUD overlay; the chart calls it at construction and destroys the result. */
  hud?: (container: HTMLElement, monitor: PerfMonitor) => { destroy(): void };
  /** True when the config constructed the monitor — the chart then destroys it on teardown. */
  ownsMonitor?: boolean;
}

/**
 * Performance instrumentation with the visible HUD overlay — the factory
 * replacement for the old `perf: true`:
 *
 * ```ts
 * new ChartInstance(el, { perf: perfHud() });
 * <ChartContainer perf={perfHud({ windowMs: 500 })} />
 * perfHud(sharedMonitor) // HUD on an externally-owned monitor
 * ```
 *
 * Importing this factory is what pulls the monitor + HUD code into the
 * bundle; pass a bare `PerfMonitor` instance as `perf` for HUD-less
 * instrumentation.
 */
export function perfHud(init?: PerfMonitorOptions | PerfMonitor): PerfConfig {
  const external = init instanceof PerfMonitor;

  return {
    monitor: external ? init : new PerfMonitor(init),
    hud: (container, monitor) => new PerfHud(container, monitor),
    ownsMonitor: !external,
  };
}

const DEFAULT_UPDATE_MS = 100;

/** No frames for this long → the chart is idle, not slow. */
const IDLE_AFTER_MS = 600;
/**
 * Cadence of the sample ticker: each tick appends one FPS point to the
 * sparkline (0 while idle) and doubles as the idle watchdog.
 */
const SAMPLE_TICK_MS = 250;

/** 60 Hz frame budget — the amber/red boundary. */
const BUDGET_60HZ_MS = 1000 / 60;
/** 120 Hz frame budget (ProMotion) — the green/amber boundary. */
const BUDGET_120HZ_MS = 1000 / 120;

/** Rolling window of FPS samples the background chart keeps (~15 s of history). */
const SPARK_CAPACITY = 60;
/**
 * Extra samples retained beyond the visible window. With a buffer equal to
 * the window, the oldest point is trimmed while still on canvas — the line
 * visibly vanishes a step before the left edge, and the window's first slot
 * sits bare (reads as left padding). The overshoot keeps the line entering
 * from off-screen.
 */
const SPARK_TRIM_BUFFER = 4;
/** Height of the graph strip in the full panel. */
const SPARK_STRIP_HEIGHT_PX = 34;

/**
 * Panel mode. Always starts as the compact FPS square — expansion is a
 * per-session gesture, deliberately not persisted.
 */
type HudMode = 'mini' | 'full';

/** Side of the compact square. */
const MINI_SIZE_PX = 64;
/** Top padding of the graph in mini mode — keeps the line below the FPS number. */
const MINI_TOP_PX = 24;

/**
 * Y-axis `max` reducer: the window peak snapped up to a round decade
 * (118.7 → 120). Two failure modes this avoids: the default auto ceiling
 * pads to an arbitrary figure (154 over a 120 fps plateau) that reads like
 * a measurement, and a scale pinned to the *exact* peak re-targets on every
 * sample's jitter, visibly warping the whole line at a steady frame rate.
 */
function sparkScaleMax(values: number[]): number {
  let peak = 0;
  for (const v of values) {
    if (v > peak) peak = v;
  }

  return Math.max(10, Math.ceil(peak / 10) * 10);
}

/**
 * Y-axis `min` reducer: slightly below zero so the idle baseline renders a
 * couple of pixels above the panel edge. With `min: 0` the zero line maps to
 * the last canvas row and drowns in the bottom border (vertical padding
 * doesn't move fixed bounds).
 */
function sparkScaleMin(values: number[]): number {
  return -sparkScaleMax(values) / 12;
}

const COLOR_TEXT = '#9aa6b6';
const COLOR_DIM = '#5d6877';
const COLOR_BRIGHT = '#e8eef7';
const COLOR_LABEL = '#cdd6e2';
const COLOR_GOOD = '#3fd68f';
const COLOR_WARN = '#f5c451';
const COLOR_BAD = '#f4756a';
const COLOR_IDLE_DOT = '#5d6877';

const HUD_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  top: '8px',
  right: '8px',
  // Fixed width on purpose: a content-driven box changes width whenever a
  // streamed value gains or loses a digit, which makes the whole panel (and
  // the nested sparkline chart tracking it) visibly twitch.
  width: '216px',
  boxSizing: 'border-box',
  padding: '8px 10px 9px',
  background: 'linear-gradient(165deg, rgba(22, 26, 36, 0.92), rgba(10, 12, 18, 0.88))',
  border: '1px solid rgba(255, 255, 255, 0.09)',
  borderRadius: '10px',
  boxShadow: '0 10px 28px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  color: COLOR_TEXT,
  font: '10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '0.02em',
  pointerEvents: 'none',
  zIndex: '20',
};

const STYLE_ELEMENT_ID = 'wick-perf-hud-style';

/** Inject the pulse keyframes once per document — inline styles cannot express animations. */
function ensureKeyframes(doc: Document): void {
  if (doc.getElementById(STYLE_ELEMENT_ID)) return;

  const style = doc.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = `@keyframes wick-perf-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(63, 214, 143, 0.55); }
  50% { box-shadow: 0 0 0 4px rgba(63, 214, 143, 0); }
}`;
  doc.head.appendChild(style);
}

/** Traffic-light color for a frame duration: green within the 120 Hz budget, amber within 60 Hz, red over. */
function msColor(ms: number): string {
  if (ms <= BUDGET_120HZ_MS) return COLOR_GOOD;
  if (ms <= BUDGET_60HZ_MS) return COLOR_WARN;

  return COLOR_BAD;
}

/** Compact count: `1234` → `1,234`, `12345` → `12.3k`, `1234567` → `1.2M`. */
function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;

  return Math.round(n).toLocaleString('en-US');
}

function clamp(value: number, min: number, max: number): number {
  if (min > max) return min;

  return Math.min(Math.max(value, min), max);
}

function sumValues(rec: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(rec)) {
    total += v;
  }

  return total;
}

interface CellOptions {
  doc: Document;
  align?: 'left' | 'right';
  color?: string;
  perfId?: string;
}

function cell(options: CellOptions): HTMLSpanElement {
  const el = options.doc.createElement('span');
  el.style.textAlign = options.align ?? 'right';
  el.style.color = options.color ?? '';
  if (options.perfId) el.setAttribute('data-perf', options.perfId);

  return el;
}

interface LayerRowCells {
  fps: HTMLSpanElement;
  ms: HTMLSpanElement;
  calls: HTMLSpanElement;
}

interface SeriesRowCells {
  ms: HTMLSpanElement;
}

interface LayerUpdate {
  cells: LayerRowCells;
  drawn: boolean;
  fps: number;
  frame: FrameTimingSample;
  callsPerRender: number;
}

type HudStatus = 'waiting' | 'live' | 'idle';

/**
 * DOM overlay that renders {@link PerfStats} inside a chart's container as a
 * compact dark glass panel. Two modes: it always mounts as the small FPS
 * square (status dot, hero rate, graph as background; click to expand), and
 * the full stats panel (the `–` header button collapses back):
 *
 *  - Header: status dot + hero render rate. The dot pulses green while frames
 *    arrive and goes grey once the chart has been quiet for {@link IDLE_AFTER_MS} —
 *    charts render on demand, so "idle" is an explicit state, not a confusing
 *    `0.0` FPS readout.
 *  - FPS graph: render rate (the hero FPS number) sampled every
 *    {@link SAMPLE_TICK_MS} and plotted as a smooth area line — filling the
 *    mini square as a background, or a dedicated strip above the table in
 *    the full panel. The graph is itself a wick chart — see
 *    {@link createSparkChart} — so streaming appends scroll and rescale with
 *    the library's own animations. The dim figure at the strip's top-left is
 *    the Y-axis tick for the top of the plot (the exact window-peak FPS);
 *    the floor is pinned at 0, so while idle the ticker streams zeros and
 *    the line visibly falls to the bottom — "rendering" vs "not rendering"
 *    at a glance.
 *  - Table: per-layer FPS / last ms / calls-per-second, then a per-series
 *    breakdown of the main pass when there is more than one series to
 *    compare.
 *
 * Uses a sibling `<div>` (with the sparkline chart's own canvases) instead of
 * a third chart canvas layer so the HUD cannot perturb the canvas timing it
 * is measuring. Subscribes to `monitor.onFrame` but throttles DOM writes to
 * `updateIntervalMs` (default 100 ms / 10 Hz) — faster updates would be
 * unreadable and would eat more time than they measure.
 */
export class PerfHud {
  private readonly element: HTMLDivElement;
  private readonly unsubscribe: () => void;
  private readonly updateIntervalMs: number;
  private readonly sampleTimer: ReturnType<typeof setInterval>;

  private readonly dot: HTMLSpanElement;
  private readonly fpsValue: HTMLSpanElement;
  private readonly fpsSuffix: HTMLSpanElement;
  private readonly header: HTMLDivElement;
  private readonly titleEl: HTMLSpanElement;
  private readonly body: HTMLDivElement;
  private readonly sparkHost: HTMLDivElement;
  private readonly sparkMaxTick: HTMLSpanElement;
  private readonly minimizeButton: HTMLButtonElement;
  private sparkChart: ChartInstance | null = null;
  private sparkSeriesId: string | null = null;
  private mode: HudMode = 'mini';
  private readonly mainCells: LayerRowCells;
  private readonly overlayCells: LayerRowCells;
  private readonly seriesSection: HTMLDivElement;
  private readonly seriesGrid: HTMLDivElement;
  private readonly heapRow: HTMLDivElement;
  private readonly heapValue: HTMLSpanElement;

  private seriesCells = new Map<string, SeriesRowCells>();
  private status: HudStatus | null = null;
  /** Consecutive zero samples streamed into the sparkline since the last live frame. */
  private idleStubCount = 0;
  /** Most recent hero render rate, refreshed on every frame; the sample ticker plots it. */
  private lastHeroFps = 0;
  /** Current drag offset, applied as a `translate` on the panel. */
  private dragX = 0;
  private dragY = 0;
  private lastFrameAt = 0;
  private lastUpdate = 0;

  constructor(container: HTMLElement, monitor: PerfMonitor, updateIntervalMs = DEFAULT_UPDATE_MS) {
    this.updateIntervalMs = updateIntervalMs;

    // Defensive: if the same container is reused across mounts (StrictMode
    // double-invoke, hot reload, host-side remount), strip any prior HUD so
    // the overlay never stacks.
    for (const stale of container.querySelectorAll('[data-chart-perf-hud]')) {
      stale.remove();
    }

    const doc = container.ownerDocument;
    ensureKeyframes(doc);

    this.element = doc.createElement('div');
    this.element.setAttribute('data-chart-perf-hud', '');
    Object.assign(this.element.style, HUD_STYLE);
    this.element.style.setProperty('backdrop-filter', 'blur(10px) saturate(1.3)');
    this.element.style.setProperty('-webkit-backdrop-filter', 'blur(10px) saturate(1.3)');

    // Host of the FPS graph; styled and placed per mode by rebuildSparkChart.
    this.sparkHost = doc.createElement('div');
    this.sparkHost.style.overflow = 'hidden';

    // Header: status dot, title, layout toggle, collapse, hero render rate.
    this.header = doc.createElement('div');
    const header = this.header;
    Object.assign(header.style, {
      position: 'relative',
      zIndex: '1',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      pointerEvents: 'auto',
      cursor: 'grab',
    } satisfies Partial<CSSStyleDeclaration>);

    this.dot = doc.createElement('span');
    Object.assign(this.dot.style, {
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      flexShrink: '0',
    } satisfies Partial<CSSStyleDeclaration>);

    this.titleEl = doc.createElement('span');
    const title = this.titleEl;
    title.textContent = 'PERF';
    Object.assign(title.style, {
      fontSize: '9px',
      fontWeight: '700',
      letterSpacing: '0.18em',
      color: COLOR_LABEL,
    } satisfies Partial<CSSStyleDeclaration>);

    this.minimizeButton = doc.createElement('button');
    this.minimizeButton.type = 'button';
    this.minimizeButton.textContent = '–';
    this.minimizeButton.title = 'Collapse to FPS square';
    Object.assign(this.minimizeButton.style, {
      pointerEvents: 'auto',
      cursor: 'pointer',
      font: 'inherit',
      fontSize: '8px',
      lineHeight: '1',
      color: COLOR_DIM,
      background: 'transparent',
      border: '1px solid rgba(255, 255, 255, 0.14)',
      borderRadius: '4px',
      padding: '2px 5px',
    } satisfies Partial<CSSStyleDeclaration>);
    // The header doubles as the drag handle — a press on the button must not start a drag.
    this.minimizeButton.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.minimizeButton.addEventListener('click', () => this.setMode('mini'));

    const spacer = doc.createElement('span');
    spacer.style.flex = '1';

    this.fpsValue = cell({ doc, perfId: 'hero-fps' });
    Object.assign(this.fpsValue.style, {
      fontSize: '16px',
      fontWeight: '700',
      lineHeight: '1',
      color: COLOR_BRIGHT,
    } satisfies Partial<CSSStyleDeclaration>);
    this.fpsValue.textContent = '—';

    this.fpsSuffix = doc.createElement('span');
    this.fpsSuffix.textContent = 'fps';
    Object.assign(this.fpsSuffix.style, {
      fontSize: '9px',
      color: COLOR_DIM,
      alignSelf: 'flex-end',
    } satisfies Partial<CSSStyleDeclaration>);

    header.append(this.dot, title, this.minimizeButton, spacer, this.fpsValue, this.fpsSuffix);
    this.installDrag(container);

    // Body: everything that dims while the chart is idle.
    this.body = doc.createElement('div');
    this.body.style.position = 'relative';
    this.body.style.zIndex = '1';

    const grid = doc.createElement('div');
    Object.assign(grid.style, {
      display: 'grid',
      gridTemplateColumns: 'minmax(44px, 1fr) repeat(3, auto)',
      columnGap: '8px',
      rowGap: '2px',
      marginTop: '7px',
    } satisfies Partial<CSSStyleDeclaration>);
    for (const label of ['', 'fps', 'ms', 'calls/s']) {
      const head = cell({ doc, align: label === '' ? 'left' : 'right', color: COLOR_DIM });
      head.textContent = label;
      head.style.fontSize = '9px';
      grid.appendChild(head);
    }
    this.mainCells = this.appendLayerRow({ doc, grid, label: 'main', perfPrefix: 'main' });
    this.overlayCells = this.appendLayerRow({ doc, grid, label: 'overlay', perfPrefix: 'overlay' });

    this.seriesSection = doc.createElement('div');
    this.seriesSection.style.display = 'none';
    this.seriesSection.style.marginTop = '6px';
    this.seriesSection.style.paddingTop = '5px';
    this.seriesSection.style.borderTop = '1px solid rgba(255, 255, 255, 0.07)';
    this.seriesGrid = doc.createElement('div');
    Object.assign(this.seriesGrid.style, {
      display: 'grid',
      gridTemplateColumns: 'minmax(44px, 1fr) auto',
      columnGap: '8px',
      rowGap: '2px',
    } satisfies Partial<CSSStyleDeclaration>);
    this.seriesSection.appendChild(this.seriesGrid);

    this.heapRow = doc.createElement('div');
    Object.assign(this.heapRow.style, {
      display: 'none',
      justifyContent: 'space-between',
      marginTop: '6px',
      fontSize: '9px',
      color: COLOR_DIM,
    } satisfies Partial<CSSStyleDeclaration>);
    const heapLabel = doc.createElement('span');
    heapLabel.textContent = 'heap';
    this.heapValue = cell({ doc, perfId: 'heap' });
    this.heapValue.textContent = '—';
    this.heapRow.append(heapLabel, this.heapValue);

    // Reserve the heap row from the start on browsers that can ever fill it —
    // popping it in after the first sample makes the whole panel jump.
    const memSupported = Boolean((performance as unknown as { memory?: unknown }).memory);
    if (memSupported) this.heapRow.style.display = 'flex';

    // The one Y-axis tick that matters: the window-peak FPS mapped to the top
    // of the plot. The bottom edge is the axis floor (min: 0). Positioned per
    // mode by rebuildSparkChart.
    this.sparkMaxTick = doc.createElement('span');
    this.sparkMaxTick.setAttribute('data-perf', 'spark-max');
    Object.assign(this.sparkMaxTick.style, {
      position: 'absolute',
      display: 'none',
      fontSize: '8px',
      lineHeight: '1',
      letterSpacing: '0.05em',
      color: COLOR_DIM,
      zIndex: '1',
    } satisfies Partial<CSSStyleDeclaration>);

    this.body.append(grid, this.seriesSection, this.heapRow);
    this.element.append(this.sparkHost, header, this.body, this.sparkMaxTick);
    container.appendChild(this.element);

    // After attach, so the nested chart measures a real box on construction.
    this.applyMode();

    this.setStatus('waiting');
    this.sampleTimer = setInterval(() => this.onSampleTick(), SAMPLE_TICK_MS);
    this.unsubscribe = monitor.onFrame((stats) => this.onFrame(stats));
  }

  destroy(): void {
    clearInterval(this.sampleTimer);
    this.unsubscribe();
    this.sparkChart?.destroy();
    this.element.remove();
  }

  private setMode(mode: HudMode): void {
    if (this.mode === mode) return;

    this.mode = mode;
    this.applyMode();
  }

  /**
   * Apply the panel mode. Mini is a compact square — status dot, hero FPS
   * and the graph as background; a click anywhere expands. Full is the
   * complete stats panel with the `–` header button to collapse back.
   */
  private applyMode(): void {
    const mini = this.mode === 'mini';

    if (mini) {
      Object.assign(this.element.style, {
        width: `${MINI_SIZE_PX}px`,
        height: `${MINI_SIZE_PX}px`,
        padding: '7px 8px',
        pointerEvents: 'auto',
        cursor: 'pointer',
      } satisfies Partial<CSSStyleDeclaration>);
      this.element.title = 'Click to expand';
    } else {
      Object.assign(this.element.style, {
        width: '216px',
        height: 'auto',
        padding: '8px 10px 9px',
        pointerEvents: 'none',
        cursor: '',
      } satisfies Partial<CSSStyleDeclaration>);
      this.element.title = '';
    }

    this.titleEl.style.display = mini ? 'none' : '';
    this.minimizeButton.style.display = mini ? 'none' : '';
    // 16px "idle" doesn't fit the square next to the dot; numbers get tight too.
    this.fpsValue.style.fontSize = mini ? '13px' : '16px';
    this.body.style.display = mini ? 'none' : '';
    this.header.style.cursor = mini ? 'pointer' : 'grab';

    // Suffix visibility is otherwise status-driven — re-sync for the new mode.
    if (this.status === 'live') {
      this.fpsSuffix.style.display = mini ? 'none' : '';
    }

    this.applySparkLayout();
  }

  /**
   * Place the FPS graph for the current mode. Mini fills the square as a
   * background; full shows a dedicated strip between header and table. The
   * nested chart is created once and then reconfigured in place — tearing it
   * down on a mode switch would wipe the FPS history on every
   * expand/collapse.
   */
  private applySparkLayout(): void {
    if (this.mode === 'mini') {
      Object.assign(this.sparkHost.style, {
        position: 'absolute',
        inset: '0',
        height: 'auto',
        marginTop: '0',
        borderRadius: 'inherit',
        opacity: '0.75',
        zIndex: '0',
      } satisfies Partial<CSSStyleDeclaration>);
      this.element.insertBefore(this.sparkHost, this.element.firstChild);
    } else {
      Object.assign(this.sparkHost.style, {
        position: 'relative',
        inset: 'auto',
        height: `${SPARK_STRIP_HEIGHT_PX}px`,
        marginTop: '7px',
        borderRadius: '4px',
        opacity: '1',
        zIndex: '0',
      } satisfies Partial<CSSStyleDeclaration>);
      this.body.insertBefore(this.sparkHost, this.body.firstChild);
    }

    if (this.sparkChart) {
      this.sparkChart.setPadding({ top: this.sparkPaddingTop(), bottom: 4, left: 0, right: 0 });
    } else {
      const spark = this.createSparkChart(this.sparkHost);
      this.sparkChart = spark?.chart ?? null;
      this.sparkSeriesId = spark?.seriesId ?? null;
    }

    // The tick is positioned against the panel, but the strip's offsetTop is
    // relative to `body` (it is position: relative) — add body's own offset
    // to land inside the strip. No room for axis chrome in the mini square.
    const stripTop = this.body.offsetTop + this.sparkHost.offsetTop;
    this.sparkMaxTick.style.top = `${stripTop + 2}px`;
    this.sparkMaxTick.style.left = '12px';
    this.sparkMaxTick.style.display = this.sparkChart && this.mode === 'full' ? '' : 'none';
  }

  /**
   * The sparkline is itself a wick chart: a single-layer area line of the
   * render rate on a chrome-less ChartInstance — no axes, no grid, no
   * interactions. Dogfooding buys the library's own streaming behavior for
   * free: spring tail-scroll on appends, smooth last-value chase, and the
   * sticky-Y contraction when a rate spike leaves the window.
   *
   * Seeding goes through `setSeriesData` on purpose — that is the bulk path
   * whose `onDataChanged` consumes `viewport.initialRange`, pinning the
   * window at full capacity from the first paint (the React Sparkline's
   * "flow" mode). Seeding via `appendData` would leave the viewport fitted
   * to the two seed points and every sample would span half the panel.
   *
   * Two guards keep the measurement honest: the nested chart carries no
   * `perf` config (no recursive HUD, nothing added to the measured monitor),
   * and it draws on its own canvases inside the HUD panel. Construction is
   * best-effort — in environments without a 2D canvas the HUD just drops the
   * sparkline and keeps the numeric panel.
   */
  private createSparkChart(host: HTMLElement): { chart: ChartInstance; seriesId: string } | null {
    try {
      const constructedAt = performance.now();
      const chart = new ChartInstance(host, {
        theme: createTheme({ background: '#10141c' }).theme,
        axis: {
          y: { visible: false, width: 0, min: sparkScaleMin, max: sparkScaleMax },
          x: { visible: false, height: 0 },
        },
        // Bottom padding keeps the zero baseline clearly on canvas — at 0 the
        // 1px stroke drowns in the panel's bottom border and rounding.
        padding: {
          top: this.sparkPaddingTop(),
          bottom: 4,
          left: 0,
          right: 0,
        },
        grid: { visible: false },
        interactive: false,
        viewport: {
          maxVisibleBars: SPARK_CAPACITY,
          initialRange: {
            from: constructedAt - SPARK_CAPACITY * SAMPLE_TICK_MS,
            to: constructedAt,
          },
        },
      });
      const seriesId = chart.addSeries(LineSeriesDef, {
        colors: [COLOR_GOOD],
        strokeWidth: 1,
        curve: 'smooth',
        area: { visible: true },
        pulse: false,
      });

      // Seed the entire window with zeros so the plot spans the full width
      // from the first paint — a partially filled window reads as a mystery
      // left inset, especially in the mini square.
      const seeds: { time: number; value: number }[] = [];
      for (let i = SPARK_CAPACITY + SPARK_TRIM_BUFFER; i >= 0; i--) {
        seeds.push({ time: constructedAt - i * SAMPLE_TICK_MS, value: 0 });
      }
      chart.setSeriesData(seriesId, seeds);

      return { chart, seriesId };
    } catch {
      return null;
    }
  }

  /** Keeps the plateau below the FPS number (mini) or the Y tick (strip). */
  private sparkPaddingTop(): number {
    return this.mode === 'mini' ? MINI_TOP_PX : 12;
  }

  /** Append one FPS sample to the sparkline chart and roll its window. */
  private appendSpark(value: number): void {
    if (!this.sparkChart || !this.sparkSeriesId) return;

    this.sparkChart.appendData(this.sparkSeriesId, { time: performance.now(), value });
    this.sparkChart.keepLast(this.sparkSeriesId, SPARK_CAPACITY + SPARK_TRIM_BUFFER);
  }

  /**
   * Drag-to-reposition, attached to the panel itself. In full mode the panel
   * is `pointer-events: none`, so gestures only start from the header (its
   * events bubble up here) and the chart underneath keeps receiving
   * crosshair moves; in mini mode the whole square is the handle. A press
   * that never moves is a click — in mini mode it expands the panel.
   *
   * Movement is applied as a `translate` transform: a `left`/`top` change
   * would re-layout the panel and resize-observe the nested graph chart on
   * every pointer move. Pointer capture keeps the gesture on the panel, so
   * no document-level listeners to clean up.
   */
  private installDrag(container: HTMLElement): void {
    const el = this.element;
    el.style.touchAction = 'none';
    el.style.userSelect = 'none';

    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;
    let limits = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    el.addEventListener('pointerdown', (e) => {
      // Clamp the gesture to the chart container so the panel can't be lost
      // outside it. Limits are computed once per gesture from current rects.
      const containerRect = container.getBoundingClientRect();
      const panelRect = el.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      baseX = this.dragX;
      baseY = this.dragY;
      limits = {
        minX: baseX + (containerRect.left - panelRect.left),
        maxX: baseX + (containerRect.right - panelRect.right),
        minY: baseY + (containerRect.top - panelRect.top),
        maxY: baseY + (containerRect.bottom - panelRect.bottom),
      };

      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    el.addEventListener('pointermove', (e) => {
      if (!el.hasPointerCapture(e.pointerId)) return;

      this.dragX = clamp(baseX + (e.clientX - startX), limits.minX, limits.maxX);
      this.dragY = clamp(baseY + (e.clientY - startY), limits.minY, limits.maxY);
      el.style.transform = `translate(${this.dragX}px, ${this.dragY}px)`;
    });

    el.addEventListener('pointerup', (e) => {
      if (!el.hasPointerCapture(e.pointerId)) return;

      el.releasePointerCapture(e.pointerId);
      const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (this.mode === 'mini' && moved < 5) {
        this.setMode('full');
      }
    });

    el.addEventListener('pointercancel', (e) => {
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
    });
  }

  private appendLayerRow(options: {
    doc: Document;
    grid: HTMLElement;
    label: string;
    perfPrefix: string;
  }): LayerRowCells {
    const { doc, grid, label, perfPrefix } = options;

    const labelCell = cell({ doc, align: 'left', color: COLOR_LABEL });
    labelCell.textContent = label;

    const cells: LayerRowCells = {
      fps: cell({ doc, perfId: `${perfPrefix}-fps` }),
      ms: cell({ doc, perfId: `${perfPrefix}-ms` }),
      calls: cell({ doc, perfId: `${perfPrefix}-calls` }),
    };
    cells.fps.textContent = '—';
    cells.ms.textContent = '—';
    cells.calls.textContent = '—';

    grid.append(labelCell, cells.fps, cells.ms, cells.calls);

    return cells;
  }

  private setStatus(status: HudStatus): void {
    if (this.status === status) return;

    this.status = status;
    this.element.setAttribute('data-perf-state', status);

    if (status === 'live') {
      this.dot.style.background = COLOR_GOOD;
      this.dot.style.animation = 'wick-perf-pulse 1.6s ease-out infinite';
      this.fpsValue.style.color = COLOR_BRIGHT;
      // No room for the unit in the mini square — the number speaks for itself.
      this.fpsSuffix.style.display = this.mode === 'mini' ? 'none' : '';
      this.body.style.opacity = '1';

      return;
    }

    this.dot.style.background = COLOR_IDLE_DOT;
    this.dot.style.animation = 'none';
    this.fpsValue.style.color = COLOR_DIM;
    this.fpsValue.textContent = status === 'idle' ? 'idle' : '—';
    this.fpsSuffix.style.display = 'none';
    this.body.style.opacity = '0.6';
  }

  private onFrame(stats: PerfStats): void {
    const now = performance.now();
    this.lastFrameAt = now;

    this.lastHeroFps = Math.max(stats.mainRendersPerSec, stats.overlayRendersPerSec);
    this.setStatus('live');

    if (now - this.lastUpdate < this.updateIntervalMs) return;

    this.lastUpdate = now;
    this.render(stats);
  }

  /**
   * Sample ticker: every {@link SAMPLE_TICK_MS} plot one point of the hero
   * render rate. Doubles as the idle watchdog — once frames stop, the status
   * flips and the plotted value drops to zero, so the line visibly falls to
   * the baseline instead of freezing at the last live reading.
   */
  private onSampleTick(): void {
    if (this.status === 'waiting') return;

    const idle = performance.now() - this.lastFrameAt >= IDLE_AFTER_MS;
    if (idle) this.setStatus('idle');

    // Stop once the window is all zeros — past that point every append is an
    // invisible no-op, and an idle page should not keep rendering at 4 Hz.
    if (idle && this.idleStubCount >= SPARK_CAPACITY) return;

    this.idleStubCount = idle ? this.idleStubCount + 1 : 0;
    this.appendSpark(idle ? 0 : this.lastHeroFps);
  }

  private render(stats: PerfStats): void {
    const heroFps = Math.max(stats.mainRendersPerSec, stats.overlayRendersPerSec);
    this.fpsValue.textContent = heroFps >= 100 ? String(Math.round(heroFps)) : heroFps.toFixed(1);

    this.updateLayerRow({
      cells: this.mainCells,
      drawn: stats.frameCount.main > 0,
      fps: stats.mainRendersPerSec,
      frame: stats.mainFrameMs,
      callsPerRender: sumValues(stats.drawCalls.main),
    });
    this.updateLayerRow({
      cells: this.overlayCells,
      drawn: stats.frameCount.overlay > 0,
      fps: stats.overlayRendersPerSec,
      frame: stats.overlayFrameMs,
      callsPerRender: sumValues(stats.drawCalls.overlay),
    });

    this.renderSeries(stats);
    this.renderHeap(stats);

    if (this.sparkChart && this.sparkMaxTick) {
      const { max } = this.sparkChart.getYRange();
      this.sparkMaxTick.textContent = max > 0 ? `${Math.round(max)}` : '';
    }
  }

  private updateLayerRow(update: LayerUpdate): void {
    const { cells, drawn, fps, frame, callsPerRender } = update;
    if (!drawn) return;

    cells.fps.textContent = fps.toFixed(1);
    cells.ms.textContent = frame.last.toFixed(2);
    cells.ms.style.color = msColor(frame.last);
    cells.calls.textContent = formatCompact(callsPerRender * fps);
  }

  /**
   * Per-series breakdown of the main pass. Single-series charts give no useful
   * attribution — the row would just echo the main row — so the section only
   * shows when there is more than one series to compare.
   */
  private renderSeries(stats: PerfStats): void {
    const ids = Object.keys(stats.perSeries);
    if (ids.length <= 1) {
      this.seriesSection.style.display = 'none';

      return;
    }

    this.seriesSection.style.display = '';
    if (!this.sameSeriesIds(ids)) this.rebuildSeriesRows(ids);

    for (const id of ids) {
      const cells = this.seriesCells.get(id);
      const sample = stats.perSeries[id];
      if (!cells || !sample) continue;

      cells.ms.textContent = sample.last.toFixed(2);
      cells.ms.style.color = msColor(sample.last);
    }
  }

  private sameSeriesIds(ids: readonly string[]): boolean {
    if (ids.length !== this.seriesCells.size) return false;

    return ids.every((id) => this.seriesCells.has(id));
  }

  private rebuildSeriesRows(ids: readonly string[]): void {
    const doc = this.element.ownerDocument;
    this.seriesGrid.replaceChildren();
    this.seriesCells = new Map();

    for (const label of ['series', 'ms']) {
      const head = cell({ doc, align: label === 'series' ? 'left' : 'right', color: COLOR_DIM });
      head.textContent = label;
      head.style.fontSize = '9px';
      this.seriesGrid.appendChild(head);
    }

    for (const id of ids) {
      const labelCell = cell({ doc, align: 'left', color: COLOR_LABEL });
      labelCell.textContent = id;
      labelCell.style.overflow = 'hidden';
      labelCell.style.textOverflow = 'ellipsis';
      labelCell.style.whiteSpace = 'nowrap';

      const cells: SeriesRowCells = {
        ms: cell({ doc, perfId: `series-${id}-ms` }),
      };
      this.seriesGrid.append(labelCell, cells.ms);
      this.seriesCells.set(id, cells);
    }
  }

  /** The row itself is reserved at construction (no layout pop) — only the value updates here. */
  private renderHeap(stats: PerfStats): void {
    if (stats.heapMb === null) return;

    this.heapRow.style.display = 'flex';
    this.heapValue.textContent = `${stats.heapMb.toFixed(1)} MB`;
  }
}

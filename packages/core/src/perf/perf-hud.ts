import type { PerfMonitor, PerfStats } from './perf-monitor';

const DEFAULT_UPDATE_MS = 100;

const HUD_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  top: '4px',
  right: '4px',
  padding: '4px 6px',
  background: 'rgba(0, 0, 0, 0.6)',
  color: '#e0e0e0',
  font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
  borderRadius: '3px',
  pointerEvents: 'none',
  zIndex: '20',
  whiteSpace: 'pre',
  letterSpacing: '0.01em',
};

function sumValues(rec: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(rec)) total += v;

  return total;
}

/**
 * Tabular HUD.
 *
 * Two rows — "Main" (data + grid, the expensive path) and "Overlay" (crosshair
 * + pulse, the cheap path that redraws on mousemove). Columns:
 *
 *  - FPS:   renders/sec over the sample window. `0.0` on an idle chart is
 *           normal — charts only redraw on change.
 *  - ms:    wall-clock time of the most recent frame.
 *  - worst: the p95 of recent frames (tail latency). Budget is 16.6 ms for 60 fps.
 *  - calls: canvas method calls issued during the most recent frame.
 *
 * Then heap, then a per-series breakdown of the main pass so it's clear
 * which renderer dominates the frame budget.
 */
const LABEL_W = 9;
const FPS_W = 7;
const MS_W = 6;
const CPS_W = 9;

/** `calls/s` is a derived aggregate — per-render count × render rate. Rounded to int; `toLocaleString` adds thousands separators so six-figure numbers stay legible. */
function formatCallsPerSec(callsPerRender: number, rendersPerSec: number): string {
  return Math.round(callsPerRender * rendersPerSec).toLocaleString('en-US');
}

function row(label: string, fps: number, lastMs: number, worstMs: number, calls: number): string {
  return [
    label.padEnd(LABEL_W),
    fps.toFixed(1).padStart(FPS_W),
    lastMs.toFixed(2).padStart(MS_W),
    worstMs.toFixed(2).padStart(MS_W),
    formatCallsPerSec(calls, fps).padStart(CPS_W),
  ].join(' ');
}

/** Placeholder row shown when a layer has never drawn (e.g. overlay before first mousemove). */
function idleRow(label: string): string {
  return [
    label.padEnd(LABEL_W),
    '—'.padStart(FPS_W),
    '—'.padStart(MS_W),
    '—'.padStart(MS_W),
    'idle'.padStart(CPS_W),
  ].join(' ');
}

function header(): string {
  return [
    ''.padEnd(LABEL_W),
    'FPS'.padStart(FPS_W),
    'ms'.padStart(MS_W),
    'worst'.padStart(MS_W),
    'calls/s'.padStart(CPS_W),
  ].join(' ');
}

function format(stats: PerfStats): string {
  const drawsMain = sumValues(stats.drawCalls.main);
  const drawsOverlay = sumValues(stats.drawCalls.overlay);

  const mainRow =
    stats.frameCount.main === 0
      ? idleRow('Main')
      : row('Main', stats.mainRendersPerSec, stats.mainFrameMs.last, stats.mainFrameMs.p95, drawsMain);
  const overlayRow =
    stats.frameCount.overlay === 0
      ? idleRow('Overlay')
      : row('Overlay', stats.overlayRendersPerSec, stats.overlayFrameMs.last, stats.overlayFrameMs.p95, drawsOverlay);

  const lines: string[] = [header(), mainRow, overlayRow];

  // Single-series charts give no useful attribution — the per-series row just
  // echoes the main-row number. Only show the breakdown when there's more
  // than one series to compare.
  const seriesIds = Object.keys(stats.perSeries);
  if (seriesIds.length > 1) {
    lines.push('');
    lines.push('Per series (main pass)');
    lines.push([''.padEnd(LABEL_W), 'ms'.padStart(MS_W), 'worst'.padStart(MS_W)].join(' '));
    for (const id of seriesIds) {
      const p = stats.perSeries[id];
      lines.push(
        [`  ${id}`.padEnd(LABEL_W), p.last.toFixed(2).padStart(MS_W), p.p95.toFixed(2).padStart(MS_W)].join(' '),
      );
    }
  }

  return lines.join('\n');
}

/**
 * DOM overlay that renders {@link PerfStats} inside a chart's container. Uses
 * a sibling `<div>` instead of a third canvas layer so the HUD itself cannot
 * perturb the canvas timing it is measuring.
 *
 * Subscribes to `monitor.onFrame` but throttles DOM writes to
 * `updateIntervalMs` (default 100 ms / 10 Hz) — faster updates would be
 * unreadable and would eat more time than they measure.
 */
export class PerfHud {
  private readonly element: HTMLDivElement;
  private readonly unsubscribe: () => void;
  private readonly updateIntervalMs: number;
  private lastUpdate = 0;

  constructor(container: HTMLElement, monitor: PerfMonitor, updateIntervalMs = DEFAULT_UPDATE_MS) {
    this.updateIntervalMs = updateIntervalMs;

    // Defensive: if the same container is reused across mounts (StrictMode
    // double-invoke, hot reload, host-side remount), strip any prior HUD so
    // the overlay never stacks.
    for (const stale of container.querySelectorAll('[data-chart-perf-hud]')) {
      stale.remove();
    }

    this.element = document.createElement('div');
    this.element.setAttribute('data-chart-perf-hud', '');
    Object.assign(this.element.style, HUD_STYLE);
    this.element.textContent = 'perf: waiting for first frame…';
    container.appendChild(this.element);

    this.unsubscribe = monitor.onFrame((stats) => this.onFrame(stats));
  }

  destroy(): void {
    this.unsubscribe();
    this.element.remove();
  }

  private onFrame(stats: PerfStats): void {
    const now = performance.now();
    if (now - this.lastUpdate < this.updateIntervalMs) return;

    this.lastUpdate = now;
    this.element.textContent = format(stats);
  }
}

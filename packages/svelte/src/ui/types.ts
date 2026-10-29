// Shared with the components so `index.ts` can export them: `tsc` reads a `.svelte` import as a bare `SvelteComponent`.

import type { HoverInfo, SeriesSnapshot, SliceInfo, ValueFormatter } from '@wick-charts/core';

/**
 * Minimal visual shape the `<Legend items>` override accepts — just what the
 * built-in swatch/label UI needs. The canonical `LegendItem` (re-exported from
 * `@wick-charts/core`) carries identity plus `toggle`/`isolate` closures;
 * those aren't meaningful for a pre-baked, non-interactive legend.
 */
export interface LegendItemOverride {
  label: string;
  color: string;
}

/** Payload for `<Legend onToggle>` — one entry per user click, regardless of built-in vs custom rendering. */
export interface LegendToggleInfo {
  /** The clicked item's id (matches `LegendItem.id`). */
  id: string;
  /** Which interaction produced this change. */
  action: 'toggle' | 'isolate' | 'unisolate';
}

export type PieLegendMode = 'value' | 'percent' | 'both';

export type PieLegendPosition = 'bottom' | 'right' | 'overlay';

/** Direction of the current value vs. previous close. Drives the badge color in the default UI. */
export type YLabelDirection = 'up' | 'down' | 'neutral';

/** Props of the `<InfoBar>` default slot (`let:` or `{#snippet children(ctx)}`). */
export interface InfoBarRenderContext {
  readonly snapshots: readonly SeriesSnapshot[];
  /** Timestamp displayed. In hover mode it's the crosshair time; in last-mode it's the newest point. */
  readonly time: number;
  /** `true` while the user's pointer is over the chart (hover mode). */
  readonly isHover: boolean;
}

/** Props of the `<PieLegend>` default slot (`let:` or `{#snippet children(ctx)}`). */
export interface PieLegendRenderContext {
  readonly slices: readonly SliceInfo[];
  readonly mode: PieLegendMode;
  readonly format: ValueFormatter;
}

/** Props of the `<PieTooltip>` default slot (`let:` or `{#snippet children(ctx)}`). */
export interface PieTooltipRenderContext {
  readonly info: HoverInfo;
  readonly format: ValueFormatter;
}

/** Props of the `<SankeyTooltip>` default slot (`let:` or `{#snippet children(ctx)}`). */
export interface SankeyTooltipRenderContext {
  readonly info: HoverInfo;
  readonly format: ValueFormatter;
}

/** Props of the `<Tooltip>` default slot (`let:` or `{#snippet children(ctx)}`). */
export interface TooltipRenderContext {
  readonly snapshots: readonly SeriesSnapshot[];
  /** Crosshair timestamp — the tooltip is hover-only, so this is always a real hover time. */
  readonly time: number;
}

/** Props of the `<YLabel>` default slot (`let:` or `{#snippet children(ctx)}`). */
export interface YLabelRenderContext {
  readonly value: number;
  /** Pixel Y of the badge anchor (already account for current viewport). */
  readonly y: number;
  /** Final background color chosen by the built-in UI — handy if you want to match the dashed line accent. */
  readonly bgColor: string;
  /** `true` while the chart is tracking a live last point (still mutating). */
  readonly isLive: boolean;
  readonly direction: YLabelDirection;
  readonly format: ValueFormatter;
  /** Entrance opacity in `[0, 1]` — ramps up as the initial-load reveal completes. */
  readonly opacity: number;
}

// Component props live here rather than in each SFC: the `*.vue` shim hides
// an SFC's named exports from `tsc`, so `index.ts` could not re-export them.

import type {
  HoverInfo,
  LegendItem,
  MarkerShape,
  NavigatorDataInput,
  NumberFlowFormat,
  ReferenceLineStyle,
  SeriesSnapshot,
  SliceInfo,
  SnapshotSort,
  TimeRegionEnd,
  TimeValue,
  TooltipFormatter,
  ValueFormatter,
  XAxisFormatter,
  YLabelAnimate,
} from '@wick-charts/core';

/**
 * Minimal visual shape the {@link LegendProps.items} override accepts. The
 * canonical {@link LegendItem} (re-exported from `@wick-charts/core`) carries
 * the full identity + closures; those aren't meaningful for a pre-baked,
 * non-interactive legend.
 */
export interface LegendItemOverride {
  label: string;
  color: string;
}

type LegendMode = 'toggle' | 'isolate' | 'solo';

/** Payload for the `onToggle` prop — one entry per user click, regardless of built-in vs custom rendering. */
export interface LegendToggleInfo {
  /** The clicked item's id (matches {@link LegendItem.id}). */
  id: string;
  /** Which interaction produced this change. */
  action: 'toggle' | 'isolate' | 'unisolate';
}

export type PieLegendMode = 'value' | 'percent' | 'both';

export type PieLegendPosition = 'bottom' | 'right' | 'overlay';

/** Direction of the current value vs. previous close. Drives the badge color in the default UI. */
export type YLabelDirection = 'up' | 'down' | 'neutral';

/** Payload of the `<InfoBar>` default slot. */
export interface InfoBarRenderContext {
  readonly snapshots: readonly SeriesSnapshot[];
  /** Timestamp displayed. In hover mode it's the crosshair time; in last-mode it's the newest point. */
  readonly time: number;
  /** `true` while the user's pointer is over the chart (hover mode). */
  readonly isHover: boolean;
}

/** Payload of the `<PieLegend>` default slot. */
export interface PieLegendRenderContext {
  readonly slices: readonly SliceInfo[];
  readonly mode: PieLegendMode;
  readonly format: ValueFormatter;
}

/** Payload of the `<PieTooltip>` default slot. */
export interface PieTooltipRenderContext {
  readonly info: HoverInfo;
  readonly format: ValueFormatter;
}

/** Payload of the `<SankeyTooltip>` default slot. */
export interface SankeyTooltipRenderContext {
  readonly info: HoverInfo;
  readonly format: ValueFormatter;
}

/** Payload of the `<Tooltip>` default slot. */
export interface TooltipRenderContext {
  readonly snapshots: readonly SeriesSnapshot[];
  /** Crosshair timestamp — the tooltip is hover-only, so this is always a real hover time. */
  readonly time: number;
}

/** Payload of the `<YLabel>` default slot. */
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

export interface HeatmapTooltipProps {
  /**
   * Owning series id. **Optional** — when omitted, the first visible heatmap
   * series is picked.
   */
  seriesId?: string;
  /** Custom formatter for the cell value. Default: plain integers, compact decimals. */
  format?: ValueFormatter;
}

export interface InfoBarProps {
  sort?: SnapshotSort;
  format?: TooltipFormatter;
}

export interface LegendProps {
  items?: LegendItemOverride[];
  position?: 'bottom' | 'right';
  /** `'isolate'` shows only the clicked item; `'solo'` is a @deprecated alias. */
  mode?: LegendMode;
  /** Fired after a click changes series visibility — via the built-in UI or a custom slot calling `item.toggle()`/`isolate()` directly. */
  onToggle?: (info: LegendToggleInfo) => void;
}

export interface MarkerProps {
  /** X anchor — epoch ms or a `Date`. */
  time: TimeValue;
  /** Y anchor as a data value. Omit and set `seriesId` to snap to that series' value at `time`. */
  value?: number;
  /** Snap Y to this series' value at `time` when `value` is omitted. Also the default color source. */
  seriesId?: string;
  /** Glyph at the anchor. Default: `'dot'`. Arrows point their tip at the anchor. */
  shape?: MarkerShape;
  /** Reuse the line pulse halo around the anchor. Default: `false`. */
  pulse?: boolean;
  /** Optional text label drawn as a callout chip whose tail points at the anchor. */
  label?: string;
  /** Color override. Falls back to the series color (when `seriesId` is set), then the theme line color. */
  color?: string;
  /** Named Y scale (`ChartContainer` `scales`) the `value` maps through. Default: the `seriesId` series' scale, else the default scale. */
  scale?: string;
}

export interface NavigatorProps {
  /** Data to render in the miniature view, usually the same series the main chart gets. Time accepts ms or `Date`. */
  data: NavigatorDataInput;
  /** Strip height in CSS pixels. Defaults to `theme.navigator.height` (60). */
  height?: number;
}

export interface NumberFlowProps {
  value: number;
  /**
   * Value-to-string formatter. Defaults to `formatSignificant`: leading
   * zeros collapse into a count (`0.0₅8123`), large values take a suffix
   * (`1.235B`). `Intl.NumberFormatOptions` is also accepted (legacy) —
   * routed through the built-in `Intl.NumberFormat`.
   */
  format?: NumberFlowFormat;
  /** BCP 47 locale tag. Gives the decimal separator; a locale other than `'en-US'` without `format` formats with `Intl.NumberFormat`. */
  locale?: string;
  /** Per-digit spin duration in ms. A value that arrives sooner than this after the previous one snaps instead. */
  spinDuration?: number;
  /** How long a character that left keeps its width before the number shrinks, in ms. */
  shrinkDelay?: number;
}

export interface PieLegendProps {
  /**
   * Owning series id. **Optional** — when omitted, the first visible pie
   * series is picked, else the first visible radial progress series.
   */
  seriesId?: string;
  /** 'value' shows only the value, 'percent' only the percent, 'both' shows both. Default: 'both'. */
  mode?: PieLegendMode;
  /** Custom formatter for the absolute slice value. */
  format?: ValueFormatter;
  /** Layout placement. Default: `'bottom'`. */
  position?: PieLegendPosition;
}

export interface PieTooltipProps {
  /**
   * Owning series id. **Optional** — when omitted, the first visible pie
   * series is picked.
   */
  seriesId?: string;
  /** Custom formatter for the slice value. Default: shared `formatCompact`. */
  format?: ValueFormatter;
}

export interface ReferenceLineProps {
  /** Horizontal line at this Y data value. Mutually exclusive with `time`. */
  value?: number;
  /** Vertical line at this `time` (epoch ms or `Date`). Mutually exclusive with `value`; wins when both are set. */
  time?: TimeValue;
  /** Line and label-chip accent color. Default: the theme line color. */
  color?: string;
  /** Optional text label drawn in an annotation chip at the line's near end. */
  label?: string;
  /** Dash style. Default: `'dashed'`. */
  lineStyle?: ReferenceLineStyle;
  /**
   * @deprecated Use {@link ReferenceLineProps.lineStyle}: Vue parses a static
   * `style="dashed"` as CSS, so only a bound `:style="'dashed'"` arrives.
   */
  style?: ReferenceLineStyle;
  /** Stroke width in CSS pixels. Default: `1`. */
  width?: number;
  /** Named Y scale (`ChartContainer` `scales`) the `value` maps through. Default: the default scale. */
  scale?: string;
}

export interface SankeyTooltipProps {
  /**
   * Owning series id. **Optional** — when omitted, the first visible sankey
   * series is picked.
   */
  seriesId?: string;
  /** Custom formatter for the flow value. Default: plain integers, compact decimals. */
  format?: ValueFormatter;
}

export interface TimeRegionProps {
  /** Left edge — epoch ms or a `Date`. */
  from: TimeValue;
  /** Right edge — epoch ms or a `Date`. Omit (or pass `'now'`) for an open-ended band to the right edge. */
  to?: TimeRegionEnd;
  /** Band fill — any CSS color, typically translucent. Default: a faint tint of `color`. */
  fill?: string;
  /** Optional text label drawn in an annotation chip at the top of the band. */
  label?: string;
  /** Edge-line and label-chip accent. Default: the theme's muted axis text color. */
  color?: string;
}

export interface TitleProps {
  /**
   * @deprecated Use the named `sub` slot instead — it accepts arbitrary
   * inline markup (icons, badges, formatted text) to mirror React's
   * `sub: ReactNode`. The string-only prop is kept as a back-compat shim
   * for callers upgrading from 0.3.1; the slot wins when both are provided.
   *
   * Note: the title strip is rendered with `pointer-events: none` so it
   * doesn't intercept canvas hover events. Interactive children (`<a>`,
   * `<button>`) need to opt back in with `pointer-events: auto`.
   */
  sub?: string;
}

export interface TooltipProps {
  sort?: SnapshotSort;
  format?: TooltipFormatter;
}

export interface XAxisProps {
  /** Desired number of labels (≥ 2). Overrides chart-level `axis.x.labelCount`. */
  labelCount?: number;
  /** Minimum pixel gap between adjacent labels (hard floor). Overrides chart-level. */
  minLabelSpacing?: number;
  /**
   * Custom label formatter. `x` is epoch ms on a time axis, the number on a
   * numeric axis, the category name on a category axis; `step` is the tick
   * spacing. Also formats the crosshair label and the tooltip / info-bar headers.
   */
  format?: XAxisFormatter;
}

export interface YAxisProps {
  /** Custom tick-label formatter. Overrides the built-in range-adaptive default. */
  format?: ValueFormatter;
  /**
   * Desired number of labels (≥ 2). Overrides any chart-level `axis.y.labelCount`.
   * Realized count may differ ±1 after the 1-2-5 snap.
   */
  labelCount?: number;
  /** Minimum pixel gap between adjacent labels (hard floor). Overrides chart-level. */
  minLabelSpacing?: number;
  /**
   * Named Y scale (`ChartContainer` `scales`) this axis labels. Default: the
   * default scale. An overlay scale has no column, so only `format` and the
   * label density apply.
   */
  scale?: string;
}

export interface YLabelProps {
  /**
   * Owning series id. **Optional** — when omitted, the first visible
   * single-layer time series is picked, falling back to the first visible
   * multi-layer time series.
   */
  seriesId?: string;
  color?: string;
  /** Custom formatter; routed through NumberFlow's `formatter` so the digit animation still plays. Default: the scale's `<YAxis format>`, else a range-adaptive number. */
  format?: ValueFormatter;
  /**
   * Badge motion. `true` (default) glides + counts up + fades in with the
   * intro; `false` snaps with no easing; an object tunes individual parts.
   */
  animate?: YLabelAnimate;
  /**
   * Named Y scale (`ChartContainer` `scales`) the value maps through. Default:
   * the series' own scale. The badge sits on that scale's axis side — the
   * default axis side for an overlay scale.
   */
  scale?: string;
}

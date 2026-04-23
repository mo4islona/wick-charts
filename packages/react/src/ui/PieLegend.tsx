import { type ReactNode, useLayoutEffect, useState } from 'react';

import { type ChartInstance, type SliceInfo, type ValueFormatter, formatCompact } from '@wick-charts/core';

import { useChartInstance } from '../context';

/**
 * Legend row content.
 *
 * - `'value'` — only the absolute value (e.g. `25`).
 * - `'percent'` — only the percentage (e.g. `25.0%`).
 * - `'both'` (default) — value + percent side-by-side; value is bold, percent dimmed.
 */
export type PieLegendMode = 'value' | 'percent' | 'both';

/**
 * Where the legend sits relative to the pie canvas.
 *
 * - `'bottom'` (default) — flex sibling below the canvas. Matches the time-series `<Legend>` layout.
 * - `'right'` — flex sibling on the right of the canvas.
 * - `'overlay'` — absolute overlay on top of the canvas. Back-compat escape hatch for callers
 *   that were relying on the old positioning; stacks with any `<Title>` at the top-left and can
 *   collide with it, so use sparingly.
 */
export type PieLegendPosition = 'bottom' | 'right' | 'overlay';

/** Context passed to the {@link PieLegend} render-prop. */
export interface PieLegendRenderContext {
  readonly slices: readonly SliceInfo[];
  readonly mode: PieLegendMode;
  readonly format: ValueFormatter;
}

export interface PieLegendProps {
  /**
   * Owning series id. **Optional** — when omitted, the first visible pie
   * series is picked.
   */
  seriesId?: string;
  /** Default: `'both'`. See {@link PieLegendMode}. */
  mode?: PieLegendMode;
  /** Custom formatter for the absolute slice value. Default: shared `formatCompact`. */
  format?: ValueFormatter;
  /** Layout placement. Default: `'bottom'`. See {@link PieLegendPosition}. */
  position?: PieLegendPosition;
  /** Render-prop escape hatch. Receives slices + mode + format, replaces default UI. */
  children?: (ctx: PieLegendRenderContext) => ReactNode;
}

function resolvePieSeriesId(chart: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const pies = chart.getSeriesIdsByType('pie', { visibleOnly: true });

  return pies.length > 0 ? pies[0] : null;
}

export function PieLegend({ seriesId, mode: modeProp, format, position, children }: PieLegendProps) {
  const mode: PieLegendMode = modeProp ?? 'both';
  const resolvedPosition: PieLegendPosition = position ?? 'bottom';
  const formatter: ValueFormatter = format ?? formatCompact;
  const chart = useChartInstance();
  const theme = chart.getTheme();

  const [, setBumpSignal] = useState(0);
  useLayoutEffect(() => {
    const handler = () => setBumpSignal((n) => n + 1);
    chart.on('overlayChange', handler);
    if (chart.getSeriesIds().length > 0) handler();

    return () => {
      chart.off('overlayChange', handler);
    };
  }, [chart]);

  const resolvedId = resolvePieSeriesId(chart, seriesId);
  const slices = resolvedId !== null ? chart.getSliceInfo(resolvedId) : null;
  if (!slices || slices.length === 0) return null;

  if (children) return <>{children({ slices, mode, format: formatter })}</>;

  // When hoisted as a flex sibling (`bottom` / `right`), the container already
  // reserves the legend's box. The extra 8px × 12px block padding only applies
  // in `overlay` mode where the legend floats above the canvas and needs to
  // breathe away from the edges.
  const isOverlay = resolvedPosition === 'overlay';

  return (
    <div
      data-chart-pie-legend=""
      data-chart-pie-legend-position={resolvedPosition}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: isOverlay ? '8px 12px' : '6px 10px',
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.fontSize,
        color: theme.tooltip.textColor,
        pointerEvents: 'auto',
      }}
    >
      {slices.map((slice, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: slice index is stable within a render
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: slice.color,
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, opacity: 0.8 }}>{slice.label}</span>
          {(mode === 'value' || mode === 'both') && (
            <span
              style={{
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                // In 'value'-only mode the cell is the primary number and wants
                // a wider reserved slot; in 'both' it's followed by the percent
                // so keep it tight.
                minWidth: mode === 'value' ? 40 : undefined,
                textAlign: 'right',
              }}
            >
              {formatter(slice.value)}
            </span>
          )}
          {(mode === 'percent' || mode === 'both') && (
            <span
              style={{
                // In 'percent' mode the percent IS the value → bold at full
                // opacity. In 'both' it's a secondary reading next to the
                // absolute value → dim + smaller.
                opacity: mode === 'percent' ? 1 : 0.5,
                fontWeight: mode === 'percent' ? 600 : 400,
                fontSize: mode === 'percent' ? theme.typography.fontSize : theme.axis.fontSize,
                fontVariantNumeric: 'tabular-nums',
                minWidth: 40,
                textAlign: 'right',
              }}
            >
              {slice.percent.toFixed(1)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

import { type ReactNode, useLayoutEffect, useState } from 'react';

import { type ChartInstance, type SliceInfo, type ValueFormatter, formatCompact } from '@wick-charts/core';

import { useChartInstance } from '../context';

export type PieLegendMode = 'value' | 'percent';

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
  /** Display mode: 'value' shows absolute + percent, 'percent' shows only percent. Default: 'value'. */
  mode?: PieLegendMode;
  /** Custom formatter for the absolute slice value. Default: shared `formatCompact`. */
  format?: ValueFormatter;
  /** Render-prop escape hatch. Receives slices + mode + format, replaces default UI. */
  children?: (ctx: PieLegendRenderContext) => ReactNode;
}

function resolvePieSeriesId(chart: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const pies = chart.getSeriesIdsByType('pie', { visibleOnly: true });

  return pies.length > 0 ? pies[0] : null;
}

export function PieLegend({ seriesId, mode: modeProp, format, children }: PieLegendProps) {
  const mode: PieLegendMode = modeProp ?? 'value';
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px 12px',
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
          {mode === 'value' && (
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatter(slice.value)}</span>
          )}
          <span
            style={{
              opacity: mode === 'percent' ? 1 : 0.5,
              fontWeight: mode === 'percent' ? 600 : 400,
              fontSize: mode === 'percent' ? theme.typography.fontSize : theme.typography.axisFontSize,
              fontVariantNumeric: 'tabular-nums',
              minWidth: 40,
              textAlign: 'right',
            }}
          >
            {slice.percent.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

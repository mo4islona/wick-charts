import { useLayoutEffect, useState } from 'react';

import {
  type ChartTheme,
  type OHLCData,
  type TimePoint,
  type TooltipFormatter,
  computeTooltipPosition,
  formatCompact,
  formatDate,
  formatPriceAdaptive,
  formatTime,
} from '@wick-charts/core';

export { computeTooltipPosition } from '@wick-charts/core';

import { useChartInstance } from '../context';
import { useCrosshairPosition } from '../store-bridge';

/** Sort order for multi-series tooltip values. */
export type TooltipSort = 'none' | 'asc' | 'desc';

/**
 * Props for the {@link Tooltip} component.
 * By default shows all series. Use `seriesId` to show one, or `sort` to order values.
 */
export interface TooltipProps {
  /** Show only this series. When omitted, show all series. */
  seriesId?: string;
  /** Sort order for line values when showing all series (default: 'none'). */
  sort?: TooltipSort;
  /**
   * Custom formatter for every displayed number. Called per row with the
   * field hint (`'open' | 'high' | 'low' | 'close' | 'volume' | 'value'`)
   * so consumers can branch on which cell they're formatting.
   * Defaults: adaptive precision for ohlc/value, compact (K/M/B/T) for volume.
   */
  format?: TooltipFormatter;
}

/** Default tooltip formatter — adaptive precision + compact volumes. */
const defaultTooltipFormat: TooltipFormatter = (v, field) =>
  field === 'volume' ? formatCompact(v) : formatPriceAdaptive(v);

/** Snapshot of a single series at a point in time, used for tooltip rendering. */
interface SeriesSnapshot {
  id: string;
  label?: string;
  data: OHLCData | TimePoint;
  color: string;
}

function sortSnapshots(snapshots: SeriesSnapshot[], sort: TooltipSort): SeriesSnapshot[] {
  if (sort === 'none' || snapshots.length <= 1) return snapshots;
  return [...snapshots].sort((a, b) => {
    const av = 'value' in a.data ? (a.data as TimePoint).value : (a.data as OHLCData).close;
    const bv = 'value' in b.data ? (b.data as TimePoint).value : (b.data as OHLCData).close;
    return sort === 'asc' ? av - bv : bv - av;
  });
}

/**
 * Floating near-cursor glass tooltip that appears while hovering the chart.
 *
 * Only handles the floating panel — the hoisted info bar at the top is a
 * separate component ({@link InfoBar}), placed as a sibling. Compose
 * them together when you want both; omit either for just one.
 */
export function Tooltip({ seriesId, sort = 'none', format = defaultTooltipFormat }: TooltipProps) {
  const chart = useChartInstance();
  const crosshair = useCrosshairPosition(chart);

  // Determine which series to display — getSeriesIds() is internally cached.
  const targetIds = seriesId ? [seriesId] : chart.getSeriesIds();

  // Re-render on data and series changes. Matches Legend's pattern — subscribe
  // in layout phase and catch up if siblings have already registered data in
  // this same commit.
  const [, bumpTooltip] = useState(0);
  useLayoutEffect(() => {
    const onDataUpdate = () => bumpTooltip((n) => n + 1);
    const onSeriesChange = () => bumpTooltip((n) => n + 1);
    chart.on('dataUpdate', onDataUpdate);
    chart.on('seriesChange', onSeriesChange);
    if (chart.getSeriesIds().length > 0) bumpTooltip((n) => n + 1);
    return () => {
      chart.off('dataUpdate', onDataUpdate);
      chart.off('seriesChange', onSeriesChange);
    };
  }, [chart]);

  if (!crosshair) return null;

  // Gather hover data for all target series.
  const hoverSnapshots: SeriesSnapshot[] = [];
  for (const id of targetIds) {
    const layers = chart.getLayerSnapshots(id, crosshair.time);
    if (layers) {
      for (let i = 0; i < layers.length; i++) {
        hoverSnapshots.push({
          id: `${id}_layer${i}`,
          label: chart.getSeriesLabel(id),
          data: { time: crosshair.time, value: layers[i].value } as TimePoint,
          color: layers[i].color,
        });
      }
    } else {
      const d = chart.getDataAtTime(id, crosshair.time);
      if (d)
        hoverSnapshots.push({
          id,
          label: chart.getSeriesLabel(id),
          data: d,
          color: chart.getSeriesColor(id) ?? '#888',
        });
    }
  }

  if (hoverSnapshots.length === 0) return null;

  const snapshots = sortSnapshots(hoverSnapshots, sort);
  const theme = chart.getTheme();
  const dataInterval = chart.getDataInterval();
  const mediaSize = chart.getMediaSize();

  return (
    <FloatingTooltip
      snapshots={snapshots}
      x={crosshair.mediaX}
      y={crosshair.mediaY}
      chartWidth={mediaSize.width - chart.yAxisWidth}
      chartHeight={mediaSize.height - chart.xAxisHeight}
      theme={theme}
      dataInterval={dataInterval}
      format={format}
    />
  );
}

function FloatingTooltip({
  snapshots,
  x,
  y,
  chartWidth,
  chartHeight,
  theme,
  dataInterval,
  format,
}: {
  snapshots: SeriesSnapshot[];
  x: number;
  y: number;
  chartWidth: number;
  chartHeight: number;
  theme: ChartTheme;
  dataInterval: number;
  format: TooltipFormatter;
}) {
  const hasOHLC = snapshots.some((s) => 'open' in s.data);
  const lineCount = snapshots.filter((s) => !('open' in s.data)).length;

  const tooltipWidth = 160;
  const tooltipHeight = hasOHLC ? 140 : 40 + lineCount * 22;

  const { left, top } = computeTooltipPosition({ x, y, chartWidth, chartHeight, tooltipWidth, tooltipHeight });

  const bg = theme.tooltip.background;
  const border = theme.tooltip.borderColor;
  const shadow = '0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)';

  const displayTime = snapshots[0].data.time;

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        pointerEvents: 'none',
        background: bg,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: shadow,
        fontSize: theme.typography.tooltipFontSize,
        fontFamily: theme.typography.fontFamily,
        fontVariantNumeric: 'tabular-nums',
        color: theme.tooltip.textColor,
        // Fix the rendered width to the value `computeTooltipPosition` assumes
        // so content growth (e.g. long labels) can't push the tooltip past the
        // clamp and back out of the plot area.
        width: tooltipWidth,
        boxSizing: 'border-box',
        zIndex: 10,
        transition: 'opacity 0.15s ease',
      }}
    >
      {/* Time header */}
      <div
        style={{
          fontSize: theme.typography.axisFontSize,
          color: theme.axis.textColor,
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: `1px solid ${border}`,
          letterSpacing: '0.02em',
        }}
      >
        {formatDate(displayTime)} {formatTime(displayTime, dataInterval)}
      </div>

      {snapshots.map((s) => {
        const isOHLC = 'open' in s.data;
        if (isOHLC) {
          const ohlc = s.data as OHLCData;
          const isUp = ohlc.close >= ohlc.open;
          const upColor = theme.candlestick.upColor;
          const downColor = theme.candlestick.downColor;
          const valColor = isUp ? upColor : downColor;
          return (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
              <TooltipRow label="Open" color={valColor} display={format(ohlc.open, 'open')} />
              <TooltipRow label="High" color={valColor} display={format(ohlc.high, 'high')} />
              <TooltipRow label="Low" color={valColor} display={format(ohlc.low, 'low')} />
              <TooltipRow label="Close" color={valColor} display={format(ohlc.close, 'close')} />
              {ohlc.volume != null && (
                <TooltipRow label="Volume" color={theme.tooltip.textColor} display={format(ohlc.volume, 'volume')} />
              )}
            </div>
          );
        }
        const line = s.data as TimePoint;
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: s.color,
                flexShrink: 0,
              }}
            />
            <span style={{ opacity: 0.6, flex: 1 }}>{s.label ?? 'Value'}</span>
            <span style={{ fontWeight: 600, color: s.color }}>{format(line.value, 'value')}</span>
          </div>
        );
      })}
    </div>
  );
}

function TooltipRow({ label, color, display }: { label: string; color: string; display: string }) {
  return (
    <>
      <span style={{ opacity: 0.5 }}>{label}</span>
      <span style={{ fontWeight: 600, color, textAlign: 'right' }}>{display}</span>
    </>
  );
}

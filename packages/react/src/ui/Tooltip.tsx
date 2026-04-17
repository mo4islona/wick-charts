import { useEffect, useState } from 'react';

import { type OHLCData, type TimePoint, formatDate, formatTime } from '@wick-charts/core';

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
  /** Show the compact legend strip in the top-left corner (default: true). */
  showLegend?: boolean;
  /** @deprecated Use `showLegend` instead. */
  legend?: boolean;
}

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
 * Two-part tooltip:
 * 1. Compact legend always visible in top-left
 * 2. Floating glass tooltip near cursor on hover
 */
export function Tooltip({ seriesId, sort = 'none', showLegend, legend }: TooltipProps) {
  const showLegendResolved = showLegend ?? legend ?? true;
  const chart = useChartInstance();
  const crosshair = useCrosshairPosition(chart);

  // Determine which series to display — getSeriesIds() is internally cached
  const targetIds = seriesId ? [seriesId] : chart.getSeriesIds();

  // Re-render on data updates (not viewport — tooltip content doesn't depend on pan/zoom)
  const [, bumpTooltip] = useState(0);
  useEffect(() => {
    const handler = () => bumpTooltip((n) => n + 1);
    chart.on('dataUpdate', handler);
    return () => chart.off('dataUpdate', handler);
  }, [chart]);

  // Gather hover data for all target series
  const hoverSnapshots: SeriesSnapshot[] = [];
  if (crosshair) {
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
  }

  // Gather last-known data for all target series (shown when not hovering) — only when needed
  let raw: SeriesSnapshot[];
  if (hoverSnapshots.length > 0) {
    raw = hoverSnapshots;
  } else {
    const lastSnapshots: SeriesSnapshot[] = [];
    for (const id of targetIds) {
      const d = chart.getLastData(id);
      if (!d) continue;
      const layers = chart.getLayerSnapshots(id, d.time);
      if (layers) {
        for (let i = 0; i < layers.length; i++) {
          lastSnapshots.push({
            id: `${id}_layer${i}`,
            label: chart.getSeriesLabel(id),
            data: { time: d.time, value: layers[i].value } as TimePoint,
            color: layers[i].color,
          });
        }
      } else {
        lastSnapshots.push({ id, label: chart.getSeriesLabel(id), data: d, color: chart.getSeriesColor(id) ?? '#888' });
      }
    }
    raw = lastSnapshots;
  }
  const snapshots = sortSnapshots(raw, sort);

  const theme = chart.getTheme();
  if (snapshots.length === 0) return null;

  const dataInterval = chart.getDataInterval();
  const mediaSize = chart.getMediaSize();
  const displayTime = snapshots[0].data.time;

  return (
    <>
      {/* ── Compact legend (below chart title) ── */}
      {showLegendResolved && (
        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 8,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexWrap: 'wrap',
            maxWidth: '70%',
            fontSize: theme.typography.fontSize,
            fontFamily: theme.typography.fontFamily,
            fontVariantNumeric: 'tabular-nums',
            opacity: crosshair ? 1 : 0.6,
            transition: 'opacity 0.2s ease',
          }}
        >
          <span style={{ color: theme.axis.textColor, marginRight: 2 }}>{formatTime(displayTime, dataInterval)}</span>
          {snapshots.map((s) => {
            const isOHLC = 'open' in s.data;
            if (isOHLC) {
              const ohlc = s.data as OHLCData;
              const isUp = ohlc.close >= ohlc.open;
              const c = isUp ? theme.candlestick.upColor : theme.candlestick.downColor;
              return (
                <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <LegendItem label="O" value={ohlc.open} color={c} dim={theme.axis.textColor} />
                  <LegendItem label="H" value={ohlc.high} color={c} dim={theme.axis.textColor} />
                  <LegendItem label="L" value={ohlc.low} color={c} dim={theme.axis.textColor} />
                  <LegendItem label="C" value={ohlc.close} color={c} dim={theme.axis.textColor} />
                  {ohlc.volume != null && (
                    <LegendItem
                      label="V"
                      value={ohlc.volume}
                      color={theme.axis.textColor}
                      dim={theme.axis.textColor}
                      volume
                    />
                  )}
                </span>
              );
            }
            const line = s.data as TimePoint;
            return (
              <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: s.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: s.color, fontWeight: 500 }}>{line.value.toFixed(2)}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* ── Floating tooltip (near cursor, only on hover) ── */}
      {crosshair && hoverSnapshots.length > 0 && (
        <FloatingTooltip
          snapshots={snapshots}
          x={crosshair.mediaX}
          y={crosshair.mediaY}
          chartWidth={mediaSize.width - chart.yAxisWidth}
          chartHeight={mediaSize.height - chart.xAxisHeight}
          theme={theme}
          dataInterval={dataInterval}
        />
      )}
    </>
  );
}

function LegendItem({
  label,
  value,
  color,
  dim,
  volume,
}: {
  label: string;
  value: number;
  color: string;
  dim: string;
  volume?: boolean;
}) {
  return (
    <>
      <span style={{ color: dim, opacity: 0.5, marginLeft: 5 }}>{label}</span>
      <span style={{ color, fontWeight: 500, marginLeft: 2 }}>{volume ? formatVolume(value) : value.toFixed(2)}</span>
    </>
  );
}

/**
 * Pure positioning for {@link FloatingTooltip}. Flip side when the preferred
 * side would overflow, then clamp into `[0, chart - size]` so the flipped
 * side can't overflow the opposite edge either. Exported for unit tests.
 */
export function computeTooltipPosition(args: {
  x: number;
  y: number;
  chartWidth: number;
  chartHeight: number;
  tooltipWidth: number;
  tooltipHeight: number;
  offsetX?: number;
  offsetY?: number;
}): { left: number; top: number } {
  const { x, y, chartWidth, chartHeight, tooltipWidth, tooltipHeight, offsetX = 16, offsetY = 16 } = args;
  const rawLeft = x + offsetX + tooltipWidth > chartWidth ? x - offsetX - tooltipWidth : x + offsetX;
  const rawTop = y + offsetY + tooltipHeight > chartHeight ? y - offsetY - tooltipHeight : y + offsetY;
  const maxLeft = Math.max(0, chartWidth - tooltipWidth);
  const maxTop = Math.max(0, chartHeight - tooltipHeight);

  return {
    left: Math.max(0, Math.min(maxLeft, rawLeft)),
    top: Math.max(0, Math.min(maxTop, rawTop)),
  };
}

function FloatingTooltip({
  snapshots,
  x,
  y,
  chartWidth,
  chartHeight,
  theme,
  dataInterval,
}: {
  snapshots: SeriesSnapshot[];
  x: number;
  y: number;
  chartWidth: number;
  chartHeight: number;
  theme: any;
  dataInterval: number;
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
              <TooltipRow label="Open" value={ohlc.open} color={valColor} />
              <TooltipRow label="High" value={ohlc.high} color={valColor} />
              <TooltipRow label="Low" value={ohlc.low} color={valColor} />
              <TooltipRow label="Close" value={ohlc.close} color={valColor} />
              {ohlc.volume != null && (
                <TooltipRow label="Volume" value={ohlc.volume} color={theme.tooltip.textColor} volume />
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
            <span style={{ fontWeight: 600, color: s.color }}>{line.value.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

function TooltipRow({
  label,
  value,
  color,
  volume,
}: {
  label: string;
  value: number;
  color: string;
  volume?: boolean;
}) {
  return (
    <>
      <span style={{ opacity: 0.5 }}>{label}</span>
      <span style={{ fontWeight: 600, color, textAlign: 'right' }}>
        {volume ? formatVolume(value) : value.toFixed(2)}
      </span>
    </>
  );
}

/** Format a volume number with K/M/B suffixes for compact display. */
function formatVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

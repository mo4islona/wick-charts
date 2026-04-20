import { useLayoutEffect, useState } from 'react';

import {
  type OHLCData,
  type TimePoint,
  type TooltipFormatter,
  formatCompact,
  formatPriceAdaptive,
  formatTime,
} from '@wick-charts/core';

import { useChartInstance } from '../context';
import { useCrosshairPosition } from '../store-bridge';
import { useTheme } from '../ThemeContext';
import type { TooltipSort } from './Tooltip';

/** Props for the {@link InfoBar} component. */
export interface InfoBarProps {
  /** Show only this series. When omitted, show all series. */
  seriesId?: string;
  /** Sort order for line values when showing all series (default: 'none'). */
  sort?: TooltipSort;
  /**
   * Custom formatter for every displayed number. Called per cell with the
   * field hint (`'open' | 'high' | 'low' | 'close' | 'volume' | 'value'`).
   * Defaults: adaptive precision for ohlc/value, compact (K/M/B/T) for volume.
   */
  format?: TooltipFormatter;
}

/** @deprecated Use {@link InfoBarProps} instead. */
export type TooltipLegendProps = InfoBarProps;

/** Default InfoBar formatter — adaptive for ohlc/value, compact for volume. */
const defaultInfoBarFormat: TooltipFormatter = (v, field) =>
  field === 'volume' ? formatCompact(v) : formatPriceAdaptive(v);

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
 * Compact OHLC/series info bar rendered as a flex row above the chart canvas.
 * Pairs with {@link Tooltip} (which then only renders its floating near-cursor part).
 * Its presence causes the chart plot area to shrink by the bar's height and the
 * Y-range to recompute — via the same DOM-flex + ResizeObserver path used by the Legend.
 */
export function InfoBar({ seriesId, sort = 'none', format = defaultInfoBarFormat }: InfoBarProps) {
  const chart = useChartInstance();
  const theme = useTheme();
  const crosshair = useCrosshairPosition(chart);

  const targetIds = seriesId ? [seriesId] : chart.getSeriesIds();

  const [, bump] = useState(0);
  useLayoutEffect(() => {
    const onDataUpdate = () => bump((n) => n + 1);
    const onSeriesChange = () => bump((n) => n + 1);
    chart.on('dataUpdate', onDataUpdate);
    chart.on('seriesChange', onSeriesChange);
    // Catch-up: a sibling CandlestickSeries/LineSeries layout effect may have
    // already registered data in this same commit. Bump so the next
    // synchronous render reflects it before paint.
    if (chart.getSeriesIds().length > 0) bump((n) => n + 1);
    return () => {
      chart.off('dataUpdate', onDataUpdate);
      chart.off('seriesChange', onSeriesChange);
    };
  }, [chart]);

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
  if (snapshots.length === 0) return null;

  const dataInterval = chart.getDataInterval();
  const displayTime = snapshots[0].data.time;

  return (
    <div
      data-tooltip-legend=""
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexWrap: 'wrap',
        padding: '4px 8px',
        flexShrink: 0,
        fontSize: theme.typography.fontSize,
        fontFamily: theme.typography.fontFamily,
        fontVariantNumeric: 'tabular-nums',
        opacity: crosshair ? 1 : 0.6,
        transition: 'opacity 0.2s ease',
        pointerEvents: 'none',
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
              <LegendItem label="O" display={format(ohlc.open, 'open')} color={c} dim={theme.axis.textColor} />
              <LegendItem label="H" display={format(ohlc.high, 'high')} color={c} dim={theme.axis.textColor} />
              <LegendItem label="L" display={format(ohlc.low, 'low')} color={c} dim={theme.axis.textColor} />
              <LegendItem label="C" display={format(ohlc.close, 'close')} color={c} dim={theme.axis.textColor} />
              {ohlc.volume != null && (
                <LegendItem
                  label="V"
                  display={format(ohlc.volume, 'volume')}
                  color={theme.axis.textColor}
                  dim={theme.axis.textColor}
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
            <span style={{ color: s.color, fontWeight: 500 }}>{format(line.value, 'value')}</span>
          </span>
        );
      })}
    </div>
  );
}

function LegendItem({ label, display, color, dim }: { label: string; display: string; color: string; dim: string }) {
  return (
    <>
      <span style={{ color: dim, opacity: 0.5, marginLeft: 5 }}>{label}</span>
      <span style={{ color, fontWeight: 500, marginLeft: 2 }}>{display}</span>
    </>
  );
}

/** @deprecated Use {@link InfoBar} instead. */
export const TooltipLegend = InfoBar;

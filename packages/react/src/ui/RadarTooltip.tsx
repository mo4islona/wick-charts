import { type ReactNode, useLayoutEffect, useState } from 'react';

import {
  type HoverInfo,
  RADAR_TOOLTIP_WIDTH,
  type ValueFormatter,
  computeTooltipPosition,
  defaultRadarFormat,
  radarTooltipHeight,
  resolveRadarSeriesId,
} from '@wick-charts/core';

import { useChartInstance } from '../context';
import { useCrosshairPosition } from '../store-bridge';
import { CustomPieTooltip } from './PieTooltip';

/** Context passed to the {@link RadarTooltip} render-prop. */
export interface RadarTooltipRenderContext {
  /** The hovered polygon; `info.rows` holds every axis value. */
  readonly info: HoverInfo;
  readonly format: ValueFormatter;
}

export interface RadarTooltipProps {
  /** Owning series id. **Optional** — when omitted, the first visible radar series is picked. */
  seriesId?: string;
  /** Custom formatter for the axis values. Default: four significant digits, K / M / B / T. */
  format?: ValueFormatter;
  /** Render-prop escape hatch — receives hover info + format, replaces default UI. */
  children?: (ctx: RadarTooltipRenderContext) => ReactNode;
}

/** Tooltip for radar charts: the hovered polygon's name and its value on every axis, with a bar of each value's share of the scale. */
export function RadarTooltip({ seriesId, format = defaultRadarFormat, children }: RadarTooltipProps) {
  const chart = useChartInstance();
  const crosshair = useCrosshairPosition(chart);

  const [, setBumpSignal] = useState(0);
  useLayoutEffect(() => {
    const handler = () => setBumpSignal((n) => n + 1);
    chart.on('overlayChange', handler);
    chart.on('seriesHover', handler);

    return () => {
      chart.off('overlayChange', handler);
      chart.off('seriesHover', handler);
    };
  }, [chart]);

  const resolvedId = resolveRadarSeriesId(chart, seriesId);
  const info = resolvedId !== null ? chart.getHoverInfo(resolvedId) : null;
  if (!info || !crosshair) return null;

  const theme = chart.getTheme();
  const mediaSize = chart.getMediaSize();

  if (children) {
    return (
      <CustomPieTooltip
        x={crosshair.mediaX}
        y={crosshair.mediaY}
        chartWidth={mediaSize.width}
        chartHeight={mediaSize.height}
        theme={theme}
      >
        {children({ info, format })}
      </CustomPieTooltip>
    );
  }

  const rows = info.rows ?? [];
  const { left, top } = computeTooltipPosition({
    x: crosshair.mediaX,
    y: crosshair.mediaY,
    chartWidth: mediaSize.width,
    chartHeight: mediaSize.height,
    tooltipWidth: RADAR_TOOLTIP_WIDTH,
    tooltipHeight: radarTooltipHeight(rows.length),
    offsetX: 16,
    offsetY: 16,
  });

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: RADAR_TOOLTIP_WIDTH,
        boxSizing: 'border-box',
        pointerEvents: 'none',
        zIndex: 10,
        background: theme.tooltip.background,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${theme.tooltip.borderColor}`,
        borderRadius: 8,
        padding: '10px 12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)',
        fontSize: theme.typography.fontSize,
        fontFamily: theme.typography.fontFamily,
        color: theme.tooltip.textColor,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: info.color, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {info.label}
        </span>
      </div>
      {rows.map((row) => (
        <div
          key={row.label}
          style={{ display: 'grid', gridTemplateColumns: '1fr 48px auto', alignItems: 'center', gap: 8 }}
        >
          <span style={{ opacity: 0.65, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.label}
          </span>
          <span style={{ height: 4, borderRadius: 2, background: theme.tooltip.borderColor, overflow: 'hidden' }}>
            <span
              style={{
                display: 'block',
                height: '100%',
                width: `${row.percent ?? 0}%`,
                borderRadius: 2,
                background: info.color,
              }}
            />
          </span>
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: 32 }}>
            {row.value === null ? '—' : format(row.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

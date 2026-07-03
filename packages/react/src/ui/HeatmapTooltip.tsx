import { useLayoutEffect, useState } from 'react';

import {
  HEATMAP_TOOLTIP_HEIGHT,
  HEATMAP_TOOLTIP_WIDTH,
  type HoverInfo,
  type ValueFormatter,
  computeTooltipPosition,
  defaultHeatmapFormat,
  resolveHeatmapSeriesId,
} from '@wick-charts/core';

import { useChartInstance } from '../context';
import { useCrosshairPosition } from '../store-bridge';

export interface HeatmapTooltipProps {
  /**
   * Owning series id. **Optional** — when omitted, the first visible heatmap
   * series is picked.
   */
  seriesId?: string;
  /** Custom formatter for the cell value. Default: plain integers, compact decimals. */
  format?: ValueFormatter;
}

/**
 * Tooltip for heatmap charts. Shows the hovered cell's row · column label,
 * value, and a small intensity meter locating the value on the color ramp.
 */
export function HeatmapTooltip({ seriesId, format = defaultHeatmapFormat }: HeatmapTooltipProps) {
  const chart = useChartInstance();
  const crosshair = useCrosshairPosition(chart);

  const [, setBumpSignal] = useState(0);
  useLayoutEffect(() => {
    const handler = () => setBumpSignal((n) => n + 1);
    chart.on('overlayChange', handler);

    return () => {
      chart.off('overlayChange', handler);
    };
  }, [chart]);

  const resolvedId = resolveHeatmapSeriesId(chart, seriesId);
  const info: HoverInfo | null = resolvedId !== null ? chart.getHoverInfo(resolvedId) : null;
  if (!info || !crosshair) return null;

  const theme = chart.getTheme();
  const mediaSize = chart.getMediaSize();

  const { left, top } = computeTooltipPosition({
    x: crosshair.mediaX,
    y: crosshair.mediaY,
    chartWidth: mediaSize.width,
    chartHeight: mediaSize.height,
    tooltipWidth: HEATMAP_TOOLTIP_WIDTH,
    tooltipHeight: HEATMAP_TOOLTIP_HEIGHT,
    offsetX: 16,
    offsetY: 16,
  });

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        pointerEvents: 'none',
        zIndex: 10,
        background: theme.tooltip.background,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${theme.tooltip.borderColor}`,
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)',
        fontSize: theme.typography.fontSize,
        fontFamily: theme.typography.fontFamily,
        color: theme.tooltip.textColor,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 120,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            background: info.color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600 }}>{info.label}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{format(info.value)}</span>
      </div>
      <div
        style={{
          position: 'relative',
          height: 4,
          borderRadius: 2,
          background: theme.tooltip.borderColor,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${Math.max(2, Math.min(100, info.percent))}%`,
            borderRadius: 2,
            background: info.color,
          }}
        />
      </div>
    </div>
  );
}

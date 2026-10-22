import { type ReactNode, useLayoutEffect, useState } from 'react';

import {
  type HoverInfo,
  SANKEY_TOOLTIP_HEIGHT,
  SANKEY_TOOLTIP_WIDTH,
  type ValueFormatter,
  computeTooltipPosition,
  defaultSankeyFormat,
  resolveSankeySeriesId,
} from '@wick-charts/core';

import { useChartInstance } from '../context';
import { useCrosshairPosition } from '../store-bridge';
import { CustomPieTooltip } from './PieTooltip';

/** Context passed to the {@link SankeyTooltip} render-prop. */
export interface SankeyTooltipRenderContext {
  readonly info: HoverInfo;
  readonly format: ValueFormatter;
}

export interface SankeyTooltipProps {
  /**
   * Owning series id. **Optional** — when omitted, the first visible sankey
   * series is picked.
   */
  seriesId?: string;
  /** Custom formatter for the flow value. Default: plain integers, compact decimals. */
  format?: ValueFormatter;
  /** Render-prop escape hatch — receives hover info + format, replaces default UI. */
  children?: (ctx: SankeyTooltipRenderContext) => ReactNode;
}

/**
 * Tooltip for sankey charts. Shows the hovered node (`label`) or link
 * (`Source → Target`), its value, and its share of the outflow: of all
 * sources for a node, of the source node for a link.
 */
export function SankeyTooltip({ seriesId, format = defaultSankeyFormat, children }: SankeyTooltipProps) {
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

  const resolvedId = resolveSankeySeriesId(chart, seriesId);
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

  const { left, top } = computeTooltipPosition({
    x: crosshair.mediaX,
    y: crosshair.mediaY,
    chartWidth: mediaSize.width,
    chartHeight: mediaSize.height,
    tooltipWidth: SANKEY_TOOLTIP_WIDTH,
    tooltipHeight: SANKEY_TOOLTIP_HEIGHT,
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
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ fontWeight: 600 }}>{format(info.value)}</span>
        <span style={{ opacity: 0.6 }}>{info.percent.toFixed(1)}%</span>
      </div>
    </div>
  );
}

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  type ChartInstance,
  type HoverInfo,
  type ValueFormatter,
  computeTooltipPosition,
  formatCompact,
} from '@wick-charts/core';

import { useChartInstance } from '../context';
import { useCrosshairPosition } from '../store-bridge';

/** Context passed to the {@link PieTooltip} render-prop. */
export interface PieTooltipRenderContext {
  readonly info: HoverInfo;
  readonly format: ValueFormatter;
}

export interface PieTooltipProps {
  /**
   * Owning series id. **Optional** — when omitted, the first visible pie
   * series is picked.
   */
  seriesId?: string;
  /** Custom formatter for the slice value. Default: shared `formatCompact`. */
  format?: ValueFormatter;
  /** Render-prop escape hatch — receives hover info + format, replaces default UI. */
  children?: (ctx: PieTooltipRenderContext) => ReactNode;
}

function resolvePieSeriesId(chart: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const pies = chart.getSeriesIdsByType('pie', { visibleOnly: true });

  return pies.length > 0 ? pies[0] : null;
}

const DEFAULT_TOOLTIP_WIDTH = 160;
const DEFAULT_TOOLTIP_HEIGHT = 70;

/** Tooltip for pie/donut charts. Shows hovered slice label, value, and percentage. */
export function PieTooltip({ seriesId, format = formatCompact, children }: PieTooltipProps) {
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

  const resolvedId = resolvePieSeriesId(chart, seriesId);
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
    tooltipWidth: DEFAULT_TOOLTIP_WIDTH,
    tooltipHeight: DEFAULT_TOOLTIP_HEIGHT,
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
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: info.color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600 }}>{info.label}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ opacity: 0.6 }}>{format(info.value)}</span>
        <span style={{ fontWeight: 600 }}>{info.percent.toFixed(1)}%</span>
      </div>
    </div>
  );
}

// Custom slot content has unknown dimensions — measure the container, then
// position it. Matches the pattern in `Tooltip` (PR #39) so user-rendered pie
// tooltips flip/clamp correctly near edges instead of overflowing with the
// hardcoded 160×70 defaults.
function CustomPieTooltip({
  x,
  y,
  chartWidth,
  chartHeight,
  children,
}: {
  x: number;
  y: number;
  chartWidth: number;
  chartHeight: number;
  children: ReactNode;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize((prev) =>
        prev && prev.width === box.width && prev.height === box.height
          ? prev
          : { width: box.width, height: box.height },
      );
    });
    ro.observe(node);

    return () => ro.disconnect();
  }, []);

  const position = size
    ? computeTooltipPosition({
        x,
        y,
        chartWidth,
        chartHeight,
        tooltipWidth: size.width,
        tooltipHeight: size.height,
        offsetX: 16,
        offsetY: 16,
      })
    : { left: 0, top: 0 };

  return (
    <div
      ref={nodeRef}
      data-measured={size ? 'true' : 'false'}
      style={{
        position: 'absolute',
        left: position.left,
        top: position.top,
        pointerEvents: 'none',
        zIndex: 10,
        width: 'max-content',
        maxWidth: chartWidth,
        boxSizing: 'border-box',
        // Hide until the first measurement so the user never sees a paint
        // with out-of-bounds position.
        visibility: size ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>
  );
}

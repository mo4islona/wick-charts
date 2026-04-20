import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  type ChartTheme,
  type OHLCData,
  type SeriesSnapshot,
  type TimePoint,
  type TooltipFormatter,
  buildHoverSnapshots,
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

/** Context passed to the {@link Tooltip} render-prop. */
export interface TooltipRenderContext {
  readonly snapshots: readonly SeriesSnapshot[];
  /** Crosshair timestamp — the tooltip is hover-only, so this is always a real hover time. */
  readonly time: number;
}

/**
 * Props for the {@link Tooltip} component.
 * Renders the built-in floating glass panel by default. Pass a render-prop
 * child to replace its *contents* — the positioned container (with flip/clamp)
 * stays.
 */
export interface TooltipProps {
  /** Sort order for line values (default: 'none'). */
  sort?: TooltipSort;
  /**
   * Custom formatter for every displayed number in the default UI. Called per
   * row with the field hint (`'open' | 'high' | 'low' | 'close' | 'volume' | 'value'`).
   * Defaults: adaptive precision for ohlc/value, compact (K/M/B/T) for volume.
   * Ignored when {@link children} is a render-prop.
   */
  format?: TooltipFormatter;
  /**
   * Render-prop escape hatch. Receives the hover snapshots and replaces the
   * built-in panel contents. The floating container (positioning, blur glass,
   * clamping) is preserved — use
   * [`computeTooltipPosition`](../../core/src/tooltip-position.ts) directly if
   * you need your own container.
   */
  children?: (ctx: TooltipRenderContext) => ReactNode;
}

/** Default tooltip formatter — adaptive precision + compact volumes. */
const defaultTooltipFormat: TooltipFormatter = (v, field) =>
  field === 'volume' ? formatCompact(v) : formatPriceAdaptive(v);

/**
 * Floating near-cursor glass tooltip that appears while hovering the chart.
 *
 * Hover-only: without a crosshair position, the component renders `null`.
 * The companion {@link InfoBar} shows last-known values when no hover is active.
 */
export function Tooltip({ sort = 'none', format = defaultTooltipFormat, children }: TooltipProps) {
  const chart = useChartInstance();
  const crosshair = useCrosshairPosition(chart);

  const [, bump] = useState(0);
  useLayoutEffect(() => {
    const onOverlayChange = () => bump((n) => n + 1);
    chart.on('overlayChange', onOverlayChange);
    if (chart.getSeriesIds().length > 0) bump((n) => n + 1);

    return () => {
      chart.off('overlayChange', onOverlayChange);
    };
  }, [chart]);

  if (!crosshair) return null;

  const snapshots = buildHoverSnapshots(chart, { time: crosshair.time, sort, cacheKey: 'tooltip' });
  if (snapshots.length === 0) return null;

  const theme = chart.getTheme();
  const dataInterval = chart.getDataInterval();
  const mediaSize = chart.getMediaSize();
  const chartWidth = mediaSize.width - chart.yAxisWidth;
  const chartHeight = mediaSize.height - chart.xAxisHeight;

  if (children) {
    return (
      <CustomFloatingTooltip
        x={crosshair.mediaX}
        y={crosshair.mediaY}
        chartWidth={chartWidth}
        chartHeight={chartHeight}
        theme={theme}
      >
        {/* `crosshair.time` is the semantic truth — snapshots[0].data.time
            shifts with `sort` and, for ragged multi-layer data, disagrees
            with the actual hover moment. */}
        {children({ snapshots, time: crosshair.time })}
      </CustomFloatingTooltip>
    );
  }

  return (
    <FloatingTooltip
      snapshots={snapshots}
      displayTime={crosshair.time}
      x={crosshair.mediaX}
      y={crosshair.mediaY}
      chartWidth={chartWidth}
      chartHeight={chartHeight}
      theme={theme}
      dataInterval={dataInterval}
      format={format}
    />
  );
}

function CustomFloatingTooltip({
  x,
  y,
  chartWidth,
  chartHeight,
  theme,
  children,
}: {
  x: number;
  y: number;
  chartWidth: number;
  chartHeight: number;
  theme: ChartTheme;
  children: ReactNode;
}) {
  // Custom content has unknown dimensions until the first paint — measure the
  // container, then position it. Hide with `visibility: hidden` on the
  // pre-measured frame so the user never sees an un-clamped paint.
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
    ? computeTooltipPosition({ x, y, chartWidth, chartHeight, tooltipWidth: size.width, tooltipHeight: size.height })
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
        background: theme.tooltip.background,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${theme.tooltip.borderColor}`,
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)',
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.tooltipFontSize,
        fontVariantNumeric: 'tabular-nums',
        color: theme.tooltip.textColor,
        width: 'max-content',
        maxWidth: chartWidth,
        boxSizing: 'border-box',
        zIndex: 10,
        visibility: size ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>
  );
}

function FloatingTooltip({
  snapshots,
  displayTime,
  x,
  y,
  chartWidth,
  chartHeight,
  theme,
  dataInterval,
  format,
}: {
  snapshots: readonly SeriesSnapshot[];
  displayTime: number;
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

import { useMemo } from "react";
import type { LineData, OHLCData } from "../core/types";
import { useChartInstance } from "../react/context";
import { useCrosshairPosition, useLastPrice } from "../react/store-bridge";
import { formatDate, formatTime } from "../utils/time";

export interface TooltipProps {
  seriesId: string;
}

/**
 * Two-part tooltip:
 * 1. Compact legend always visible in top-left
 * 2. Floating glass tooltip near cursor on hover
 */
export function Tooltip({ seriesId }: TooltipProps) {
  const chart = useChartInstance();
  const crosshair = useCrosshairPosition(chart);
  const lastPrice = useLastPrice(chart, seriesId);

  const hoverData = useMemo(() => {
    if (!crosshair) return null;
    return chart.getDataAtTime(seriesId, crosshair.time);
  }, [chart, seriesId, crosshair?.time]);

  const lastData = useMemo(() => {
    return chart.getLastData(seriesId);
  }, [chart, seriesId, lastPrice]);

  const displayData = hoverData ?? lastData;
  if (!displayData) return null;

  const theme = chart.getTheme();
  const isOHLC = "open" in displayData;
  const ohlc = displayData as OHLCData;
  const line = displayData as LineData;
  const isUp = isOHLC ? ohlc.close >= ohlc.open : true;
  const dataInterval = chart.getDataInterval();
  const mediaSize = chart.getMediaSize();

  const upColor = theme.candlestick.upColor;
  const downColor = theme.candlestick.downColor;
  const valueColor = isOHLC ? (isUp ? upColor : downColor) : theme.line.color;
  const labelColor = theme.axis.textColor;

  return (
    <>
      {/* ── Compact legend (below chart title) ── */}
      <div
        style={{
          position: "absolute",
          top: 24,
          left: 8,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: theme.typography.fontSize,
          fontFamily: theme.typography.fontFamily,
          fontVariantNumeric: "tabular-nums",
          opacity: crosshair ? 1 : 0.6,
          transition: "opacity 0.2s ease",
        }}
      >
        <span style={{ color: labelColor, marginRight: 2 }}>{formatTime(displayData.time, dataInterval)}</span>
        {isOHLC ? (
          <>
            <LegendItem label="O" value={ohlc.open} color={valueColor} dim={labelColor} />
            <LegendItem label="H" value={ohlc.high} color={valueColor} dim={labelColor} />
            <LegendItem label="L" value={ohlc.low} color={valueColor} dim={labelColor} />
            <LegendItem label="C" value={ohlc.close} color={valueColor} dim={labelColor} />
            {ohlc.volume != null && (
              <LegendItem label="V" value={ohlc.volume} color={labelColor} dim={labelColor} volume />
            )}
          </>
        ) : (
          <span style={{ color: valueColor, fontWeight: 500 }}>{line.value.toFixed(2)}</span>
        )}
      </div>

      {/* ── Floating tooltip (near cursor, only on hover) ── */}
      {crosshair && hoverData && (
        <FloatingTooltip
          data={hoverData}
          x={crosshair.mediaX}
          y={crosshair.mediaY}
          chartWidth={mediaSize.width - 70}
          chartHeight={mediaSize.height - 30}
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

function FloatingTooltip({
  data,
  x,
  y,
  chartWidth,
  chartHeight,
  theme,
  dataInterval,
}: {
  data: OHLCData | LineData;
  x: number;
  y: number;
  chartWidth: number;
  chartHeight: number;
  theme: any;
  dataInterval: number;
}) {
  const isOHLC = "open" in data;
  const ohlc = data as OHLCData;
  const line = data as LineData;
  const isUp = isOHLC ? ohlc.close >= ohlc.open : true;

  const upColor = theme.candlestick.upColor;
  const downColor = theme.candlestick.downColor;

  // Position: offset from cursor, flip near edges
  const tooltipWidth = 160;
  const tooltipHeight = isOHLC ? 140 : 60;
  const offsetX = 16;
  const offsetY = 16;

  const left = x + offsetX + tooltipWidth > chartWidth ? x - offsetX - tooltipWidth : x + offsetX;
  const top = y + offsetY + tooltipHeight > chartHeight ? y - offsetY - tooltipHeight : y + offsetY;

  const bg = theme.tooltip.background;
  const border = theme.tooltip.borderColor;
  const shadow = "0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)";

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        pointerEvents: "none",
        background: bg,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: shadow,
        fontSize: theme.typography.fontSize,
        fontFamily: theme.typography.fontFamily,
        fontVariantNumeric: "tabular-nums",
        color: theme.tooltip.textColor,
        minWidth: 140,
        zIndex: 10,
        transition: "opacity 0.15s ease",
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
          letterSpacing: "0.02em",
        }}
      >
        {formatDate(data.time)} {formatTime(data.time, dataInterval)}
      </div>

      {isOHLC ? (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
          <TooltipRow label="Open" value={ohlc.open} color={isUp ? upColor : downColor} />
          <TooltipRow label="High" value={ohlc.high} color={isUp ? upColor : downColor} />
          <TooltipRow label="Low" value={ohlc.low} color={isUp ? upColor : downColor} />
          <TooltipRow label="Close" value={ohlc.close} color={isUp ? upColor : downColor} />
          {ohlc.volume != null && (
            <TooltipRow label="Volume" value={ohlc.volume} color={theme.tooltip.textColor} volume />
          )}
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ opacity: 0.6 }}>Value</span>
          <span style={{ fontWeight: 600, color: theme.line.color }}>{line.value.toFixed(2)}</span>
        </div>
      )}
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
      <span style={{ fontWeight: 600, color, textAlign: "right" }}>
        {volume ? formatVolume(value) : value.toFixed(2)}
      </span>
    </>
  );
}

function formatVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(0);
}

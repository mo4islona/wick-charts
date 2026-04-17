import { useChartInstance } from '../context';
import { useCrosshairPosition } from '../store-bridge';

export interface PieTooltipProps {
  seriesId: string;
}

/** Tooltip for pie/donut charts. Shows hovered slice label, value, and percentage. */
export function PieTooltip({ seriesId }: PieTooltipProps) {
  const chart = useChartInstance();
  const crosshair = useCrosshairPosition(chart);

  const info = chart.getHoverInfo(seriesId);
  if (!info || !crosshair) return null;

  const theme = chart.getTheme();
  const mediaSize = chart.getMediaSize();

  const tooltipWidth = 160;
  const tooltipHeight = 70;
  const offsetX = 16;
  const offsetY = 16;

  const left =
    crosshair.mediaX + offsetX + tooltipWidth > mediaSize.width
      ? crosshair.mediaX - offsetX - tooltipWidth
      : crosshair.mediaX + offsetX;
  const top =
    crosshair.mediaY + offsetY + tooltipHeight > mediaSize.height
      ? crosshair.mediaY - offsetY - tooltipHeight
      : crosshair.mediaY + offsetY;

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        pointerEvents: 'none',
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
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* Label row */}
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
      {/* Value + percent */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ opacity: 0.6 }}>{info.value.toLocaleString()}</span>
        <span style={{ fontWeight: 600 }}>{info.percent.toFixed(1)}%</span>
      </div>
    </div>
  );
}

import { formatTime } from '@wick-charts/core';

import { useChartInstance } from '../context';
import { useCrosshairPosition } from '../store-bridge';

export function Crosshair() {
  const chart = useChartInstance();
  const position = useCrosshairPosition(chart);

  if (!position) return null;

  const theme = chart.getTheme();
  const dataInterval = chart.getDataInterval();

  const labelStyle = {
    // Blend the theme's labelBackground at 80% opacity so the axis grid
    // shows through — matches TradingView-style overlays and keeps the
    // badge from looking like an opaque block.
    background: `color-mix(in srgb, ${theme.crosshair.labelBackground} 80%, transparent)`,
    color: theme.crosshair.labelTextColor,
    fontSize: theme.axis.fontSize,
    fontFamily: theme.typography.fontFamily,
    fontVariantNumeric: 'tabular-nums' as const,
    padding: '2px 6px',
    borderRadius: 2,
    whiteSpace: 'nowrap' as const,
    pointerEvents: 'none' as const,
    // Sit above axis ticks (z:0) but below the YLabel badge (z:3) so the
    // live last-value stays visible when the crosshair crosses its row.
    zIndex: 2,
  };

  return (
    <>
      {/* Y label on right axis */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: position.mediaY,
          transform: 'translateY(-50%)',
          ...labelStyle,
        }}
      >
        {chart.yScale.formatY(position.y)}
      </div>
      {/* Time label on bottom axis */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: position.mediaX,
          transform: 'translateX(-50%)',
          ...labelStyle,
        }}
      >
        {formatTime(position.time, dataInterval)}
      </div>
    </>
  );
}

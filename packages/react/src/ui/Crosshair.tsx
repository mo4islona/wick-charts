import { useChartInstance } from '../context';
import { useCrosshairPosition, useOverlayVersion } from '../store-bridge';
import { NumberText } from './NumberText';

export function Crosshair() {
  const chart = useChartInstance();
  const position = useCrosshairPosition(chart);
  // A formatter or scale change re-labels a still crosshair.
  useOverlayVersion(chart);

  if (!position) return null;

  const theme = chart.getTheme();
  const dataInterval = chart.getDataInterval();
  // Format the time pill at the axis's *resolved* tick granularity, not the raw
  // data interval — otherwise a time-of-day badge floats among date labels when
  // zoomed out. Falls back to dataInterval on a degenerate range.
  const tickInterval = chart.timeScale.niceTickValues(dataInterval).tickInterval || dataInterval;

  // One value label per named scale's axis column, each read through its own scale.
  const scaleLabels = chart.getYScaleIds().flatMap((scale) => {
    const column = chart.getYScaleColumn(scale);
    if (column === null) return [];

    const yScale = chart.getYScale(scale);

    return [{ scale, position: column.position, text: yScale.formatY(yScale.yToValue(position.mediaY)) }];
  });
  // A named scale can own the default axis's side when the default axis is hidden.
  const defaultSideTaken = scaleLabels.some((label) => label.position === chart.yAxisPosition);

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
      {/* Y label on the value axis */}
      {!defaultSideTaken && (
        <div
          style={{
            position: 'absolute',
            [chart.yAxisPosition]: 0,
            top: position.mediaY,
            transform: 'translateY(-50%)',
            ...labelStyle,
          }}
        >
          <NumberText text={chart.yScale.formatY(position.y)} mute={false} />
        </div>
      )}
      {scaleLabels.map((label) => (
        <div
          key={label.scale}
          style={{
            position: 'absolute',
            [label.position]: 0,
            top: position.mediaY,
            transform: 'translateY(-50%)',
            ...labelStyle,
          }}
        >
          <NumberText text={label.text} mute={false} />
        </div>
      ))}
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
        {chart.timeScale.formatX(position.time, tickInterval)}
      </div>
    </>
  );
}

import type { ChartTheme } from '@wick-charts/react';

/**
 * Thin bordered wrapper for a dashboard chart. The title/subtitle are now
 * the chart's responsibility — use `<Title>` inside the chart container so
 * the header row is laid out by ChartContainer alongside `<InfoBar>`
 * instead of floating as a separate element above the canvas.
 */
export function Cell({
  children,
  theme,
  style,
}: {
  children: React.ReactNode;
  theme: ChartTheme;
  style?: React.CSSProperties;
}) {
  return (
    <div
      data-cell=""
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        borderRadius: 6,
        overflow: 'hidden',
        border: `1px solid ${theme.tooltip.borderColor}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

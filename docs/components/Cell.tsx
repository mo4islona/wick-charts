import type { ChartTheme } from '@wick-charts/react';

import { CardFrame } from './playground/cardPick';

/**
 * Thin bordered wrapper for a dashboard chart. The title/subtitle are now
 * the chart's responsibility — use `<Title>` inside the chart container so
 * the header row is laid out by ChartContainer alongside `<InfoBar>`
 * instead of floating as a separate element above the canvas.
 *
 * `cardId` makes the cell a playground card: a click picks it for the Code tab.
 */
export function Cell({
  children,
  theme,
  style,
  cardId,
}: {
  children?: React.ReactNode;
  theme: ChartTheme;
  style?: React.CSSProperties;
  cardId?: string;
}) {
  return (
    <CardFrame
      cardId={cardId}
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
    </CardFrame>
  );
}

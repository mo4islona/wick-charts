import type { ChartTheme } from '@wick-charts/react';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/**
 * Extract the editable surface of a `ChartTheme` into the `createTheme` arg
 * shape. Round-trips through `createTheme` so edits drive previews and the
 * whole-page override.
 */
export function themeToJson(t: ChartTheme): JsonValue {
  return {
    background: t.background,
    chartGradient: [t.chartGradient[0], t.chartGradient[1]],
    typography: {
      fontFamily: t.typography.fontFamily,
      fontSize: t.typography.fontSize,
      axisFontSize: t.typography.axisFontSize,
      yFontSize: t.typography.yFontSize,
      tooltipFontSize: t.typography.tooltipFontSize,
    },
    grid: { color: t.grid.color, style: t.grid.style },
    candlestick: {
      upColor: t.candlestick.upColor,
      downColor: t.candlestick.downColor,
      wickUpColor: t.candlestick.wickUpColor,
      wickDownColor: t.candlestick.wickDownColor,
    },
    line: { color: t.line.color, width: t.line.width },
    seriesColors: [...t.seriesColors],
    bands: { upper: t.bands.upper, lower: t.bands.lower },
    crosshair: {
      color: t.crosshair.color,
      labelBackground: t.crosshair.labelBackground,
      labelTextColor: t.crosshair.labelTextColor,
    },
    axis: { textColor: t.axis.textColor },
    yLabel: {
      upBackground: t.yLabel.upBackground,
      downBackground: t.yLabel.downBackground,
      neutralBackground: t.yLabel.neutralBackground,
      textColor: t.yLabel.textColor,
    },
    tooltip: {
      background: t.tooltip.background,
      textColor: t.tooltip.textColor,
      borderColor: t.tooltip.borderColor,
    },
  };
}

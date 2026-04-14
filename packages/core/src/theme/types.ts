/** Font family and size tokens used across the chart. */
export interface Typography {
  fontFamily: string;
  fontSize: number;
  axisFontSize: number;
  yFontSize: number;
  tooltipFontSize: number;
}

/**
 * Complete visual theme for a chart instance.
 * Controls colors for every visual element: background, series, axes, crosshair, tooltip, etc.
 */
export interface ChartTheme {
  /** Optional preset display name (used by theme selectors). */
  name?: string;
  /** Optional short description of the theme. */
  description?: string;
  /** True when background is dark — used by theme selectors for grouping. */
  dark?: boolean;
  /** Optional URL for a web font (e.g. Google Fonts) associated with this theme. */
  fontUrl?: string | null;
  /** Optional CSS `background-image` for the page surrounding the chart. */
  backgroundImage?: string;
  /** Optional CSS `background-size` paired with {@link backgroundImage}. */
  backgroundSize?: string;

  /** Page/container background */
  background: string;
  /** Chart area gradient [top, bottom] — subtle vignette for depth */
  chartGradient: [string, string];
  typography: Typography;

  /** Grid line appearance in the chart area. */
  grid: {
    color: string;
    style: 'solid' | 'dashed' | 'dotted';
  };

  /** OHLC candlestick body and wick colors. */
  candlestick: {
    upColor: string;
    downColor: string;
    wickUpColor: string;
    wickDownColor: string;
  };

  /** Default line series appearance including area gradient fill. */
  line: {
    color: string;
    width: number;
    areaTopColor: string;
    areaBottomColor: string;
  };

  /** Color palette for multi-series charts (stacked bars, overlays). */
  seriesColors: string[];

  /** Bollinger band / envelope fill colors. */
  bands: {
    upper: string;
    lower: string;
  };

  /** Crosshair line and axis label styling. */
  crosshair: {
    color: string;
    labelBackground: string;
    labelTextColor: string;
  };

  /** Axis tick label styling. */
  axis: {
    textColor: string;
  };

  /** Floating label shown at the current value level on the Y axis. */
  yLabel: {
    upBackground: string;
    downBackground: string;
    neutralBackground: string;
    textColor: string;
  };

  /** Hover tooltip styling. */
  tooltip: {
    background: string;
    textColor: string;
    borderColor: string;
  };
}

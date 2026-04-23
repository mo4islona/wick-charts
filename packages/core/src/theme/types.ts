/** Font family and base font size used across the chart. */
export interface Typography {
  fontFamily: string;
  /** Base body font size — titles, infobar, pie tooltip/legend default to this. */
  fontSize: number;
}

/**
 * Complete visual theme for a chart instance.
 * Controls colors for every visual element: background, series, axes, crosshair, tooltip, etc.
 */
export interface ChartTheme {
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

  /**
   * OHLC candlestick colors. `wick` defaults to `body` in {@link createTheme}
   * when omitted, so most presets only need to set the body colors.
   *
   * `body` shape encodes the fill: a single color renders flat; a
   * `[top, bottom]` tuple renders a 2-stop vertical gradient. Presets that
   * want the subtle lightened/darkened look pass `autoGradient(color)`.
   */
  candlestick: {
    up: { body: string | [string, string]; wick: string };
    down: { body: string | [string, string]; wick: string };
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

  /**
   * Axis tick styling. `fontSize` and `textColor` are the shared defaults used
   * for both X and Y, as well as non-axis label surfaces (legend, crosshair
   * labels, sparkline ticks). Set `x` / `y` only when a specific axis needs to
   * diverge.
   */
  axis: {
    fontSize: number;
    textColor: string;
    x?: { fontSize?: number; textColor?: string };
    y?: { fontSize?: number; textColor?: string };
  };

  /** Floating label shown at the current value level on the Y axis. */
  yLabel: {
    fontSize: number;
    upBackground: string;
    downBackground: string;
    neutralBackground: string;
    textColor: string;
  };

  /** Hover tooltip styling. */
  tooltip: {
    fontSize: number;
    background: string;
    textColor: string;
    borderColor: string;
  };
}

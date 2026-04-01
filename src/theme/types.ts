export interface Typography {
  fontFamily: string;
  fontSize: number;
  axisFontSize: number;
  priceFontSize: number;
}

export interface ChartTheme {
  /** Page/container background */
  background: string;
  /** Chart area gradient [top, bottom] — subtle vignette for depth */
  chartGradient: [string, string];
  typography: Typography;

  grid: {
    color: string;
    style: "solid" | "dashed" | "dotted";
  };

  candlestick: {
    upColor: string;
    downColor: string;
    wickUpColor: string;
    wickDownColor: string;
  };

  line: {
    color: string;
    width: number;
    areaTopColor: string;
    areaBottomColor: string;
  };

  seriesColors: string[];

  bands: {
    upper: string;
    lower: string;
  };

  crosshair: {
    color: string;
    labelBackground: string;
    labelTextColor: string;
  };

  axis: {
    textColor: string;
  };

  priceLabel: {
    upBackground: string;
    downBackground: string;
    neutralBackground: string;
    textColor: string;
  };

  tooltip: {
    background: string;
    textColor: string;
    borderColor: string;
  };
}

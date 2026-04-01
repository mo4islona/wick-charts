import { useMemo } from "react";
import { useChartInstance } from "../react/context";
import { useLastPrice, usePreviousClose } from "../react/store-bridge";
import { NumberFlow } from "./NumberFlow";

export interface PriceLabelProps {
  seriesId: string;
  /** Override badge color (e.g. line color). If not set, uses up/down/neutral from theme. */
  color?: string;
}

export function PriceLabel({ seriesId, color }: PriceLabelProps) {
  const chart = useChartInstance();
  const lastPrice = useLastPrice(chart, seriesId);
  const previousClose = usePreviousClose(chart, seriesId);

  if (lastPrice === null) return null;

  const theme = chart.getTheme();
  const y = chart.priceScale.priceToY(lastPrice);

  let bgColor: string;
  if (color) {
    bgColor = color;
  } else {
    const direction =
      previousClose === null
        ? "neutral"
        : lastPrice > previousClose
          ? "up"
          : lastPrice < previousClose
            ? "down"
            : "neutral";
    bgColor =
      direction === "up"
        ? theme.priceLabel.upBackground
        : direction === "down"
          ? theme.priceLabel.downBackground
          : theme.priceLabel.neutralBackground;
  }

  const priceRange = chart.priceScale.getRange();
  const range = priceRange.max - priceRange.min;
  const fractionDigits = range < 0.1 ? 6 : range < 10 ? 4 : range < 1000 ? 2 : 0;

  return (
    <>
      {/* Horizontal dashed line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 70,
          top: y,
          height: 0,
          borderTop: `1px dashed ${bgColor}`,
          opacity: 0.5,
          pointerEvents: "none",
          zIndex: 2,
        }}
      />
      {/* Price badge */}
      <div
        style={{
          position: "absolute",
          right: 4,
          top: y,
          transform: "translateY(-50%)",
          pointerEvents: "auto",
          zIndex: 3,
          background: bgColor,
          color: theme.priceLabel.textColor,
          fontSize: theme.typography.priceFontSize,
          fontFamily: theme.typography.fontFamily,
          fontWeight: 600,
          padding: "3px 8px",
          borderRadius: 3,
          whiteSpace: "nowrap",
          transition: "background-color 0.3s ease",
        }}
      >
        <NumberFlow
          value={lastPrice}
          format={{ minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits, useGrouping: false }}
          spinDuration={350}
        />
      </div>
    </>
  );
}

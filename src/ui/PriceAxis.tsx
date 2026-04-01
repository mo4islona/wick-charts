import { useRef } from "react";
import { useChartInstance } from "../react/context";
import { usePriceRange } from "../react/store-bridge";

interface TrackedTick {
  opacity: number;
  addedAt: number;
}

export function PriceAxis() {
  const chart = useChartInstance();
  const priceRange = usePriceRange(chart);
  const theme = chart.getTheme();
  const currentTicks = chart.priceScale.niceTickValues();
  const currentSet = new Set(currentTicks);

  const mapRef = useRef<Map<number, TrackedTick>>(new Map());
  const map = mapRef.current;
  const now = performance.now();

  for (const p of currentTicks) {
    if (!map.has(p)) {
      map.set(p, { opacity: 1, addedAt: now });
    } else {
      map.get(p)!.opacity = 1;
    }
  }

  for (const [p, entry] of map) {
    if (!currentSet.has(p)) {
      entry.opacity = 0;
    }
  }

  for (const [p, entry] of map) {
    if (entry.opacity === 0 && now - entry.addedAt > 5000) {
      map.delete(p);
    }
  }

  const allTicks = Array.from(map.entries());

  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 30,
        width: 70,
        pointerEvents: "none",
      }}
    >
      {allTicks.map(([price, entry]) => {
        const y = chart.priceScale.priceToY(price);
        return (
          <span
            key={price}
            style={{
              position: "absolute",
              right: 8,
              top: y,
              transform: "translateY(-50%)",
              color: theme.axis.textColor,
              fontSize: theme.typography.axisFontSize,
              fontFamily: theme.typography.fontFamily,
              fontVariantNumeric: "tabular-nums",
              userSelect: "none",
              opacity: entry.opacity,
              transition: "opacity 0.3s ease",
              willChange: "opacity",
            }}
          >
            {chart.priceScale.formatPrice(price)}
          </span>
        );
      })}
    </div>
  );
}

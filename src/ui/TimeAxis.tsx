import { useRef } from "react";
import { useChartInstance } from "../react/context";
import { useVisibleRange } from "../react/store-bridge";
import { formatTime } from "../utils/time";

interface TrackedTick {
  opacity: number;
  addedAt: number;
}

export function TimeAxis() {
  const chart = useChartInstance();
  const visibleRange = useVisibleRange(chart);
  const theme = chart.getTheme();
  const dataInterval = chart.getDataInterval();
  const currentTicks = chart.timeScale.niceTickValues(dataInterval);
  const currentSet = new Set(currentTicks);

  // Persistent map: tick value → tracked state
  const mapRef = useRef<Map<number, TrackedTick>>(new Map());
  const map = mapRef.current;
  const now = performance.now();

  // Mark current ticks as visible
  for (const t of currentTicks) {
    if (!map.has(t)) {
      map.set(t, { opacity: 1, addedAt: now });
    } else {
      map.get(t)!.opacity = 1;
    }
  }

  // Mark missing ticks for fade-out
  for (const [t, entry] of map) {
    if (!currentSet.has(t)) {
      entry.opacity = 0;
    }
  }

  // Clean up old faded-out ticks (keep for 400ms for CSS transition)
  for (const [t, entry] of map) {
    if (entry.opacity === 0 && now - entry.addedAt > 5000) {
      map.delete(t);
    }
  }

  // Collect all ticks to render (current + fading out)
  const allTicks = Array.from(map.entries());

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        right: 70,
        height: 30,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
      }}
    >
      {allTicks.map(([time, entry]) => {
        const x = chart.timeScale.timeToX(time);
        return (
          <span
            key={time}
            style={{
              position: "absolute",
              left: x,
              transform: "translateX(-50%)",
              color: theme.axis.textColor,
              fontSize: theme.typography.axisFontSize,
              fontFamily: theme.typography.fontFamily,
              userSelect: "none",
              whiteSpace: "nowrap",
              opacity: entry.opacity,
              transition: "opacity 0.3s ease",
              willChange: "opacity",
            }}
          >
            {formatTime(time, dataInterval)}
          </span>
        );
      })}
    </div>
  );
}

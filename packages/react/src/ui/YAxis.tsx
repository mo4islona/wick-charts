import { useRef } from 'react';

import { useChartInstance } from '../context';
import { useYRange } from '../store-bridge';

interface TrackedTick {
  opacity: number;
  addedAt: number;
  fadedAt?: number;
}

export function YAxis() {
  const chart = useChartInstance();
  useYRange(chart); // subscribe to viewport changes so ticks re-render
  const theme = chart.getTheme();
  const currentTicks = chart.yScale.niceTickValues();
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
      if (entry.opacity !== 0) {
        entry.opacity = 0;
        entry.fadedAt = now;
      }
    }
  }

  for (const [p, entry] of map) {
    if (entry.opacity === 0 && entry.fadedAt !== undefined && now - entry.fadedAt > 600) {
      map.delete(p);
    }
  }

  const allTicks = Array.from(map.entries());

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: chart.xAxisHeight,
        width: chart.yAxisWidth,
        pointerEvents: 'none',
      }}
    >
      {allTicks.map(([price, entry]) => {
        const y = chart.yScale.valueToY(price);
        return (
          <span
            key={price}
            style={{
              position: 'absolute',
              right: 8,
              top: y,
              transform: 'translateY(-50%)',
              color: theme.axis.textColor,
              fontSize: theme.typography.axisFontSize,
              fontFamily: theme.typography.fontFamily,
              fontVariantNumeric: 'tabular-nums',
              userSelect: 'none',
              opacity: entry.opacity,
              transition: 'opacity 0.3s ease',
              willChange: 'opacity',
            }}
          >
            {chart.yScale.formatY(price)}
          </span>
        );
      })}
    </div>
  );
}

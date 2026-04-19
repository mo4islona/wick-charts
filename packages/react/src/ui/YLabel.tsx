import { useEffect, useMemo } from 'react';

import type { ValueFormatter } from '@wick-charts/core';

import { useChartInstance } from '../context';
import { useLastYValue, usePreviousClose } from '../store-bridge';
import { NumberFlow } from './NumberFlow';

export interface YLabelProps {
  seriesId: string;
  /** Override badge color (e.g. line color). If not set, uses up/down/neutral from theme. */
  color?: string;
  /**
   * Custom formatter. Routed through NumberFlow as its `format` prop so the
   * digit-by-digit animation still plays on the output string — NumberFlow
   * animates whichever characters the formatter returns.
   */
  format?: ValueFormatter;
}

export function YLabel({ seriesId, color, format }: YLabelProps) {
  const chart = useChartInstance();

  // Notify chart that YLabel is present (affects right padding)
  useEffect(() => {
    chart.setYLabel(true);
    return () => chart.setYLabel(false);
  }, [chart]);
  const last = useLastYValue(chart, seriesId);
  const previousClose = usePreviousClose(chart, seriesId);

  const yRange = chart.yScale.getRange();
  const range = yRange.max - yRange.min;
  const fractionDigits = range < 0.1 ? 6 : range < 10 ? 4 : range < 1000 ? 2 : 0;

  // Build the fallback range-adaptive Intl formatter before the early return
  // so this hook call can't be skipped on subsequent renders (Rules of Hooks).
  const effectiveFormat = useMemo<ValueFormatter>(() => {
    if (format) return format;
    const nf = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      useGrouping: false,
    });
    return (v: number) => nf.format(v);
  }, [format, fractionDigits]);

  if (!last) return null;

  const { value, isLive } = last;
  const theme = chart.getTheme();
  const y = chart.yScale.valueToY(value);

  let bgColor: string;
  if (!isLive) {
    bgColor = theme.axis.textColor;
  } else if (color) {
    bgColor = color;
  } else {
    const direction =
      previousClose === null ? 'neutral' : value > previousClose ? 'up' : value < previousClose ? 'down' : 'neutral';
    bgColor =
      direction === 'up'
        ? theme.yLabel.upBackground
        : direction === 'down'
          ? theme.yLabel.downBackground
          : theme.yLabel.neutralBackground;
  }

  return (
    <>
      {/* Horizontal dashed line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: chart.yAxisWidth,
          top: y,
          height: 0,
          borderTop: `1px dashed ${bgColor}`,
          opacity: 0.5,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
      {/* Value badge */}
      <div
        style={{
          position: 'absolute',
          right: 4,
          top: y,
          transform: 'translateY(-50%)',
          pointerEvents: 'auto',
          zIndex: 3,
          background: bgColor,
          color: theme.yLabel.textColor,
          fontSize: theme.typography.yFontSize,
          fontFamily: theme.typography.fontFamily,
          padding: '3px 8px',
          borderRadius: 3,
          whiteSpace: 'nowrap',
          transition: 'background-color 0.3s ease',
        }}
      >
        <NumberFlow value={value} format={effectiveFormat} spinDuration={350} />
      </div>
    </>
  );
}

import { useLayoutEffect, useState } from 'react';

import { type ValueFormatter, formatCompact } from '@wick-charts/core';

import { useChartInstance } from '../context';

export type PieLegendMode = 'value' | 'percent';

export interface PieLegendProps {
  seriesId: string;
  /** Display mode: 'value' shows absolute + percent, 'percent' shows only percent. Default: 'value'. */
  mode?: PieLegendMode;
  /** Custom formatter for the absolute slice value. Default: shared `formatCompact`. */
  format?: ValueFormatter;
}

export function PieLegend({ seriesId, mode: modeProp, format }: PieLegendProps) {
  const mode: PieLegendMode = modeProp ?? 'value';
  const formatter: ValueFormatter = format ?? formatCompact;
  const chart = useChartInstance();
  const theme = chart.getTheme();

  // Subscribe to re-render when series or data changes. Bump once so the
  // first render — which happens before sibling series have committed their
  // setup layout-effects — picks up the now-registered slices.
  const [, setTick] = useState(0);
  useLayoutEffect(() => {
    const handler = () => setTick((t) => t + 1);
    chart.on('dataUpdate', handler);
    chart.on('seriesChange', handler);
    handler();
    return () => {
      chart.off('dataUpdate', handler);
      chart.off('seriesChange', handler);
    };
  }, [chart]);

  const slices = chart.getSliceInfo(seriesId);
  if (!slices || slices.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px 12px',
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.fontSize,
        color: theme.tooltip.textColor,
        pointerEvents: 'auto',
      }}
    >
      {slices.map((slice, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: slice.color,
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, opacity: 0.8 }}>{slice.label}</span>
          {mode === 'value' && (
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatter(slice.value)}</span>
          )}
          <span
            style={{
              opacity: mode === 'percent' ? 1 : 0.5,
              fontWeight: mode === 'percent' ? 600 : 400,
              fontSize: mode === 'percent' ? theme.typography.fontSize : theme.typography.axisFontSize,
              fontVariantNumeric: 'tabular-nums',
              minWidth: 40,
              textAlign: 'right',
            }}
          >
            {slice.percent.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

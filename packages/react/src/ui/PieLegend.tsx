import { useEffect, useState } from 'react';
import { useChartInstance } from '../context';

export type PieLegendFormat = 'value' | 'percent';

export interface PieLegendProps {
  seriesId: string;
  /** Display format: 'value' shows absolute + percent, 'percent' shows only percent. Default: 'value'. */
  format?: PieLegendFormat;
}

function formatCompact(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toLocaleString();
}

export function PieLegend({ seriesId, format = 'value' }: PieLegendProps) {
  const chart = useChartInstance();
  const theme = chart.getTheme();

  // Subscribe to dataUpdate to re-render when pie data changes
  const [, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    chart.on('dataUpdate', handler);
    return () => { chart.off('dataUpdate', handler); };
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
          {format === 'value' && (
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {formatCompact(slice.value)}
            </span>
          )}
          <span
            style={{
              opacity: format === 'percent' ? 1 : 0.5,
              fontWeight: format === 'percent' ? 600 : 400,
              fontSize: format === 'percent' ? theme.typography.fontSize : theme.typography.axisFontSize,
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

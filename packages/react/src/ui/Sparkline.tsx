import { type CSSProperties, useMemo } from 'react';

import { type ChartTheme, type TimePoint, formatCompact } from '@wick-charts/core';

import { BarSeries } from '../BarSeries';
import { ChartContainer } from '../ChartContainer';
import { LineSeries } from '../LineSeries';

export type SparklineVariant = 'line' | 'bar';
export type SparklineValuePosition = 'left' | 'right' | 'none';

export interface SparklineProps {
  data: TimePoint[];
  theme: ChartTheme;
  /** 'line' (default) or 'bar' */
  variant?: SparklineVariant;
  /** Where to show the value label */
  valuePosition?: SparklineValuePosition;
  /** Custom format for the value */
  formatValue?: (value: number) => string;
  /** Label text above the value */
  label?: string;
  /** Sublabel text below the value (defaults to the change %) */
  sublabel?: string;
  /** Line/bar color override (defaults to theme) */
  color?: string;
  /** Secondary color for negative bars */
  negativeColor?: string;
  /** Show area fill under line */
  areaFill?: boolean;
  /** Chart width (default: 140) */
  width?: number;
  /** Overall height (default: 48) */
  height?: number;
  /** Line width (default: 1.5) */
  lineWidth?: number;
  /** Show chart background gradient (default: true) */
  gradient?: boolean;
  /** Container style override */
  style?: CSSProperties;
}

function hexToRgba(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color;
  if (!color.startsWith('#')) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function computeChange(data: TimePoint[]): { value: number; pct: number; positive: boolean } {
  if (data.length < 2) return { value: 0, pct: 0, positive: true };
  const first = data[0].value;
  const last = data[data.length - 1].value;
  const diff = last - first;
  const pct = first !== 0 ? (diff / first) * 100 : 0;
  return { value: diff, pct, positive: diff >= 0 };
}

export function Sparkline({
  data,
  theme,
  variant = 'line',
  valuePosition = 'right',
  formatValue = formatCompact,
  label,
  sublabel,
  color,
  negativeColor,
  areaFill = true,
  width = 140,
  height = 48,
  lineWidth = 1.5,
  gradient = true,
  style,
}: SparklineProps) {
  const lastValue = data.length > 0 ? data[data.length - 1].value : 0;
  const change = useMemo(() => computeChange(data), [data]);

  const resolvedColor = color ?? theme.seriesColors[0];
  const resolvedNegColor = negativeColor ?? theme.candlestick.downColor;
  const changeColor = change.positive ? theme.candlestick.upColor : theme.candlestick.downColor;

  const valueBlock = valuePosition !== 'none' && (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 1,
        minWidth: 0,
        flexShrink: 0,
      }}
    >
      {label && (
        <div
          style={{
            fontSize: theme.typography.axisFontSize,
            color: theme.axis.textColor,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          fontSize: theme.typography.fontSize + 3,
          fontWeight: 700,
          color: theme.tooltip.textColor,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatValue(lastValue)}
      </div>
      {sublabel !== undefined ? (
        <div
          style={{
            fontSize: theme.typography.axisFontSize - 1,
            color: theme.axis.textColor,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          {sublabel}
        </div>
      ) : (
        <div
          style={{
            fontSize: theme.typography.axisFontSize - 1,
            fontWeight: 500,
            color: changeColor,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {change.positive ? '+' : ''}
          {change.pct.toFixed(1)}%
        </div>
      )}
    </div>
  );

  const chartBlock = (
    <div style={{ width, height, flexShrink: 0, borderRadius: 4, overflow: 'hidden' }}>
      <ChartContainer
        theme={theme}
        axis={{
          y: { visible: false, width: 0 },
          x: { visible: false, height: 0 },
        }}
        padding={{ top: 5, right: 0, bottom: 0, left: 0 }}
        gradient={gradient}
        interactive={false}
        grid={false}
      >
        {variant === 'line' ? (
          <LineSeries
            data={[data]}
            options={{
              colors: [resolvedColor],
              lineWidth,
              areaFill,
              pulse: false,
              stacking: 'off',
            }}
          />
        ) : (
          <BarSeries
            data={[data]}
            options={{
              colors: [resolvedColor, resolvedNegColor],
              barWidthRatio: 0.7,
              stacking: 'off',
            }}
          />
        )}
      </ChartContainer>
    </div>
  );

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderRadius: 8,
        background: hexToRgba(theme.tooltip.background, 0.7),
        border: `1px solid ${theme.tooltip.borderColor}`,
        fontFamily: theme.typography.fontFamily,
        ...style,
      }}
    >
      {valuePosition === 'left' && valueBlock}
      {chartBlock}
      {valuePosition === 'right' && valueBlock}
    </div>
  );
}

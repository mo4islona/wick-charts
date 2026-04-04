import { type CSSProperties, type ReactNode, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ChartInstance, type ChartOptions, type AxisConfig, type ChartTheme } from '@wick-charts/core';
import { ChartContext } from './context';
import { ThemeProvider, useThemeOptional } from './ThemeContext';

/** Props for the {@link ChartContainer} component. */
export interface ChartContainerProps {
  /** Series components and UI overlays (Tooltip, TimeAxis, etc.) rendered inside the chart. */
  children?: ReactNode;
  /** Visual theme. Changing this at runtime will update all themed elements. */
  theme?: ChartTheme;
  /** Grouped axis configuration (Y/X visibility, bounds, sizing). */
  axis?: AxisConfig;
  style?: CSSProperties;
  className?: string;
}

/**
 * Top-level React wrapper that creates a {@link ChartInstance} and provides it to children via context.
 * Owns the DOM container and canvas lifecycle; renders children as an overlay layer.
 */
export function ChartContainer({
  children,
  theme,
  axis,
  style,
  className,
}: ChartContainerProps) {
  const contextTheme = useThemeOptional();
  const resolvedTheme = theme ?? contextTheme ?? undefined;

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const [_, setRevision] = useState(0);

  // useLayoutEffect — synchronous, runs before paint.
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    if (chartRef.current) return;

    const options: ChartOptions = {};
    if (axis) options.axis = axis;
    if (resolvedTheme) options.theme = resolvedTheme;
    chartRef.current = new ChartInstance(containerRef.current, options);
    setRevision((r) => r + 1);

    return () => {
      const instance = chartRef.current;
      chartRef.current = null;
      setTimeout(() => {
        if (!chartRef.current) {
          instance?.destroy();
        }
      }, 0);
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && resolvedTheme) {
      chartRef.current.setTheme(resolvedTheme);
    }
  }, [resolvedTheme]);

  useEffect(() => {
    if (chartRef.current && axis) {
      chartRef.current.setAxis(axis);
    }
  }, [
    axis?.y?.width, axis?.y?.min, axis?.y?.max, axis?.y?.visible,
    axis?.x?.height, axis?.x?.visible,
  ]);

  const chart = chartRef.current;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      {chart && (
        <ChartContext.Provider value={chart}>
          <ThemeProvider value={resolvedTheme ?? chart.getTheme()}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 2,
              }}
            >
              {children}
            </div>
          </ThemeProvider>
        </ChartContext.Provider>
      )}
    </div>
  );
}

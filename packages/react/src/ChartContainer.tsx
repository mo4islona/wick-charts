import {
  type CSSProperties,
  Children,
  type ReactElement,
  type ReactNode,
  isValidElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { type AxisConfig, ChartInstance, type ChartOptions, type ChartTheme } from '@wick-charts/core';

import { ChartContext } from './context';
import { ThemeProvider, useThemeOptional } from './ThemeContext';
import { Legend } from './ui/Legend';

/** Props for the {@link ChartContainer} component. */
export interface ChartContainerProps {
  /** Series components and UI overlays (Tooltip, TimeAxis, etc.) rendered inside the chart. */
  children?: ReactNode;
  /** Visual theme. Changing this at runtime will update all themed elements. */
  theme?: ChartTheme;
  /** Grouped axis configuration (Y/X visibility, bounds, sizing). */
  axis?: AxisConfig;
  /**
   * Viewport padding: { top, right, bottom, left }.
   * `top`/`bottom` are in pixels; `left`/`right` are in bar counts.
   * Set all to 0 for edge-to-edge sparklines. Applied on mount only.
   */
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Show the chart background gradient. Defaults to true. */
  gradient?: boolean;
  /** Enable zoom, pan, and crosshair interactions. Defaults to true. */
  interactive?: boolean;
  /** Show the background grid. Defaults to true. */
  grid?: boolean;
  style?: CSSProperties;
  className?: string;
}

/**
 * Top-level React wrapper that creates a {@link ChartInstance} and provides it to children via context.
 * Owns the DOM container and canvas lifecycle; renders children as an overlay layer.
 * Detects `<Legend>` children and renders them outside the chart area.
 */
export function ChartContainer({ children, theme, axis, padding, gradient = true, interactive, grid, style, className }: ChartContainerProps) {
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
    if (padding) options.padding = padding;
    if (interactive !== undefined) options.interactive = interactive;
    if (grid !== undefined) options.grid = grid;
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
  }, [axis?.y?.width, axis?.y?.min, axis?.y?.max, axis?.y?.visible, axis?.x?.height, axis?.x?.visible]);

  const chart = chartRef.current;

  // Separate Legend children from chart overlay children
  const { legendEl, overlay } = (() => {
    let legend: ReactElement | null = null;
    const rest: ReactNode[] = [];
    Children.forEach(children, (child) => {
      if (isValidElement(child) && child.type === Legend) {
        legend = child;
      } else {
        rest.push(child);
      }
    });
    return { legendEl: legend as ReactElement | null, overlay: rest };
  })();

  const legendPosition = (legendEl as any)?.props?.position ?? 'bottom';
  const isLegendRight = legendPosition === 'right';

  const effectiveTheme = resolvedTheme ?? chart?.getTheme();
  const [gtop, gbot] = effectiveTheme?.chartGradient ?? ['transparent', 'transparent'];
  const bg = effectiveTheme?.background ?? 'transparent';
  const backgroundStyle = gradient
    ? `linear-gradient(to bottom, ${gtop} 0%, ${bg} 70%, ${gbot} 100%)`
    : bg;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: isLegendRight ? 'row' : 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: backgroundStyle,
        ...style,
      }}
    >
      {/* Chart area */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
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
                {overlay}
              </div>
            </ThemeProvider>
          </ChartContext.Provider>
        )}
      </div>

      {/* Legend — rendered outside chart, viewport automatically compensates */}
      {chart && legendEl && (
        <ChartContext.Provider value={chart}>
          <ThemeProvider value={resolvedTheme ?? chart.getTheme()}>{legendEl}</ThemeProvider>
        </ChartContext.Provider>
      )}
    </div>
  );
}

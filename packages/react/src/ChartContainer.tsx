import {
  type CSSProperties,
  Children,
  Fragment,
  type ReactElement,
  type ReactNode,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { type AxisConfig, ChartInstance, type ChartOptions, type ChartTheme } from '@wick-charts/core';

import { ChartContext, TooltipLegendPresenceContext } from './context';
import { ThemeProvider, useThemeOptional } from './ThemeContext';
import { Legend } from './ui/Legend';
import { TooltipLegend } from './ui/TooltipLegend';

/** Props for the {@link ChartContainer} component. */
export interface ChartContainerProps {
  /** Series components and UI overlays (Tooltip, TimeAxis, etc.) rendered inside the chart. */
  children?: ReactNode;
  /** Visual theme. Changing this at runtime will update all themed elements. */
  theme?: ChartTheme;
  /** Grouped axis configuration (Y/X visibility, bounds, sizing). */
  axis?: AxisConfig;
  /**
   * Viewport padding. `top`/`bottom` are in pixels. `left`/`right` accept either pixels (`50`)
   * or data intervals (`{ intervals: 3 }`). Set to 0 for edge-to-edge sparklines. Applied on mount only.
   * Defaults: `{ top: 20, bottom: 20, right: { intervals: 3 }, left: { intervals: 0 } }`.
   */
  padding?: {
    top?: number;
    bottom?: number;
    right?: number | { intervals: number };
    left?: number | { intervals: number };
  };
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
 * Split children into `<Legend>`, `<TooltipLegend>`, and the rest.
 *
 * Transparently walks through `<React.Fragment>` wrappers so the caller can
 * use normal React patterns — e.g. wrapping children in a conditional
 * fragment or returning fragments from parent components — and still get
 * hoisting. Deeper component boundaries are left alone on purpose: a custom
 * component that internally renders a `<TooltipLegend>` is its own DOM
 * subtree and should stay there.
 *
 * Exported for testing — this is pure React-children iteration with no DOM
 * dependencies, so it can be asserted in Node.
 */
export function siftContainerChildren(children: ReactNode): {
  legendEl: ReactElement | null;
  tooltipLegendEl: ReactElement | null;
  overlay: ReactNode[];
} {
  let legendEl: ReactElement | null = null;
  let tooltipLegendEl: ReactElement | null = null;
  const overlay: ReactNode[] = [];

  const visit = (child: ReactNode): void => {
    if (isValidElement(child) && child.type === Fragment) {
      // Unwrap fragments recursively — fragments don't produce DOM nodes,
      // so a Legend/TooltipLegend nested in one is still a layout-level sibling.
      Children.forEach(
        (child as ReactElement<{ children?: ReactNode }>).props.children,
        visit,
      );
      return;
    }
    if (isValidElement(child)) {
      if (child.type === Legend) {
        legendEl = child;
        return;
      }
      if (child.type === TooltipLegend) {
        tooltipLegendEl = child;
        return;
      }
    }
    overlay.push(child);
  };

  Children.forEach(children, visit);
  return { legendEl, tooltipLegendEl, overlay };
}

/**
 * Top-level React wrapper that creates a {@link ChartInstance} and provides it to children via context.
 * Owns the DOM container and canvas lifecycle; renders children as an overlay layer.
 * Detects `<Legend>` and `<TooltipLegend>` children and renders them outside the chart area
 * so browser flex layout reserves their height and ResizeObserver drives a Y-range recompute.
 */
export function ChartContainer({
  children,
  theme,
  axis,
  padding,
  gradient = true,
  interactive,
  grid,
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

  useEffect(() => {
    if (chartRef.current && padding) {
      chartRef.current.setPadding(padding);
    }
  }, [
    padding?.top,
    padding?.bottom,
    typeof padding?.right === 'object' ? padding.right.intervals : padding?.right,
    typeof padding?.left === 'object' ? padding.left.intervals : padding?.left,
  ]);

  useEffect(() => {
    if (chartRef.current && grid !== undefined) {
      chartRef.current.setGrid(grid);
    }
  }, [grid]);

  const chart = chartRef.current;

  const { legendEl, tooltipLegendEl, overlay } = siftContainerChildren(children);
  const legendPosition = (legendEl as any)?.props?.position ?? 'bottom';
  const isLegendRight = legendPosition === 'right';

  const effectiveTheme = resolvedTheme ?? chart?.getTheme();
  const [gtop, gbot] = effectiveTheme?.chartGradient ?? ['transparent', 'transparent'];
  const bg = effectiveTheme?.background ?? 'transparent';
  const backgroundStyle = gradient ? `linear-gradient(to bottom, ${gtop} 0%, ${bg} 70%, ${gbot} 100%)` : bg;

  // When the right-legend is active, the canvas + legend share a horizontal row;
  // the TooltipLegend still sits on top spanning the full width. We achieve that
  // by wrapping the row in a column container.
  const canvasBlock = (
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
            <TooltipLegendPresenceContext.Provider value={tooltipLegendEl !== null}>
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
            </TooltipLegendPresenceContext.Provider>
          </ThemeProvider>
        </ChartContext.Provider>
      )}
    </div>
  );

  const hoistedTooltipLegend = chart && tooltipLegendEl && (
    <ChartContext.Provider value={chart}>
      <ThemeProvider value={resolvedTheme ?? chart.getTheme()}>{tooltipLegendEl}</ThemeProvider>
    </ChartContext.Provider>
  );

  const hoistedLegend = chart && legendEl && (
    <ChartContext.Provider value={chart}>
      <ThemeProvider value={resolvedTheme ?? chart.getTheme()}>{legendEl}</ThemeProvider>
    </ChartContext.Provider>
  );

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: backgroundStyle,
        ...style,
      }}
    >
      {hoistedTooltipLegend}
      {isLegendRight ? (
        <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0 }}>
          {canvasBlock}
          {hoistedLegend}
        </div>
      ) : (
        <>
          {canvasBlock}
          {hoistedLegend}
        </>
      )}
    </div>
  );
}

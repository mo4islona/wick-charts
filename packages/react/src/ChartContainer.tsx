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

import { ChartContext } from './context';
import { ThemeProvider, useThemeOptional } from './ThemeContext';
import { Legend } from './ui/Legend';
import { Title } from './ui/Title';
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
  /**
   * How `<Title>` and `<TooltipLegend>` are positioned relative to the canvas.
   * - `'overlay'` (default): absolute overlays on top of the canvas — the grid
   *   and Y-axis labels render full-height behind the header strip.
   * - `'inline'`: flex siblings above the canvas — the canvas (and grid) are
   *   shifted down by the measured header height, so nothing renders behind
   *   the title. The chart background still spans the full container.
   */
  headerLayout?: 'overlay' | 'inline';
  style?: CSSProperties;
  className?: string;
}

/**
 * Split children into `<Title>`, `<Legend>`, `<TooltipLegend>`, and the rest.
 *
 * Transparently walks through `<React.Fragment>` wrappers so the caller can
 * use normal React patterns — e.g. wrapping children in a conditional
 * fragment or returning fragments from parent components — and still get
 * hoisting. Deeper component boundaries are left alone on purpose: a custom
 * component that internally renders a `<Title>` / `<TooltipLegend>` is its
 * own DOM subtree and should stay there.
 *
 * Exported for testing — this is pure React-children iteration with no DOM
 * dependencies, so it can be asserted in Node.
 */
export function siftContainerChildren(children: ReactNode): {
  titleEl: ReactElement | null;
  legendEl: ReactElement | null;
  tooltipLegendEl: ReactElement | null;
  overlay: ReactNode[];
} {
  let titleEl: ReactElement | null = null;
  let legendEl: ReactElement | null = null;
  let tooltipLegendEl: ReactElement | null = null;
  const overlay: ReactNode[] = [];

  const visit = (child: ReactNode): void => {
    if (isValidElement(child) && child.type === Fragment) {
      // Unwrap fragments recursively — fragments don't produce DOM nodes,
      // so a Title/Legend/TooltipLegend nested in one is still a layout-level sibling.
      Children.forEach((child as ReactElement<{ children?: ReactNode }>).props.children, visit);
      return;
    }
    if (isValidElement(child)) {
      if (child.type === Title) {
        titleEl = child;
        return;
      }
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
  return { titleEl, legendEl, tooltipLegendEl, overlay };
}

/**
 * Top-level React wrapper that creates a {@link ChartInstance} and provides it to children via context.
 * Owns the DOM container and canvas lifecycle; renders children as an overlay layer.
 *
 * Detects `<Title>`, `<TooltipLegend>`, and `<Legend>` children and positions them as:
 *   - Title + TooltipLegend — absolutely-positioned *overlays* stacked at the top of the canvas
 *     block, so the canvas (and therefore the grid) fills the full container height. The stacked
 *     height is measured and fed back into `chart.setPadding({ top })` so series data stays below
 *     them.
 *   - Legend — flex sibling at the bottom (or right, when `position="right"`), so its height is
 *     reserved by browser layout.
 */
export function ChartContainer({
  children,
  theme,
  axis,
  padding,
  gradient = true,
  interactive,
  grid,
  headerLayout = 'overlay',
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

  // Top-overlay height (title + info bar) — measured below. Declared here so
  // the padding effect can fold it into `padding.top`.
  const topOverlayRef = useRef<HTMLDivElement>(null);
  const [topOverlayHeight, setTopOverlayHeight] = useState(0);

  // In 'inline' mode the canvas itself is shorter (browser flex reserves the
  // header height), so adding topOverlayHeight here would double-shift the
  // data. Only the overlay mode needs the fold-in. Depend on `headerExtra`
  // below instead of `topOverlayHeight` so inline-mode header resizes don't
  // fire redundant `chart.setPadding(...)` calls (headerExtra stays 0).
  const headerExtra = headerLayout === 'overlay' ? topOverlayHeight : 0;

  useEffect(() => {
    const current = chartRef.current;
    if (!current) return;
    const userTop = padding?.top ?? 20;
    const merged: ChartOptions['padding'] = {
      top: userTop + headerExtra,
      ...(padding?.bottom !== undefined ? { bottom: padding.bottom } : {}),
      ...(padding?.right !== undefined ? { right: padding.right } : {}),
      ...(padding?.left !== undefined ? { left: padding.left } : {}),
    };
    current.setPadding(merged);
  }, [
    padding?.top,
    padding?.bottom,
    typeof padding?.right === 'object' ? padding.right.intervals : padding?.right,
    typeof padding?.left === 'object' ? padding.left.intervals : padding?.left,
    headerExtra,
  ]);

  useEffect(() => {
    if (chartRef.current && grid !== undefined) {
      chartRef.current.setGrid(grid);
    }
  }, [grid]);

  const chart = chartRef.current;

  const { titleEl, legendEl, tooltipLegendEl, overlay } = siftContainerChildren(children);
  const legendPosition = (legendEl as any)?.props?.position ?? 'bottom';
  const isLegendRight = legendPosition === 'right';

  const effectiveTheme = resolvedTheme ?? chart?.getTheme();
  const [gtop, gbot] = effectiveTheme?.chartGradient ?? ['transparent', 'transparent'];
  const bg = effectiveTheme?.background ?? 'transparent';
  const backgroundStyle = gradient ? `linear-gradient(to bottom, ${gtop} 0%, ${bg} 70%, ${gbot} 100%)` : bg;

  // Measure the stacked overlay (Title + TooltipLegend) height and feed it
  // into the padding effect above so data stays below them even though the
  // canvas itself fills the whole container. Only needed in 'overlay' mode —
  // 'inline' mode lets browser flex layout reserve header height directly,
  // so we skip the ResizeObserver entirely and clear any stale measurement.
  useLayoutEffect(() => {
    if (headerLayout !== 'overlay') {
      setTopOverlayHeight(0);
      return;
    }
    const el = topOverlayRef.current;
    if (!el) {
      // When neither Title nor TooltipLegend is present the overlay wrapper
      // isn't rendered — clear any stale measured height so `padding.top`
      // drops back to the user's configured value on the next effect run.
      setTopOverlayHeight(0);
      return;
    }
    const update = () => setTopOverlayHeight(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
    // `chart !== null` is in deps so the measurement re-runs once the
    // ChartInstance is attached — on the first pass the overlay wrapper is
    // gated behind `chart && (...)` so the ref is null; without this dep
    // React wouldn't re-fire when the overlay finally mounts.
  }, [titleEl !== null, tooltipLegendEl !== null, headerLayout, chart !== null]);

  const headerStack = (titleEl || tooltipLegendEl) && (
    <div
      data-chart-header=""
      data-chart-top-overlay={headerLayout === 'overlay' ? '' : undefined}
      ref={topOverlayRef}
      style={
        headerLayout === 'overlay'
          ? {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              // Lower than the series-overlay layer below, so the floating
              // <Tooltip> glass panel renders *above* Title/TooltipLegend
              // when the cursor hovers near them.
              zIndex: 2,
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
            }
          : {
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              pointerEvents: 'none',
            }
      }
    >
      {titleEl}
      {tooltipLegendEl}
    </div>
  );

  const chartInner = (
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
            {headerLayout === 'overlay' && headerStack}
            <div
              data-chart-series-overlay=""
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 3,
              }}
            >
              {overlay}
            </div>
          </ThemeProvider>
        </ChartContext.Provider>
      )}
    </div>
  );

  const canvasBlock =
    headerLayout === 'inline' ? (
      <div
        data-chart-canvas-block=""
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}
      >
        {chart && headerStack && (
          <ChartContext.Provider value={chart}>
            <ThemeProvider value={resolvedTheme ?? chart.getTheme()}>{headerStack}</ThemeProvider>
          </ChartContext.Provider>
        )}
        {chartInner}
      </div>
    ) : (
      chartInner
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

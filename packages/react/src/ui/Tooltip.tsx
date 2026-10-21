import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  type BandPoint,
  type ChartInstance,
  type ChartTheme,
  type OHLCData,
  type SeriesSnapshot,
  type TooltipFormatter,
  buildHoverSnapshots,
  computeTooltipPosition,
  formatRowTime,
  formatRowValue,
  formatTooltipHeader,
  resolveCandlestickBodyColor,
  rowFormatter,
} from '@wick-charts/core';

export { computeTooltipPosition } from '@wick-charts/core';

import { useChartInstance } from '../context';
import { useCrosshairPosition } from '../store-bridge';
import { NumberText } from './NumberText';

/** Sort order for multi-series tooltip values. */
export type TooltipSort = 'none' | 'asc' | 'desc';

/** Floor of the default box; it grows with its content up to the plot width. */
const TOOLTIP_MIN_WIDTH = 140;

interface BoxSize {
  width: number;
  height: number;
}

/** Border-box size of the node, `null` before it has a layout. */
function measureBox(node: HTMLElement): BoxSize | null {
  const width = node.offsetWidth;
  if (width === 0) return null;

  return { width, height: node.offsetHeight };
}

function sameBox(a: BoxSize | null, b: BoxSize | null): boolean {
  if (a === null || b === null) return a === b;

  return a.width === b.width && a.height === b.height;
}

/**
 * Border-box size of the tooltip box, measured after every render (a new size
 * re-renders before paint) and when its content resizes between renders.
 */
function useBoxSize(nodeRef: RefObject<HTMLElement | null>): BoxSize | null {
  const [size, setSize] = useState<BoxSize | null>(null);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const next = measureBox(node);
    setSize((prev) => (sameBox(prev, next) ? prev : next));
  });

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    // `contentRect` leaves out the padding and border, so read the border box from the node.
    const ro = new ResizeObserver(() => {
      const next = measureBox(node);
      setSize((prev) => (sameBox(prev, next) ? prev : next));
    });
    ro.observe(node);

    return () => ro.disconnect();
  }, [nodeRef]);

  return size;
}

/** Context passed to the {@link Tooltip} render-prop. */
export interface TooltipRenderContext {
  readonly snapshots: readonly SeriesSnapshot[];
  /** Crosshair timestamp — the tooltip is hover-only, so this is always a real hover time. */
  readonly time: number;
}

/**
 * Props for the {@link Tooltip} component.
 * Renders the built-in floating glass panel by default. Pass a render-prop
 * child to replace its *contents* — the positioned container (with flip/clamp)
 * stays.
 */
export interface TooltipProps {
  /** Sort order for line values (default: 'none'). */
  sort?: TooltipSort;
  /**
   * Custom formatter for every displayed number in the default UI. Called per
   * row with the field hint (`'open' | 'high' | 'low' | 'close' | 'volume' | 'value'`).
   * Defaults: adaptive precision for ohlc/value (no decimals when a series is
   * all whole numbers), compact (K/M/B/T) for volume.
   * Ignored when {@link children} is a render-prop.
   */
  format?: TooltipFormatter;
  /**
   * Render-prop escape hatch. Receives the hover snapshots and replaces the
   * built-in panel contents. The floating container (positioning, blur glass,
   * clamping) is preserved — use
   * [`computeTooltipPosition`](../../core/src/tooltip-position.ts) directly if
   * you need your own container.
   */
  children?: (ctx: TooltipRenderContext) => ReactNode;
}

/**
 * Floating near-cursor glass tooltip that appears while hovering the chart.
 *
 * Hover-only: without a crosshair position, the component renders `null`.
 * The companion {@link InfoBar} shows last-known values when no hover is active.
 */
export function Tooltip({ sort = 'none', format, children }: TooltipProps) {
  const chart = useChartInstance();
  const crosshair = useCrosshairPosition(chart);

  const [, bump] = useState(0);
  useLayoutEffect(() => {
    const onOverlayChange = () => bump((n) => n + 1);
    chart.on('overlayChange', onOverlayChange);
    // Rows read animated values (smoothing, fades, percent shares).
    chart.on('seriesFrame', onOverlayChange);
    if (chart.getSeriesIds().length > 0) bump((n) => n + 1);

    return () => {
      chart.off('overlayChange', onOverlayChange);
      chart.off('seriesFrame', onOverlayChange);
    };
  }, [chart]);

  if (!crosshair) return null;

  const snapshots = buildHoverSnapshots(chart, { time: crosshair.time, sort, cacheKey: 'tooltip' });
  if (snapshots.length === 0) return null;

  const theme = chart.getTheme();
  const dataInterval = chart.getDataInterval();
  const mediaSize = chart.getMediaSize();
  const chartLeft = chart.plotLeft;
  const chartWidth = chart.getLayout().chartArea.width;
  const chartHeight = mediaSize.height - chart.xAxisHeight;

  if (children) {
    return (
      <CustomFloatingTooltip
        x={crosshair.mediaX}
        y={crosshair.mediaY}
        chartLeft={chartLeft}
        chartWidth={chartWidth}
        chartHeight={chartHeight}
        theme={theme}
      >
        {/* `crosshair.time` is the semantic truth — snapshots[0].data.time
            shifts with `sort` and, for ragged multi-layer data, disagrees
            with the actual hover moment. */}
        {children({ snapshots, time: crosshair.time })}
      </CustomFloatingTooltip>
    );
  }

  return (
    <FloatingTooltip
      chart={chart}
      snapshots={snapshots}
      displayTime={crosshair.time}
      x={crosshair.mediaX}
      y={crosshair.mediaY}
      chartLeft={chartLeft}
      chartWidth={chartWidth}
      chartHeight={chartHeight}
      theme={theme}
      dataInterval={dataInterval}
      format={format}
    />
  );
}

function CustomFloatingTooltip({
  x,
  y,
  chartLeft,
  chartWidth,
  chartHeight,
  theme,
  children,
}: {
  x: number;
  y: number;
  chartLeft: number;
  chartWidth: number;
  chartHeight: number;
  theme: ChartTheme;
  children: ReactNode;
}) {
  // Custom content has no size to estimate, so the box stays hidden until it is measured.
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const size = useBoxSize(nodeRef);

  const position = size
    ? computeTooltipPosition({
        x,
        y,
        chartLeft,
        chartWidth,
        chartHeight,
        tooltipWidth: size.width,
        tooltipHeight: size.height,
      })
    : { left: chartLeft, top: 0 };

  return (
    <div
      ref={nodeRef}
      data-chart-tooltip=""
      data-measured={size ? 'true' : 'false'}
      style={{
        position: 'absolute',
        left: position.left,
        top: position.top,
        pointerEvents: 'none',
        background: theme.tooltip.background,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${theme.tooltip.borderColor}`,
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)',
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.tooltip.fontSize,
        fontVariantNumeric: 'tabular-nums',
        color: theme.tooltip.textColor,
        width: 'max-content',
        maxWidth: chartWidth,
        boxSizing: 'border-box',
        zIndex: 10,
        visibility: size ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>
  );
}

function FloatingTooltip({
  chart,
  snapshots,
  displayTime,
  x,
  y,
  chartLeft,
  chartWidth,
  chartHeight,
  theme,
  dataInterval,
  format,
}: {
  chart: ChartInstance;
  snapshots: readonly SeriesSnapshot[];
  displayTime: number;
  x: number;
  y: number;
  chartLeft: number;
  chartWidth: number;
  chartHeight: number;
  theme: ChartTheme;
  dataInterval: number;
  format: TooltipFormatter | undefined;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const measured = useBoxSize(boxRef);

  const hasOHLC = snapshots.some((s) => 'open' in s.data);
  const lineCount = snapshots.filter((s) => !('open' in s.data)).length;

  // Until the box is measured, estimate it: a band row carries two numbers, a percent-stack row a share and a value.
  const hasBand = snapshots.some((s) => 'high' in s.data && !('open' in s.data));
  const hasShare = snapshots.some((s) => s.share !== undefined);
  let estimatedWidth = 160;
  if (hasBand) estimatedWidth = 220;
  if (hasShare) estimatedWidth = 240;
  const estimatedHeight = hasOHLC ? 140 : 40 + lineCount * 22;
  const tooltipWidth = measured?.width ?? estimatedWidth;
  const tooltipHeight = measured?.height ?? estimatedHeight;

  const { left, top } = computeTooltipPosition({
    x,
    y,
    chartLeft,
    chartWidth,
    chartHeight,
    tooltipWidth,
    tooltipHeight,
  });

  // A date only means something on a time axis.
  const bg = theme.tooltip.background;
  const border = theme.tooltip.borderColor;
  const shadow = '0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)';

  return (
    <div
      ref={boxRef}
      data-chart-tooltip=""
      style={{
        position: 'absolute',
        left,
        top,
        pointerEvents: 'none',
        background: bg,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: shadow,
        fontSize: theme.tooltip.fontSize,
        fontFamily: theme.typography.fontFamily,
        fontVariantNumeric: 'tabular-nums',
        color: theme.tooltip.textColor,
        // `max-content` keeps the width independent of `left`, so the measured size is the size at any position.
        width: 'max-content',
        minWidth: TOOLTIP_MIN_WIDTH,
        maxWidth: chartWidth,
        boxSizing: 'border-box',
        zIndex: 10,
        transition: 'opacity 0.15s ease',
      }}
    >
      {/* Time header */}
      <div
        style={{
          fontSize: theme.axis.fontSize,
          color: theme.axis.textColor,
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: `1px solid ${border}`,
          letterSpacing: '0.02em',
        }}
      >
        {formatTooltipHeader(chart, { time: displayTime, snapshots, interval: dataInterval })}
      </div>

      {snapshots.map((s) => {
        const rowFormat = rowFormatter(chart, s, format);
        const rowTime = formatRowTime(chart, { time: displayTime, snapshots, interval: dataInterval, snapshot: s });
        const isOHLC = 'open' in s.data;
        if (isOHLC) {
          const ohlc = s.data as OHLCData;
          const isUp = ohlc.close >= ohlc.open;
          const valColor =
            theme.tooltip.valueColor ??
            resolveCandlestickBodyColor(isUp ? theme.candlestick.up.body : theme.candlestick.down.body);
          return (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
              {rowTime !== null && (
                <span style={{ gridColumn: '1 / -1' }}>
                  <RowTime text={rowTime} />
                </span>
              )}
              <TooltipRow label="Open" color={valColor} display={rowFormat(ohlc.open, 'open')} />
              <TooltipRow label="High" color={valColor} display={rowFormat(ohlc.high, 'high')} />
              <TooltipRow label="Low" color={valColor} display={rowFormat(ohlc.low, 'low')} />
              <TooltipRow label="Close" color={valColor} display={rowFormat(ohlc.close, 'close')} />
              {ohlc.volume != null && (
                <TooltipRow label="Volume" color={theme.tooltip.textColor} display={rowFormat(ohlc.volume, 'volume')} />
              )}
            </div>
          );
        }
        if ('high' in s.data) {
          const band = s.data as BandPoint;

          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              <span
                style={{
                  opacity: 0.6,
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.label ?? 'Range'}
              </span>
              {rowTime !== null && <RowTime text={rowTime} />}
              <span style={{ fontWeight: 600, color: theme.tooltip.valueColor ?? s.color, whiteSpace: 'nowrap' }}>
                <NumberText text={rowFormat(band.low, 'low')} /> – <NumberText text={rowFormat(band.high, 'high')} />
              </span>
            </div>
          );
        }
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: s.color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                opacity: 0.6,
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {s.label ?? 'Value'}
            </span>
            {rowTime !== null && <RowTime text={rowTime} />}
            <span style={{ fontWeight: 600, color: theme.tooltip.valueColor ?? s.color, whiteSpace: 'nowrap' }}>
              <NumberText text={formatRowValue(s, (v) => rowFormat(v, 'value'))} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The date of a row whose point is not the header's. */
function RowTime({ text }: { text: string }) {
  return <span style={{ opacity: 0.45, whiteSpace: 'nowrap' }}>{text}</span>;
}

function TooltipRow({ label, color, display }: { label: string; color: string; display: string }) {
  return (
    <>
      <span style={{ opacity: 0.5 }}>{label}</span>
      <span style={{ fontWeight: 600, color, textAlign: 'right' }}>
        <NumberText text={display} />
      </span>
    </>
  );
}

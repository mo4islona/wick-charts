import { type ReactNode, useLayoutEffect, useState } from 'react';

import {
  type ChartInstance,
  type HoverInfo,
  type PieHole,
  type SliceInfo,
  type ValueFormatter,
  formatCompact,
  pieCenterBox,
  pieCenterText,
  pieCenterValueFontSize,
  pieTotal,
} from '@wick-charts/core';

import { useChartInstance } from '../context';

/** Context passed to the {@link PieCenter} render-prop. */
export interface PieCenterRenderContext {
  /** Sum of the slice values. */
  readonly total: number;
  readonly slices: readonly SliceInfo[];
  /** The slice under the pointer, or null. */
  readonly hovered: HoverInfo | null;
  readonly format: ValueFormatter;
  /** The disk and hole, in CSS pixels. */
  readonly hole: PieHole;
}

export interface PieCenterProps {
  /**
   * Owning series id. **Optional** — when omitted, the first visible pie
   * series is picked.
   */
  seriesId?: string;
  /** Caption under the total, e.g. `'Total sessions'`. Default: none. */
  label?: string;
  /** Formatter for the total and the hovered value. Default: shared `formatCompact`. */
  format?: ValueFormatter;
  /** Show the hovered slice instead of the total while the pointer is on a slice. Default `true`. */
  followHover?: boolean;
  /** Render-prop escape hatch — replaces the default text; the hole still positions and sizes the box. */
  children?: (ctx: PieCenterRenderContext) => ReactNode;
}

function resolvePieSeriesId(chart: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const pies = chart.getSeriesIdsByType('pie', { visibleOnly: true });

  return pies.length > 0 ? pies[0] : null;
}

/**
 * Content in the hole of a donut: the total by default, the hovered slice while
 * the pointer is on one. Renders nothing for a pie without a hole
 * (`innerRadiusRatio: 0`).
 */
export function PieCenter({ seriesId, label, format = formatCompact, followHover = true, children }: PieCenterProps) {
  const chart = useChartInstance();

  const [, setBumpSignal] = useState(0);
  useLayoutEffect(() => {
    const handler = () => setBumpSignal((n) => n + 1);
    chart.on('overlayChange', handler);
    chart.on('seriesHover', handler);
    if (chart.getSeriesIds().length > 0) handler();

    return () => {
      chart.off('overlayChange', handler);
      chart.off('seriesHover', handler);
    };
  }, [chart]);

  const resolvedId = resolvePieSeriesId(chart, seriesId);
  const hole = resolvedId !== null ? chart.getPieHole(resolvedId) : null;
  const slices = resolvedId !== null ? chart.getSliceInfo(resolvedId) : null;
  if (!hole || !slices || slices.length === 0) return null;

  const theme = chart.getTheme();
  const box = pieCenterBox(hole, theme);
  if (!box) return null;

  const hoverInfo = resolvedId !== null && followHover ? chart.getHoverInfo(resolvedId) : null;
  const boxStyle = {
    position: 'absolute' as const,
    left: box.left,
    top: box.top,
    width: box.size,
    height: box.size,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
    overflow: 'hidden',
    pointerEvents: 'none' as const,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.fontSize,
    color: theme.tooltip.textColor,
  };

  if (children) {
    const total = pieTotal(slices);

    return (
      <div data-chart-pie-center="" style={boxStyle}>
        {children({ total, slices, hovered: hoverInfo, format, hole })}
      </div>
    );
  }

  const text = pieCenterText({ slices, hovered: hoverInfo, format, label });

  return (
    <div data-chart-pie-center="" style={boxStyle}>
      <div
        style={{
          fontSize: pieCenterValueFontSize(box, text.value),
          fontWeight: 600,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
        }}
      >
        {text.value}
      </div>
      {text.caption && (
        <div style={{ fontSize: box.captionFontSize, opacity: 0.6, marginTop: 2, lineHeight: 1.2 }}>{text.caption}</div>
      )}
    </div>
  );
}

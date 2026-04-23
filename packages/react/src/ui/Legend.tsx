import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { ChartInstance, LegendItem } from '@wick-charts/core';

import { useChartInstance } from '../context';
import { useTheme } from '../ThemeContext';

/**
 * Minimal visual shape the {@link LegendProps.items} override accepts — just
 * the pieces the built-in swatch/label UI needs. The canonical
 * {@link LegendItem} (re-exported from `@wick-charts/core`) carries full
 * identity plus `toggle`/`isolate` closures; those aren't meaningful when a
 * consumer hands in a pre-baked, non-interactive legend.
 */
export interface LegendItemOverride {
  label: string;
  color: string;
}

/**
 * Legend interaction mode.
 * - `'toggle'` — click toggles the clicked item on/off (default).
 * - `'isolate'` — click shows only that item; click again shows all.
 * - `'solo'` — **@deprecated** alias for `'isolate'`, kept for back-compat.
 */
export type LegendMode = 'toggle' | 'isolate' | 'solo';

/** Context passed to the {@link Legend} render-prop. */
export interface LegendRenderContext {
  readonly items: readonly LegendItem[];
}

export interface LegendProps {
  /**
   * Static override for auto-detected items. Renders a non-interactive legend
   * with just swatch + label. Ignored when {@link children} is a render-prop.
   */
  items?: LegendItemOverride[];
  /** Layout position. Default: 'bottom'. */
  position?: 'bottom' | 'right';
  /** Click behavior for the built-in UI. Default: `'toggle'`. Ignored when {@link children} is provided. */
  mode?: LegendMode;
  /**
   * Render-prop escape hatch. Receives the computed `items` (each carrying
   * its own `toggle()` / `isolate()` closures) and fully replaces the
   * built-in flex row / column. Callers can filter, reorder, and re-style
   * without reimplementing visibility wiring.
   */
  children?: (ctx: LegendRenderContext) => ReactNode;
}

interface BuildArgs {
  chart: ChartInstance;
  isolatedIdRef: { current: string | null };
  setIsolatedId: (v: string | null) => void;
}

function buildLegendItems({ chart, isolatedIdRef, setIsolatedId }: BuildArgs): LegendItem[] {
  const items: LegendItem[] = [];
  const seriesIds = chart.getSeriesIds();

  for (const seriesId of seriesIds) {
    const layers = chart.getSeriesLayers(seriesId);
    if (layers) {
      const baseLabel = chart.getSeriesLabel(seriesId);
      for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
        const id = `${seriesId}_layer${layerIndex}`;
        const visible = chart.isSeriesVisible(seriesId) && chart.isLayerVisible(seriesId, layerIndex);
        items.push(
          makeItem({
            id,
            seriesId,
            layerIndex,
            label: baseLabel ? `${baseLabel} ${layerIndex + 1}` : `Series ${layerIndex + 1}`,
            color: layers[layerIndex].color,
            isDisabled: !visible,
            chart,
            isolatedIdRef,
            setIsolatedId,
          }),
        );
      }
    } else {
      const color = chart.getSeriesColor(seriesId);
      if (!color) continue;

      const label = chart.getSeriesLabel(seriesId);
      const visible = chart.isSeriesVisible(seriesId);
      items.push(
        makeItem({
          id: seriesId,
          seriesId,
          layerIndex: undefined,
          label: label ?? 'Series',
          color,
          isDisabled: !visible,
          chart,
          isolatedIdRef,
          setIsolatedId,
        }),
      );
    }
  }

  return items;
}

interface MakeItemArgs {
  id: string;
  seriesId: string;
  layerIndex: number | undefined;
  label: string;
  color: string;
  isDisabled: boolean;
  chart: ChartInstance;
  isolatedIdRef: { current: string | null };
  setIsolatedId: (v: string | null) => void;
}

function makeItem(args: MakeItemArgs): LegendItem {
  const { id, seriesId, layerIndex, label, color, isDisabled, chart, isolatedIdRef, setIsolatedId } = args;

  const toggle = () => {
    if (layerIndex !== undefined) {
      chart.setLayerVisible(seriesId, layerIndex, !chart.isLayerVisible(seriesId, layerIndex));
    } else {
      chart.setSeriesVisible(seriesId, !chart.isSeriesVisible(seriesId));
    }
  };

  const isolate = () => {
    if (isolatedIdRef.current === id) {
      chart.batch(() => {
        for (const sid of chart.getSeriesIds()) {
          chart.setSeriesVisible(sid, true);
          const layers = chart.getSeriesLayers(sid);
          if (layers) {
            for (let i = 0; i < layers.length; i++) chart.setLayerVisible(sid, i, true);
          }
        }
      });
      // Mutate the ref synchronously so a back-to-back second `isolate()`
      // sees the unisolated state even before React's re-render commits.
      isolatedIdRef.current = null;
      setIsolatedId(null);

      return;
    }

    chart.batch(() => {
      for (const sid of chart.getSeriesIds()) {
        const layers = chart.getSeriesLayers(sid);
        if (layers) {
          chart.setSeriesVisible(sid, sid === seriesId);
          for (let i = 0; i < layers.length; i++) {
            chart.setLayerVisible(sid, i, sid === seriesId && i === layerIndex);
          }
        } else {
          chart.setSeriesVisible(sid, sid === id);
        }
      }
    });
    isolatedIdRef.current = id;
    setIsolatedId(id);
  };

  return { id, seriesId, layerIndex, label, color, isDisabled, toggle, isolate };
}

export function Legend({ items, position = 'bottom', mode = 'toggle', children }: LegendProps) {
  const chart = useChartInstance();
  const theme = useTheme();
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const [bumpSignal, setBumpSignal] = useState(0);

  // Closure bound to every LegendItem.isolate() reads live state through this
  // ref, not the captured-at-render value, so a second click correctly sees
  // `isolatedId` even when the component hasn't re-rendered yet.
  const isolatedIdRef = useRef(isolatedId);
  isolatedIdRef.current = isolatedId;

  useLayoutEffect(() => {
    const onOverlayChange = () => setBumpSignal((n) => n + 1);
    const onSeriesChange = () => setIsolatedId(null);
    chart.on('overlayChange', onOverlayChange);
    chart.on('seriesChange', onSeriesChange);
    // Catch-up: a sibling series' layout effect may have registered data in
    // the same commit. Bump so the next synchronous render picks it up.
    if (chart.getSeriesIds().length > 0) setBumpSignal((n) => n + 1);

    return () => {
      chart.off('overlayChange', onOverlayChange);
      chart.off('seriesChange', onSeriesChange);
    };
  }, [chart]);

  const legendItems = useMemo(
    () => buildLegendItems({ chart, isolatedIdRef, setIsolatedId }),
    // biome-ignore lint/correctness/useExhaustiveDependencies: `bumpSignal` is the subscription signal; isolatedId triggers the opacity-only refresh
    [chart, isolatedId, bumpSignal],
  );

  const isRight = position === 'right';
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: isRight ? 'column' : 'row',
    flexWrap: 'wrap',
    gap: isRight ? 6 : 14,
    padding: isRight ? '8px 6px' : '6px 8px',
    alignItems: isRight ? 'flex-start' : 'center',
    justifyContent: isRight ? 'flex-start' : 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.axis.fontSize,
    color: theme.axis.textColor,
    pointerEvents: 'auto',
    flexShrink: 0,
  };

  if (children) {
    if (legendItems.length === 0) return null;

    return (
      <div data-legend={position} style={containerStyle}>
        {children({ items: legendItems })}
      </div>
    );
  }

  if (items) {
    if (items.length === 0) return null;

    return (
      <div data-legend={position} style={containerStyle}>
        {items.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static override — caller chose the order
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
          </div>
        ))}
      </div>
    );
  }

  if (legendItems.length === 0) return null;

  const handleClick = (item: LegendItem) => {
    if (mode === 'isolate' || mode === 'solo') item.isolate();
    else item.toggle();
  };

  return (
    <div data-legend={position} style={containerStyle}>
      {legendItems.map((item) => (
        <div
          key={item.id}
          onClick={() => handleClick(item)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            opacity: item.isDisabled ? 0.35 : 1,
            transition: 'opacity 0.15s ease',
            userSelect: 'none',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

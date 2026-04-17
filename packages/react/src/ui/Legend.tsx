import { useEffect, useLayoutEffect, useState } from 'react';

import { useChartInstance } from '../context';
import { useTheme } from '../ThemeContext';

export interface LegendItem {
  label: string;
  color: string;
}

interface ResolvedItem extends LegendItem {
  seriesId: string;
  layerIndex: number;
  isLayer: boolean; // true = layer within multi-layer, false = whole series
}

export interface LegendProps {
  /** Override auto-detected items. When omitted, derived from series layers. */
  items?: LegendItem[];
  /** Layout position. Default: 'bottom'. */
  position?: 'bottom' | 'right';
  /**
   * Click behavior:
   * - `'toggle'` — click toggles individual items on/off (default)
   * - `'solo'` — click shows only that item; click again shows all
   */
  mode?: 'toggle' | 'solo';
}

export function Legend({ items, position = 'bottom', mode = 'toggle' }: LegendProps) {
  const chart = useChartInstance();
  const theme = useTheme();
  const [disabled, setDisabled] = useState<Set<number>>(new Set());
  const [, bump] = useState(0);

  useLayoutEffect(() => {
    const onSeriesChange = () => {
      bump((n) => n + 1);
      setDisabled(new Set()); // reset toggles — series list changed
    };
    const onDataUpdate = () => bump((n) => n + 1);
    chart.on('seriesChange', onSeriesChange);
    chart.on('dataUpdate', onDataUpdate);
    // Catch-up: series may already be registered by sibling useLayoutEffects
    // that fired earlier in tree order. Bump so the next synchronous re-render
    // picks them up before the browser paints.
    if (chart.getSeriesIds().length > 0) bump((n) => n + 1);
    return () => {
      chart.off('seriesChange', onSeriesChange);
      chart.off('dataUpdate', onDataUpdate);
    };
  }, [chart]);

  const resolved: ResolvedItem[] =
    items?.map((item, i) => ({ ...item, seriesId: '', layerIndex: i, isLayer: false })) ??
    (() => {
      const result: ResolvedItem[] = [];
      for (const id of chart.getSeriesIds()) {
        const layers = chart.getSeriesLayers(id);
        if (layers) {
          const baseLabel = chart.getSeriesLabel(id);
          for (let i = 0; i < layers.length; i++) {
            result.push({
              label: baseLabel ? `${baseLabel} ${i + 1}` : `Series ${i + 1}`,
              color: layers[i].color,
              seriesId: id,
              layerIndex: i,
              isLayer: true,
            });
          }
        } else {
          const color = chart.getSeriesColor(id);
          const label = chart.getSeriesLabel(id);
          if (color) result.push({ label: label ?? 'Series', color, seriesId: id, layerIndex: 0, isLayer: false });
        }
      }
      return result;
    })();

  if (resolved.length === 0) return null;

  const apply = (next: Set<number>) => {
    setDisabled(next);
    chart.batch(() => {
      for (let i = 0; i < resolved.length; i++) {
        const item = resolved[i];
        if (!item.seriesId) continue;
        if (item.isLayer) {
          chart.setLayerVisible(item.seriesId, item.layerIndex, !next.has(i));
        } else {
          chart.setSeriesVisible(item.seriesId, !next.has(i));
        }
      }
    });
  };

  const handleClick = (index: number) => {
    if (mode === 'solo') {
      // Solo: if already solo'd on this one → show all, otherwise solo it
      const allOthersOff = resolved.every((_, i) => i === index || disabled.has(i));
      if (allOthersOff) {
        apply(new Set());
      } else {
        const next = new Set(resolved.map((_, i) => i));
        next.delete(index);
        apply(next);
      }
    } else {
      // Toggle
      const s = new Set(disabled);
      if (s.has(index)) s.delete(index);
      else s.add(index);
      apply(s);
    }
  };

  const isRight = position === 'right';

  return (
    <div
      data-legend={position}
      style={{
        display: 'flex',
        flexDirection: isRight ? 'column' : 'row',
        flexWrap: 'wrap',
        gap: isRight ? 6 : 14,
        padding: isRight ? '8px 6px' : '6px 8px',
        alignItems: isRight ? 'flex-start' : 'center',
        justifyContent: isRight ? 'flex-start' : 'center',
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.axisFontSize,
        color: theme.axis.textColor,
        pointerEvents: 'auto',
        flexShrink: 0,
      }}
    >
      {resolved.map((item, i) => {
        const isDisabled = disabled.has(i);
        const interactive = !!item.seriesId;
        return (
          <div
            key={i}
            onClick={interactive ? () => handleClick(i) : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: interactive ? 'pointer' : 'default',
              opacity: isDisabled ? 0.35 : 1,
              transition: 'opacity 0.15s ease',
              userSelect: 'none',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: item.color,
                flexShrink: 0,
              }}
            />
            <span style={{ whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

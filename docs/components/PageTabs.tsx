// Two-tab strip for chart component pages — "Demos" (existing playground) and
// "API" (auto-generated table). MUI uses the same shape on
// material-ui/react-autocomplete vs material-ui/api/autocomplete.

import { type ReactNode, useEffect, useState } from 'react';

import type { ChartTheme } from '@wick-charts/react';

export type ChartTab = 'demos' | 'api';

const TABS: { id: ChartTab; label: string }[] = [
  { id: 'demos', label: 'Demos' },
  { id: 'api', label: 'API' },
];

/**
 * Stores the active tab in localStorage so a reader who toggles to API while
 * researching props doesn't get bounced back to Demos by every navigation.
 */
function usePersistedTab(storageKey: string, fallback: ChartTab): [ChartTab, (t: ChartTab) => void] {
  const [tab, setTab] = useState<ChartTab>(() => {
    if (typeof window === 'undefined') return fallback;
    const saved = window.localStorage.getItem(storageKey);
    if (saved === 'demos' || saved === 'api') return saved;

    return fallback;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, tab);
    } catch {
      // ignore storage failures
    }
  }, [storageKey, tab]);

  return [tab, setTab];
}

export function PageTabs({
  storageKey,
  theme,
  children,
}: {
  storageKey: string;
  theme: ChartTheme;
  children: (tab: ChartTab) => ReactNode;
}) {
  const [tab, setTab] = usePersistedTab(storageKey, 'demos');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: 4,
          padding: '4px 14px 0',
          borderBottom: `1px solid ${theme.tooltip.borderColor}`,
          flexShrink: 0,
        }}
      >
        {TABS.map((t) => {
          const active = t.id === tab;

          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? `2px solid ${theme.line.color}` : '2px solid transparent',
                marginBottom: -1,
                color: active ? theme.tooltip.textColor : theme.axis.textColor,
                fontFamily: 'inherit',
                fontSize: theme.typography.fontSize,
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                opacity: active ? 1 : 0.7,
                transition: 'opacity 0.1s, color 0.1s',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children(tab)}</div>
    </div>
  );
}

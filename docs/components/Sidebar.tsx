import { cloneElement, isValidElement } from 'react';

import type { ChartTheme } from '@wick-charts/react';
import {
  Activity,
  BarChart3,
  CandlestickChart,
  FlaskConical,
  LayoutDashboard,
  Palette,
  PieChart,
  TrendingUp,
  X,
} from 'lucide-react';

import { hexToRgba } from '../utils';
import { FrameworkSelect } from './FrameworkSelect';

export type Route = 'dashboard' | 'candlestick' | 'line' | 'bar' | 'pie' | 'sparkline' | 'theme' | 'stress-test';

const BASE_NAV: { route: Route; label: string; icon: React.ReactNode }[] = [
  { route: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
  { route: 'candlestick', label: 'Candlestick', icon: <CandlestickChart size={16} /> },
  { route: 'line', label: 'Line & Area', icon: <TrendingUp size={16} /> },
  { route: 'bar', label: 'Bar Chart', icon: <BarChart3 size={16} /> },
  { route: 'pie', label: 'Pie & Donut', icon: <PieChart size={16} /> },
  { route: 'sparkline', label: 'Sparkline', icon: <Activity size={16} /> },
  { route: 'theme', label: 'Custom Theme', icon: <Palette size={16} /> },
];

// The stress-test page is always routable via `#stress-test` but only visible
// in the sidebar during `pnpm dev`.
const NAV: { route: Route; label: string; icon: React.ReactNode }[] = import.meta.env.DEV
  ? [...BASE_NAV, { route: 'stress-test', label: 'Stress', icon: <FlaskConical size={16} /> }]
  : BASE_NAV;

export function Sidebar({
  route,
  onNavigate,
  collapsed,
  onToggle,
  theme,
  mobile = false,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  collapsed: boolean;
  onToggle: () => void;
  theme: ChartTheme;
  mobile?: boolean;
}) {
  const bg = theme.tooltip.background;
  const border = theme.tooltip.borderColor;
  const accent = theme.line.color;

  const navIconSize = mobile ? 18 : 16;
  const itemPadding = mobile ? '12px 14px' : collapsed ? '8px 0' : '8px 10px';
  const fontSize = mobile ? theme.typography.fontSize + 1 : theme.typography.fontSize;

  return (
    <div
      style={{
        width: mobile ? 'min(280px, 80vw)' : collapsed ? 48 : 180,
        height: '100%',
        transition: mobile ? 'none' : 'width 0.2s ease',
        background: bg,
        borderRight: `1px solid ${border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {mobile && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderBottom: `1px solid ${border}`,
            color: theme.tooltip.textColor,
          }}
        >
          <span style={{ fontSize: theme.typography.fontSize + 2, fontWeight: 600, letterSpacing: '-0.01em' }}>
            Wick Charts
          </span>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onToggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              background: 'transparent',
              color: theme.axis.textColor,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <nav style={{ flex: 1, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(({ route: r, label, icon }) => {
          const active = r === route;
          const sized = mobile ? <span style={{ display: 'inline-flex' }}>{withSize(icon, navIconSize)}</span> : icon;

          return (
            <button
              type="button"
              key={r}
              onClick={() => onNavigate(r)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: mobile ? 12 : 10,
                padding: itemPadding,
                justifyContent: collapsed && !mobile ? 'center' : 'flex-start',
                background: active ? hexToRgba(theme.crosshair.labelBackground, 0.8) : 'transparent',
                color: active ? theme.tooltip.textColor : theme.crosshair.labelTextColor,
                border: 'none',
                borderLeft: active ? `2px solid ${accent}` : '2px solid transparent',
                borderRadius: 4,
                fontSize,
                fontFamily: 'inherit',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                transition: 'background 0.1s, color 0.1s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = hexToRgba(theme.crosshair.labelBackground, 0.3);
              }}
              onMouseLeave={(e) => {
                if (!active)
                  e.currentTarget.style.background = active
                    ? hexToRgba(theme.crosshair.labelBackground, 0.8)
                    : 'transparent';
              }}
            >
              <span
                style={{
                  width: mobile ? 22 : 20,
                  textAlign: 'center',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {sized}
              </span>
              {(!collapsed || mobile) && <span>{label}</span>}
            </button>
          );
        })}
      </nav>

      <div
        style={{
          padding: mobile ? '10px 14px' : collapsed ? '6px 4px' : '6px 10px',
          borderTop: `1px solid ${border}`,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <FrameworkSelect theme={theme} compact />
      </div>

      {!mobile && (
        <button
          type="button"
          onClick={onToggle}
          style={{
            padding: 10,
            background: 'transparent',
            color: theme.axis.textColor,
            border: 'none',
            borderTop: `1px solid ${border}`,
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: 'inherit',
            transition: 'color 0.1s',
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      )}
    </div>
  );
}

function withSize(icon: React.ReactNode, size: number): React.ReactNode {
  if (isValidElement<{ size?: number }>(icon)) {
    return cloneElement(icon, { size });
  }

  return icon;
}

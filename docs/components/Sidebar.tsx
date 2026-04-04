import type { ChartTheme } from '@wick-charts/react';
import { BarChart3, CandlestickChart, LayoutDashboard, Palette, PieChart, TrendingUp } from 'lucide-react';

import { hexToRgba } from '../utils';

export type Route = 'dashboard' | 'candlestick' | 'line' | 'bar' | 'pie' | 'theme';

const NAV: { route: Route; label: string; icon: React.ReactNode }[] = [
  { route: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
  { route: 'candlestick', label: 'Candlestick', icon: <CandlestickChart size={16} /> },
  { route: 'line', label: 'Line & Area', icon: <TrendingUp size={16} /> },
  { route: 'bar', label: 'Bar Chart', icon: <BarChart3 size={16} /> },
  { route: 'pie', label: 'Pie & Donut', icon: <PieChart size={16} /> },
  { route: 'theme', label: 'Custom Theme', icon: <Palette size={16} /> },
];

export function Sidebar({
  route,
  onNavigate,
  collapsed,
  onToggle,
  theme,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  collapsed: boolean;
  onToggle: () => void;
  theme: ChartTheme;
}) {
  const bg = theme.tooltip.background;
  const border = theme.tooltip.borderColor;
  const accent = theme.line.color;

  return (
    <div
      style={{
        width: collapsed ? 48 : 180,
        transition: 'width 0.2s ease',
        background: bg,
        borderRight: `1px solid ${border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Nav items */}
      <nav style={{ flex: 1, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(({ route: r, label, icon }) => {
          const active = r === route;
          return (
            <button
              type="button"
              key={r}
              onClick={() => onNavigate(r)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: collapsed ? '8px 0' : '8px 10px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: active ? hexToRgba(theme.crosshair.labelBackground, 0.8) : 'transparent',
                color: active ? theme.tooltip.textColor : theme.crosshair.labelTextColor,
                border: 'none',
                borderLeft: active ? `2px solid ${accent}` : '2px solid transparent',
                borderRadius: 4,
                fontSize: theme.typography.fontSize,
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
                  width: 20,
                  textAlign: 'center',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {icon}
              </span>
              {!collapsed && <span>{label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
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
    </div>
  );
}

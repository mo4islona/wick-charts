import type { ChartTheme } from '@wick-charts/react';

import { themes } from '../themes';
import { hexToRgba } from '../utils';

export function ThemeDots({ t }: { t: ChartTheme }) {
  return (
    <span style={{ display: 'flex', gap: 3 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.candlestick.upColor }} />
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.line.color }} />
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.candlestick.downColor }} />
    </span>
  );
}

export function ThemeListHeader({ children, theme }: { children: React.ReactNode; theme: ChartTheme }) {
  return (
    <div
      style={{
        fontSize: theme.typography.axisFontSize,
        color: theme.axis.textColor,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight: 600,
        padding: '4px 8px 10px',
        borderBottom: `1px solid ${theme.tooltip.borderColor}`,
        marginBottom: 2,
      }}
    >
      {children}
    </div>
  );
}

export function ThemeList({
  label,
  names,
  value,
  onChange,
  theme,
}: {
  label?: string;
  names: string[];
  value: string | null;
  onChange: (v: string) => void;
  theme: ChartTheme;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {label && <ThemeListHeader theme={theme}>{label}</ThemeListHeader>}
      {names.map((name) => {
        const preset = themes[name];
        const t = preset.theme;
        const active = name === value;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              background: active ? hexToRgba(theme.crosshair.labelBackground, 0.8) : 'transparent',
              color: active ? theme.tooltip.textColor : theme.crosshair.labelTextColor,
              border: 'none',
              padding: '7px 10px',
              borderRadius: 5,
              fontSize: theme.typography.fontSize,
              fontFamily: 'inherit',
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = hexToRgba(theme.crosshair.labelBackground, 0.4);
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = 'transparent';
            }}
          >
            <ThemeDots t={t} />
            <span style={{ flex: 1 }}>{name}</span>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                background: `linear-gradient(135deg, ${t.chartGradient[0]}, ${t.background})`,
                border: '1px solid rgba(128,128,128,0.3)',
                flexShrink: 0,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

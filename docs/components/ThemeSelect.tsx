import { useEffect, useState } from 'react';

import { type ChartTheme, themes } from '@wick-charts/react';

import { hexToRgba } from '../utils';

const allNames = Object.keys(themes);
const darkThemes = allNames.filter((n) => themes[n].dark);
const lightThemes = allNames.filter((n) => !themes[n].dark);

export function ThemeSelect({
  value,
  onChange,
  theme,
  mobile = false,
}: {
  value: string;
  onChange: (v: string) => void;
  theme: ChartTheme;
  mobile?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Keyboard shortcut: ] next theme, [ prev theme
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'BracketRight' || e.code === 'BracketLeft') {
        e.preventDefault();
        const idx = allNames.indexOf(value);
        const next =
          e.code === 'BracketRight' ? (idx + 1) % allNames.length : (idx - 1 + allNames.length) % allNames.length;
        onChange(allNames[next]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [value, onChange]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        type="button"
        aria-label={`Theme: ${value}`}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: theme.crosshair.labelBackground,
          color: theme.tooltip.textColor,
          border: `1px solid ${theme.tooltip.borderColor}`,
          borderRadius: 6,
          height: 36,
          padding: '0 16px',
          fontSize: theme.typography.fontSize,
          fontFamily: 'inherit',
          fontWeight: 500,
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <ThemeDots t={themes[value].theme} />
        {!mobile && value}
        <span style={{ opacity: 0.4, fontSize: theme.typography.axisFontSize, marginLeft: mobile ? 0 : 2 }}>▾</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: theme.tooltip.background,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${theme.tooltip.borderColor}`,
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
              padding: 16,
              zIndex: 100,
              display: 'flex',
              flexDirection: mobile ? 'column' : 'row',
              gap: mobile ? 16 : 32,
              minWidth: mobile ? undefined : 520,
              maxHeight: 'calc(100vh - 80px)',
              overflowY: 'auto',
              paddingBottom: 36,
              ...(mobile ? { left: 0, right: 0, position: 'fixed' as const, top: 50, marginTop: 0 } : {}),
            }}
          >
            <ThemeColumn
              label="Light"
              names={lightThemes}
              value={value}
              onChange={(v) => {
                onChange(v);
                setOpen(false);
              }}
              theme={theme}
            />
            <ThemeColumn
              label="Dark"
              names={darkThemes}
              value={value}
              onChange={(v) => {
                onChange(v);
                setOpen(false);
              }}
              theme={theme}
            />
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '8px 16px',
                borderTop: `1px solid ${theme.tooltip.borderColor}`,
                fontSize: theme.typography.axisFontSize,
                color: theme.crosshair.labelTextColor,
                opacity: 0.5,
                textAlign: 'center',
              }}
            >
              <span style={{ marginRight: 4 }}>&#9000;</span> Press{' '}
              <kbd
                style={{
                  padding: '1px 5px',
                  borderRadius: 3,
                  border: `1px solid ${theme.tooltip.borderColor}`,
                  background: hexToRgba(theme.crosshair.labelBackground, 0.5),
                }}
              >
                [
              </kbd>{' '}
              <kbd
                style={{
                  padding: '1px 5px',
                  borderRadius: 3,
                  border: `1px solid ${theme.tooltip.borderColor}`,
                  background: hexToRgba(theme.crosshair.labelBackground, 0.5),
                }}
              >
                ]
              </kbd>{' '}
              to switch themes
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ThemeColumn({
  label,
  names,
  value,
  onChange,
  theme,
}: {
  label: string;
  names: string[];
  value: string;
  onChange: (v: string) => void;
  theme: ChartTheme;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
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
        {label}
      </div>
      {names.map((name) => {
        const preset = themes[name];
        const t = preset.theme;
        const active = name === value;
        return (
          <button
            key={name}
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

function ThemeDots({ t }: { t: ChartTheme }) {
  return (
    <span style={{ display: 'flex', gap: 3 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.candlestick.upColor }} />
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.line.color }} />
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.candlestick.downColor }} />
    </span>
  );
}

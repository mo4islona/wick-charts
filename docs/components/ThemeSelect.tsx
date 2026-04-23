import { useEffect, useState } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { themes } from '../themes';
import { hexToRgba } from '../utils';
import { ThemeDots, ThemeList } from './ThemeList';

const allNames = Object.keys(themes);
const darkThemes = allNames.filter((n) => themes[n].dark);
const lightThemes = allNames.filter((n) => !themes[n].dark);

export function ThemeSelect({
  value,
  onChange,
  theme,
  mobile = false,
  custom = false,
}: {
  value: string;
  onChange: (v: string) => void;
  theme: ChartTheme;
  mobile?: boolean;
  /** When true, the trigger shows "Custom" and dots from the live theme; pressing any preset in the list clears the custom state. */
  custom?: boolean;
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
          background: hexToRgba(theme.crosshair.labelBackground, 0.45),
          color: theme.tooltip.textColor,
          border: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.5)}`,
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
        <ThemeDots t={custom ? theme : themes[value].theme} />
        {!mobile &&
          (custom ? (
            <span>
              Custom <span style={{ opacity: 0.5, fontWeight: 400 }}>from {value}</span>
            </span>
          ) : (
            value
          ))}
        <span style={{ opacity: 0.4, fontSize: theme.axis.fontSize, marginLeft: mobile ? 0 : 2 }}>▾</span>
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
            <ThemeList
              label="Light"
              names={lightThemes}
              value={custom ? null : value}
              onChange={(v) => {
                onChange(v);
                setOpen(false);
              }}
              theme={theme}
            />
            <ThemeList
              label="Dark"
              names={darkThemes}
              value={custom ? null : value}
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
                fontSize: theme.axis.fontSize,
                color: theme.crosshair.labelTextColor,
                opacity: 0.5,
                textAlign: 'center',
              }}
            >
              Press
              <kbd
                style={{
                  display: 'inline-block',
                  margin: '0 0 0 4px',
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: `1px solid ${theme.tooltip.borderColor}`,
                  borderBottomWidth: 2,
                  background: hexToRgba(theme.crosshair.labelBackground, 0.5),
                  boxShadow: `inset 0 1px 0 ${hexToRgba(theme.crosshair.labelBackground, 0.9)}, 0 1px 0 ${theme.tooltip.borderColor}`,
                }}
              >
                [
              </kbd>
              <kbd
                style={{
                  display: 'inline-block',
                  margin: '0 4px 0 3px',
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: `1px solid ${theme.tooltip.borderColor}`,
                  borderBottomWidth: 2,
                  background: hexToRgba(theme.crosshair.labelBackground, 0.5),
                  boxShadow: `inset 0 1px 0 ${hexToRgba(theme.crosshair.labelBackground, 0.9)}, 0 1px 0 ${theme.tooltip.borderColor}`,
                }}
              >
                ]
              </kbd>
              to switch themes
            </div>
          </div>
        </>
      )}
    </div>
  );
}

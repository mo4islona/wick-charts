import { type CSSProperties, useState } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { hexToRgba } from '../utils';

// ── Shared styles ────────────────────────────────────────────

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  minHeight: 28,
};

function Label({ children, theme }: { children: React.ReactNode; theme: ChartTheme }) {
  return (
    <span
      style={{
        fontSize: 11,
        color: theme.axis.textColor,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

// ── Select ───────────────────────────────────────────────────

export function Select({
  label,
  options,
  value,
  onChange,
  theme,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  theme: ChartTheme;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <div style={row}>
      <Label theme={theme}>{label}</Label>
      <div style={{ position: 'relative', flex: 1, maxWidth: 160 }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            background: hexToRgba(theme.crosshair.labelBackground, 0.6),
            color: theme.tooltip.textColor,
            border: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.6)}`,
            borderRadius: 5,
            padding: '4px 8px',
            fontSize: 11,
            fontFamily: 'inherit',
            fontWeight: 500,
            cursor: 'pointer',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = hexToRgba(theme.line.color, 0.5);
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = hexToRgba(theme.tooltip.borderColor, 0.6);
          }}
        >
          <span>{current?.label}</span>
          <span
            style={{
              opacity: 0.35,
              fontSize: 8,
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s',
            }}
          >
            ▾
          </span>
        </button>
        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 2,
                background: theme.tooltip.background,
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: `1px solid ${theme.tooltip.borderColor}`,
                borderRadius: 6,
                boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
                padding: 2,
                zIndex: 100,
              }}
            >
              {options.map((opt) => {
                const active = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      background: active ? hexToRgba(theme.line.color, 0.12) : 'transparent',
                      color: active ? theme.tooltip.textColor : theme.axis.textColor,
                      border: 'none',
                      padding: '4px 7px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontFamily: 'inherit',
                      fontWeight: active ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = hexToRgba(theme.crosshair.labelBackground, 0.5);
                    }}
                    onMouseLeave={(e) => {
                      if (!active)
                        e.currentTarget.style.background = active ? hexToRgba(theme.line.color, 0.12) : 'transparent';
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── ToggleGroup ──────────────────────────────────────────────

export function ToggleGroup({
  label,
  options,
  value,
  onChange,
  theme,
  accentColor,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  theme: ChartTheme;
  accentColor?: string;
}) {
  const accent = accentColor ?? theme.line.color;
  return (
    <div style={row}>
      <Label theme={theme}>{label}</Label>
      <div
        style={{
          display: 'flex',
          gap: 1,
          background: hexToRgba(theme.tooltip.borderColor, 0.4),
          borderRadius: 5,
          padding: 1,
        }}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                background: active ? hexToRgba(accent, 0.25) : 'transparent',
                color: active ? theme.tooltip.textColor : theme.axis.textColor,
                border: 'none',
                padding: '3px 10px',
                borderRadius: 4,
                fontSize: 10,
                fontFamily: 'inherit',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Switch ───────────────────────────────────────────────────

export function Switch({
  label,
  checked,
  onChange,
  theme,
  accentColor,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  theme: ChartTheme;
  accentColor?: string;
}) {
  const accent = accentColor ?? theme.line.color;
  return (
    <div style={row}>
      <Label theme={theme}>{label}</Label>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          width: 32,
          height: 18,
          borderRadius: 9,
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          background: checked ? accent : hexToRgba(theme.axis.textColor, 0.2),
          transition: 'background 0.2s',
          outline: 'none',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 16 : 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          }}
        />
      </button>
    </div>
  );
}

// ── BoundInput ───────────────────────────────────────────────

const BOUND_PRESETS = ['auto', '0', '+10%', '+20%'];

const inputStyle = (theme: ChartTheme): CSSProperties => ({
  background: hexToRgba(theme.crosshair.labelBackground, 0.6),
  color: theme.tooltip.textColor,
  border: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.6)}`,
  borderRadius: 4,
  padding: '3px 6px',
  fontSize: 10,
  fontFamily: 'inherit',
  fontWeight: 500,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box' as const,
  transition: 'border-color 0.15s',
});

export function BoundInput({
  label,
  value,
  onChange,
  theme,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  theme: ChartTheme;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
      <span style={{ fontSize: 10, color: theme.axis.textColor, fontWeight: 500 }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="auto"
        style={inputStyle(theme)}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = hexToRgba(theme.line.color, 0.5);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = hexToRgba(theme.tooltip.borderColor, 0.6);
        }}
      />
      <div style={{ display: 'flex', gap: 2 }}>
        {BOUND_PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            style={{
              background: value === p ? hexToRgba(theme.line.color, 0.15) : 'transparent',
              color: value === p ? theme.tooltip.textColor : theme.axis.textColor,
              border: `1px solid ${value === p ? hexToRgba(theme.line.color, 0.3) : hexToRgba(theme.tooltip.borderColor, 0.4)}`,
              borderRadius: 3,
              padding: '0px 4px',
              fontSize: 9,
              fontFamily: 'inherit',
              cursor: 'pointer',
              lineHeight: '16px',
            }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── NumberInput ──────────────────────────────────────────────

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  theme,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  theme: ChartTheme;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
      <span style={{ fontSize: 10, color: theme.axis.textColor, fontWeight: 500 }}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        style={inputStyle(theme)}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = hexToRgba(theme.line.color, 0.5);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = hexToRgba(theme.tooltip.borderColor, 0.6);
        }}
      />
    </div>
  );
}

// ── Section divider ─────────────────────────────────────────

export function SectionLabel({ children, theme }: { children: React.ReactNode; theme: ChartTheme }) {
  return (
    <div style={{ borderTop: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.5)}`, paddingTop: 6 }}>
      <span
        style={{
          fontSize: 9,
          color: theme.axis.textColor,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
          opacity: 0.6,
        }}
      >
        {children}
      </span>
    </div>
  );
}

// ── Syntax-highlighted code ──────────────────────────────────

type TokenType = 'tag' | 'attr' | 'string' | 'punct' | 'brace' | 'text';

function tokenizeJSX(code: string): { type: TokenType; text: string }[] {
  const tokens: { type: TokenType; text: string }[] = [];
  const re = /(<\/?[A-Z]\w*)|(\w+)(?==)|("[^"]*")|(\{[^{}]*\})|([<>/={}])|(\s+)|([^<>"{}=\s/]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m[1]) tokens.push({ type: 'tag', text: m[1] });
    else if (m[2]) tokens.push({ type: 'attr', text: m[2] });
    else if (m[3]) tokens.push({ type: 'string', text: m[3] });
    else if (m[4]) tokens.push({ type: 'brace', text: m[4] });
    else if (m[5]) tokens.push({ type: 'punct', text: m[5] });
    else tokens.push({ type: 'text', text: m[0] });
  }
  return tokens;
}

const syntaxColors: Record<TokenType, string> = {
  tag: '#7dd3fc',
  attr: '#c4b5fd',
  string: '#86efac',
  punct: '#94a3b8',
  brace: '#fbbf24',
  text: '#e2e8f0',
};

export function HighlightedCode({ code, theme }: { code: string; theme: ChartTheme }) {
  const tokens = tokenizeJSX(code);
  return (
    <pre
      style={{
        flex: 1,
        margin: 0,
        padding: 8,
        borderRadius: 6,
        background: hexToRgba(theme.crosshair.labelBackground, 0.3),
        border: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.5)}`,
        fontSize: 10,
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
        lineHeight: 1.5,
        overflow: 'auto',
        whiteSpace: 'pre',
        tabSize: 2,
        minHeight: 0,
      }}
    >
      {tokens.map((t, i) => (
        <span key={i} style={{ color: syntaxColors[t.type] }}>
          {t.text}
        </span>
      ))}
    </pre>
  );
}

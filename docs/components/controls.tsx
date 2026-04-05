import { type CSSProperties, useEffect, useRef, useState } from 'react';

import type { ChartTheme } from '@wick-charts/react';
import { ChevronDown } from 'lucide-react';

import { hexToRgba } from '../utils';

// ── Shared styles ────────────────────────────────────────────

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  minHeight: 30,
};

function Label({ children, theme }: { children: React.ReactNode; theme: ChartTheme }) {
  return (
    <span
      style={{
        fontSize: 11,
        color: hexToRgba(theme.axis.textColor, 0.9),
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
            background: hexToRgba(theme.crosshair.labelBackground, 0.5),
            color: theme.tooltip.textColor,
            border: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.5)}`,
            borderRadius: 6,
            padding: '5px 10px',
            fontSize: 11,
            fontFamily: 'inherit',
            fontWeight: 500,
            cursor: 'pointer',
            outline: 'none',
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = hexToRgba(theme.line.color, 0.4);
            e.currentTarget.style.background = hexToRgba(theme.crosshair.labelBackground, 0.7);
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = hexToRgba(theme.tooltip.borderColor, 0.5);
            e.currentTarget.style.background = hexToRgba(theme.crosshair.labelBackground, 0.5);
          }}
        >
          <span>{current?.label}</span>
          <ChevronDown
            size={12}
            style={{
              opacity: 0.5,
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          />
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
                marginTop: 4,
                background: theme.tooltip.background,
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.8)}`,
                borderRadius: 8,
                boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.15)',
                padding: 3,
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
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      background: active ? hexToRgba(theme.line.color, 0.12) : 'transparent',
                      color: active ? theme.tooltip.textColor : hexToRgba(theme.axis.textColor, 0.85),
                      border: 'none',
                      padding: '5px 8px',
                      borderRadius: 5,
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
                      e.currentTarget.style.background = active ? hexToRgba(theme.line.color, 0.12) : 'transparent';
                    }}
                  >
                    {active && <span style={{ fontSize: 6, color: theme.line.color }}>●</span>}
                    <span>{opt.label}</span>
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

// ── ToggleGroup (animated sliding indicator) ─────────────────

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
  const activeIndex = options.findIndex((o) => o.value === value);
  const btnsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [ind, setInd] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const btn = btnsRef.current[activeIndex];
    if (btn) setInd({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [activeIndex]);

  return (
    <div style={row}>
      <Label theme={theme}>{label}</Label>
      <div
        style={{
          position: 'relative',
          display: 'inline-flex',
          background: hexToRgba(theme.tooltip.borderColor, 0.2),
          borderRadius: 7,
          padding: 2,
        }}
      >
        {ind.width > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 2,
              bottom: 2,
              left: ind.left,
              width: ind.width,
              background: hexToRgba(accent, 0.18),
              border: `1px solid ${hexToRgba(accent, 0.22)}`,
              borderRadius: 5,
              transition: 'left 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.15s ease',
              pointerEvents: 'none',
            }}
          />
        )}
        {options.map((opt, i) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              ref={(el) => {
                btnsRef.current[i] = el;
              }}
              onClick={() => onChange(opt.value)}
              style={{
                background: 'transparent',
                color: active ? theme.tooltip.textColor : hexToRgba(theme.axis.textColor, 0.6),
                border: 'none',
                padding: '4px 12px',
                borderRadius: 5,
                fontSize: 10,
                fontFamily: 'inherit',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                transition: 'color 0.2s',
                position: 'relative',
                zIndex: 1,
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
          width: 36,
          height: 20,
          borderRadius: 10,
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          background: checked ? accent : hexToRgba(theme.axis.textColor, 0.18),
          transition: 'background 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s',
          outline: 'none',
          flexShrink: 0,
          boxShadow: checked ? `0 0 10px ${hexToRgba(accent, 0.35)}` : 'none',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
      </button>
    </div>
  );
}

// ── Slider ───────────────────────────────────────────────────

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  theme,
  suffix,
  accentColor,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  theme: ChartTheme;
  suffix?: string;
  accentColor?: string;
}) {
  const accent = accentColor ?? theme.line.color;
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label theme={theme}>{label}</Label>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: theme.tooltip.textColor,
            fontVariantNumeric: 'tabular-nums',
            background: hexToRgba(theme.crosshair.labelBackground, 0.5),
            padding: '1px 6px',
            borderRadius: 4,
          }}
        >
          {value}
          {suffix && <span style={{ fontSize: 8, opacity: 0.5, marginLeft: 1 }}>{suffix}</span>}
        </span>
      </div>
      <div style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
        {/* Track background */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 4,
            borderRadius: 2,
            background: hexToRgba(theme.tooltip.borderColor, 0.3),
          }}
        />
        {/* Track fill */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            height: 4,
            borderRadius: 2,
            width: `${pct}%`,
            background: accent,
            opacity: 0.7,
          }}
        />
        {/* Thumb (visual only) */}
        <div
          style={{
            position: 'absolute',
            left: `${pct}%`,
            transform: 'translateX(-50%)',
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: `0 0 0 2px ${accent}, 0 2px 6px rgba(0,0,0,0.25)`,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
        {/* Native range input (invisible, handles interaction) */}
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            margin: 0,
            zIndex: 3,
          }}
        />
      </div>
    </div>
  );
}

// ── GridStylePicker ──────────────────────────────────────────

export function GridStylePicker({
  value,
  onChange,
  theme,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  theme: ChartTheme;
  label?: string;
}) {
  const styles = [
    { value: 'solid', label: 'Solid', dasharray: 'none' },
    { value: 'dashed', label: 'Dashed', dasharray: '6 4' },
    { value: 'dotted', label: 'Dotted', dasharray: '2 4' },
  ] as const;

  return (
    <div style={label ? row : { display: 'flex', gap: 5 }}>
      {label && <Label theme={theme}>{label}</Label>}
      <div style={{ display: 'flex', gap: 5, flex: label ? undefined : 1 }}>
        {styles.map((s) => {
          const active = value === s.value;
          return (
            <button
              key={s.value}
              onClick={() => onChange(s.value)}
              title={s.label}
              style={{
                flex: 1,
                height: 32,
                borderRadius: 6,
                border: active
                  ? `1.5px solid ${hexToRgba(theme.line.color, 0.6)}`
                  : `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.35)}`,
                background: active ? hexToRgba(theme.line.color, 0.08) : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
                padding: 0,
              }}
            >
              <svg width={30} height={20} viewBox="0 0 30 20">
                {[5, 10, 15].map((y) => (
                  <line
                    key={y}
                    x1={3}
                    y1={y}
                    x2={27}
                    y2={y}
                    stroke={hexToRgba(theme.axis.textColor, active ? 0.7 : 0.3)}
                    strokeWidth={1.2}
                    strokeDasharray={s.dasharray}
                    strokeLinecap="round"
                  />
                ))}
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── BoundInput ───────────────────────────────────────────────

const inputStyle = (theme: ChartTheme): CSSProperties => ({
  background: hexToRgba(theme.crosshair.labelBackground, 0.5),
  color: theme.tooltip.textColor,
  border: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.5)}`,
  borderRadius: 5,
  padding: '4px 7px',
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
  const presets = ['auto', '0', '+10%', '+20%'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
      <span style={{ fontSize: 10, color: hexToRgba(theme.axis.textColor, 0.8), fontWeight: 500 }}>{label}</span>
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
          e.currentTarget.style.borderColor = hexToRgba(theme.tooltip.borderColor, 0.5);
        }}
      />
      <div style={{ display: 'flex', gap: 2 }}>
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            style={{
              background: 'transparent',
              color: value === p ? theme.tooltip.textColor : hexToRgba(theme.axis.textColor, 0.4),
              border: 'none',
              borderRadius: 3,
              padding: '1px 4px',
              fontSize: 9,
              fontFamily: 'inherit',
              fontWeight: value === p ? 600 : 400,
              cursor: 'pointer',
              lineHeight: '16px',
              transition: 'color 0.15s',
              textDecoration: value === p ? 'none' : undefined,
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
      <span style={{ fontSize: 10, color: hexToRgba(theme.axis.textColor, 0.8), fontWeight: 500 }}>{label}</span>
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
          e.currentTarget.style.borderColor = hexToRgba(theme.tooltip.borderColor, 0.5);
        }}
      />
    </div>
  );
}

// ── Section divider ─────────────────────────────────────────

export function Section({
  title,
  theme,
  defaultOpen = true,
  accent,
  noBorder,
  children,
}: {
  title: string;
  theme: ChartTheme;
  defaultOpen?: boolean;
  accent?: string;
  noBorder?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const accentColor = accent ?? theme.line.color;

  return (
    <div style={noBorder ? undefined : { borderTop: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.3)}` }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '8px 0 4px',
          cursor: 'pointer',
          color: theme.axis.textColor,
          fontFamily: 'inherit',
        }}
      >
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: accentColor,
            opacity: open ? 0.8 : 0.3,
            transition: 'opacity 0.2s',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 700,
            flex: 1,
            textAlign: 'left',
            opacity: open ? 0.85 : 0.5,
            transition: 'opacity 0.2s',
          }}
        >
          {title}
        </span>
        <ChevronDown
          size={12}
          style={{
            opacity: 0.4,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, paddingLeft: 13 }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function SectionLabel({ children, theme }: { children: React.ReactNode; theme: ChartTheme }) {
  return (
    <div style={{ borderTop: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.4)}`, paddingTop: 8 }}>
      <span
        style={{
          fontSize: 9,
          color: hexToRgba(theme.axis.textColor, 0.6),
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontWeight: 700,
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
        padding: 10,
        borderRadius: 8,
        background: hexToRgba(theme.crosshair.labelBackground, 0.3),
        border: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.4)}`,
        fontSize: 10,
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
        lineHeight: 1.6,
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

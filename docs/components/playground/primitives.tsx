import type { ReactNode } from 'react';

// ── Toggle (replaces old Switch) ─────────────────────────────

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? 'on' : ''}`}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}

// ── ToggleGroup ──────────────────────────────────────────────

export function ToggleGroup<V extends string>({
  value,
  options,
  onChange,
}: {
  value: V;
  options: readonly { value: V; label?: string; icon?: ReactNode; title?: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <div className="tgroup" role="tablist">
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          role="tab"
          aria-selected={opt.value === value}
          title={opt.title ?? opt.label}
          className={opt.value === value ? 'on' : ''}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon}
          {opt.label ? <span>{opt.label}</span> : null}
        </button>
      ))}
    </div>
  );
}

// ── Select ───────────────────────────────────────────────────

export function Select<V extends string>({
  value,
  options,
  onChange,
}: {
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <div className="select">
      <select value={value} onChange={(e) => onChange(e.target.value as V)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg width="10" height="10" viewBox="0 0 10 10" className="caret" aria-hidden="true">
        <path
          d="M2 4l3 3 3-3"
          stroke="currentColor"
          fill="none"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ── Slider ───────────────────────────────────────────────────

export function Slider({
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  label,
  accentColor: _accentColor,
  theme: _theme,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  label?: string;
  // Legacy props; accepted but unused here — styling comes from CSS tokens.
  accentColor?: string;
  theme?: unknown;
}) {
  return (
    <div className="slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider-val">
        {value}
        {suffix && <em>{suffix}</em>}
      </span>
    </div>
  );
}

// ── BoundInput ───────────────────────────────────────────────

export function BoundInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const presets = ['auto', '0', '+10%', '+20%'];
  return (
    <div className="bound">
      <input type="text" value={value} placeholder="auto" onChange={(e) => onChange(e.target.value)} />
      <div className="bound-presets">
        {presets.map((p) => (
          <button key={p} type="button" className={value === p ? 'on' : ''} onClick={() => onChange(p)}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Shared layout types ──────────────────────────────────────

export type PrimitiveChildren = ReactNode;

import { type CSSProperties, type ReactNode, useState } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { hexToRgba } from '../utils';

// Internal docs UI kit — the one visual family for every small control on
// docs pages (walkthrough tabs, demo mode pickers, example-control rows).
// Mirrors the playground panel's `.tgroup` look: bordered track, inset
// active pill, themed from the chart theme's ink color.

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

/** Segmented single-choice switch — tabs and mode pickers. */
export function Segmented<T extends string>({
  theme,
  value,
  options,
  onChange,
  ariaLabel,
  style,
}: {
  theme: ChartTheme;
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (next: T) => void;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  const text = theme.tooltip.textColor;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignSelf: 'flex-start',
        padding: 2,
        gap: 2,
        border: `1px solid ${hexToRgba(text, 0.18)}`,
        borderRadius: 6,
        background: hexToRgba(text, 0.04),
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.fontSize - 1,
        ...style,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;

        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '4px 12px',
              border: 'none',
              borderRadius: 4,
              background: active ? hexToRgba(text, 0.12) : 'transparent',
              color: active ? text : hexToRgba(text, 0.62),
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              fontWeight: active ? 500 : 400,
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Single on/off chip in the same family as {@link Segmented} — for boolean
 * demo controls ("labels", "ongoing"). Optional `accent` tints the ON state
 * (e.g. the annotations demo's alert red).
 */
export function ToggleChip({
  theme,
  pressed,
  onToggle,
  children,
  accent,
}: {
  theme: ChartTheme;
  pressed: boolean;
  onToggle: (next: boolean) => void;
  children: ReactNode;
  accent?: string;
}) {
  const text = theme.tooltip.textColor;
  const onColor = accent ?? text;

  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onToggle(!pressed)}
      style={{
        padding: '5px 12px',
        border: `1px solid ${pressed ? hexToRgba(onColor, 0.45) : hexToRgba(text, 0.18)}`,
        borderRadius: 6,
        background: pressed ? hexToRgba(onColor, accent ? 0.15 : 0.1) : 'transparent',
        color: pressed ? onColor : hexToRgba(text, 0.62),
        cursor: 'pointer',
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.fontSize - 1,
        fontWeight: pressed ? 500 : 400,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

/** Plain action button ("Replay") in the same family — bordered chip metrics
 * with a hover lift instead of a pressed state. */
export function Button({
  theme,
  onClick,
  children,
  ariaLabel,
  style,
}: {
  theme: ChartTheme;
  onClick: () => void;
  children: ReactNode;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  const text = theme.tooltip.textColor;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        padding: '5px 12px',
        border: `1px solid ${hexToRgba(text, hover ? 0.32 : 0.18)}`,
        borderRadius: 6,
        background: hover ? hexToRgba(text, 0.06) : 'transparent',
        color: hexToRgba(text, 0.85),
        cursor: 'pointer',
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.fontSize - 1,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        transition: 'background 120ms ease, border-color 120ms ease',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

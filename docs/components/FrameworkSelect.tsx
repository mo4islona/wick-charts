import type { ChartTheme } from '@wick-charts/react';

import { type Framework, useFramework } from '../context/framework';
import { hexToRgba } from '../utils';

const FW_ITEMS: { value: Framework; label: string; color: string; icon: React.ReactNode }[] = [
  {
    value: 'react',
    label: 'React',
    color: '#61DAFB',
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <ellipse
          cx="12"
          cy="12"
          rx="10"
          ry="4"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          transform="rotate(60 12 12)"
        />
        <ellipse
          cx="12"
          cy="12"
          rx="10"
          ry="4"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          transform="rotate(120 12 12)"
        />
      </svg>
    ),
  },
  {
    value: 'vue',
    label: 'Vue',
    color: '#42b883',
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
        <path d="M2 3h3.5L12 14.5 18.5 3H22L12 21 2 3z" opacity="0.6" />
        <path d="M7.5 3L12 10.5 16.5 3H14L12 6.5 10 3H7.5z" />
      </svg>
    ),
  },
  {
    value: 'svelte',
    label: 'Svelte',
    color: '#FF3E00',
    icon: (
      <svg viewBox="0 0 512 512" width="15" height="15">
        <path
          d="M416.9 93.1c-41.1-58.9-122.4-76.3-181.2-38.9L132.5 120c-28.2 17.7-47.6 46.5-53.5 79.3-4.9 27.3-.6 55.5 12.3 80-8.8 13.4-14.9 28.5-17.7 44.2-5.9 33.4 1.8 67.8 21.6 95.4 41.2 58.9 122.4 76.3 181.2 38.9L379.6 392c28.2-17.7 47.6-46.5 53.5-79.3 4.9-27.3.6-55.5-12.3-80 8.8-13.4 14.9-28.4 17.7-44.2 5.8-33.4-1.9-67.8-21.6-95.4"
          fill="#ff3e00"
        />
        <path
          d="M225.6 424.5c-33.3 8.6-68.4-4.4-88-32.6-11.9-16.6-16.5-37.3-13-57.4.6-3.3 1.4-6.5 2.5-9.6l1.9-5.9 5.3 3.9c12.2 9 25.9 15.8 40.4 20.2l3.8 1.2-.4 3.8c-.5 5.4 1 10.9 4.2 15.3 5.9 8.5 16.5 12.4 26.5 9.8 2.2-.6 4.4-1.5 6.3-2.8l103.2-65.8c5.1-3.2 8.6-8.4 9.7-14.4 1.1-6.1-.3-12.3-3.9-17.3-5.9-8.5-16.5-12.4-26.5-9.8-2.2.6-4.4 1.5-6.3 2.8L252 291c-6.5 4.1-13.5 7.2-21 9.2-33.3 8.6-68.4-4.4-88-32.6-11.9-16.6-16.5-37.3-13-57.4 3.5-19.7 15.2-37 32.2-47.7l103.2-65.8c6.5-4.1 13.5-7.2 21-9.2 33.3-8.6 68.4 4.4 88 32.6 11.9 16.6 16.5 37.3 13 57.4-.6 3.3-1.4 6.5-2.5 9.6L383 193l-5.3-3.9c-12.2-9-25.9-15.8-40.4-20.2l-3.8-1.2.4-3.8c.5-5.4-1-10.9-4.2-15.3-5.9-8.5-16.5-12.4-26.5-9.8-2.2.6-4.4 1.5-6.3 2.8l-103.2 65.8c-5.1 3.2-8.6 8.4-9.7 14.4-1.1 6.1.3 12.3 3.9 17.3 5.9 8.5 16.5 12.4 26.5 9.8 2.2-.6 4.4-1.5 6.3-2.8L260 221c6.5-4.1 13.5-7.2 21-9.2 33.3-8.6 68.4 4.4 88 32.6 11.9 16.6 16.5 37.3 13 57.4-3.5 19.7-15.2 37-32.2 47.7l-103.2 65.8c-6.5 4.1-13.6 7.2-21 9.2"
          fill="#fff"
        />
      </svg>
    ),
  },
];

/** Compact framework selector — reads/writes via FrameworkContext. */
export function FrameworkSelect({ theme, compact }: { theme: ChartTheme; compact?: boolean }) {
  const [value, onChange] = useFramework();

  return (
    <div style={{ display: 'flex', gap: compact ? 4 : 8 }}>
      {FW_ITEMS.map((fw) => {
        const active = fw.value === value;
        return (
          <button
            type="button"
            key={fw.value}
            title={fw.label}
            onClick={() => onChange(fw.value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: compact ? 4 : 8,
              padding: compact ? '4px 8px' : '8px 20px',
              borderRadius: compact ? 5 : 8,
              border: `1.5px solid ${active ? hexToRgba(theme.tooltip.textColor, 0.3) : hexToRgba(theme.tooltip.borderColor, 0.4)}`,
              background: active ? hexToRgba(theme.crosshair.labelBackground, 0.5) : 'transparent',
              color: active ? theme.tooltip.textColor : hexToRgba(theme.axis.textColor, 0.5),
              cursor: 'pointer',
              fontSize: compact ? 10 : 13,
              fontFamily: 'inherit',
              fontWeight: active ? 600 : 400,
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', color: fw.color }}>{fw.icon}</span>
            {!compact && fw.label}
          </button>
        );
      })}
    </div>
  );
}

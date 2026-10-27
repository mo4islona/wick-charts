import type { ReactNode } from 'react';

const HEATMAP_CELLS = [0, 1, 2].flatMap((row) => [0, 1, 2, 3, 4, 5].map((col) => ({ row, col })));

const SKETCHES = {
  candlestick: (
    <>
      <path d="M9 8v4M9 20v4M19 5v4M19 17v4M29 10v3M29 19v4M39 4v2M39 14v4" />
      <rect x="6" y="12" width="6" height="8" rx="1" fill="currentColor" />
      <rect x="16" y="9" width="6" height="8" rx="1" />
      <rect x="26" y="13" width="6" height="6" rx="1" fill="currentColor" />
      <rect x="36" y="6" width="6" height="8" rx="1" />
    </>
  ),
  'line-live': (
    <>
      <path d="M3 20l8-6 7 4 8-10 8 5 7-6" />
      <circle cx="41" cy="7" r="2.5" fill="currentColor" />
    </>
  ),
  'line-annotations': (
    <>
      <rect x="22" y="3" width="10" height="22" fill="currentColor" fillOpacity="0.15" stroke="none" />
      <path d="M3 9h42" strokeDasharray="3 3" strokeWidth="1" />
      <path d="M3 21l8-3 7 2 8-10 8 8 11-3" />
    </>
  ),
  'line-navigator': (
    <>
      <path d="M3 15l8-5 7 3 8-8 8 4 11-5" />
      <rect x="3" y="20" width="42" height="6" rx="1" strokeWidth="1" />
      <rect x="24" y="20" width="12" height="6" fill="currentColor" fillOpacity="0.3" stroke="none" />
    </>
  ),
  'area-stacked': (
    <>
      <path d="M3 24V16l10-4 10 3 10-6 12 3v12z" fill="currentColor" fillOpacity="0.15" />
      <path d="M3 24v-4l10-2 10 2 10-4 12 2v6z" fill="currentColor" fillOpacity="0.45" />
    </>
  ),
  band: (
    <>
      <path
        d="M3 8l10-3 10 4 10-5 12 3v12l-12 2-10-3-10 4-10-3z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="none"
      />
      <path d="M3 14l10-2 10 3 10-4 12 3" />
    </>
  ),
  'bar-grouped': (
    <>
      <path d="M4 25V12M9 25V6M18 25V15M23 25V9M32 25V10M37 25V4" strokeWidth="4" strokeLinecap="butt" />
      <path d="M2 25.5h44" strokeWidth="1" />
    </>
  ),
  donut: (
    <>
      <circle cx="24" cy="14" r="10" strokeWidth="4" strokeOpacity="0.3" />
      <path d="M24 4a10 10 0 0 1 9.5 13" strokeWidth="4" strokeLinecap="butt" />
    </>
  ),
  heatmap: (
    <>
      {HEATMAP_CELLS.map(({ row, col }) => (
        <rect
          key={`${row}-${col}`}
          x={4 + col * 7}
          y={3 + row * 8}
          width="6"
          height="7"
          rx="1"
          fill="currentColor"
          fillOpacity={0.15 + ((row * 3 + col * 5) % 7) / 9}
          stroke="none"
        />
      ))}
    </>
  ),
  'order-book': (
    <>
      <path d="M3 24V6h5v5h5v5h5v5h5v3z" fill="currentColor" fillOpacity="0.45" stroke="none" />
      <path d="M45 24V4h-5v6h-5v5h-5v5h-5v4z" fill="currentColor" fillOpacity="0.15" stroke="none" />
    </>
  ),
  sankey: (
    <>
      <path d="M6 4c10 0 10 4 18 4M6 20c10 0 10 4 18 4M24 8c10 0 10-3 18-3M24 22c10 0 10-4 18-4" />
      <path d="M5 2v20M24 6v20M43 3v17" strokeWidth="3" strokeLinecap="butt" />
    </>
  ),
  gauge: (
    <>
      <path d="M13 23a12 12 0 1 1 22 0" strokeWidth="3" strokeOpacity="0.3" />
      <path d="M13 23a12 12 0 0 1 17-15" strokeWidth="3" />
      <path d="M24 17l5-6" />
    </>
  ),
  'radial-progress': (
    <>
      <circle cx="24" cy="14" r="11" strokeWidth="2" strokeOpacity="0.25" />
      <circle cx="24" cy="14" r="7" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M24 3a11 11 0 1 1-10 15" strokeWidth="2" />
      <path d="M24 7a7 7 0 0 1 6 10" strokeWidth="2" />
    </>
  ),
  sparkline: (
    <>
      <rect x="3" y="3" width="42" height="22" rx="3" strokeWidth="1" />
      <path d="M3 17l6-3 5 2 6-5 6 3 6-4 6 2 7-2" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type SketchName = keyof typeof SKETCHES;

/** A small drawing of a chart on a 48×28 grid, in `currentColor`. */
export function ChartSketch({ name, height }: { name: SketchName; height: number }) {
  return (
    <svg
      width={(height * 48) / 28}
      height={height}
      viewBox="0 0 48 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {SKETCHES[name]}
    </svg>
  );
}

import type { ReactNode } from 'react';

export const ICONS: Record<string, ReactNode> = {
  display: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="1.5" y="2.5" width="9" height="7" rx="1" stroke="currentColor" fill="none" strokeWidth="1.2" />
      <path d="M4 9.5v1M8 9.5v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  grid: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1.5 4.5h9M1.5 7.5h9M4.5 1.5v9M7.5 1.5v9" stroke="currentColor" strokeWidth="1.1" opacity="0.9" />
    </svg>
  ),
  background: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" fill="none" strokeWidth="1.2" />
      <path d="M1.5 7l3-3 3 3 3-3" stroke="currentColor" fill="none" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
  axes: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 2v8h8" stroke="currentColor" fill="none" strokeWidth="1.2" strokeLinecap="round" />
      <path
        d="M4 8l2-3 2 1.5"
        stroke="currentColor"
        fill="none"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  animations: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M2 6h3l1-3 2 6 1-3h1"
        stroke="currentColor"
        fill="none"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  data: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <ellipse cx="6" cy="3" rx="4" ry="1.4" stroke="currentColor" fill="none" strokeWidth="1.2" />
      <path d="M2 3v6c0 .8 1.8 1.4 4 1.4s4-.6 4-1.4V3" stroke="currentColor" fill="none" strokeWidth="1.2" />
      <path d="M2 6c0 .8 1.8 1.4 4 1.4s4-.6 4-1.4" stroke="currentColor" fill="none" strokeWidth="1.2" />
    </svg>
  ),
  series: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M1.5 8.5l2.5-3 2 2 4.5-5"
        stroke="currentColor"
        fill="none"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  legend: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="1.5" y="2" width="3" height="2" rx="0.4" fill="currentColor" />
      <rect x="1.5" y="5" width="3" height="2" rx="0.4" fill="currentColor" opacity="0.6" />
      <rect x="1.5" y="8" width="3" height="2" rx="0.4" fill="currentColor" opacity="0.3" />
      <path d="M5.5 3h5M5.5 6h5M5.5 9h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  ),
  tooltip: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M2 2h8v5.5H7L6 9l-1-1.5H2V2z"
        stroke="currentColor"
        fill="none"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

export const CHEV_ICON = (
  <svg className="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path
      d="M3.5 2.5L6.5 5 3.5 7.5"
      stroke="currentColor"
      fill="none"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const SEARCH_ICON = (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <circle cx="5" cy="5" r="3" stroke="currentColor" fill="none" strokeWidth="1.3" />
    <path d="M7.2 7.2L10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

export const RESET_ICON = (
  <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
    <path
      d="M2 5.5a3.5 3.5 0 1 0 1-2.5M2 2v2.5h2.5"
      stroke="currentColor"
      fill="none"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const COPY_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

export const CHECK_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

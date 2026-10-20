import { createContext, useContext } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { routeToPath } from '../router';
import { type Route, type RouteEntry, adjacentGuides } from '../routes';
import { hexToRgba } from '../utils';

/** The guide route being rendered; `null` outside a guide page. */
export const GuideRouteContext = createContext<Route | null>(null);

/** Previous / Next links at the end of a guide, in sidebar order. */
export function GuideNav({ theme }: { theme: ChartTheme }) {
  const route = useContext(GuideRouteContext);
  if (!route) return null;

  const { prev, next } = adjacentGuides(route);
  if (!prev && !next) return null;

  return (
    <nav
      aria-label="More guides"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 28,
        paddingTop: 16,
        borderTop: `1px solid ${theme.tooltip.borderColor}`,
      }}
    >
      {prev ? <GuideLink entry={prev} direction="prev" theme={theme} /> : <span style={{ flex: '1 1 200px' }} />}
      {next && <GuideLink entry={next} direction="next" theme={theme} />}
    </nav>
  );
}

function GuideLink({ entry, direction, theme }: { entry: RouteEntry; direction: 'prev' | 'next'; theme: ChartTheme }) {
  const isNext = direction === 'next';

  return (
    <a
      href={routeToPath(entry.route)}
      rel={direction}
      style={{
        flex: '1 1 200px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: isNext ? 'flex-end' : 'flex-start',
        gap: 2,
        padding: '10px 14px',
        borderRadius: 8,
        border: `1px solid ${theme.tooltip.borderColor}`,
        background: hexToRgba(theme.crosshair.labelBackground, 0.25),
        color: theme.tooltip.textColor,
        textDecoration: 'none',
      }}
    >
      <span style={{ fontSize: theme.typography.fontSize - 2, color: theme.axis.textColor }}>
        {isNext ? 'Next' : 'Previous'}
      </span>
      <span style={{ fontWeight: 600 }}>{isNext ? `${entry.label} →` : `← ${entry.label}`}</span>
    </a>
  );
}

'use client';

import { type ComponentProps, useMemo, useRef } from 'react';

import { ChartContainer, type ChartTheme } from '@wick-charts/react';

import { useWickTheme } from '@/hooks/use-wick-theme';
import { cn } from '@/lib/utils';

export type WickChartProps = Omit<ComponentProps<typeof ChartContainer>, 'theme'> & {
  /**
   * A theme, or a function that adjusts the theme built from the CSS variables.
   * Define the function outside the component: a new one each render re-themes the chart.
   */
  theme?: ChartTheme | ((theme: ChartTheme) => ChartTheme);
};

/**
 * Wick Charts `ChartContainer` themed from the shadcn/ui CSS variables. Size it
 * with classes, like the shadcn `ChartContainer`: `aspect-video` by default,
 * `aspect-auto h-[250px]` for a fixed height. Horizontal grid lines only, as in
 * shadcn charts; pass `grid` to change it.
 */
export function WickChart({ className, style, theme, grid = { vertical: false }, ...props }: WickChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const wickTheme = useWickTheme(ref);
  const chartTheme = useMemo(() => {
    if (typeof theme === 'function') return theme(wickTheme);

    return theme ?? wickTheme;
  }, [theme, wickTheme]);

  return (
    <div ref={ref} data-slot="wick-chart" className={cn('flex aspect-video w-full', className)}>
      <ChartContainer
        theme={chartTheme}
        grid={grid}
        style={{ minHeight: 0, background: 'transparent', ...style }}
        {...props}
      />
    </div>
  );
}

import { PieLegend, PieSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

describe('PieLegend', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const slices = [
    { label: 'A', value: 25 },
    { label: 'B', value: 25 },
    { label: 'C', value: 50 },
  ];

  const id = 'pie';

  function PieWithLegend(props: { mode?: 'value' | 'percent' }) {
    return (
      <>
        <PieSeries id={id} data={slices} />
        <PieLegend seriesId={id} mode={props.mode} />
      </>
    );
  }

  it('renders one row per slice', () => {
    mounted = mountChart(<PieWithLegend />);

    // Each slice row has exactly one circular swatch (border-radius: 50%).
    // Count swatches rather than rows — more stable across layout tweaks.
    const swatches = mounted.container.querySelectorAll('span[style*="border-radius: 50%"]');
    expect(swatches.length).toBe(slices.length);
  });

  it('shows percentages that sum to ~100%', () => {
    mounted = mountChart(<PieWithLegend />);
    const text = mounted.container.textContent ?? '';
    expect(text).toContain('25.0%');
    expect(text).toContain('50.0%');
  });

  it('mode="value" shows absolute values alongside percentages', () => {
    mounted = mountChart(<PieWithLegend mode="value" />);
    const text = mounted.container.textContent ?? '';
    // Absolute values formatted by formatCompact — 25 stays as "25".
    expect(text).toContain('25');
    expect(text).toContain('50');
  });

  it('mode="percent" omits absolute values', () => {
    mounted = mountChart(<PieWithLegend mode="percent" />);
    const text = mounted.container.textContent ?? '';
    const spanTexts = Array.from(mounted.container.querySelectorAll('span')).map(
      (span) => span.textContent?.trim() ?? '',
    );
    expect(text).toContain('50.0%');
    // No standalone value cell — "25" / "50" only appear inside "25.0%" /
    // "50.0%" percent strings, never as their own span.
    expect(spanTexts).not.toContain('25');
    expect(spanTexts).not.toContain('50');
  });

  it('omitted seriesId picks the first visible pie series', () => {
    mounted = mountChart(
      <>
        <PieSeries id={id} data={slices} />
        <PieLegend />
      </>,
    );
    const swatches = mounted.container.querySelectorAll('span[style*="border-radius: 50%"]');
    expect(swatches.length).toBe(slices.length);
  });

  it('children render-prop replaces the default UI and receives slices/mode/format', () => {
    let captured: { count: number; mode: string } | null = null;
    mounted = mountChart(
      <>
        <PieSeries id={id} data={slices} />
        <PieLegend mode="percent">
          {({ slices: s, mode, format }) => {
            captured = { count: s.length, mode };

            return (
              <ul data-testid="custom-pie-legend">
                {s.map((slice) => (
                  <li key={slice.label}>
                    {slice.label}:{format(slice.value)}
                  </li>
                ))}
              </ul>
            );
          }}
        </PieLegend>
      </>,
    );
    const custom = mounted.container.querySelector('[data-testid="custom-pie-legend"]');
    expect(custom).not.toBeNull();
    expect(captured).not.toBeNull();
    expect(captured!.count).toBe(slices.length);
    expect(captured!.mode).toBe('percent');
    // Default swatch markers absent.
    expect(mounted.container.querySelectorAll('span[style*="border-radius: 50%"]').length).toBe(0);
  });
});

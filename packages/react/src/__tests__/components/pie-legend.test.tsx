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

  function PieWithLegend(props: { format?: 'value' | 'percent' }) {
    return (
      <>
        <PieSeries id={id} data={slices} />
        <PieLegend seriesId={id} format={props.format} />
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

  it('format="value" shows absolute values alongside percentages', () => {
    mounted = mountChart(<PieWithLegend format="value" />);
    const text = mounted.container.textContent ?? '';
    // Absolute values formatted by formatCompact — 25 stays as "25".
    expect(text).toContain('25');
    expect(text).toContain('50');
  });

  it('format="percent" omits absolute values', () => {
    mounted = mountChart(<PieWithLegend format="percent" />);
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
});

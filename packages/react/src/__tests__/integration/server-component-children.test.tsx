import { type ComponentType, createElement } from 'react';

import { Legend, LineSeries, Navigator, type NavigatorProps } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

// A resolved client reference as the Flight client hands it over: a lazy element type.
function flightLazy<P>(component: ComponentType<P>): ComponentType<P> {
  const chunk = { status: 'fulfilled', value: component };
  const lazy = {
    $$typeof: Symbol.for('react.lazy'),
    _payload: chunk,
    _init: (payload: typeof chunk) => payload.value,
  };

  return lazy as unknown as ComponentType<P>;
}

const points = Array.from({ length: 30 }, (_, i) => ({ time: 1_000_000 + i * 60_000, value: 10 + (i % 5) }));

describe('children created in a Server Component', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('lays out a lazy Legend and Navigator outside the plot overlay', () => {
    const LazyLegend = flightLazy(Legend);
    const LazyNavigator = flightLazy<NavigatorProps>(Navigator);

    mounted = mountChart(
      <>
        <LineSeries data={[{ label: 'A', data: points }]} />
        {createElement(LazyLegend)}
        {createElement(LazyNavigator, { data: { type: 'line', points }, height: 40 })}
      </>,
    );

    const overlay = mounted.container.querySelector('[data-chart-series-overlay]');
    const legend = mounted.container.querySelector('[data-legend]');
    const navigator = mounted.container.querySelector('[data-chart-navigator]');

    expect(legend).not.toBeNull();
    expect(navigator).not.toBeNull();
    expect(overlay?.contains(legend)).toBe(false);
    expect(overlay?.contains(navigator)).toBe(false);
  });
});

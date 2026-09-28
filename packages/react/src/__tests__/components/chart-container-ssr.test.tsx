// @vitest-environment node

import { ChartContainer, LineSeries, Title, YAxis } from '@wick-charts/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

/**
 * The chart instance only exists after mount, so a server render emits the
 * empty container shell. Anything `ChartContainer` subscribes to must still
 * render on the server — `useSyncExternalStore` without a server snapshot
 * throws there.
 */
describe('ChartContainer server rendering', () => {
  it('renders the container shell without a chart', () => {
    const html = renderToString(<ChartContainer />);

    expect(html).toContain('<div');
  });

  it('renders with children, a header and a left Y axis', () => {
    const html = renderToString(
      <ChartContainer axis={{ y: { position: 'left' } }}>
        <Title>BTC/USD</Title>
        <LineSeries data={[[{ time: 1, value: 1 }]]} />
        <YAxis />
      </ChartContainer>,
    );

    expect(html).toContain('<div');
  });
});

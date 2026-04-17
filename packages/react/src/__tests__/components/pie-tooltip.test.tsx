import { useState } from 'react';

import { PieSeries, PieTooltip } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * PieTooltip renders only when both `useCrosshairPosition(chart)` AND
 * `chart.getHoverInfo(seriesId)` resolve non-null.
 *
 * To drive the positive path deterministically we dispatch a mousemove on
 * the overlay canvas at a point inside the large slice's wedge. With slices
 * { Alpha: 40%, Beta: 60% } the pie starts at 12 o'clock going clockwise,
 * so Alpha occupies angles 0°–144° (top → right-bottom) and Beta the
 * remaining 216°. A move below-center lands squarely inside Beta.
 */
describe('PieTooltip', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const slices = [
    { label: 'Alpha', value: 40 },
    { label: 'Beta', value: 60 },
  ];

  function PieWithTooltip() {
    const [id, setId] = useState<string | null>(null);
    return (
      <>
        <PieSeries data={slices} onSeriesId={setId} />
        {id && <PieTooltip seriesId={id} />}
      </>
    );
  }

  it('renders nothing before any hover', () => {
    mounted = mountChart(<PieWithTooltip />);
    expect(mounted.container.textContent).not.toContain('Alpha');
    expect(mounted.container.textContent).not.toContain('Beta');
  });

  it('shows the hovered slice label when mouse is over that slice', () => {
    mounted = mountChart(<PieWithTooltip />, { width: 400, height: 400 });
    // Center X, 50 px below center Y — inside Beta's wedge (180° from top).
    mounted.dispatchMouse('mousemove', { clientX: 200, clientY: 250 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    expect(mounted.container.textContent).toContain('Beta');
  });

  it('clears the tooltip when the cursor leaves the canvas', () => {
    mounted = mountChart(<PieWithTooltip />, { width: 400, height: 400 });

    // Force a known hover state first (as in the test above).
    mounted.dispatchMouse('mousemove', { clientX: 200, clientY: 250 }, mounted.overlayCanvas);
    mounted.flushScheduler();
    // Pre-condition: tooltip is visible. Without this, the mouseleave
    // assertion below could pass trivially by never rendering.
    expect(mounted.container.textContent).toContain('Beta');

    mounted.dispatchMouse('mouseleave', {}, mounted.overlayCanvas);
    mounted.flushScheduler();

    const text = mounted.container.textContent ?? '';
    expect(text).not.toContain('Alpha');
    expect(text).not.toContain('Beta');
  });
});

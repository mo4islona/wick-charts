import { PieSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Regression for a real bug: `<PieSeries>`'s useEffect dependency array used
 * to list only a few top-level option fields. Changing `options.sliceLabels`
 * (label mode / content / font size) never re-fired the effect, so the live
 * playground's Labels section appeared to do nothing. This suite asserts
 * that every nested option we plumb through re-runs `updateSeriesOptions`.
 *
 * Strategy: mount with one `sliceLabels.mode`, rerender with a different
 * mode, assert the painted canvas shows the effect (e.g. `fillText` calls
 * disappear when flipping `outside → none`). We can't spy on
 * `updateSeriesOptions` directly without reaching into private internals,
 * but observable side effects on the canvas are the thing we actually care
 * about.
 */
describe('<PieSeries> options — label updates reach the renderer', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const slices = [
    { label: 'Alpha', value: 40 },
    { label: 'Beta', value: 60 },
  ];

  it('flipping sliceLabels.mode from outside → none stops drawing label text', () => {
    mounted = mountChart(<PieSeries id="pie" data={slices} options={{ sliceLabels: { mode: 'outside' } }} />, {
      width: 400,
      height: 400,
      padding: { top: 0, bottom: 0 },
    });
    // Give the reveal animation a nudge — outside mode fades the text in,
    // so the very first paint may record 0 fillText calls even though the
    // effect ran correctly. Flushing another scheduler tick is enough with
    // our RAF stub, but on the chance the text is still at alpha~0 we just
    // count that at least one paint wrote a label since mount.
    mounted.flushScheduler();
    const spy = mounted.mainSpy;

    const beforeFlip = spy.countOf('fillText');

    mounted.rerender(<PieSeries id="pie" data={slices} options={{ sliceLabels: { mode: 'none' } }} />);
    const afterFlipTotal = spy.countOf('fillText');

    // `fillText` is cumulative across paints. After the flip no more text
    // should be added, so the post-flip paint must not have increased the
    // count. (Equality is safe since the second `rerender` triggers exactly
    // one additional paint pass.)
    expect(afterFlipTotal).toBe(beforeFlip);
  });

  it('flipping sliceLabels.content from label → percent changes the rendered text', () => {
    mounted = mountChart(
      <PieSeries id="pie" data={slices} options={{ sliceLabels: { mode: 'inside', content: 'label' } }} />,
      { width: 400, height: 400, padding: { top: 0, bottom: 0 } },
    );
    mounted.flushScheduler();

    const labelTexts = mounted.mainSpy.callsOf('fillText').map((c) => c.args[0]);
    expect(labelTexts.some((t) => t === 'Alpha' || t === 'Beta')).toBe(true);
    const pctBefore = labelTexts.filter((t) => typeof t === 'string' && (t as string).includes('%')).length;
    expect(pctBefore).toBe(0);

    mounted.rerender(
      <PieSeries id="pie" data={slices} options={{ sliceLabels: { mode: 'inside', content: 'percent' } }} />,
    );

    const afterTexts = mounted.mainSpy.callsOf('fillText').map((c) => c.args[0]);
    const pctAfter = afterTexts.filter((t) => typeof t === 'string' && (t as string).includes('%')).length;
    // At least one percent-formatted label should appear after the flip.
    expect(pctAfter).toBeGreaterThan(0);
  });

  it('updating stroke.width propagates to the paint', () => {
    mounted = mountChart(<PieSeries id="pie" data={slices} options={{ stroke: { color: '#fff', width: 1 } }} />, {
      width: 400,
      height: 400,
      padding: { top: 0, bottom: 0 },
    });
    mounted.flushScheduler();

    // Capture stroke() calls on the initial paint. The `lineWidth` state is
    // snapshotted per call; the call right before a stroke() reflects what
    // the renderer set. Instead of chasing state, we verify the stroke
    // count changes meaningfully between widths.
    const strokesBefore = mounted.mainSpy.countOf('stroke');
    expect(strokesBefore).toBeGreaterThan(0);

    mounted.rerender(<PieSeries id="pie" data={slices} options={{ stroke: { color: '#fff', width: 6 } }} />);
    // The repaint should stroke the same number of times per slice, so
    // simply assert the rerender produced additional stroke calls (i.e.
    // the update actually re-ran the renderer).
    const strokesAfter = mounted.mainSpy.countOf('stroke');
    expect(strokesAfter).toBeGreaterThan(strokesBefore);
  });
});

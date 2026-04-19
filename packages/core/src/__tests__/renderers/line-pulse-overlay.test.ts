/**
 * Issue 4 — `overlayNeedsAnimation` must factor in the chart-level `pulseMs`
 * so the overlay RAF loop doesn't stay alive at 60fps when the pulse cycle
 * is disabled. `hasPulse` alone is not enough: per-series `pulse: true` +
 * `pulseMs: 0` means "draw nothing, animate nothing".
 */
import { describe, expect, it } from 'vitest';

import { LineRenderer } from '../../series/line';

describe('LineRenderer overlay animation gate', () => {
  it('overlayNeedsAnimation is false when pulseMs resolves to 0', () => {
    const r = new LineRenderer(1, { pulse: true, pulseMs: 0 });
    r.setData([{ time: 10, value: 5 }]);

    expect(r.overlayNeedsAnimation).toBe(false);
  });

  it('overlayNeedsAnimation is false when pulseMs resolves to false', () => {
    const r = new LineRenderer(1, { pulse: true, pulseMs: false });
    r.setData([{ time: 10, value: 5 }]);

    expect(r.overlayNeedsAnimation).toBe(false);
  });

  it('overlayNeedsAnimation is true when pulse is on and pulseMs is positive', () => {
    const r = new LineRenderer(1, { pulse: true, pulseMs: 600 });
    r.setData([{ time: 10, value: 5 }]);

    expect(r.overlayNeedsAnimation).toBe(true);
  });

  it('overlayNeedsAnimation is false when the per-series pulse is off, regardless of pulseMs', () => {
    const r = new LineRenderer(1, { pulse: false, pulseMs: 600 });
    r.setData([{ time: 10, value: 5 }]);

    expect(r.overlayNeedsAnimation).toBe(false);
  });
});

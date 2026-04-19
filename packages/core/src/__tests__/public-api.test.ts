import { describe, expect, it } from 'vitest';

import * as core from '../index';

/**
 * Guards that consumers can reach the new format helpers via the public
 * entry point. Framework-specific re-exports are covered by their own test
 * suites; this one just asserts the core export surface.
 */
describe('public API: format helpers', () => {
  it('exports formatCompact and formatPriceAdaptive', () => {
    expect(typeof core.formatCompact).toBe('function');
    expect(typeof core.formatPriceAdaptive).toBe('function');
  });

  it('formatCompact from the index matches the expected output for a sample', () => {
    expect(core.formatCompact(5.4e12)).toBe('5.40T');
  });

  it('formatPriceAdaptive from the index preserves sub-cent precision', () => {
    expect(core.formatPriceAdaptive(0.00001234)).toBe('0.00001234');
  });
});

// Type-level checks: `tsc --noEmit` (`pnpm typecheck`) fails on a regression; at runtime they are no-ops.
import { describe, expectTypeOf, it } from 'vitest';

import type { ChartInstance } from '../chart';
import type { NavigatorDataInput } from '../navigator/types';
import type { BandPoint, LineSeriesOptions, OHLCData, OHLCInput, TimePoint } from '../types';

describe('public option types', () => {
  it('takes a line `area` with only the baseline, since `visible` defaults on', () => {
    expectTypeOf({ area: { baseline: 0 } }).toMatchTypeOf<Partial<LineSeriesOptions>>();
  });

  it('keeps the nested fields that have no default required', () => {
    expectTypeOf({ points: { radius: 4 } }).not.toMatchTypeOf<Partial<LineSeriesOptions>>();
    expectTypeOf({ threshold: { value: 0 } }).not.toMatchTypeOf<Partial<LineSeriesOptions>>();
  });
});

describe('navigator data', () => {
  it('takes the `OHLCInput[]` a candlestick series takes', () => {
    expectTypeOf<{ type: 'candlestick'; points: OHLCInput[] }>().toMatchTypeOf<NavigatorDataInput>();
  });

  it('takes `Date` times on line points', () => {
    expectTypeOf<{ type: 'line'; points: { time: Date; value: number }[] }>().toMatchTypeOf<NavigatorDataInput>();
  });
});

describe('chart point getters', () => {
  it('return the named point shape', () => {
    const atTime = (chart: ChartInstance) => chart.getDataAtTime<OHLCData>('candles', 0)?.close;
    const last = (chart: ChartInstance) => chart.getLastData<TimePoint>('line')?.value;

    expectTypeOf(atTime).returns.toEqualTypeOf<number | undefined>();
    expectTypeOf(last).returns.toEqualTypeOf<number | undefined>();
  });

  it('return the union without a type argument', () => {
    const atTime = (chart: ChartInstance) => chart.getDataAtTime('any', 0);

    expectTypeOf(atTime).returns.toEqualTypeOf<OHLCData | TimePoint | BandPoint | null>();
  });
});

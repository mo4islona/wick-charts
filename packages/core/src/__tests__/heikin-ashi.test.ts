import { describe, expect, it } from 'vitest';

import { heikinAshi, heikinAshiStream } from '../data/heikin-ashi';
import type { OHLCData } from '../types';

const SOURCE: OHLCData[] = [
  { time: 1, open: 10, high: 14, low: 9, close: 12, volume: 100 },
  { time: 2, open: 12, high: 13, low: 8, close: 9, volume: 250 },
  { time: 3, open: 9, high: 15, low: 9, close: 14 },
  { time: 4, open: 14, high: 14.5, low: 11, close: 11.5, volume: 80 },
];

describe('heikinAshi', () => {
  it('derives each candle from its own prices and the previous Heikin-Ashi body', () => {
    const [first, second] = heikinAshi(SOURCE);

    expect(first).toEqual({ time: 1, open: 11, high: 14, low: 9, close: 11.25, volume: 100 });
    // open = (11 + 11.25) / 2; close = (12 + 13 + 8 + 9) / 4.
    expect(second.open).toBeCloseTo(11.125, 10);
    expect(second.close).toBeCloseTo(10.5, 10);
    expect(second.high).toBe(13);
    expect(second.low).toBe(8);
  });

  it('widens high and low to cover the Heikin-Ashi body', () => {
    // A tight bar after a far-away body: the new open lies outside its own high-low range.
    const [, next] = heikinAshi([
      { time: 1, open: 100, high: 101, low: 99, close: 100 },
      { time: 2, open: 50, high: 51, low: 49, close: 50 },
    ]);

    expect(next.open).toBe(100);
    expect(next.high).toBe(100);
    expect(next.low).toBe(49);
  });

  it('is pure: it keeps every other field and leaves the input untouched', () => {
    const input = SOURCE.map((candle) => ({ ...candle, label: `#${candle.time}` }));
    const snapshot = structuredClone(input);

    const result = heikinAshi(input);

    expect(input).toEqual(snapshot);
    expect(result.map((c) => c.label)).toEqual(['#1', '#2', '#3', '#4']);
    expect(result.map((c) => c.volume)).toEqual([100, 250, undefined, 80]);
    expect(result[0]).not.toBe(input[0]);
  });

  it('returns an empty series for empty input', () => {
    expect(heikinAshi([])).toEqual([]);
  });
});

describe('heikinAshiStream', () => {
  it('append matches the batch output candle for candle', () => {
    const stream = heikinAshiStream<OHLCData>();
    const streamed = SOURCE.map((candle) => stream.append(candle));

    expect(streamed).toEqual(heikinAshi(SOURCE));
  });

  it('update rebuilds only the newest candle, as a batch run over the edited history does', () => {
    const stream = heikinAshiStream<OHLCData>();
    stream.setData(SOURCE.slice(0, 3));
    const ticks: OHLCData[] = [
      { time: 3, open: 9, high: 16, low: 9, close: 15.5 },
      { time: 3, open: 9, high: 16, low: 7, close: 8 },
    ];

    for (const tick of ticks) {
      const updated = stream.update(tick);
      const batch = heikinAshi([...SOURCE.slice(0, 2), tick]);

      expect(updated).toEqual(batch[2]);
    }
  });

  it('append after updates continues from the last update', () => {
    const stream = heikinAshiStream<OHLCData>();
    stream.setData(SOURCE.slice(0, 2));
    const finalThird: OHLCData = { time: 3, open: 9, high: 15, low: 9, close: 14 };
    stream.append({ time: 3, open: 9, high: 10, low: 9, close: 9.5 });
    stream.update(finalThird);

    const fourth = stream.append(SOURCE[3]);

    expect(fourth).toEqual(heikinAshi([...SOURCE.slice(0, 2), finalThird, SOURCE[3]])[3]);
  });

  it('setData returns the batch series and resets the state', () => {
    const stream = heikinAshiStream<OHLCData>();
    stream.append({ time: 0, open: 500, high: 500, low: 500, close: 500 });

    expect(stream.setData(SOURCE)).toEqual(heikinAshi(SOURCE));
    expect(stream.append({ time: 5, open: 11, high: 12, low: 10, close: 11 })).toEqual(
      heikinAshi([...SOURCE, { time: 5, open: 11, high: 12, low: 10, close: 11 }])[4],
    );
  });

  it('update on an empty stream starts the series', () => {
    const stream = heikinAshiStream<OHLCData>();

    expect(stream.update(SOURCE[0])).toEqual(heikinAshi([SOURCE[0]])[0]);
  });
});

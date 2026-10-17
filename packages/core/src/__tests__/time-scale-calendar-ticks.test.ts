import { describe, expect, it } from 'vitest';

import { timeTicks } from '../scales/time-ticks';
import { XScale } from '../scales/x-scale';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const ZONES = ['UTC', 'America/New_York', 'Asia/Kolkata', 'Australia/Sydney'];

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
}

function wallClock(t: number, timeZone: string): WallClock {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
  });
  const fields: Record<string, string> = {};
  for (const part of format.formatToParts(t)) {
    fields[part.type] = part.value;
  }

  return {
    year: Number(fields.year),
    month: Number(fields.month),
    day: Number(fields.day),
    hour: Number(fields.hour),
    minute: Number(fields.minute),
    weekday: fields.weekday,
  };
}

function ticksFor(args: { from: number; to: number; dataInterval: number; timeZone?: string; width?: number }): {
  ticks: number[];
  tickInterval: number;
} {
  const scale = new XScale();
  scale.setTimeZone(args.timeZone);
  scale.update({ from: args.from, to: args.to }, args.width ?? 800, 1, args.dataInterval);

  return scale.niceTickValues(args.dataInterval);
}

describe('time-axis ticks fall on calendar boundaries', () => {
  describe.each(ZONES)('in %s', (timeZone) => {
    it('puts year ticks on Jan 1 across 77 years of monthly data', () => {
      const { ticks, tickInterval } = ticksFor({
        from: Date.UTC(1948, 0, 1),
        to: Date.UTC(2024, 11, 1),
        dataInterval: MONTH,
        timeZone,
      });

      expect(tickInterval).toBe(10 * YEAR);
      expect(ticks.length).toBeGreaterThanOrEqual(7);
      for (const tick of ticks) {
        const wall = wallClock(tick, timeZone);
        expect(wall).toMatchObject({ month: 1, day: 1, hour: 0, minute: 0 });
        expect(wall.year % 10).toBe(0);
      }
    });

    it('labels the tick before a 2020 region as 2020-01-01, not a late-December 2019', () => {
      const { ticks } = ticksFor({
        from: Date.UTC(2014, 0, 1),
        to: Date.UTC(2024, 0, 1),
        dataInterval: MONTH,
        timeZone,
      });
      const regionStart = Date.UTC(2020, 1, 1);
      const before = ticks.filter((t) => t <= regionStart);
      const last = before[before.length - 1];

      expect(wallClock(last, timeZone)).toMatchObject({ year: 2020, month: 1, day: 1, hour: 0 });
    });

    it('puts month ticks on the 1st, through a leap February', () => {
      const { ticks, tickInterval } = ticksFor({
        from: Date.UTC(2019, 5, 10),
        to: Date.UTC(2020, 5, 10),
        dataInterval: DAY,
        timeZone,
        width: 1200,
      });

      expect(tickInterval).toBe(MONTH);
      expect(ticks.map((t) => wallClock(t, timeZone).month)).toEqual([7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]);
      for (const tick of ticks) {
        expect(wallClock(tick, timeZone)).toMatchObject({ day: 1, hour: 0, minute: 0 });
      }
    });

    it('puts quarter ticks on Jan, Apr, Jul and Oct 1', () => {
      const { ticks, tickInterval } = ticksFor({
        from: Date.UTC(2021, 1, 15),
        to: Date.UTC(2023, 1, 15),
        dataInterval: DAY,
        timeZone,
      });

      expect(tickInterval).toBe(90 * DAY);
      expect(ticks.length).toBeGreaterThanOrEqual(7);
      for (const tick of ticks) {
        const wall = wallClock(tick, timeZone);
        expect(wall).toMatchObject({ day: 1, hour: 0, minute: 0 });
        expect([1, 4, 7, 10]).toContain(wall.month);
      }
    });

    it('puts week ticks on Monday midnight', () => {
      const { ticks, tickInterval } = ticksFor({
        from: Date.UTC(2024, 0, 3),
        to: Date.UTC(2024, 2, 3),
        dataInterval: DAY,
        timeZone,
      });

      expect(tickInterval).toBe(7 * DAY);
      expect(ticks.length).toBeGreaterThanOrEqual(7);
      for (const tick of ticks) {
        expect(wallClock(tick, timeZone)).toMatchObject({ weekday: 'Mon', hour: 0, minute: 0 });
      }
    });

    it('puts sub-day ticks on whole wall-clock hours', () => {
      const { ticks, tickInterval } = ticksFor({
        from: Date.UTC(2024, 5, 1),
        to: Date.UTC(2024, 5, 4),
        dataInterval: HOUR,
        timeZone,
      });

      expect(tickInterval).toBe(12 * HOUR);
      for (const tick of ticks) {
        const wall = wallClock(tick, timeZone);
        expect(wall.minute).toBe(0);
        expect(wall.hour % 12).toBe(0);
      }
    });
  });

  it('keeps day ticks on midnight through a spring-forward day', () => {
    const timeZone = 'America/New_York';
    const { ticks, tickInterval } = ticksFor({
      from: Date.UTC(2024, 2, 5),
      to: Date.UTC(2024, 2, 15),
      dataInterval: HOUR,
      timeZone,
    });

    expect(tickInterval).toBe(DAY);
    const days = ticks.map((t) => wallClock(t, timeZone));
    for (let i = 0; i < days.length; i++) {
      expect(days[i]).toMatchObject({ hour: 0, minute: 0 });
      if (i > 0) expect(days[i].day).toBe(days[i - 1].day + 1);
    }
    // March 10 is 23 hours long.
    expect(ticks).toContain(Date.UTC(2024, 2, 10, 5));
    expect(ticks).toContain(Date.UTC(2024, 2, 11, 4));
  });

  it('keeps half-hour ticks through the repeated hour of a fall-back night', () => {
    const timeZone = 'America/New_York';
    const { ticks, tickInterval } = ticksFor({
      from: Date.UTC(2024, 10, 3, 4),
      to: Date.UTC(2024, 10, 3, 9),
      dataInterval: MINUTE,
      timeZone,
    });

    expect(tickInterval).toBe(30 * MINUTE);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i] - ticks[i - 1]).toBe(30 * MINUTE);
    }
    for (const tick of ticks) {
      expect(wallClock(tick, timeZone).minute % 30).toBe(0);
    }
  });

  it('skips the missing hour of a spring-forward night without a duplicate tick', () => {
    const timeZone = 'America/New_York';
    const { ticks } = ticksFor({
      from: Date.UTC(2024, 2, 10, 5),
      to: Date.UTC(2024, 2, 10, 10),
      dataInterval: MINUTE,
      timeZone,
    });

    expect(new Set(ticks).size).toBe(ticks.length);
    const hours = ticks.map((t) => wallClock(t, timeZone).hour);
    expect(hours).not.toContain(2);
    expect(hours).toContain(3);
  });

  it('uses the local zone when none is set', () => {
    const { ticks } = ticksFor({
      from: new Date(1948, 0, 1).getTime(),
      to: new Date(2024, 11, 1).getTime(),
      dataInterval: MONTH,
    });

    expect(ticks.length).toBeGreaterThanOrEqual(7);
    for (const tick of ticks) {
      const date = new Date(tick);
      expect([date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([0, 1, 0, 0]);
    }
  });
});

describe('sub-day ticks across DST shifts', () => {
  function tierTicks(args: { from: string; to: string; interval: number; timeZone: string }): number[] {
    const { interval, timeZone } = args;

    return timeTicks({ from: Date.parse(args.from), to: Date.parse(args.to), interval, timeZone, max: 500 });
  }

  it('keeps both copies of the repeated hour when the grid starts inside it (Sydney)', () => {
    const ticks = tierTicks({
      from: '2024-04-06T15:15Z',
      to: '2024-04-06T18:00Z',
      interval: 30 * MINUTE,
      timeZone: 'Australia/Sydney',
    });

    const utc = ['15:30', '16:00', '16:30', '17:00', '17:30', '18:00'];
    expect(ticks).toEqual(utc.map((hm) => Date.parse(`2024-04-06T${hm}Z`)));
  });

  it('skips a boundary the spring-forward jump removes instead of moving it off the grid', () => {
    const timeZone = 'America/New_York';
    const ticks = tierTicks({ from: '2024-03-10T05:00Z', to: '2024-03-10T14:00Z', interval: 2 * HOUR, timeZone });

    expect(ticks.map((t) => wallClock(t, timeZone).hour)).toEqual([0, 4, 6, 8, 10]);
  });

  it('keeps a boundary the spring-forward jump pulls in before the right edge', () => {
    const timeZone = 'America/New_York';
    const ticks = tierTicks({ from: '2024-03-10T05:00Z', to: '2024-03-10T10:30Z', interval: 6 * HOUR, timeZone });

    expect(ticks).toEqual([Date.parse('2024-03-10T05:00Z'), Date.parse('2024-03-10T10:00Z')]);
  });

  const SHIFTS = [
    { timeZone: 'America/New_York', from: '2024-03-09T12:00Z', to: '2024-03-11T12:00Z' },
    { timeZone: 'America/New_York', from: '2024-11-02T12:00Z', to: '2024-11-04T12:00Z' },
    { timeZone: 'Australia/Sydney', from: '2024-04-05T12:00Z', to: '2024-04-07T12:00Z' },
    { timeZone: 'Australia/Sydney', from: '2024-10-05T12:00Z', to: '2024-10-07T12:00Z' },
    { timeZone: 'Australia/Lord_Howe', from: '2024-04-06T00:00Z', to: '2024-04-08T00:00Z' },
  ];
  const TIERS = [15 * MINUTE, 30 * MINUTE, HOUR, 2 * HOUR, 6 * HOUR];

  it.each(SHIFTS)('gives every wall-clock multiple through a shift in $timeZone from $from', (shift) => {
    // Every tier and zone offset here is a multiple of 15 minutes, so the 15-minute instants hold every tick.
    const start = Date.parse(shift.from);
    const end = Date.parse(shift.to);
    const instants: { t: number; minuteOfDay: number }[] = [];
    for (let t = start; t <= end; t += 15 * MINUTE) {
      const { hour, minute } = wallClock(t, shift.timeZone);
      instants.push({ t, minuteOfDay: hour * 60 + minute });
    }

    for (const interval of TIERS) {
      const expected = instants.filter((s) => s.minuteOfDay % (interval / MINUTE) === 0).map((s) => s.t);
      const ticksIn = (from: number, to: number) =>
        timeTicks({ from, to, interval, timeZone: shift.timeZone, max: 500 });

      expect(expected.length).toBeGreaterThan(0);
      for (const { t } of instants) {
        expect(ticksIn(t, end)).toEqual(expected.filter((tick) => tick >= t));
        expect(ticksIn(start, t)).toEqual(expected.filter((tick) => tick <= t));
      }
    }
  });

  it('moves a midnight the jump skips forward to the first hour of the day (Santiago)', () => {
    const timeZone = 'America/Santiago';
    const ticks = tierTicks({ from: '2024-09-06T12:00Z', to: '2024-09-10T12:00Z', interval: DAY, timeZone });

    const days = ticks.map((t) => wallClock(t, timeZone));
    expect(days.map((d) => d.day)).toEqual([7, 8, 9, 10]);
    expect(days.map((d) => d.hour)).toEqual([0, 1, 0, 0]);
  });
});

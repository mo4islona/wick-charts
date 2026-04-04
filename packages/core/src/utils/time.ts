const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

export function detectInterval(times: number[]): number {
  if (times.length < 2) return DAY;
  const diffs: number[] = [];
  for (let i = 1; i < Math.min(times.length, 20); i++) {
    diffs.push(times[i] - times[i - 1]);
  }
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

export function formatTime(timestamp: number, interval: number): string {
  const d = new Date(timestamp * 1000);
  if (interval >= DAY) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (interval >= HOUR) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function niceTimeIntervals(interval: number): number[] {
  const sub_minute = [1, 5, 10, 15, 30];
  const sub_hour = [MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE];
  const sub_day = [HOUR, 2 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR];
  const days = [DAY, 7 * DAY, 30 * DAY, 90 * DAY, 365 * DAY];

  // Always include all larger interval tiers so zoomed-out views
  // can escalate beyond the data interval's native granularity
  if (interval < MINUTE) return [...sub_minute, ...sub_hour, ...sub_day, ...days];
  if (interval < HOUR) return [...sub_hour, ...sub_day, ...days];
  if (interval < DAY) return [...sub_day, ...days];
  return days;
}

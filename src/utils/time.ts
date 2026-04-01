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
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (interval >= HOUR) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function niceTimeIntervals(interval: number): number[] {
  if (interval < MINUTE) return [1, 5, 10, 15, 30];
  if (interval < HOUR) return [MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE];
  if (interval < DAY) return [HOUR, 2 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR];
  return [DAY, 7 * DAY, 30 * DAY, 90 * DAY, 365 * DAY];
}

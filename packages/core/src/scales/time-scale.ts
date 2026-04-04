import type { VisibleRange } from '../types';
import { detectInterval, niceTimeIntervals } from '../utils/time';

export class TimeScale {
  private from = 0;
  private to = 0;
  private width = 1;
  private pixelRatio = 1;

  update(range: VisibleRange, mediaWidth: number, pixelRatio: number): void {
    this.from = range.from;
    this.to = range.to;
    this.width = mediaWidth;
    this.pixelRatio = pixelRatio;
  }

  timeToX(time: number): number {
    if (this.to <= this.from) return 0;
    return ((time - this.from) / (this.to - this.from)) * this.width;
  }

  timeToBitmapX(time: number): number {
    return Math.round(this.timeToX(time) * this.pixelRatio);
  }

  xToTime(x: number): number {
    if (this.to <= this.from) return this.from;
    return this.from + (x / this.width) * (this.to - this.from);
  }

  pixelDeltaToTimeDelta(pixelDelta: number): number {
    if (this.to <= this.from) return 0;
    return (pixelDelta / this.width) * (this.to - this.from);
  }

  barWidthMedia(dataInterval: number): number {
    if (this.to <= this.from) return 0;
    return (dataInterval / (this.to - this.from)) * this.width;
  }

  barWidthBitmap(dataInterval: number): number {
    return Math.max(1, Math.round(this.barWidthMedia(dataInterval) * this.pixelRatio));
  }

  niceTickValues(dataInterval: number): { ticks: number[]; tickInterval: number } {
    if (this.to <= this.from) return { ticks: [], tickInterval: 0 };
    const intervals = niceTimeIntervals(dataInterval);
    const minPixelSpacing = 80;
    const timePerPixel = (this.to - this.from) / this.width;
    const minTimeSpacing = timePerPixel * minPixelSpacing;

    let tickInterval = intervals[intervals.length - 1];
    for (const interval of intervals) {
      if (interval >= minTimeSpacing) {
        tickInterval = interval;
        break;
      }
    }

    const ticks: number[] = [];
    const start = Math.ceil(this.from / tickInterval) * tickInterval;
    for (let t = start; t <= this.to; t += tickInterval) {
      ticks.push(t);
    }
    return { ticks, tickInterval };
  }

  getRange(): VisibleRange {
    return { from: this.from, to: this.to };
  }

  getMediaWidth(): number {
    return this.width;
  }
}

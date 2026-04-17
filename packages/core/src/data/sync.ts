import type { ChartInstance } from '../chart';
import type { TimeValue } from '../types';

/**
 * Smart data synchronization for time-series.
 * Decides between full replace, in-place update, or incremental append
 * based on how the data array changed since the last call.
 *
 * Accepts raw user data (time may be number or Date) — normalization
 * happens inside the ChartInstance methods this function delegates to.
 *
 * Returns the new prevLen to be stored for the next call.
 */
export function syncSeriesData(chart: ChartInstance, id: string, data: { time: TimeValue }[], prevLen: number): number {
  if (data.length === 0) {
    // Clear the series and reset prevLen so the next call treats it as a fresh load
    chart.setSeriesData(id, [] as any);
    return 0;
  }

  if (prevLen === 0 || data.length < prevLen || data.length - prevLen > 5) {
    chart.setSeriesData(id, data as any);
  } else if (data.length === prevLen) {
    chart.updateData(id, data[data.length - 1] as any);
  } else {
    for (let i = prevLen; i < data.length; i++) {
      chart.appendData(id, data[i] as any);
    }
  }

  return data.length;
}

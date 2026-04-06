import type { ChartInstance } from '../chart';

/**
 * Smart data synchronization for time-series.
 * Decides between full replace, in-place update, or incremental append
 * based on how the data array changed since the last call.
 *
 * When `data` is empty the series is cleared via `chart.setSeriesData(id, [])`
 * and the returned prevLen resets to 0 so the next non-empty call does a full replace.
 *
 * Returns the new prevLen to be stored for the next call.
 */
export function syncSeriesData(chart: ChartInstance, id: string, data: { time: number }[], prevLen: number): number {
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

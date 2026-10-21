/**
 * Series, data and features a numeric or category X axis can't take, surfaced
 * to the integrator: a hard error for an unsupported series, dev-mode
 * warnings for the rest.
 */

import type { XAxisType } from '../types';

/** Throw when a series' definition doesn't list the chart's X axis type. */
export function assertSeriesFitsXAxis(args: {
  seriesType: string;
  axisType: XAxisType;
  supported: readonly XAxisType[];
}): void {
  const { seriesType, axisType, supported } = args;
  if (supported.includes(axisType)) return;

  const list = supported.map((type) => `'${type}'`).join(', ');

  throw new Error(
    `[wick-charts] A '${seriesType}' series can't plot on a '${axisType}' X axis — it supports ${list}. ` +
      'Set axis.x.type to a supported type, or declare `xTypes` on a custom series definition.',
  );
}

/** Dev-only: a point whose `x` doesn't fit the axis is skipped. */
export function warnXMisfit(args: { seriesId: string; axisType: XAxisType; x: unknown }): void {
  if (process.env.NODE_ENV === 'production') return;

  const expected = args.axisType === 'category' ? 'a string `x` (the category name)' : 'a number `x`';

  console.warn(
    `[wick-charts] Series '${args.seriesId}' has a point with x = ${String(args.x)}, which doesn't fit the ` +
      `'${args.axisType}' X axis — it needs ${expected}. Such points are skipped.`,
  );
}

/** Dev-only: one series keys some points by `x` and some by `time`. */
export function warnXTimeMixed(args: { seriesId: string }): void {
  if (process.env.NODE_ENV === 'production') return;

  console.warn(
    `[wick-charts] Series '${args.seriesId}' mixes \`x\` and \`time\` keys. On a numeric or category X axis ` +
      'key every point by `x`.',
  );
}

/** Dev-only: a time-only feature on a numeric or category axis does nothing. */
export function warnTimeOnlyFeature(args: { feature: string; axisType: XAxisType }): void {
  if (process.env.NODE_ENV === 'production') return;

  console.warn(
    `[wick-charts] ${args.feature} works on a time X axis only — it is disabled on this '${args.axisType}' axis.`,
  );
}

/** Dev-only: `axis.x.type` is read at construction only. */
export function warnXTypeChange(args: { from: XAxisType; to: XAxisType }): void {
  if (process.env.NODE_ENV === 'production') return;

  console.warn(
    `[wick-charts] axis.x.type changed from '${args.from}' to '${args.to}' after the chart was created — ` +
      'the change is ignored. Remount the chart (e.g. a React `key`) to switch the X axis type.',
  );
}

/** Dev-only: a requested visible range spans less than two data steps, so the chart can't show it. */
export function warnRangeTooNarrow(args: {
  from: number;
  to: number;
  interval: number;
  source: 'setVisibleRange' | 'initialRange';
}): void {
  if (process.env.NODE_ENV === 'production') return;

  const { from, to, interval, source } = args;
  const outcome =
    source === 'setVisibleRange'
      ? 'so the chart keeps its current range'
      : 'so the chart shows its default window until a series with a finer step lands';

  console.warn(
    `[wick-charts] ${source === 'setVisibleRange' ? 'setVisibleRange' : 'viewport.initialRange'}: the range ` +
      `${from} .. ${to} spans less than two data steps (a step is ${interval}), ${outcome}.`,
  );
}

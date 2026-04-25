import type { TimeScale } from '../scales/time-scale';
import type { YScale } from '../scales/y-scale';
import { resolveCandlestickBodyColor } from '../theme/resolve';
import type { ChartTheme } from '../theme/types';
import type { VisibleRange } from '../types';
import type { NavigatorCandlePoint, NavigatorLinePoint } from './types';

export interface NavigatorRenderContext {
  ctx: CanvasRenderingContext2D;
  timeScale: TimeScale;
  yScale: YScale;
  mediaWidth: number;
  mediaHeight: number;
  theme: ChartTheme['navigator'];
}

export function renderBackground(rc: NavigatorRenderContext): void {
  const { ctx, theme, mediaWidth, mediaHeight } = rc;
  // `transparent` produces a no-op fill; explicit themes still paint here.
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, mediaWidth, mediaHeight);
}

export function renderMiniLine(
  rc: NavigatorRenderContext,
  points: readonly NavigatorLinePoint[],
  drawArea = true,
): void {
  if (points.length < 2) return;
  const { ctx, timeScale, yScale, mediaHeight, theme } = rc;

  if (drawArea) {
    // Area fill — gradient from areaTopColor to areaBottomColor, closed to the
    // bottom edge. Stroke is drawn separately below.
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const x = timeScale.timeToX(p.time);
      const y = yScale.valueToY(p.value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(timeScale.timeToX(points[points.length - 1].time), mediaHeight);
    ctx.lineTo(timeScale.timeToX(points[0].time), mediaHeight);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, mediaHeight);
    grad.addColorStop(0, theme.line.areaTopColor);
    grad.addColorStop(1, theme.line.areaBottomColor);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Stroke pass — independent of the area path so multi-series strokes can
  // skip the fill without leaving a stale area subpath behind.
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = timeScale.timeToX(p.time);
    const y = yScale.valueToY(p.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = theme.line.color;
  ctx.lineWidth = theme.line.width;
  ctx.stroke();
}

export function renderMiniBar(rc: NavigatorRenderContext, points: readonly NavigatorLinePoint[]): void {
  if (points.length === 0) return;
  const { ctx, timeScale, yScale, mediaHeight, theme } = rc;

  // One bar per point. Width ≈ the pixel span between adjacent points, min 1.
  const barWidth = Math.max(
    1,
    points.length > 1 ? Math.abs(timeScale.timeToX(points[1].time) - timeScale.timeToX(points[0].time)) * 0.8 : 2,
  );

  ctx.fillStyle = theme.line.color;
  for (const p of points) {
    const x = timeScale.timeToX(p.time);
    const y = yScale.valueToY(p.value);
    const h = Math.max(1, mediaHeight - y);
    ctx.fillRect(x - barWidth / 2, y, barWidth, h);
  }
}

export function renderMiniCandlestick(rc: NavigatorRenderContext, points: readonly NavigatorCandlePoint[]): void {
  if (points.length === 0) return;
  const { ctx, timeScale, yScale, theme } = rc;

  const candleWidth = Math.max(
    1,
    points.length > 1 ? Math.abs(timeScale.timeToX(points[1].time) - timeScale.timeToX(points[0].time)) * 0.75 : 2,
  );

  for (const p of points) {
    const up = p.close >= p.open;
    const colors = up ? theme.candlestick.up : theme.candlestick.down;
    const bodyColor = resolveCandlestickBodyColor(colors.body);
    const x = timeScale.timeToX(p.time);
    const yOpen = yScale.valueToY(p.open);
    const yClose = yScale.valueToY(p.close);
    const yHigh = yScale.valueToY(p.high);
    const yLow = yScale.valueToY(p.low);

    ctx.strokeStyle = colors.wick;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(1, Math.abs(yClose - yOpen));
    ctx.fillStyle = bodyColor;
    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyH);
  }
}

export function renderWindow(rc: NavigatorRenderContext, visible: VisibleRange, dataRange: VisibleRange): void {
  const { ctx, timeScale, mediaWidth, mediaHeight, theme } = rc;
  if (dataRange.to <= dataRange.from) return;

  const fromClamped = Math.max(dataRange.from, Math.min(dataRange.to, visible.from));
  const toClamped = Math.max(dataRange.from, Math.min(dataRange.to, visible.to));
  const x1 = timeScale.timeToX(fromClamped);
  const x2 = timeScale.timeToX(toClamped);
  const left = Math.min(x1, x2);
  const width = Math.max(1, Math.abs(x2 - x1));

  // Mask outside the window.
  ctx.fillStyle = theme.mask.fill;
  if (left > 0) ctx.fillRect(0, 0, left, mediaHeight);
  if (left + width < mediaWidth) {
    ctx.fillRect(left + width, 0, mediaWidth - (left + width), mediaHeight);
  }

  // Window body.
  ctx.fillStyle = theme.window.fill;
  ctx.fillRect(left, 0, width, mediaHeight);

  // Border.
  if (theme.window.borderWidth > 0) {
    ctx.strokeStyle = theme.window.border;
    ctx.lineWidth = theme.window.borderWidth;
    ctx.strokeRect(left + 0.5, 0.5, width - 1, mediaHeight - 1);
  }

  // Handles — left and right vertical bars on the edges.
  ctx.fillStyle = theme.handle.color;
  const hw = theme.handle.width;
  ctx.fillRect(left - hw / 2, 0, hw, mediaHeight);
  ctx.fillRect(left + width - hw / 2, 0, hw, mediaHeight);
}

/** Geometry of the window rect in media pixels — returned for hit-testing. */
export interface WindowGeometry {
  left: number;
  right: number;
  width: number;
}

export function computeWindowGeometry(
  timeScale: TimeScale,
  visible: VisibleRange,
  dataRange: VisibleRange,
): WindowGeometry {
  const fromClamped = Math.max(dataRange.from, Math.min(dataRange.to, visible.from));
  const toClamped = Math.max(dataRange.from, Math.min(dataRange.to, visible.to));
  const x1 = timeScale.timeToX(fromClamped);
  const x2 = timeScale.timeToX(toClamped);
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);

  return { left, right, width: Math.max(1, right - left) };
}

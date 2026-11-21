import type { SKRSContext2D } from '@napi-rs/canvas';

export interface TextStyle {
  size: number;
  family: string;
  color: string;
  weight?: number;
}

export interface TextBox {
  width: number;
  /** Line box above the baseline, as CSS `line-height: normal` lays it out. */
  ascent: number;
  descent: number;
}

export function cssFont(style: TextStyle): string {
  return `${style.weight ?? 400} ${style.size}px ${style.family}`;
}

export function measureText(params: { ctx: SKRSContext2D; text: string; style: TextStyle }): TextBox {
  const { ctx, text, style } = params;
  ctx.save();
  ctx.font = cssFont(style);
  const metrics = ctx.measureText(text);
  ctx.restore();

  return {
    width: metrics.width,
    ascent: metrics.fontBoundingBoxAscent,
    descent: metrics.fontBoundingBoxDescent,
  };
}

/** Draw `text` with its baseline at `y`. */
export function drawText(params: {
  ctx: SKRSContext2D;
  text: string;
  style: TextStyle;
  x: number;
  y: number;
  align?: CanvasTextAlign;
  opacity?: number;
  maxWidth?: number;
}): void {
  const { ctx, text, style, x, y } = params;
  ctx.save();
  ctx.font = cssFont(style);
  ctx.fillStyle = style.color;
  ctx.textAlign = params.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = params.opacity ?? 1;
  ctx.fillText(fitText({ ctx, text, maxWidth: params.maxWidth }), x, y);
  ctx.restore();
}

/** Cut `text` to `maxWidth` with an ellipsis, as CSS `text-overflow: ellipsis`. */
function fitText(params: { ctx: SKRSContext2D; text: string; maxWidth: number | undefined }): string {
  const { ctx, text, maxWidth } = params;
  if (maxWidth === undefined || ctx.measureText(text).width <= maxWidth) return text;

  for (let end = text.length - 1; end > 0; end--) {
    const cut = `${text.slice(0, end)}…`;
    if (ctx.measureText(cut).width <= maxWidth) return cut;
  }

  return '';
}

/**
 * Built-in loading presets for `chart.setEdgeIndicator` / `<EdgeLoader
 * indicator>`. Glass, condense, aurora and halftone run a WebGL2 shader and
 * fall back to a flat 2D drawing without it; dust is plain 2D. Every preset
 * adapts to the series kind and to the real marks' sizes.
 *
 * Nothing in this module runs at import: each preset is a plain function and
 * compiles its shader on its first frame, so a bundler drops every preset an
 * app doesn't import.
 */

import type { LoadingIndicatorArgs, LoadingIndicatorFn } from '../loading-indicator';
import { drawFlatShapes, placeholderShapes, reportCandles, shapeUniforms, shapesGlsl } from './placeholders';
import { SHADER_PRELUDE, type ShaderPainter, createShaderPainter, stageUniforms } from './shader-stage';

const GLASS_MAIN = `
void main() {
  vec2 p = stagePx();
  float dist = boundaryDistance(p);
  vec2 hit = shapes(p);
  bool line = u_mode > 0.5;

  float aa = 0.75 * u_pr;
  float fill = 1.0 - smoothstep(-aa, aa, hit.x);
  float rim = line ? 0.0 : 1.0 - smoothstep(0.0, 1.1 * u_pr, abs(hit.x + 0.6 * u_pr));
  float gloss = shapeGloss(p, hit.y);
  float glow = line ? exp(-max(hit.x, 0.0) / (4.0 * u_pr)) * 0.14 : 0.0;

  float period = 1.9;
  float span = u_res.x + 0.4 * u_res.y + 120.0 * u_pr;
  float travel = fract(u_time / period) * span - 60.0 * u_pr;
  float diagonal = dist + (p.y - u_anchor) * 0.4;
  float band = exp(-pow((diagonal - travel) / (22.0 * u_pr), 2.0));

  float breath = 0.5 + 0.5 * sin(u_time * 2.2 - hit.y * 0.75);
  float fade = 1.0 - smoothstep(0.45 * u_res.x, 0.98 * u_res.x, dist);

  vec3 base = mix(u_ink, u_accent, 0.55);
  vec3 sheen = mix(u_accent, vec3(1.0), 0.45 * u_dark);
  float lineBoost = line ? 0.3 : 0.0;
  float body = fill * (0.07 + lineBoost + 0.10 * gloss * gloss + 0.05 * breath + 0.45 * band);
  float edge = rim * (0.22 + 0.5 * band);
  emit(mix(base, sheen, clamp(band * 1.4, 0.0, 1.0)), (body + edge + glow * (1.0 - fill)) * fade);
}
`;

const CONDENSE_MAIN = `
void main() {
  vec2 p = stagePx();
  float dist = boundaryDistance(p);

  float index = shapes(p).y;
  float local = fract(u_time / 3.0 - index * 0.07);
  float gather = smoothstep(0.0, 0.35, local) * (1.0 - smoothstep(0.82, 1.0, local));

  vec2 flow = vec2(
    noise(p * 0.03 / u_pr + vec2(u_time * 0.7, 0.0)),
    noise(p * 0.03 / u_pr + vec2(0.0, u_time * 0.7) + 31.0)
  ) - 0.5;
  vec2 q = p + flow * (1.0 - gather) * 14.0 * u_pr;

  float cellSize = 2.5 * u_pr;
  vec2 cell = floor(q / cellSize);
  vec2 center = (cell + 0.5) * cellSize;
  vec2 hit = shapes(center);

  // A line is a thin ribbon: grains hug the stroke instead of padding it out.
  float reach = u_mode > 0.5 ? 0.5 * cellSize : 1.5 * cellSize;
  float inside = 1.0 - smoothstep(-0.5 * cellSize, reach, hit.x);
  float seed = hash12(cell);
  float shown = step(seed, mix(0.25, 1.0, gather) * inside);

  float radius = cellSize * (0.3 + 0.08 * gather);
  float grain = 1.0 - smoothstep(radius - 0.6 * u_pr, radius + 0.6 * u_pr, length(q - center));

  vec3 color = mix(u_ink, u_accent, 0.3 + 0.5 * gather);
  float fade = 1.0 - smoothstep(0.5 * u_res.x, u_res.x, dist);
  emit(color, grain * shown * (0.3 + 0.45 * gather) * fade);
}
`;

const AURORA_MAIN = `
void main() {
  vec2 p = stagePx();
  float dist = boundaryDistance(p) / u_pr;
  float y = (p.y - u_anchor) / u_pr;
  float width = u_res.x / u_pr;
  float height = u_res.y / u_pr;
  float t = u_time;

  float fold = fbm(vec2(dist * 0.010 - t * 0.07, y * 0.005 + t * 0.10));
  float rays = fbm(vec2(dist * 0.06 + fold * 2.2, y * 0.004 - t * 0.25));
  float falloff = exp(-dist * 0.03) * (1.0 - smoothstep(0.5 * width, width, dist));
  float vertical = 0.2 + 0.8 * exp(-pow(y / (height * 0.28), 2.0));
  float curtain = falloff * vertical * smoothstep(0.35, 0.8, rays * 0.8 + fold * 0.45);

  float waver = (noise(vec2(y * 0.025, t * 0.8)) - 0.5) * 4.0;
  float seam = exp(-pow((dist - waver) / 1.4, 2.0)) * vertical;

  vec3 color = mix(u_accent, vec3(1.0), 0.35 * u_dark * seam);
  emit(color, curtain * mix(0.3, 0.55, u_dark) + seam * 0.6);
}
`;

const HALFTONE_MAIN = `
uniform float u_kind;      // 0 = candle, 1 = bar, 2 = line
uniform float u_baseline;  // bar floor, GL px

void main() {
  vec2 p = stagePx() / u_pr;
  float spacing = 7.0;
  vec2 cell = floor(p / spacing);
  vec2 center = (cell + 0.5) * spacing;
  float width = u_res.x / u_pr;
  float height = u_res.y / u_pr;
  float dist = u_side > 0.5 ? width - center.x : center.x;
  float anchor = u_anchor / u_pr;
  float baseline = u_baseline / u_pr;

  float path = anchor + (sin(dist * 0.035 + 0.6) - sin(0.6)) * height * 0.07
    + (noise(vec2(dist * 0.03, 2.0)) - 0.5) * height * 0.12 * (dist / width);
  float wave = 0.5 + 0.5 * sin(dist * 0.085 - u_time * 3.0);
  float fade = 1.0 - smoothstep(0.4 * width, width, dist);

  float ridge = exp(-pow((center.y - path) / (height * 0.085), 2.0));
  float amp = ridge * (0.3 + 0.7 * wave) + 0.12 * wave * exp(-dist * 0.012);
  if (u_kind > 0.5 && u_kind < 1.5) {
    float column = step(min(path, baseline), center.y) * step(center.y, max(path, baseline));
    float columnSlot = step(0.5, fract(cell.x * 0.5));
    ridge = column * columnSlot;
    amp = ridge * (0.35 + 0.45 * wave);
  }

  float radius = spacing * 0.45 * clamp(amp, 0.0, 1.0) * fade;
  float dotMask = 1.0 - smoothstep(radius - 0.6, radius + 0.6, length(p - center));
  vec3 color = mix(u_ink, u_up, ridge * 0.85);
  emit(color, dotMask * (0.22 + 0.5 * ridge));
}
`;

/** A shader preset over placeholder shapes; reports candle shapes for the morph reveal. */
function paintShapes(args: LoadingIndicatorArgs, paint: ShaderPainter): void {
  const shapes = placeholderShapes(args);
  const painted = paint({
    scope: args.scope,
    width: args.chartMediaWidth,
    height: args.chartMediaHeight,
    uniforms: (ratio) => ({ ...stageUniforms(args, ratio), ...shapeUniforms(shapes, ratio) }),
  });
  if (!painted) drawFlatShapes(args, shapes);

  reportCandles(args, shapes);
}

/** A shader preset that fills the stage; without WebGL2 it draws the flat shapes instead. */
function paintField(args: LoadingIndicatorArgs, paint: ShaderPainter): void {
  const shapes = placeholderShapes(args);
  const painted = paint({
    scope: args.scope,
    width: args.chartMediaWidth,
    height: args.chartMediaHeight,
    uniforms: (ratio) => ({ ...stageUniforms(args, ratio), ...shapeUniforms(shapes, ratio) }),
  });
  if (!painted) drawFlatShapes(args, shapes);
}

let glassPainter: ShaderPainter | undefined;
let condensePainter: ShaderPainter | undefined;
let auroraPainter: ShaderPainter | undefined;
let halftonePainter: ShaderPainter | undefined;

/**
 * Frosted placeholders in the theme's accent color: a glossy top, a crisp
 * rim, a staggered breath and a sheen sliding off the boundary. Candles and
 * bars copy the real bodies' width, a line becomes a glass ribbon of the
 * real stroke width. Candle placeholders feed `skeletonMorphIntro`.
 */
export const glassLoadingIndicator: LoadingIndicatorFn = (args) => {
  glassPainter ??= createShaderPainter(SHADER_PRELUDE + shapesGlsl() + GLASS_MAIN);
  paintShapes(args, glassPainter);
};

/**
 * Placeholders that assemble out of fine grains drifting in on a flow field,
 * hold, then loosen again, one shape a beat after its neighbor. Candle
 * placeholders feed `skeletonMorphIntro`.
 */
export const condenseLoadingIndicator: LoadingIndicatorFn = (args) => {
  condensePainter ??= createShaderPainter(SHADER_PRELUDE + shapesGlsl() + CONDENSE_MAIN);
  paintShapes(args, condensePainter);
};

/** A light curtain in the theme's accent color with a wavering seam where the loaded history ends. */
export const auroraLoadingIndicator: LoadingIndicatorFn = (args) => {
  auroraPainter ??= createShaderPainter(SHADER_PRELUDE + AURORA_MAIN);
  paintField(args, auroraPainter);
};

/**
 * A dot grid: a ridge of swollen dots carries the last value on into the
 * overshoot zone; over a bar series the dots fill columns down to the zero line.
 */
export const halftoneLoadingIndicator: LoadingIndicatorFn = (args) => {
  halftonePainter ??= createShaderPainter(SHADER_PRELUDE + HALFTONE_MAIN);
  paintField(args, halftonePainter);
};

const DUST_COUNT = 72;

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;

  return s - Math.floor(s);
}

function bodyColor(body: string | [string, string]): string {
  return typeof body === 'string' ? body : body[0];
}

/**
 * Motes drifting in from the far side of the stage and converging on the
 * boundary value, faster as they arrive, with a soft glow where they land.
 * Plain 2D canvas.
 */
export const dustLoadingIndicator: LoadingIndicatorFn = (args: LoadingIndicatorArgs) => {
  const { scope, theme, chartMediaWidth, chartMediaHeight, now, side, edgeValueY } = args;
  const { context, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
  const anchor = edgeValueY ?? chartMediaHeight / 2;
  const fromRight = side === 'right';
  const boundaryX = fromRight ? 0 : chartMediaWidth;
  const colors = [bodyColor(theme.candlestick.up.body), bodyColor(theme.candlestick.down.body)];
  const t = now / 1000;

  context.save();

  const pulse = 0.6 + 0.4 * Math.sin(t * 3.1);
  const glowRadius = 26 * hpr;
  const glow = context.createRadialGradient(
    boundaryX * hpr,
    anchor * vpr,
    0,
    boundaryX * hpr,
    anchor * vpr,
    glowRadius,
  );
  glow.addColorStop(0, colors[0]);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.globalAlpha = 0.18 * pulse;
  context.fillStyle = glow;
  context.fillRect((boundaryX - 30) * hpr, (anchor - 30) * vpr, 60 * hpr, 60 * vpr);

  for (let i = 0; i < DUST_COUNT; i++) {
    const speed = 0.3 + 0.35 * hash(i + 1);
    const progress = (t * speed + hash(i + 2)) % 1;
    const eased = progress * progress;
    const lane = (hash(i + 3) + hash(i + 4) - 1) * chartMediaHeight * 0.38;
    const start = chartMediaWidth * (0.45 + 0.55 * hash(i + 5));

    const dist = start * (1 - eased);
    const x = fromRight ? dist : chartMediaWidth - dist;
    const y = anchor + lane * (1 - 0.9 * eased);
    const trail = 2 + 10 * eased;
    const trailX = fromRight ? x + trail : x - trail;
    const trailY = anchor + lane * (1 - 0.9 * Math.max(0, eased - 0.04));

    context.globalAlpha = Math.sin(Math.PI * progress) ** 1.4 * 0.75;
    context.strokeStyle = colors[i % 2];
    context.lineCap = 'round';
    context.lineWidth = (0.8 + 1.0 * hash(i + 6)) * hpr;
    context.beginPath();
    context.moveTo(trailX * hpr, trailY * vpr);
    context.lineTo(x * hpr, y * vpr);
    context.stroke();
  }

  context.restore();
};

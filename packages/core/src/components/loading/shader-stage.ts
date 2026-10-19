/**
 * Runs a fragment shader over a loading indicator's clipped stage: the
 * shader draws into one shared offscreen WebGL2 canvas, which is then
 * blitted into the stage's 2D context. The preset stays a plain
 * `LoadingIndicatorFn`, so the chart's clip, exit fade and morph hand-off
 * all apply to it unchanged.
 */

import type { BitmapCoordinateSpace } from '../../canvas-manager';
import type { ChartTheme } from '../../theme/types';
import { parseColorChannels } from '../../utils/color';
import type { LoadingIndicatorArgs } from '../loading-indicator';

/** Soft effects gain nothing from a 3x phone bitmap; 2x keeps the fragment cost down. */
const MAX_GL_RATIO = 2;

const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Shared prelude: stage coordinates, theme colors and a few noise helpers. */
export const SHADER_PRELUDE = `#version 300 es
precision highp float;

uniform vec2 u_res;      // stage size, GL px
uniform float u_pr;      // GL px per media px
uniform float u_time;    // seconds
uniform float u_side;    // 1 = data boundary at the right edge (left loader), 0 = at the left edge
uniform float u_anchor;  // boundary value Y, GL px from the top
uniform float u_dark;    // 1 on a dark background
uniform vec3 u_ink;
uniform vec3 u_accent;
uniform vec3 u_up;
uniform vec3 u_down;

out vec4 outColor;

// Top-left origin, GL px.
vec2 stagePx() {
  return vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
}

// GL px from the data boundary, growing into the overshoot zone.
float boundaryDistance(vec2 p) {
  return u_side > 0.5 ? u_res.x - p.x : p.x;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);

  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    amp *= 0.5;
  }

  return sum;
}

// Premultiplied output: the 2D canvas composites the blit as-is.
void emit(vec3 color, float alpha) {
  float a = clamp(alpha, 0.0, 1.0);
  outColor = vec4(color * a, a);
}
`;

export type UniformValue = number | readonly number[];

interface UniformSlot {
  location: WebGLUniformLocation;
  type: number;
}

interface CompiledProgram {
  program: WebGLProgram;
  uniforms: Map<string, UniformSlot>;
}

interface SharedGl {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  programs: Map<string, CompiledProgram | null>;
}

/** `undefined` until first use; `null` once WebGL2 proved unavailable. */
let shared: SharedGl | null | undefined;

function sharedGl(): SharedGl | null {
  if (shared !== undefined) return shared;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
  // A mobile browser drops background GL contexts; the next frame builds a fresh one.
  canvas.addEventListener('webglcontextlost', () => {
    shared = undefined;
  });
  shared = gl === null ? null : { canvas, gl, programs: new Map() };

  return shared;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (shader === null) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);

    return null;
  }

  return shader;
}

function compileProgram(gl: WebGL2RenderingContext, fragment: string): CompiledProgram | null {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragment);
  if (vertexShader === null || fragmentShader === null) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const uniforms = new Map<string, UniformSlot>();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info === null) continue;

    const location = gl.getUniformLocation(program, info.name);
    if (location === null) continue;

    uniforms.set(info.name.replace(/\[0\]$/, ''), { location, type: info.type });
  }

  return { program, uniforms };
}

function setUniform(gl: WebGL2RenderingContext, slot: UniformSlot, value: UniformValue): void {
  const list = typeof value === 'number' ? [value] : value;

  switch (slot.type) {
    case gl.FLOAT:
      gl.uniform1fv(slot.location, list);
      break;
    case gl.FLOAT_VEC2:
      gl.uniform2fv(slot.location, list);
      break;
    case gl.FLOAT_VEC3:
      gl.uniform3fv(slot.location, list);
      break;
    case gl.FLOAT_VEC4:
      gl.uniform4fv(slot.location, list);
      break;
  }
}

export interface ShaderFrame {
  scope: BitmapCoordinateSpace;
  /** Stage size, media px. */
  width: number;
  height: number;
  /** Uniforms in GL px, for the given GL px per media px. */
  uniforms(ratio: number): Record<string, UniformValue>;
}

export type ShaderPainter = (frame: ShaderFrame) => boolean;

/**
 * A painter for `fragment`, compiled on first use. It returns `false` when
 * WebGL2 is unavailable or the shader failed, so the preset can fall back to
 * a 2D drawing.
 */
export function createShaderPainter(fragment: string): ShaderPainter {
  return ({ scope, width, height, uniforms }) => {
    const glState = sharedGl();
    if (glState === null || glState.gl.isContextLost()) return false;

    const { canvas, gl, programs } = glState;
    let compiled = programs.get(fragment);
    if (compiled === undefined) {
      compiled = compileProgram(gl, fragment);
      programs.set(fragment, compiled);
    }
    if (compiled === null) return false;

    const ratio = Math.min(scope.horizontalPixelRatio, MAX_GL_RATIO);
    const glWidth = Math.max(1, Math.round(width * ratio));
    const glHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== glWidth) canvas.width = glWidth;
    if (canvas.height !== glHeight) canvas.height = glHeight;

    gl.viewport(0, 0, glWidth, glHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(compiled.program);

    const all: Record<string, UniformValue> = { u_res: [glWidth, glHeight], u_pr: ratio, ...uniforms(ratio) };
    for (const [name, value] of Object.entries(all)) {
      const slot = compiled.uniforms.get(name);
      if (slot !== undefined) setUniform(gl, slot, value);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    scope.context.drawImage(canvas, 0, 0, width * scope.horizontalPixelRatio, height * scope.verticalPixelRatio);

    return true;
  };
}

/** A CSS color as `[r, g, b]` in 0..1; mid-gray for a form the parser doesn't read. */
function toRgb(color: string): [number, number, number] {
  const channels = parseColorChannels(color);
  if (channels === null) return [0.5, 0.5, 0.5];

  return [channels[0] / 255, channels[1] / 255, channels[2] / 255];
}

function firstColor(body: string | [string, string]): string {
  return typeof body === 'string' ? body : body[0];
}

function isDark(theme: ChartTheme): boolean {
  const [r, g, b] = toRgb(theme.background);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

/** The uniforms every preset shader reads — see {@link SHADER_PRELUDE}. */
export function stageUniforms(args: LoadingIndicatorArgs, ratio: number): Record<string, UniformValue> {
  const { theme, chartMediaHeight, now, side, edgeValueY } = args;
  const anchor = edgeValueY ?? chartMediaHeight / 2;

  return {
    u_time: now / 1000,
    u_side: side === 'right' ? 0 : 1,
    u_anchor: anchor * ratio,
    u_dark: isDark(theme) ? 1 : 0,
    u_ink: toRgb(theme.axis.textColor ?? '#787b86'),
    u_accent: toRgb(theme.line.color),
    u_up: toRgb(firstColor(theme.candlestick.up.body)),
    u_down: toRgb(firstColor(theme.candlestick.down.body)),
  };
}

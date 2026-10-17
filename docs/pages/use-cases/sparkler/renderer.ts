import { INSTANCE_CAPACITY, INSTANCE_FLOATS } from './particles';

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_motion; // x, y, vx, vy — plot-relative CSS px
layout(location = 2) in vec4 a_look;   // size, heat, alpha, shape

uniform vec2 u_viewport;
uniform vec2 u_origin;
uniform float u_streak;

out vec2 v_local;
out float v_tail;
out float v_heat;
out float v_alpha;
out float v_glow;

void main() {
  vec2 velocity = a_motion.zw;
  float size = a_look.x;
  bool glow = a_look.w > 0.5;

  float speed = length(velocity);
  vec2 dir = speed > 0.001 ? velocity / speed : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);

  // A streak is a capsule trailing behind the spark along -velocity: motion
  // blur without an accumulation buffer. The pad leaves room for the halo.
  float tail = glow ? 0.0 : min(speed * u_streak, 60.0);
  float pad = glow ? size : size * 4.0;
  float along = a_corner.x < 0.0 ? -tail - pad : pad;
  float across = a_corner.y * pad;

  vec2 pixel = u_origin + a_motion.xy + dir * along + normal * across;
  vec2 clip = pixel / u_viewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);

  v_local = vec2(along, across) / size;
  v_tail = tail / size;
  v_heat = a_look.y;
  v_alpha = a_look.z;
  v_glow = glow ? 1.0 : 0.0;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

uniform vec3 u_ramp[4];
uniform float u_halo;
uniform float u_glowGain;

in vec2 v_local;
in float v_tail;
in float v_heat;
in float v_alpha;
in float v_glow;

out vec4 outColor;

// Blackbody-ish cooling: ember red -> orange -> gold -> white-hot.
vec3 ramp(float heat) {
  float h = clamp(heat, 0.0, 1.0) * 3.0;
  if (h < 1.0) return mix(u_ramp[0], u_ramp[1], h);
  if (h < 2.0) return mix(u_ramp[1], u_ramp[2], h - 1.0);

  return mix(u_ramp[2], u_ramp[3], h - 2.0);
}

void main() {
  float intensity;
  if (v_glow > 0.5) {
    float d = length(v_local);
    intensity = exp(-d * d * 4.5) * u_glowGain;
  } else {
    // Distance to the streak's spine, brightest at the spark, fading down the tail.
    float t = clamp(v_local.x, -v_tail, 0.0);
    float d = length(v_local - vec2(t, 0.0));
    float taper = v_tail > 0.0 ? mix(0.15, 1.0, (t + v_tail) / v_tail) : 1.0;
    intensity = (exp(-d * d * 1.8) + u_halo * exp(-d * 0.9)) * taper;
  }

  float alpha = clamp(intensity * v_alpha, 0.0, 1.0);
  outColor = vec4(ramp(v_heat) * alpha, alpha);
}
`;

export interface Palette {
  /** Four RGB stops, coolest first. */
  ramp: Float32Array;
  halo: number;
  /** Scales the soft glows (head light, flashes), which read as opaque blobs on a light page. */
  glowGain: number;
  /** Additive light on a dark page; plain premultiplied "over" on a light one, where light can't add up. */
  additive: boolean;
}

export const DARK_PALETTE: Palette = {
  ramp: new Float32Array([0.55, 0.06, 0.02, 1.0, 0.36, 0.05, 1.0, 0.74, 0.28, 1.0, 0.96, 0.86]),
  halo: 0.35,
  glowGain: 1,
  additive: true,
};

export const LIGHT_PALETTE: Palette = {
  ramp: new Float32Array([0.45, 0.04, 0.0, 0.85, 0.22, 0.0, 1.0, 0.5, 0.0, 1.0, 0.72, 0.1]),
  halo: 0.12,
  glowGain: 0.4,
  additive: false,
};

interface DrawOptions {
  count: number;
  instances: Float32Array;
  /** Plot area's top-left corner in client CSS px. */
  origin: { x: number; y: number };
  palette: Palette;
}

export class SparkRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #gl: WebGL2RenderingContext;
  readonly #program: WebGLProgram;
  readonly #vao: WebGLVertexArrayObject;
  readonly #instanceBuffer: WebGLBuffer;
  readonly #uniforms: {
    viewport: WebGLUniformLocation | null;
    origin: WebGLUniformLocation | null;
    streak: WebGLUniformLocation | null;
    ramp: WebGLUniformLocation | null;
    halo: WebGLUniformLocation | null;
    glowGain: WebGLUniformLocation | null;
  };

  /** `null` when WebGL2 is unavailable — the chart just plays its intro without sparks. */
  static create(canvas: HTMLCanvasElement): SparkRenderer | null {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (gl === null) return null;

    const program = linkProgram(gl);
    if (program === null) return null;

    return new SparkRenderer(canvas, gl, program);
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, program: WebGLProgram) {
    this.#canvas = canvas;
    this.#gl = gl;
    this.#program = program;
    this.#uniforms = {
      viewport: gl.getUniformLocation(program, 'u_viewport'),
      origin: gl.getUniformLocation(program, 'u_origin'),
      streak: gl.getUniformLocation(program, 'u_streak'),
      ramp: gl.getUniformLocation(program, 'u_ramp'),
      halo: gl.getUniformLocation(program, 'u_halo'),
      glowGain: gl.getUniformLocation(program, 'u_glowGain'),
    };

    this.#vao = gl.createVertexArray();
    gl.bindVertexArray(this.#vao);

    const cornerBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const stride = INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
    this.#instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, INSTANCE_CAPACITY * stride, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);
    gl.vertexAttribDivisor(2, 1);

    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
  }

  /** Matches the backing store to the viewport; cheap to call every frame. */
  resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    if (this.#canvas.width === width && this.#canvas.height === height) return;

    this.#canvas.width = width;
    this.#canvas.height = height;
  }

  draw(options: DrawOptions): void {
    const { count, instances, origin, palette } = options;
    const gl = this.#gl;

    gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (count === 0) return;

    if (palette.additive) {
      gl.blendFunc(gl.ONE, gl.ONE);
    } else {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(this.#program);
    gl.uniform2f(this.#uniforms.viewport, window.innerWidth, window.innerHeight);
    gl.uniform2f(this.#uniforms.origin, origin.x, origin.y);
    gl.uniform1f(this.#uniforms.streak, 0.035);
    gl.uniform3fv(this.#uniforms.ramp, palette.ramp);
    gl.uniform1f(this.#uniforms.halo, palette.halo);
    gl.uniform1f(this.#uniforms.glowGain, palette.glowGain);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.#instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, instances, 0, count * INSTANCE_FLOATS);

    gl.bindVertexArray(this.#vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
  }

  clear(): void {
    const gl = this.#gl;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Browsers cap live WebGL contexts, so a remounted demo must hand its context back. */
  dispose(): void {
    this.#gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

function linkProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vertex = compileShader(gl, { type: gl.VERTEX_SHADER, source: VERTEX_SHADER });
  const fragment = compileShader(gl, { type: gl.FRAGMENT_SHADER, source: FRAGMENT_SHADER });
  if (vertex === null || fragment === null) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('sparkler: program link failed', gl.getProgramInfoLog(program));

    return null;
  }

  return program;
}

function compileShader(gl: WebGL2RenderingContext, shader: { type: number; source: string }): WebGLShader | null {
  const compiled = gl.createShader(shader.type);
  if (compiled === null) return null;

  gl.shaderSource(compiled, shader.source);
  gl.compileShader(compiled);
  if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) {
    console.warn('sparkler: shader compile failed', gl.getShaderInfoLog(compiled));

    return null;
  }

  return compiled;
}

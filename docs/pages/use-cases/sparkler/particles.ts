/**
 * CPU side of the sparkler: a fixed-capacity particle pool stepped once per
 * animation frame and packed into an instance buffer for the WebGL pass.
 *
 * Units are CSS pixels relative to the plot area's top-left corner, and
 * seconds. Keeping particles plot-relative means they ride along when the page
 * scrolls mid-animation — the renderer adds the plot's client offset per frame.
 */

const CAPACITY = 12_000;
const TAU = Math.PI * 2;
const GRAVITY = 420;

/** Floats per packed instance: x, y, vx, vy, size, heat, alpha, shape. */
export const INSTANCE_FLOATS = 8;
export const INSTANCE_CAPACITY = CAPACITY;

export const SHAPE_STREAK = 0;
export const SHAPE_GLOW = 1;

const KIND_SPARK = 0;
const KIND_EMBER = 1;
const KIND_GLOW = 2;

/** Sparks a burning head throws per second. */
const SPRAY_RATE = 1100;

interface Spawn {
  kind: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  life: number;
  size: number;
  heat: number;
  alpha?: number;
  /** Age at which the spark splits into a star of smaller ones. */
  forkAt?: number;
  generation?: number;
}

export interface Head {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export class ParticleField {
  readonly instances = new Float32Array(CAPACITY * INSTANCE_FLOATS);

  #count = 0;

  readonly #kind = new Uint8Array(CAPACITY);
  readonly #generation = new Uint8Array(CAPACITY);
  readonly #x = new Float32Array(CAPACITY);
  readonly #y = new Float32Array(CAPACITY);
  readonly #vx = new Float32Array(CAPACITY);
  readonly #vy = new Float32Array(CAPACITY);
  readonly #age = new Float32Array(CAPACITY);
  readonly #life = new Float32Array(CAPACITY);
  readonly #size = new Float32Array(CAPACITY);
  readonly #heat = new Float32Array(CAPACITY);
  readonly #alpha = new Float32Array(CAPACITY);
  readonly #forkAt = new Float32Array(CAPACITY);
  readonly #seed = new Float32Array(CAPACITY);

  get alive(): boolean {
    return this.#count > 0;
  }

  /** One frame of a burning head: a spray of sparks, a few embers, and a hot spot left on the line. */
  spray(head: Head, dt: number): void {
    const count = Math.floor(SPRAY_RATE * dt + Math.random());

    for (let i = 0; i < count; i++) {
      if (Math.random() < 0.05) {
        this.#ember(head);
        continue;
      }

      const angle = Math.random() * TAU;
      // Most sparks are slow; a long tail of fast ones gives the spray its reach.
      const speed = 90 + Math.random() ** 1.6 * 560;
      const life = 0.16 + Math.random() * 0.42;
      const forks = Math.random() < 0.42;

      this.#spawn({
        kind: KIND_SPARK,
        x: head.x,
        y: head.y,
        vx: Math.cos(angle) * speed + head.vx * 0.35,
        vy: Math.sin(angle) * speed + head.vy * 0.35 - 40,
        life,
        size: 0.8 + Math.random() * 0.9,
        heat: 0.9 + Math.random() * 0.1,
        forkAt: forks ? life * (0.3 + Math.random() * 0.45) : Number.POSITIVE_INFINITY,
      });
    }

    this.#spawn({
      kind: KIND_GLOW,
      x: head.x + (Math.random() - 0.5) * 2,
      y: head.y + (Math.random() - 0.5) * 2,
      life: 0.55,
      size: 7,
      heat: 0.95,
      alpha: 0.55,
    });
  }

  /**
   * The burning core and the light it throws on the chart. These live for a
   * single frame — the next `step` retires them — so they track the head exactly.
   */
  light(head: Head): void {
    const flicker = Math.random();

    this.#spawn({ kind: KIND_GLOW, x: head.x, y: head.y, life: 1e-4, size: 150, heat: 0.75, alpha: 0.07 });
    this.#spawn({
      kind: KIND_GLOW,
      x: head.x,
      y: head.y,
      life: 1e-4,
      size: 42 + flicker * 14,
      heat: 0.85,
      alpha: 0.26 + flicker * 0.14,
    });
    this.#spawn({ kind: KIND_GLOW, x: head.x, y: head.y, life: 1e-4, size: 8, heat: 1, alpha: 0.95 });
  }

  /** A radial explosion with a flash — the ignition, and each head burning out. */
  burst(options: { x: number; y: number; count: number; speed: number }): void {
    const { x, y, count, speed } = options;

    this.#spawn({ kind: KIND_GLOW, x, y, life: 0.45, size: speed * 0.22, heat: 1, alpha: 0.9 });

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const velocity = speed * (0.15 + 0.85 * Math.sqrt(Math.random()));
      const life = 0.25 + Math.random() * 0.6;
      const forks = Math.random() < 0.6;

      this.#spawn({
        kind: KIND_SPARK,
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 60,
        life,
        size: 0.9 + Math.random() * 1.1,
        heat: 1,
        forkAt: forks ? life * (0.25 + Math.random() * 0.5) : Number.POSITIVE_INFINITY,
      });
    }

    const embers = Math.round(count * 0.08);
    for (let i = 0; i < embers; i++) {
      this.#ember({ x, y, vx: 0, vy: -120 });
    }
  }

  step(dt: number): void {
    const sparkDrag = Math.exp(-2.4 * dt);
    const emberDrag = Math.exp(-1.1 * dt);

    let i = 0;
    while (i < this.#count) {
      const age = this.#age[i] + dt;
      if (age >= this.#life[i]) {
        this.#remove(i);
        continue;
      }

      this.#age[i] = age;

      if (age >= this.#forkAt[i]) {
        this.#fork(i);
        this.#remove(i);
        continue;
      }

      const kind = this.#kind[i];
      if (kind === KIND_SPARK) {
        this.#vx[i] *= sparkDrag;
        this.#vy[i] = this.#vy[i] * sparkDrag + GRAVITY * 0.6 * dt;
      } else if (kind === KIND_EMBER) {
        this.#vx[i] = this.#vx[i] * emberDrag + Math.sin(age * 6 + this.#seed[i]) * 24 * dt;
        this.#vy[i] = this.#vy[i] * emberDrag + GRAVITY * dt;
      }

      this.#x[i] += this.#vx[i] * dt;
      this.#y[i] += this.#vy[i] * dt;
      i++;
    }
  }

  /** Packs every live particle into {@link instances}; returns the instance count. */
  pack(): number {
    const out = this.instances;

    for (let i = 0; i < this.#count; i++) {
      const t = this.#age[i] / this.#life[i];
      const kind = this.#kind[i];

      let heat: number;
      let alpha: number;
      if (kind === KIND_SPARK) {
        heat = this.#heat[i] * (1 - 0.85 * t);
        alpha = this.#alpha[i] * (1 - smoothstep(0.6, 1, t));
      } else if (kind === KIND_EMBER) {
        const flicker = 0.7 + 0.3 * Math.sin(this.#age[i] * 38 + this.#seed[i]);
        heat = this.#heat[i] * (1 - 0.8 * t) * flicker;
        alpha = (1 - t * t) * flicker;
      } else {
        heat = this.#heat[i] * (1 - 0.6 * t);
        alpha = this.#alpha[i] * (1 - t) * (1 - t);
      }

      const base = i * INSTANCE_FLOATS;
      out[base] = this.#x[i];
      out[base + 1] = this.#y[i];
      out[base + 2] = this.#vx[i];
      out[base + 3] = this.#vy[i];
      out[base + 4] = this.#size[i];
      out[base + 5] = heat;
      out[base + 6] = alpha;
      out[base + 7] = kind === KIND_GLOW ? SHAPE_GLOW : SHAPE_STREAK;
    }

    return this.#count;
  }

  #ember(from: Head): void {
    const angle = Math.random() * TAU;
    const speed = 30 + Math.random() * 120;

    this.#spawn({
      kind: KIND_EMBER,
      x: from.x,
      y: from.y,
      vx: Math.cos(angle) * speed + from.vx * 0.2,
      vy: Math.sin(angle) * speed + from.vy * 0.2 - 60,
      life: 0.8 + Math.random() * 0.9,
      size: 1.2 + Math.random() * 0.6,
      heat: 0.6,
    });
  }

  /** The signature sparkler crackle: a dying spark splits into a small star of hotter fragments. */
  #fork(parent: number): void {
    const generation = this.#generation[parent] + 1;
    const t = this.#age[parent] / this.#life[parent];
    const heat = Math.min(1, this.#heat[parent] * (1 - 0.85 * t) * 1.15);
    const x = this.#x[parent];
    const y = this.#y[parent];
    const count = 3 + Math.floor(Math.random() * 3);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = 70 + Math.random() * 240;
      const life = 0.07 + Math.random() * 0.2;
      const forksAgain = generation < 2 && Math.random() < 0.22;

      this.#spawn({
        kind: KIND_SPARK,
        x,
        y,
        vx: this.#vx[parent] * 0.3 + Math.cos(angle) * speed,
        vy: this.#vy[parent] * 0.3 + Math.sin(angle) * speed,
        life,
        size: this.#size[parent] * 0.85,
        heat,
        forkAt: forksAgain ? life * 0.5 : Number.POSITIVE_INFINITY,
        generation,
      });
    }

    this.#spawn({ kind: KIND_GLOW, x, y, life: 0.07, size: 5, heat: 1, alpha: 0.8 });
  }

  #spawn(spawn: Spawn): void {
    if (this.#count >= CAPACITY) return;

    const i = this.#count++;
    this.#kind[i] = spawn.kind;
    this.#generation[i] = spawn.generation ?? 0;
    this.#x[i] = spawn.x;
    this.#y[i] = spawn.y;
    this.#vx[i] = spawn.vx ?? 0;
    this.#vy[i] = spawn.vy ?? 0;
    this.#age[i] = 0;
    this.#life[i] = spawn.life;
    this.#size[i] = spawn.size;
    this.#heat[i] = spawn.heat;
    this.#alpha[i] = spawn.alpha ?? 1;
    this.#forkAt[i] = spawn.forkAt ?? Number.POSITIVE_INFINITY;
    this.#seed[i] = Math.random() * TAU;
  }

  /** Swap-remove: order doesn't matter under additive blending. */
  #remove(i: number): void {
    const last = --this.#count;
    if (i === last) return;

    this.#kind[i] = this.#kind[last];
    this.#generation[i] = this.#generation[last];
    this.#x[i] = this.#x[last];
    this.#y[i] = this.#y[last];
    this.#vx[i] = this.#vx[last];
    this.#vy[i] = this.#vy[last];
    this.#age[i] = this.#age[last];
    this.#life[i] = this.#life[last];
    this.#size[i] = this.#size[last];
    this.#heat[i] = this.#heat[last];
    this.#alpha[i] = this.#alpha[last];
    this.#forkAt[i] = this.#forkAt[last];
    this.#seed[i] = this.#seed[last];
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));

  return t * t * (3 - 2 * t);
}

import { DEFAULT_SANKEY_ENTRY, DEFAULT_SANKEY_UPDATE } from '../animation/config';
import { easeOutCubic } from '../animation/easing';
import { prefersReducedMotion } from '../animation/reduced-motion';
import { defaultSankeyFormat } from '../sankey-tooltip';
import { resolveAxisFontSize } from '../theme/resolve';
import type { ChartTheme } from '../theme/types';
import type { SankeyLabelsOptions, SankeySeriesOptions } from '../types';
import { hexToRgba, mixColors } from '../utils/color';
import { clamp, lerp } from '../utils/math';
import { warnDataOnce } from '../utils/poisoned-data-reporter';
import type { SeriesDefinition } from './definition';
import { fillRoundedRect } from './painters/canvas-path';
import type { HoverInfo, RenderPadding, SankeySeriesRenderer, SeriesRenderContext } from './types';

type ResolvedLabels = false | SankeyLabelsOptions;

interface ResolvedSankeyOptions {
  colors?: string[];
  nodeWidth: number;
  nodePadding: number;
  linkOpacity: number;
  labels: ResolvedLabels;
  entryMs: number;
  updateMs: number;
}

const DEFAULT_OPTIONS: ResolvedSankeyOptions = {
  nodeWidth: 12,
  nodePadding: 12,
  linkOpacity: 0.35,
  labels: {},
  entryMs: DEFAULT_SANKEY_ENTRY,
  updateMs: DEFAULT_SANKEY_UPDATE,
};

/** d3-sankey's default: enough sweeps to untangle a funnel, few enough to stay cheap. */
const RELAX_ITERATIONS = 6;
const NODE_RADIUS = 2;
/** Gap between a node and its label backdrop, CSS px. */
const LABEL_OFFSET = 6;
const LABEL_PAD_X = 5;
const LABEL_PAD_Y = 3;
const LABEL_RADIUS = 4;
/** Least room between a label and another label or node, CSS px. */
const LABEL_SPACING = 2;
const LABEL_BACKDROP_ALPHA = 0.8;
/**
 * Band shades at a source: band k (0 at the top) of n mixes `k × step` of the background
 * into the node color, with step = min({@link SHADE_STEP_MAX}, {@link SHADE_SPREAD} / (n − 1)).
 */
export const SHADE_SPREAD = 0.6;
export const SHADE_STEP_MAX = 0.4;
/** Opacity a hover takes off the elements it leaves out. */
const LINK_DIM = 0.75;
const NODE_DIM = 0.6;

/** Join key of a link — `\u0000` cannot appear in a normal id. */
function linkKey(source: string, target: string): string {
  return `${source}\u0000${target}`;
}

function resolveLabels(raw: SankeySeriesOptions['labels']): ResolvedLabels {
  if (raw === false) return false;
  if (raw === true || raw === undefined) return {};

  return { ...raw };
}

/** Merge `incoming` over `base`; a key set to `undefined` goes back to its default. */
function normalize(base: ResolvedSankeyOptions, incoming: Partial<SankeySeriesOptions>): ResolvedSankeyOptions {
  const labels = 'labels' in incoming ? resolveLabels(incoming.labels) : base.labels;
  const merged = { ...base, ...incoming };

  return {
    colors: merged.colors,
    nodeWidth: Math.max(1, merged.nodeWidth ?? DEFAULT_OPTIONS.nodeWidth),
    nodePadding: Math.max(0, merged.nodePadding ?? DEFAULT_OPTIONS.nodePadding),
    linkOpacity: clamp(merged.linkOpacity ?? DEFAULT_OPTIONS.linkOpacity, 0, 1),
    labels,
    entryMs: Math.max(0, merged.entryMs ?? DEFAULT_OPTIONS.entryMs),
    updateMs: Math.max(0, merged.updateMs ?? DEFAULT_OPTIONS.updateMs),
  };
}

// --- Data model (independent of the canvas size) --------------------------------

interface ModelNode {
  id: string;
  label: string;
  color?: string;
  /** Position in the input `nodes`, for the palette. */
  paletteIndex: number;
  column: number;
  /** Throughput: the larger of inflow and outflow. */
  value: number;
  outValue: number;
  incoming: number[];
  outgoing: number[];
}

interface ModelLink {
  key: string;
  source: number;
  target: number;
  value: number;
  color?: string;
}

interface SankeyModel {
  nodes: ModelNode[];
  links: ModelLink[];
  columns: number;
  /** Outflow of every node with no incoming link — the base of a node's share. */
  sourceTotal: number;
}

const EMPTY_MODEL: SankeyModel = { nodes: [], links: [], columns: 0, sourceTotal: 0 };

/** Links the input carried that can't be drawn, for one warning per renderer. */
interface RejectedLinks {
  count: number;
  first: unknown;
}

const NODE_FIELDS = ['id', 'label', 'color'] as const;
const LINK_FIELDS = ['source', 'target', 'value', 'color'] as const;

/** The fields of one input row that the series reads — what an unchanged-data check compares. */
function rowValues(row: unknown, fields: readonly string[]): unknown[] {
  if (typeof row !== 'object' || row === null) return [row];

  const record = row as Record<string, unknown>;

  return fields.map((field) => record[field]);
}

function sameRows(a: readonly unknown[][], b: readonly unknown[][]): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (left.length !== right.length) return false;

    for (let j = 0; j < left.length; j++) {
      if (!Object.is(left[j], right[j])) return false;
    }
  }

  return true;
}

interface InputSnapshot {
  nodes: unknown[][];
  links: unknown[][];
}

function readRows(data: unknown): { nodes: readonly unknown[]; links: readonly unknown[] } {
  const raw = (data ?? {}) as { nodes?: unknown; links?: unknown };
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const links = Array.isArray(raw.links) ? raw.links : [];

  return { nodes, links };
}

function describeLink(row: unknown): string {
  if (typeof row !== 'object' || row === null) return String(row);

  const { source, target, value } = row as Record<string, unknown>;

  return `${String(source)} → ${String(target)} (value ${String(value)})`;
}

/** One cycle as node ids, first id repeated at the end — or `null` for a DAG. */
function findCycle(args: { ids: readonly string[]; next: readonly number[][] }): string[] | null {
  const { ids, next } = args;
  // 0 = unvisited, 1 = on the current path, 2 = done.
  const state = new Array<number>(ids.length).fill(0);
  const path: number[] = [];

  const visit = (node: number): number[] | null => {
    state[node] = 1;
    path.push(node);

    for (const target of next[node]) {
      if (state[target] === 1) return [...path.slice(path.indexOf(target)), target];
      if (state[target] === 0) {
        const cycle = visit(target);
        if (cycle !== null) return cycle;
      }
    }

    path.pop();
    state[node] = 2;

    return null;
  };

  for (let node = 0; node < ids.length; node++) {
    if (state[node] !== 0) continue;

    const cycle = visit(node);
    if (cycle !== null) return cycle.map((index) => ids[index]);
  }

  return null;
}

/** Longest path from a source; a node with no outgoing link moves to the last column (justify). */
function assignColumns(nodes: ModelNode[], links: readonly ModelLink[]): number {
  const depth = new Array<number>(nodes.length).fill(0);
  const pending = nodes.map((node) => node.incoming.length);
  const queue: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (pending[i] === 0) queue.push(i);
  }

  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    for (const link of nodes[node].outgoing) {
      const target = links[link].target;
      depth[target] = Math.max(depth[target], depth[node] + 1);
      pending[target]--;
      if (pending[target] === 0) queue.push(target);
    }
  }

  const lastColumn = Math.max(0, ...depth);
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].column = nodes[i].outgoing.length > 0 ? depth[i] : lastColumn;
  }

  return lastColumn + 1;
}

/** Validate and index the input. Throws on a cycle before anything changes. */
function buildModel(args: {
  nodes: readonly unknown[];
  links: readonly unknown[];
  rejected: RejectedLinks;
}): SankeyModel {
  const { rejected } = args;

  const inputNodes: { id: string; label: string; color?: string; paletteIndex: number }[] = [];
  const nodeIndex = new Map<string, number>();
  args.nodes.forEach((row, paletteIndex) => {
    if (typeof row !== 'object' || row === null) return;

    const { id, label, color } = row as Record<string, unknown>;
    if (typeof id !== 'string' || nodeIndex.has(id)) return;

    nodeIndex.set(id, inputNodes.length);
    inputNodes.push({
      id,
      label: typeof label === 'string' ? label : id,
      color: typeof color === 'string' ? color : undefined,
      paletteIndex,
    });
  });

  const merged = new Map<string, { source: number; target: number; value: number; color?: string }>();
  for (const row of args.links) {
    const record = typeof row === 'object' && row !== null ? (row as Record<string, unknown>) : {};
    const source = typeof record.source === 'string' ? nodeIndex.get(record.source) : undefined;
    const target = typeof record.target === 'string' ? nodeIndex.get(record.target) : undefined;
    const { value } = record;
    const drawable = typeof value === 'number' && Number.isFinite(value) && value > 0;
    if (source === undefined || target === undefined || !drawable) {
      if (rejected.count === 0) rejected.first = row;
      rejected.count++;
      continue;
    }

    const key = linkKey(inputNodes[source].id, inputNodes[target].id);
    const existing = merged.get(key);
    if (existing) {
      existing.value += value;
      continue;
    }

    merged.set(key, { source, target, value, color: typeof record.color === 'string' ? record.color : undefined });
  }

  const next = inputNodes.map((): number[] => []);
  for (const link of merged.values()) {
    next[link.source].push(link.target);
  }

  const cycle = findCycle({ ids: inputNodes.map((node) => node.id), next });
  if (cycle !== null) throw new Error(`Sankey links form a cycle: ${cycle.join(' → ')}`);

  // Only nodes some link reaches are drawn; they keep their input order.
  const linked = new Set<number>();
  for (const link of merged.values()) {
    linked.add(link.source);
    linked.add(link.target);
  }

  const drawnIndex = new Map<number, number>();
  const nodes: ModelNode[] = [];
  inputNodes.forEach((node, index) => {
    if (!linked.has(index)) return;

    drawnIndex.set(index, nodes.length);
    nodes.push({ ...node, column: 0, value: 0, outValue: 0, incoming: [], outgoing: [] });
  });

  const links: ModelLink[] = [];
  for (const [key, link] of merged) {
    const source = drawnIndex.get(link.source) ?? -1;
    const target = drawnIndex.get(link.target) ?? -1;
    nodes[source].outgoing.push(links.length);
    nodes[target].incoming.push(links.length);
    links.push({ key, source, target, value: link.value, color: link.color });
  }

  let sourceTotal = 0;
  for (const node of nodes) {
    const inValue = node.incoming.reduce((sum, link) => sum + links[link].value, 0);
    node.outValue = node.outgoing.reduce((sum, link) => sum + links[link].value, 0);
    node.value = Math.max(inValue, node.outValue);
    if (node.incoming.length === 0) sourceTotal += node.outValue;
  }

  const columns = nodes.length > 0 ? assignColumns(nodes, links) : 0;

  return { nodes, links, columns, sourceTotal };
}

// --- Layout (bitmap pixels) ------------------------------------------------------------

/** Canvas the layout fills, in bitmap pixels, and the ratios that scale the CSS-px options. */
interface LayoutGeometry {
  width: number;
  height: number;
  padTop: number;
  padBottom: number;
  hpr: number;
  vpr: number;
}

interface SankeyLayout {
  top: number;
  bottom: number;
  /** X distance between two neighbor columns. */
  step: number;
  x0: number[];
  x1: number[];
  y0: number[];
  y1: number[];
  /** Per link: band width, and the band center at the source and the target node. */
  width: number[];
  sy: number[];
  ty: number[];
  /** Per link: how much background its color takes, by its rank at the source; 0 with its own color. */
  shade: number[];
}

/**
 * d3-sankey's node placement: stack each column, then sweep right-to-left and
 * left-to-right moving each node toward the weighted mean of its neighbors and
 * pushing apart the nodes that collide.
 */
class LayoutSolver {
  readonly #model: SankeyModel;
  readonly #top: number;
  readonly #bottom: number;
  readonly #gap: number;
  readonly y0: number[];
  readonly y1: number[];
  readonly width: number[];
  /** Link order at each node, top to bottom. */
  readonly outgoing: number[][];
  readonly incoming: number[][];

  constructor(args: { model: SankeyModel; top: number; bottom: number; gap: number }) {
    this.#model = args.model;
    this.#top = args.top;
    this.#bottom = args.bottom;
    this.#gap = args.gap;
    this.y0 = new Array<number>(args.model.nodes.length).fill(0);
    this.y1 = new Array<number>(args.model.nodes.length).fill(0);
    this.width = new Array<number>(args.model.links.length).fill(0);
    this.outgoing = args.model.nodes.map((node) => [...node.outgoing]);
    this.incoming = args.model.nodes.map((node) => [...node.incoming]);
  }

  solve(columns: number[][]): void {
    this.#initialize(columns);

    for (let i = 0; i < RELAX_ITERATIONS; i++) {
      const alpha = 0.99 ** i;
      const beta = Math.max(1 - alpha, (i + 1) / RELAX_ITERATIONS);
      this.#relaxRightToLeft(columns, { alpha, beta });
      this.#relaxLeftToRight(columns, { alpha, beta });
    }

    for (let node = 0; node < this.y0.length; node++) {
      this.#sortLinks(node);
    }
  }

  /** One vertical scale for every column, fitted to the fullest one. */
  #initialize(columns: number[][]): void {
    const { nodes, links } = this.#model;
    const usable = this.#bottom - this.#top;
    let ky = Number.POSITIVE_INFINITY;
    for (const column of columns) {
      const total = column.reduce((sum, node) => sum + nodes[node].value, 0);
      ky = Math.min(ky, (usable - (column.length - 1) * this.#gap) / total);
    }

    for (let link = 0; link < links.length; link++) {
      this.width[link] = links[link].value * ky;
    }

    for (const column of columns) {
      let y = this.#top;
      for (const node of column) {
        this.y0[node] = y;
        this.y1[node] = y + nodes[node].value * ky;
        y = this.y1[node] + this.#gap;
      }

      // Spread the column's spare room evenly around its nodes.
      const spare = (this.#bottom - y + this.#gap) / (column.length + 1);
      column.forEach((node, i) => {
        this.y0[node] += spare * (i + 1);
        this.y1[node] += spare * (i + 1);
      });

      for (const node of column) {
        this.#sortLinks(node);
      }
    }
  }

  #relaxLeftToRight(columns: number[][], factors: { alpha: number; beta: number }): void {
    const { nodes, links } = this.#model;
    for (let i = 1; i < columns.length; i++) {
      const column = columns[i];
      for (const target of column) {
        let y = 0;
        let weight = 0;
        for (const link of this.incoming[target]) {
          const { source, value } = links[link];
          const w = value * (nodes[target].column - nodes[source].column);
          y += this.#targetTop(link) * w;
          weight += w;
        }
        if (!(weight > 0)) continue;

        this.#shift(target, (y / weight - this.y0[target]) * factors.alpha);
        this.#sortNeighborLinks(target);
      }

      this.#sortColumn(column);
      this.#resolveCollisions(column, factors.beta);
    }
  }

  #relaxRightToLeft(columns: number[][], factors: { alpha: number; beta: number }): void {
    const { nodes, links } = this.#model;
    for (let i = columns.length - 2; i >= 0; i--) {
      const column = columns[i];
      for (const source of column) {
        let y = 0;
        let weight = 0;
        for (const link of this.outgoing[source]) {
          const { target, value } = links[link];
          const w = value * (nodes[target].column - nodes[source].column);
          y += this.#sourceTop(link) * w;
          weight += w;
        }
        if (!(weight > 0)) continue;

        this.#shift(source, (y / weight - this.y0[source]) * factors.alpha);
        this.#sortNeighborLinks(source);
      }

      this.#sortColumn(column);
      this.#resolveCollisions(column, factors.beta);
    }
  }

  #shift(node: number, dy: number): void {
    this.y0[node] += dy;
    this.y1[node] += dy;
  }

  /** Stable, so nodes at the same height keep their input order. */
  #sortColumn(column: number[]): void {
    column.sort((a, b) => this.y0[a] - this.y0[b]);
  }

  /** Where the target's top would sit for a straight band from its source. */
  #targetTop(link: number): number {
    const { source, target } = this.#model.links[link];
    let y = this.y0[source] - ((this.outgoing[source].length - 1) * this.#gap) / 2;
    for (const other of this.outgoing[source]) {
      if (other === link) break;

      y += this.width[other] + this.#gap;
    }
    for (const other of this.incoming[target]) {
      if (other === link) break;

      y -= this.width[other];
    }

    return y;
  }

  /** Where the source's top would sit for a straight band to its target. */
  #sourceTop(link: number): number {
    const { source, target } = this.#model.links[link];
    let y = this.y0[target] - ((this.incoming[target].length - 1) * this.#gap) / 2;
    for (const other of this.incoming[target]) {
      if (other === link) break;

      y += this.width[other] + this.#gap;
    }
    for (const other of this.outgoing[source]) {
      if (other === link) break;

      y -= this.width[other];
    }

    return y;
  }

  #resolveCollisions(column: number[], alpha: number): void {
    const middle = column.length >> 1;
    const subject = column[middle];
    this.#pushUp(column, { y: this.y0[subject] - this.#gap, from: middle - 1, alpha });
    this.#pushDown(column, { y: this.y1[subject] + this.#gap, from: middle + 1, alpha });
    this.#pushUp(column, { y: this.#bottom, from: column.length - 1, alpha });
    this.#pushDown(column, { y: this.#top, from: 0, alpha });
  }

  #pushDown(column: number[], args: { y: number; from: number; alpha: number }): void {
    let { y } = args;
    for (let i = args.from; i < column.length; i++) {
      const node = column[i];
      const dy = (y - this.y0[node]) * args.alpha;
      if (dy > 1e-6) this.#shift(node, dy);

      y = this.y1[node] + this.#gap;
    }
  }

  #pushUp(column: number[], args: { y: number; from: number; alpha: number }): void {
    let { y } = args;
    for (let i = args.from; i >= 0; i--) {
      const node = column[i];
      const dy = (this.y1[node] - y) * args.alpha;
      if (dy > 1e-6) this.#shift(node, -dy);

      y = this.y0[node] - this.#gap;
    }
  }

  /** Order a node's link ends by the other end's height, so bands don't cross at the node. */
  #sortLinks(node: number): void {
    const { links } = this.#model;
    this.outgoing[node].sort((a, b) => this.y0[links[a].target] - this.y0[links[b].target] || a - b);
    this.incoming[node].sort((a, b) => this.y0[links[a].source] - this.y0[links[b].source] || a - b);
  }

  /** A node moved: re-sort the link ends at the nodes across its links. */
  #sortNeighborLinks(node: number): void {
    const { links } = this.#model;
    for (const link of this.incoming[node]) {
      this.#sortLinks(links[link].source);
    }
    for (const link of this.outgoing[node]) {
      this.#sortLinks(links[link].target);
    }
  }
}

function computeLayout(args: {
  model: SankeyModel;
  geometry: LayoutGeometry;
  options: ResolvedSankeyOptions;
}): SankeyLayout | null {
  const { model, geometry, options } = args;
  const top = clamp(geometry.padTop, 0, geometry.height);
  const bottom = geometry.height - clamp(geometry.padBottom, 0, geometry.height - top);
  const nodeWidth = options.nodeWidth * geometry.hpr;
  if (bottom - top <= 0 || geometry.width <= nodeWidth) return null;

  const columns: number[][] = Array.from({ length: model.columns }, () => []);
  model.nodes.forEach((node, index) => {
    columns[node.column].push(index);
  });

  const fullest = Math.max(1, ...columns.map((column) => column.length));
  // A crowded column gives up gap before its nodes shrink to nothing.
  const gapLimit = fullest > 1 ? (bottom - top) / (fullest - 1) / 2 : Number.POSITIVE_INFINITY;
  const gap = Math.min(options.nodePadding * geometry.vpr, gapLimit);

  const solver = new LayoutSolver({ model, top, bottom, gap });
  if (model.nodes.length > 0) solver.solve(columns);

  const step = model.columns > 1 ? (geometry.width - nodeWidth) / (model.columns - 1) : 0;
  const x0 = model.nodes.map((node) => node.column * step);
  const x1 = x0.map((x) => x + nodeWidth);

  const sy = new Array<number>(model.links.length).fill(0);
  const ty = new Array<number>(model.links.length).fill(0);
  const shade = new Array<number>(model.links.length).fill(0);
  model.nodes.forEach((_node, index) => {
    let outY = solver.y0[index];
    const bands = solver.outgoing[index].length;
    solver.outgoing[index].forEach((link, rank) => {
      sy[link] = outY + solver.width[link] / 2;
      outY += solver.width[link];
      const shaded = model.links[link].color === undefined && bands > 1;
      if (shaded) shade[link] = rank * Math.min(SHADE_STEP_MAX, SHADE_SPREAD / (bands - 1));
    });

    let inY = solver.y0[index];
    for (const link of solver.incoming[index]) {
      ty[link] = inY + solver.width[link] / 2;
      inY += solver.width[link];
    }
  });

  return { top, bottom, step, x0, x1, y0: solver.y0, y1: solver.y1, width: solver.width, sy, ty, shade };
}

// --- Drawn frame -------------------------------------------------------------------

interface DrawnNode {
  id: string;
  label: string;
  value: number;
  color: string;
  column: number;
  /** Label side: `1` right of the node, `-1` left (last column). */
  side: 1 | -1;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  alpha: number;
  /** Hover index, or `-1` for a node fading out. */
  index: number;
}

interface DrawnLink {
  key: string;
  /** The color before {@link shade}: the link's own, else its source node's. */
  color: string;
  shade: number;
  x0: number;
  x1: number;
  sy: number;
  ty: number;
  width: number;
  alpha: number;
  index: number;
}

/** What one frame draws, in bitmap pixels. */
export interface SankeyFrame {
  nodes: DrawnNode[];
  links: DrawnLink[];
}

interface Morph {
  from: SankeyFrame;
  start: number;
  durationMs: number;
}

function blendNode(args: { from: DrawnNode | undefined; to: DrawnNode; t: number }): DrawnNode {
  const { from, to, t } = args;
  if (from === undefined) return { ...to, alpha: t };

  return {
    ...to,
    x0: lerp(from.x0, to.x0, t),
    x1: lerp(from.x1, to.x1, t),
    y0: lerp(from.y0, to.y0, t),
    y1: lerp(from.y1, to.y1, t),
    alpha: lerp(from.alpha, 1, t),
  };
}

function blendLink(args: { from: DrawnLink | undefined; to: DrawnLink; t: number }): DrawnLink {
  const { from, to, t } = args;
  if (from === undefined) return { ...to, alpha: t };

  return {
    ...to,
    x0: lerp(from.x0, to.x0, t),
    x1: lerp(from.x1, to.x1, t),
    sy: lerp(from.sy, to.sy, t),
    ty: lerp(from.ty, to.ty, t),
    width: lerp(from.width, to.width, t),
    shade: lerp(from.shade, to.shade, t),
    alpha: lerp(from.alpha, 1, t),
  };
}

/** Kept elements ease by id, new ones fade in, removed ones fade out where they were. */
function blendFrames(args: { from: SankeyFrame; to: SankeyFrame; t: number }): SankeyFrame {
  const { from, to, t } = args;
  const fromNodes = new Map(from.nodes.map((node) => [node.id, node]));
  const fromLinks = new Map(from.links.map((link) => [link.key, link]));
  const toNodes = new Set(to.nodes.map((node) => node.id));
  const toLinks = new Set(to.links.map((link) => link.key));

  const nodes = to.nodes.map((node) => blendNode({ from: fromNodes.get(node.id), to: node, t }));
  const links = to.links.map((link) => blendLink({ from: fromLinks.get(link.key), to: link, t }));

  for (const node of from.nodes) {
    if (!toNodes.has(node.id)) nodes.push({ ...node, alpha: node.alpha * (1 - t), index: -1 });
  }
  for (const link of from.links) {
    if (!toLinks.has(link.key)) links.push({ ...link, alpha: link.alpha * (1 - t), index: -1 });
  }

  return { nodes, links };
}

/** The `t` where an increasing map of `[0, 1]` onto `[0, 1]` reaches `y`. */
function solveMonotone(fn: (t: number) => number, y: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < y) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) / 2;
}

/** X of the band's Bézier at `t`; the control points sit at the middle X, so it is monotonic. */
function bandX(t: number): number {
  return 1.5 * t - 1.5 * t * t + t * t * t;
}

/** Center Y of a band at bitmap X `x`, or `null` outside its span. */
function bandCenterAt(link: DrawnLink, x: number): number | null {
  if (x < link.x0 || x > link.x1 || link.x1 <= link.x0) return null;

  const t = solveMonotone(bandX, (x - link.x0) / (link.x1 - link.x0));
  const rise = 3 * t * t - 2 * t * t * t;

  return link.sy + (link.ty - link.sy) * rise;
}

// --- Entrance cascade ----------------------------------------------------------------

/** The cascade in plan ms; `entryMs` stretches or squeezes the whole of it. */
const CASCADE = {
  /** Band travel across one column step. */
  hopMs: 240,
  /** Soft head of a running band, CSS px. */
  featherPx: 36,
  growMs: 260,
  sourceStaggerMs: 24,
  /** A source starts to pour once it has grown this far. */
  sourceOutAt: 0.55,
  /** A node pours this long before its last inflow lands, so the cascade never stalls. */
  outLeadMs: 60,
  labelMs: 300,
  /** CSS px a label slides into place. */
  labelSlidePx: 4,
};

interface CascadePlan {
  /** Plan ms until the last label is in place. */
  total: number;
  /** Bitmap px of a band head's soft edge. */
  feather: number;
  links: { start: number; durationMs: number }[];
  /** `growStart` is set for a source, which grows; any other node fills from its inflows. */
  nodes: { growStart: number | null; visibleFrom: number; full: number }[];
}

/** Half linear, half sine: the head leaves and lands softly but never stalls mid-band. */
function flowEase(t: number): number {
  return 0.5 * t + 0.25 * (1 - Math.cos(Math.PI * t));
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Sources grow first; each band runs to its target, which fills from its inflows, then pours on. */
function planCascade(args: { model: SankeyModel; layout: SankeyLayout; hpr: number }): CascadePlan {
  const { model, layout } = args;
  const feather = Math.min(CASCADE.featherPx * args.hpr, layout.step * 0.3);
  const speed = layout.step / CASCADE.hopMs;
  const links = model.links.map(() => ({ start: 0, durationMs: 0 }));
  const nodes = model.nodes.map(() => ({ growStart: null as number | null, visibleFrom: 0, full: 0 }));
  const spanOf = (link: number): number => layout.x0[model.links[link].target] - layout.x1[model.links[link].source];

  // Column order times every inflow of a node before the node itself.
  const order = model.nodes.map((_node, index) => index);
  order.sort((a, b) => model.nodes[a].column - model.nodes[b].column || layout.y0[a] - layout.y0[b]);

  let sources = 0;
  let total = 0;
  for (const index of order) {
    const node = model.nodes[index];
    const timing = nodes[index];
    let outStart: number;

    if (node.incoming.length === 0) {
      const growStart = sources * CASCADE.sourceStaggerMs;
      sources++;
      timing.growStart = growStart;
      timing.visibleFrom = growStart;
      timing.full = growStart + CASCADE.growMs;
      outStart = growStart + CASCADE.growMs * CASCADE.sourceOutAt;
    } else {
      // A node shows once the first head reaches its edge.
      const arrivals = node.incoming.map((link) => {
        const span = spanOf(link);
        const reach = solveMonotone(flowEase, span / (span + feather));

        return links[link].start + links[link].durationMs * reach;
      });
      timing.visibleFrom = Math.min(...arrivals);
      timing.full = Math.max(...node.incoming.map((link) => links[link].start + links[link].durationMs));
      outStart = timing.full - CASCADE.outLeadMs;
    }

    for (const link of node.outgoing) {
      links[link] = { start: outStart, durationMs: (spanOf(link) + feather) / speed };
    }

    total = Math.max(total, timing.full + CASCADE.labelMs);
  }

  return { total, feather, links, nodes };
}

/** Where a band's head is at plan time `t`: `progress` in `[0, 1]`, `head` in bitmap px. */
function bandHead(args: { plan: CascadePlan; link: number; x0: number; x1: number; t: number }): {
  progress: number;
  head: number;
} {
  const { plan, link, x0, x1, t } = args;
  const timing = plan.links[link];
  const progress = timing.durationMs > 0 ? clamp((t - timing.start) / timing.durationMs, 0, 1) : 1;
  // The head runs one feather past the target edge, where the band is opaque to its end.
  const head = x0 + (x1 - x0 + plan.feather) * flowEase(progress);

  return { progress, head };
}

const PLAIN_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * `color` mixed toward `background` by `amount`: `mixColors` when both are plain hex,
 * `color-mix` for any other pair (named, `rgb()`, `hsl()`, hex with alpha), which keeps their alpha.
 */
function shadeColor(args: { color: string; background: string; amount: number }): string {
  const { color, background, amount } = args;
  if (amount <= 0) return color;

  const plain = PLAIN_HEX.test(color) && PLAIN_HEX.test(background);
  if (plain) return mixColors(color, background, amount);

  return `color-mix(in srgb, ${color}, ${background} ${Math.round(amount * 100)}%)`;
}

/**
 * `color` at `alpha`, for any CSS color: `rgba()` for plain hex, `color-mix` for the
 * rest (which keeps an `rgba()` input's own alpha). A plain `transparent` stop would
 * not do: canvas gradients mix unpremultiplied, so a fade to transparent black darkens the edge.
 */
function withAlpha(color: string, alpha: number): string {
  if (PLAIN_HEX.test(color)) return hexToRgba(color, alpha);

  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

/** Opaque left of `head - feather`, clear right of `head`, with no visible ramp edge. */
function featherGradient(args: {
  context: CanvasRenderingContext2D;
  color: string;
  head: number;
  feather: number;
}): CanvasGradient {
  const { context, color, head, feather } = args;
  const gradient = context.createLinearGradient(head - feather, 0, head, 0);
  const stops = 8;
  for (let i = 0; i <= stops; i++) {
    const offset = i / stops;
    gradient.addColorStop(offset, withAlpha(color, 1 - smoothstep(offset)));
  }

  return gradient;
}

/** The cascade at one moment: its plan and the plan time. */
interface Reveal {
  plan: CascadePlan;
  t: number;
}

export class SankeyRenderer implements SankeySeriesRenderer {
  readonly kind = 'sankey' as const;

  #options: ResolvedSankeyOptions;
  #theme: ChartTheme;
  #model: SankeyModel = EMPTY_MODEL;
  /** What the last accepted `setData` read, so a fresh copy of the same graph is a no-op. */
  #input: InputSnapshot = { nodes: [], links: [] };

  #layoutCache: { key: string; layout: SankeyLayout | null } | null = null;
  /** Canvas of the last render; `hitTest` and a data change read their layout against it. */
  #lastGeometry: LayoutGeometry | null = null;
  #lastFrame: SankeyFrame | null = null;

  /** First-data cascade; `start` stamps on the first render after arming. */
  #entry: { start: number | null; durationMs: number } | null = null;
  #cascadeCache: { layout: SankeyLayout; plan: CascadePlan } | null = null;
  /** The newest data that arrived during the cascade, applied once it ends. */
  #pending: { model: SankeyModel; snapshot: InputSnapshot } | null = null;
  #morph: Morph | null = null;

  #hoverIndex = -1;
  /** Dim per hover index (nodes, then links), eased from `from` to `to`. */
  #dimFrom: number[] = [];
  #dimTo: number[] = [];
  #dimStart: number | null = null;

  #dataListeners: Array<() => void> = [];

  constructor(args: { options?: Partial<SankeySeriesOptions>; theme: ChartTheme }) {
    this.#options = normalize(DEFAULT_OPTIONS, args.options ?? {});
    this.#theme = args.theme;
  }

  // --- Data ingest -----------------------------------------------------------

  /** Replace the graph with `{ nodes, links }`; the diagram on screen morphs to it. */
  setData(data: unknown): void {
    const rows = readRows(data);
    const snapshot: InputSnapshot = {
      nodes: rows.nodes.map((row) => rowValues(row, NODE_FIELDS)),
      links: rows.links.map((row) => rowValues(row, LINK_FIELDS)),
    };
    // A wrapper passes a fresh object of the same graph on every render; that must not replay the morph.
    const latest = this.#pending?.snapshot ?? this.#input;
    const unchanged = sameRows(snapshot.nodes, latest.nodes) && sameRows(snapshot.links, latest.links);
    if (unchanged) return;

    const rejected: RejectedLinks = { count: 0, first: null };
    const model = buildModel({ nodes: rows.nodes, links: rows.links, rejected });
    this.#reportRejected(rejected);

    // A running cascade draws its first data to the end; the newest data waits, then morphs in.
    const cascading = this.#entry !== null && this.#entry.start !== null;
    if (cascading) {
      this.#pending = { model, snapshot };

      return;
    }

    this.#apply({ model, snapshot });
  }

  #apply(next: { model: SankeyModel; snapshot: InputSnapshot }): void {
    const now = performance.now();
    const onScreen = this.#drawnFrame(now);
    const hoverKey = this.#hoverKey();

    this.#input = next.snapshot;
    this.#model = next.model;
    this.#pending = null;
    this.#layoutCache = null;

    const showsNothing = onScreen === null || (onScreen.nodes.length === 0 && onScreen.links.length === 0);
    const animate = this.#options.updateMs > 0 && !prefersReducedMotion();
    if (showsNothing) {
      this.#morph = null;
      if (next.model.nodes.length > 0) this.#armEntry();
    } else {
      this.#morph = animate ? { from: onScreen, start: now, durationMs: this.#options.updateMs } : null;
    }

    this.#hoverIndex = this.#indexOfKey(hoverKey);
    this.#dimTo = this.#dimTargets(this.#hoverIndex);
    this.#dimFrom = this.#dimTo;
    this.#dimStart = null;

    for (const listener of this.#dataListeners) {
      listener();
    }
  }

  #reportRejected(rejected: RejectedLinks): void {
    if (rejected.count === 0) return;

    const rows = rejected.count === 1 ? 'link' : 'links';
    warnDataOnce({
      token: this,
      topic: 'sankey-links',
      message:
        `sankey: skipping ${rejected.count} ${rows} (first: ${describeLink(rejected.first)}). ` +
        'A link needs a source and a target from `nodes` and a finite value above 0.',
    });
  }

  #armEntry(): void {
    const { entryMs } = this.#options;
    this.#entry = entryMs > 0 && !prefersReducedMotion() ? { start: null, durationMs: entryMs } : null;
  }

  onDataChanged(listener: () => void): () => void {
    this.#dataListeners.push(listener);

    return () => {
      const index = this.#dataListeners.indexOf(listener);
      if (index >= 0) this.#dataListeners.splice(index, 1);
    };
  }

  updateOptions(options: Partial<SankeySeriesOptions>): void {
    this.#options = normalize(this.#options, options ?? {});
    this.#layoutCache = null;

    if (this.#options.entryMs === 0) this.#entry = null;
    if (this.#options.updateMs === 0) {
      this.#morph = null;
      this.#dimStart = null;
    }
  }

  applyTheme(theme: ChartTheme): void {
    this.#theme = theme;
  }

  // --- Layers (single-layer, like pie and heatmap) ----------------------------------

  getLayerCount(): number {
    return 1;
  }

  setLayerVisible(_index: number, _visible: boolean): void {
    // A sankey has no layers.
  }

  isLayerVisible(_index: number): boolean {
    return true;
  }

  getLayerColors(): string[] {
    const first = this.#model.nodes[0];
    if (first) return [this.#nodeColor(first, this.#theme)];

    return [this.#theme.seriesColors[0] ?? '#888'];
  }

  getTotalLength(): number {
    return this.#model.links.length;
  }

  #nodeColor(node: ModelNode, theme: ChartTheme): string {
    if (node.color !== undefined) return node.color;

    const fromOptions = this.#options.colors?.[node.paletteIndex];
    if (fromOptions !== undefined) return fromOptions;

    const palette = theme.seriesColors;

    return palette.length > 0 ? palette[node.paletteIndex % palette.length] : '#888';
  }

  #linkColor(link: ModelLink, theme: ChartTheme): string {
    return link.color ?? this.#nodeColor(this.#model.nodes[link.source], theme);
  }

  // --- Layout --------------------------------------------------------------------

  #layoutFor(geometry: LayoutGeometry): SankeyLayout | null {
    const { width, height, padTop, padBottom, hpr, vpr } = geometry;
    const key = `${width}|${height}|${padTop}|${padBottom}|${hpr}|${vpr}`;
    if (this.#layoutCache?.key === key) return this.#layoutCache.layout;

    const layout = computeLayout({ model: this.#model, geometry, options: this.#options });
    this.#layoutCache = { key, layout };

    return layout;
  }

  /** The diagram as the data says, no morph. */
  #targetFrame(layout: SankeyLayout): SankeyFrame {
    const { nodes, links, columns } = this.#model;
    const lastColumn = columns - 1;

    const drawnNodes = nodes.map(
      (node, index): DrawnNode => ({
        id: node.id,
        label: node.label,
        value: node.value,
        color: this.#nodeColor(node, this.#theme),
        column: node.column,
        side: node.column === lastColumn && lastColumn > 0 ? -1 : 1,
        x0: layout.x0[index],
        x1: layout.x1[index],
        y0: layout.y0[index],
        y1: layout.y1[index],
        alpha: 1,
        index,
      }),
    );

    const drawnLinks = links.map(
      (link, index): DrawnLink => ({
        key: link.key,
        color: this.#linkColor(link, this.#theme),
        shade: layout.shade[index],
        x0: layout.x1[link.source],
        x1: layout.x0[link.target],
        sy: layout.sy[index],
        ty: layout.ty[index],
        width: layout.width[index],
        alpha: 1,
        index: nodes.length + index,
      }),
    );

    return { nodes: drawnNodes, links: drawnLinks };
  }

  #frameAt(now: number, layout: SankeyLayout): SankeyFrame {
    const target = this.#targetFrame(layout);
    const morph = this.#morph;
    if (morph === null) return target;

    const t = easeOutCubic(clamp((now - morph.start) / morph.durationMs, 0, 1));

    return blendFrames({ from: morph.from, to: target, t });
  }

  /** What is on screen at `now`, or `null` before the first render. */
  #drawnFrame(now: number): SankeyFrame | null {
    if (this.#lastGeometry === null) return null;

    const layout = this.#layoutFor(this.#lastGeometry);

    return layout === null ? null : this.#frameAt(now, layout);
  }

  // --- Hover -----------------------------------------------------------------------

  /** Nodes first, then links, against the layout the data says (not mid-morph). */
  hitTest(bx: number, by: number, bitmapWidth: number, bitmapHeight: number, padding?: RenderPadding): number {
    const layout = this.#layoutFor({
      width: bitmapWidth,
      height: bitmapHeight,
      padTop: padding?.top ?? 0,
      padBottom: padding?.bottom ?? 0,
      hpr: this.#lastGeometry?.hpr ?? 1,
      vpr: this.#lastGeometry?.vpr ?? 1,
    });
    if (layout === null) return -1;

    // Mid-cascade, only what is already on screen answers.
    const reveal = this.#revealAt({ now: performance.now(), layout, stamp: false });
    const { nodes } = this.#model;
    const frame = this.#targetFrame(layout);
    for (const node of frame.nodes) {
      const hidden = reveal !== null && reveal.t <= reveal.plan.nodes[node.index].visibleFrom;
      if (hidden) continue;

      const inside = bx >= node.x0 && bx <= node.x1 && by >= node.y0 && by <= node.y1;
      if (inside) return node.index;
    }

    // Last drawn is on top.
    for (let i = frame.links.length - 1; i >= 0; i--) {
      const link = frame.links[i];
      const hidden = reveal !== null && reveal.t <= reveal.plan.links[link.index - nodes.length].start;
      if (hidden) continue;

      const center = bandCenterAt(link, bx);
      if (center !== null && Math.abs(by - center) <= link.width / 2) return link.index;
    }

    return -1;
  }

  setHoverIndex(index: number): boolean {
    if (this.#hoverIndex === index) return false;

    const now = performance.now();
    const current = this.#dimsAt(now);
    this.#hoverIndex = index;
    this.#dimTo = this.#dimTargets(index);

    if (this.#options.updateMs > 0) {
      this.#dimFrom = current;
      this.#dimStart = now;
    } else {
      this.#dimFrom = this.#dimTo;
      this.#dimStart = null;
    }

    return true;
  }

  getHoverIndex(): number {
    return this.#hoverIndex;
  }

  getHoverInfo(theme: ChartTheme): HoverInfo | null {
    const { nodes, links, sourceTotal } = this.#model;
    const index = this.#hoverIndex;
    if (index < 0) return null;

    if (index < nodes.length) {
      const node = nodes[index];

      return {
        label: node.label,
        value: node.value,
        percent: sourceTotal > 0 ? (node.value / sourceTotal) * 100 : 0,
        color: this.#nodeColor(node, theme),
      };
    }

    const link = links[index - nodes.length];
    if (link === undefined) return null;

    const source = nodes[link.source];
    const target = nodes[link.target];

    return {
      label: `${source.label} → ${target.label}`,
      value: link.value,
      percent: source.outValue > 0 ? (link.value / source.outValue) * 100 : 0,
      color: shadeColor({
        color: this.#linkColor(link, theme),
        background: theme.background,
        amount: this.#linkShade(index - nodes.length),
      }),
    };
  }

  /** The shade the link draws with at rest, `0` before any layout. */
  #linkShade(link: number): number {
    const geometry = this.#lastGeometry;
    const layout = geometry === null ? null : this.#layoutFor(geometry);

    return layout?.shade[link] ?? 0;
  }

  #hoverKey(): string | null {
    const { nodes, links } = this.#model;
    const index = this.#hoverIndex;
    if (index < 0) return null;
    if (index < nodes.length) return `node:${nodes[index].id}`;

    const link = links[index - nodes.length];

    return link === undefined ? null : `link:${link.key}`;
  }

  #indexOfKey(key: string | null): number {
    if (key === null) return -1;

    const { nodes, links } = this.#model;
    const node = nodes.findIndex((candidate) => `node:${candidate.id}` === key);
    if (node >= 0) return node;

    const link = links.findIndex((candidate) => `link:${candidate.key}` === key);

    return link >= 0 ? nodes.length + link : -1;
  }

  /** `1` for what a hover leaves out — adjacency only, not the whole trajectory. */
  #dimTargets(hover: number): number[] {
    const { nodes, links } = this.#model;
    const total = nodes.length + links.length;
    if (hover < 0 || hover >= total) return new Array<number>(total).fill(0);

    const dims = new Array<number>(total).fill(1);
    const keepLink = (link: number): void => {
      dims[nodes.length + link] = 0;
      dims[links[link].source] = 0;
      dims[links[link].target] = 0;
    };

    if (hover < nodes.length) {
      dims[hover] = 0;
      for (const link of [...nodes[hover].incoming, ...nodes[hover].outgoing]) {
        keepLink(link);
      }
    } else {
      keepLink(hover - nodes.length);
    }

    return dims;
  }

  #dimsAt(now: number): number[] {
    const start = this.#dimStart;
    if (start === null) return this.#dimTo;

    const t = easeOutCubic(clamp((now - start) / this.#options.updateMs, 0, 1));

    return this.#dimTo.map((to, i) => lerp(this.#dimFrom[i] ?? to, to, t));
  }

  // --- Animation ---------------------------------------------------------------------

  get needsAnimation(): boolean {
    const waiting = this.#pending !== null;

    return waiting || this.#entry !== null || this.#morph !== null || this.#dimStart !== null;
  }

  dispose(): void {
    this.#dataListeners = [];
    this.#model = EMPTY_MODEL;
    this.#input = { nodes: [], links: [] };
    this.#layoutCache = null;
    this.#lastFrame = null;
    this.#cascadeCache = null;
    this.#pending = null;
    this.#entry = null;
    this.#morph = null;
    this.#dimStart = null;
  }

  /**
   * @internal Test-only: the frame the last render drew, in bitmap pixels.
   * Do not call from production code.
   */
  _inspectFrame(): SankeyFrame | null {
    return this.#lastFrame;
  }

  /** Stop every tween at its end — nothing can be seen to move. */
  #settle(): void {
    this.#entry = null;
    this.#morph = null;
    this.#dimStart = null;
  }

  #cascadeFor(layout: SankeyLayout): CascadePlan {
    if (this.#cascadeCache?.layout === layout) return this.#cascadeCache.plan;

    const hpr = this.#lastGeometry?.hpr ?? 1;
    const plan = planCascade({ model: this.#model, layout, hpr });
    this.#cascadeCache = { layout, plan };

    return plan;
  }

  /**
   * The cascade at `now`, stretched so it ends at `entryMs`, or `null` without one.
   * `stamp` (the render pass) starts the clock and clears the cascade once it is through.
   */
  #revealAt(args: { now: number; layout: SankeyLayout; stamp: boolean }): Reveal | null {
    const entry = this.#entry;
    if (entry === null) return null;

    const plan = this.#cascadeFor(args.layout);
    if (entry.start === null) {
      if (!args.stamp) return { plan, t: Number.NEGATIVE_INFINITY };

      entry.start = args.now;
    }

    const t = ((args.now - entry.start) / entry.durationMs) * plan.total;
    if (t < plan.total) return { plan, t };

    if (args.stamp) this.#entry = null;

    return null;
  }

  /** Clear the morph and the dim ease once they reach their end. */
  #advanceTweens(now: number): void {
    const morph = this.#morph;
    if (morph !== null && now - morph.start >= morph.durationMs) this.#morph = null;

    const dimStart = this.#dimStart;
    if (dimStart !== null && now - dimStart >= this.#options.updateMs) this.#dimStart = null;
  }

  // --- Render ------------------------------------------------------------------------

  render(ctx: SeriesRenderContext): void {
    const { scope, theme, padding } = ctx;
    const { context, bitmapSize, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
    this.#theme = theme;

    const geometry: LayoutGeometry = {
      width: bitmapSize.width,
      height: bitmapSize.height,
      padTop: padding.top * vpr,
      padBottom: padding.bottom * vpr,
      hpr,
      vpr,
    };
    this.#lastGeometry = geometry;

    // Held data goes in before this frame draws, not from inside the pass that ended the cascade.
    const pending = this.#pending;
    if (pending !== null && this.#entry === null) this.#apply(pending);

    const layout = this.#layoutFor(geometry);
    if (layout === null) {
      // Nothing fits, so no tween can be seen; settling keeps the frame loop from spinning.
      this.#settle();
      this.#lastFrame = null;

      return;
    }

    const now = performance.now();
    const frame = this.#frameAt(now, layout);
    const dims = this.#dimsAt(now);
    const reveal = this.#revealAt({ now, layout, stamp: true });
    this.#advanceTweens(now);
    this.#lastFrame = frame;

    const empty = frame.nodes.length === 0 && frame.links.length === 0;
    if (empty) return;

    const nodeCount = this.#model.nodes.length;
    const baseAlpha = context.globalAlpha;
    for (const link of frame.links) {
      const color = shadeColor({ color: link.color, background: theme.background, amount: link.shade });
      let fill: string | CanvasGradient = color;
      if (reveal !== null && link.index >= 0) {
        const { progress, head } = bandHead({
          plan: reveal.plan,
          link: link.index - nodeCount,
          x0: link.x0,
          x1: link.x1,
          t: reveal.t,
        });
        if (progress <= 0) continue;

        if (progress < 1) fill = featherGradient({ context, color, head, feather: reveal.plan.feather });
      }

      const dim = link.index >= 0 ? (dims[link.index] ?? 0) : 0;
      context.globalAlpha = baseAlpha * this.#options.linkOpacity * link.alpha * (1 - LINK_DIM * dim);
      context.fillStyle = fill;
      this.#drawBand(context, link);
    }

    const radius = NODE_RADIUS * hpr;
    for (const node of frame.nodes) {
      const dim = node.index >= 0 ? (dims[node.index] ?? 0) : 0;
      context.globalAlpha = baseAlpha * node.alpha * (1 - NODE_DIM * dim);
      context.fillStyle = node.color;

      const filling = reveal !== null && node.index >= 0 && reveal.t < reveal.plan.nodes[node.index].full;
      if (filling) {
        this.#drawFillingNode({ context, node, reveal, layout, radius });
        continue;
      }

      fillRoundedRect(context, {
        x: node.x0,
        y: node.y0,
        width: node.x1 - node.x0,
        height: Math.max(0, node.y1 - node.y0),
        radius,
        corners: { tl: true, tr: true, br: true, bl: true },
      });
    }

    const labels = this.#options.labels;
    if (labels !== false) {
      const width = bitmapSize.width;
      this.#drawLabels({ context, frame, dims, labels, theme, layout, width, hpr, vpr, baseAlpha, reveal });
    }

    context.globalAlpha = baseAlpha;
  }

  /** Mid-cascade: a source grows from its center; any other node fills one slot per landed inflow. */
  #drawFillingNode(args: {
    context: CanvasRenderingContext2D;
    node: DrawnNode;
    reveal: Reveal;
    layout: SankeyLayout;
    radius: number;
  }): void {
    const { context, node, reveal, layout, radius } = args;
    const timing = reveal.plan.nodes[node.index];
    const width = node.x1 - node.x0;

    if (timing.growStart !== null) {
      const scale = easeOutCubic(clamp((reveal.t - timing.growStart) / CASCADE.growMs, 0, 1));
      if (scale <= 0) return;

      const height = Math.max(0, node.y1 - node.y0) * scale;
      const middle = (node.y0 + node.y1) / 2;
      fillRoundedRect(context, {
        x: node.x0,
        y: middle - height / 2,
        width,
        height,
        radius,
        corners: { tl: true, tr: true, br: true, bl: true },
      });

      return;
    }

    context.save();
    context.beginPath();
    context.rect(node.x0, node.y0, width, node.y1 - node.y0);
    context.clip();

    // Inflow slots share the node's whole height by value, so a node taller than its
    // inflow (more out than in) still ends its fill on the final rectangle.
    const { links } = this.#model;
    const incoming = [...this.#model.nodes[node.index].incoming].sort((a, b) => layout.ty[a] - layout.ty[b]);
    const inflow = incoming.reduce((sum, link) => sum + links[link].value, 0);
    const nodeHeight = node.y1 - node.y0;
    let slotTop = node.y0;
    for (const link of incoming) {
      const slot = (nodeHeight * links[link].value) / inflow;
      const center = slotTop + slot / 2;
      slotTop += slot;

      const x0 = layout.x1[links[link].source];
      const { head } = bandHead({ plan: reveal.plan, link, x0, x1: node.x0, t: reveal.t });
      const filled = easeOutCubic(clamp((head - node.x0) / reveal.plan.feather, 0, 1));
      if (filled <= 0) continue;

      const height = slot * filled;
      context.fillRect(node.x0, center - height / 2, width, height);
    }

    context.restore();
  }

  /** A band with horizontal tangents at both ends: two vertical offsets of one Bézier. */
  #drawBand(context: CanvasRenderingContext2D, link: DrawnLink): void {
    const half = link.width / 2;
    const middle = (link.x0 + link.x1) / 2;

    context.beginPath();
    context.moveTo(link.x0, link.sy - half);
    context.bezierCurveTo(middle, link.sy - half, middle, link.ty - half, link.x1, link.ty - half);
    context.lineTo(link.x1, link.ty + half);
    context.bezierCurveTo(middle, link.ty + half, middle, link.sy + half, link.x0, link.sy + half);
    context.closePath();
    context.fill();
  }

  /** `label · value` beside each node on a backdrop, where {@link placeLabels} finds room for it. */
  #drawLabels(args: {
    context: CanvasRenderingContext2D;
    frame: SankeyFrame;
    dims: number[];
    labels: SankeyLabelsOptions;
    theme: ChartTheme;
    layout: SankeyLayout;
    /** Canvas width, bitmap px. */
    width: number;
    hpr: number;
    vpr: number;
    baseAlpha: number;
    reveal: Reveal | null;
  }): void {
    const { context, frame, dims, labels, theme, layout, width, hpr, vpr, baseAlpha, reveal } = args;
    const fontSize = resolveAxisFontSize(theme);
    const format = labels.format ?? defaultSankeyFormat;
    const textColor = labels.color ?? theme.tooltip.textColor;
    const background = labels.background ?? hexToRgba(theme.background, LABEL_BACKDROP_ALPHA);

    context.font = `${fontSize * vpr}px ${theme.typography.fontFamily}`;
    context.textBaseline = 'middle';
    context.textAlign = 'left';

    const boxHeight = (fontSize + 2 * LABEL_PAD_Y) * vpr;
    const nodes = frame.nodes.filter((node) => node.alpha > 0);
    const candidates = nodes.map((node) => {
      const text = `${node.label} · ${format(node.value)}`;
      const center = clamp((node.y0 + node.y1) / 2, layout.top + boxHeight / 2, layout.bottom - boxHeight / 2);

      return { node, text, center, width: context.measureText(text).width + 2 * LABEL_PAD_X * hpr };
    });
    const placed = placeLabels({ candidates, nodes, area: { width, boxHeight }, hpr, vpr });

    for (const placement of placed) {
      const { node, text, center, left } = placement;
      // Mid-cascade, a label fades and slides in once its node is full.
      const fullAt = reveal !== null && node.index >= 0 ? reveal.plan.nodes[node.index].full : null;
      const shown =
        reveal !== null && fullAt !== null ? easeOutCubic(clamp((reveal.t - fullAt) / CASCADE.labelMs, 0, 1)) : 1;
      if (shown <= 0) continue;

      const boxLeft = left - CASCADE.labelSlidePx * hpr * (1 - shown);
      const dim = node.index >= 0 ? (dims[node.index] ?? 0) : 0;
      context.globalAlpha = baseAlpha * node.alpha * shown * (1 - NODE_DIM * dim);
      context.fillStyle = background;
      fillRoundedRect(context, {
        x: boxLeft,
        y: center - boxHeight / 2,
        width: placement.width,
        height: boxHeight,
        radius: LABEL_RADIUS * hpr,
        corners: { tl: true, tr: true, br: true, bl: true },
      });

      context.fillStyle = textColor;
      context.fillText(text, boxLeft + LABEL_PAD_X * hpr, center);
    }
  }
}

interface LabelCandidate {
  node: DrawnNode;
  text: string;
  /** Bitmap Y of the label's middle, kept inside the plot. */
  center: number;
  width: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function boxesOverlap(a: Box, b: Box, gap: { x: number; y: number }): boolean {
  const apartX = a.right + gap.x <= b.left || b.right + gap.x <= a.left;
  const apartY = a.bottom + gap.y <= b.top || b.bottom + gap.y <= a.top;

  return !apartX && !apartY;
}

/**
 * Where each label goes, larger nodes first: beside its node on the side facing
 * the center, else on the other side. A label that would leave the canvas, or
 * cover another node or a placed label, is left out. Returns the placed labels
 * in column order, top to bottom.
 */
function placeLabels(args: {
  candidates: readonly LabelCandidate[];
  nodes: readonly DrawnNode[];
  area: { width: number; boxHeight: number };
  hpr: number;
  vpr: number;
}): (LabelCandidate & { left: number })[] {
  const { candidates, nodes, area, hpr, vpr } = args;
  const offset = LABEL_OFFSET * hpr;
  const gap = { x: LABEL_SPACING * hpr, y: LABEL_SPACING * vpr };
  const nodeBoxes = nodes.map((node) => ({
    node,
    box: { left: node.x0, top: node.y0, right: node.x1, bottom: node.y1 },
  }));

  const byNodeSize = [...candidates].sort(
    (a, b) => b.node.value - a.node.value || a.node.column - b.node.column || a.node.y0 - b.node.y0,
  );
  const taken: Box[] = [];
  const placed: (LabelCandidate & { left: number })[] = [];
  for (const candidate of byNodeSize) {
    const { node, center, width } = candidate;
    const top = center - area.boxHeight / 2;

    for (const side of [node.side, -node.side]) {
      const left = side === 1 ? node.x1 + offset : node.x0 - offset - width;
      const box = { left, top, right: left + width, bottom: top + area.boxHeight };
      if (box.left < 0 || box.right > area.width) continue;

      const coversNode = nodeBoxes.some((other) => other.node !== node && boxesOverlap(box, other.box, gap));
      if (coversNode || taken.some((other) => boxesOverlap(box, other, gap))) continue;

      taken.push(box);
      placed.push({ ...candidate, left });
      break;
    }
  }

  return placed.sort((a, b) => a.node.column - b.node.column || a.center - b.center);
}

/** Series definition for `chart.addSeries` — hosts that never draw a sankey don't bundle this module. */
export const SankeySeriesDef: SeriesDefinition<SankeySeriesOptions> = {
  type: 'sankey',
  create: (env, options) => new SankeyRenderer({ options: { ...options }, theme: env.theme }),
};

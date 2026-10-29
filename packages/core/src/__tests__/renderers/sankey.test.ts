import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SHADE_SPREAD, SHADE_STEP_MAX, type SankeyFrame, SankeyRenderer } from '../../series/sankey';
import { catppuccin } from '../../theme/themes/catppuccin';
import { githubLight } from '../../theme/themes/github-light';
import type { SankeyData, SankeySeriesOptions } from '../../types';
import { hexToRgba, mixColors } from '../../utils/color';
import { buildRenderContext } from '../helpers/render-context';

/**
 * a, b → c → d / e, with a → e skipping a column and b → f ending early:
 * f has no outgoing link, so it moves to the last column.
 */
const FUNNEL: SankeyData = {
  nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }],
  links: [
    { source: 'a', target: 'c', value: 30 },
    { source: 'b', target: 'c', value: 20 },
    { source: 'c', target: 'd', value: 35 },
    { source: 'c', target: 'e', value: 15 },
    { source: 'a', target: 'e', value: 10 },
    { source: 'b', target: 'f', value: 5 },
  ],
};

/** No reveal, no morph, no labels — geometry on the first frame. */
const STILL: Partial<SankeySeriesOptions> = { entryMs: 0, updateMs: 0, labels: false };

function renderOnce(r: SankeyRenderer, opts: Parameters<typeof buildRenderContext>[0] = {}) {
  const built = buildRenderContext(opts);
  r.render(built.ctx);

  return built;
}

function frameOf(r: SankeyRenderer): SankeyFrame {
  const frame = r._inspectFrame();
  if (frame === null) throw new Error('nothing rendered');

  return frame;
}

function nodeOf(frame: SankeyFrame, id: string) {
  const node = frame.nodes.find((candidate) => candidate.id === id);
  if (node === undefined) throw new Error(`no node ${id}`);

  return node;
}

/** Pairs of bands between the same two columns whose ends swap order. */
function countCrossings(ends: { from: number; to: number; sy: number; ty: number }[]): number {
  let crossings = 0;
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const a = ends[i];
      const b = ends[j];
      const sameSpan = a.from === b.from && a.to === b.to;
      if (sameSpan && (a.sy - b.sy) * (a.ty - b.ty) < 0) crossings++;
    }
  }

  return crossings;
}

describe('SankeyRenderer — layout', () => {
  it('puts each node in its longest-path column and moves sinks to the last one', () => {
    const r = new SankeyRenderer({ options: STILL, theme: catppuccin.theme });
    r.setData(FUNNEL);
    renderOnce(r);

    const frame = frameOf(r);
    const columns = Object.fromEntries(frame.nodes.map((node) => [node.id, node.column]));
    expect(columns).toEqual({ a: 0, b: 0, c: 1, d: 2, e: 2, f: 2 });

    // Columns spread across the full width: first at x = 0, last against the right edge.
    expect(nodeOf(frame, 'a').x0).toBe(0);
    expect(nodeOf(frame, 'c').x0).toBeCloseTo((800 - 12) / 2);
    expect(nodeOf(frame, 'd').x1).toBeCloseTo(800);
  });

  it('sizes nodes by throughput on one scale fitted to the fullest column', () => {
    const r = new SankeyRenderer({ options: { ...STILL, nodePadding: 10 }, theme: catppuccin.theme });
    r.setData(FUNNEL);
    renderOnce(r, { padding: { top: 20, bottom: 20 } });

    const frame = frameOf(r);
    const throughput: Record<string, number> = { a: 40, b: 25, c: 50, d: 35, e: 25, f: 5 };
    const scales = frame.nodes.map((node) => (node.y1 - node.y0) / throughput[node.id]);
    for (const scale of scales) {
      expect(scale).toBeCloseTo(scales[0]);
    }

    // The last column (d + e + f = 65, two gaps) fills the padded height exactly.
    expect(scales[0]).toBeCloseTo((400 - 40 - 2 * 10) / 65);
    for (const node of frame.nodes) {
      expect(node.y0).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(node.y1).toBeLessThanOrEqual(380 + 1e-6);
    }
  });

  it('gives the same geometry for the same input', () => {
    const first = new SankeyRenderer({ options: STILL, theme: catppuccin.theme });
    const second = new SankeyRenderer({ options: STILL, theme: catppuccin.theme });
    first.setData(FUNNEL);
    second.setData(structuredClone(FUNNEL));
    renderOnce(first);
    renderOnce(second);

    expect(frameOf(second)).toEqual(frameOf(first));
  });

  it('untangles bands that cross in input order', () => {
    // Input order stacks a over b and x over y, so a → z / c → x cross; relaxation flips them.
    const data: SankeyData = {
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'x' }, { id: 'y' }, { id: 'z' }],
      links: [
        { source: 'a', target: 'z', value: 30 },
        { source: 'b', target: 'y', value: 20 },
        { source: 'c', target: 'x', value: 25 },
        { source: 'a', target: 'y', value: 5 },
      ],
    };
    const inputRank: Record<string, number> = { a: 0, b: 1, c: 2, x: 0, y: 1, z: 2 };
    const inputOrder = data.links.map((link) => ({
      from: 0,
      to: 1,
      sy: inputRank[link.source],
      ty: inputRank[link.target],
    }));

    const r = new SankeyRenderer({ options: STILL, theme: catppuccin.theme });
    r.setData(data);
    renderOnce(r);
    const frame = frameOf(r);
    const columnOf = (x: number) => (x < 400 ? 0 : 1);
    const drawn = frame.links.map((link) => ({
      from: columnOf(link.x0),
      to: columnOf(link.x1),
      sy: link.sy,
      ty: link.ty,
    }));

    expect(countCrossings(inputOrder)).toBeGreaterThan(0);
    expect(countCrossings(drawn)).toBeLessThan(countCrossings(inputOrder));
  });

  it('stacks the link ends at a node in the order of their other ends', () => {
    const r = new SankeyRenderer({ options: STILL, theme: catppuccin.theme });
    r.setData(FUNNEL);
    renderOnce(r);

    const frame = frameOf(r);
    const c = nodeOf(frame, 'c');
    const outOfC = frame.links.filter((link) => link.key.startsWith('c\u0000'));
    const targets = outOfC.map((link) => nodeOf(frame, link.key.split('\u0000')[1]));
    const byEnd = [...outOfC].sort((p, q) => p.sy - q.sy);
    const byTarget = [...outOfC].sort((p, q) => targets[outOfC.indexOf(p)].y0 - targets[outOfC.indexOf(q)].y0);

    expect(byEnd).toEqual(byTarget);
    // The bands leave c edge to edge.
    expect(Math.min(...outOfC.map((link) => link.sy - link.width / 2))).toBeCloseTo(c.y0);
  });
});

describe('SankeyRenderer — data', () => {
  it('rejects a cycle with the nodes on it and keeps the previous data', () => {
    const r = new SankeyRenderer({ options: STILL, theme: catppuccin.theme });
    r.setData(FUNNEL);

    const cyclic: SankeyData = {
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      links: [
        { source: 'a', target: 'b', value: 1 },
        { source: 'b', target: 'c', value: 1 },
        { source: 'c', target: 'b', value: 1 },
      ],
    };
    expect(() => r.setData(cyclic)).toThrow('Sankey links form a cycle: b → c → b');
    expect(() => r.setData({ nodes: [{ id: 'a' }], links: [{ source: 'a', target: 'a', value: 1 }] })).toThrow(
      'Sankey links form a cycle: a → a',
    );

    renderOnce(r);
    expect(frameOf(r).nodes.map((node) => node.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(r.getTotalLength()).toBe(FUNNEL.links.length);
  });

  it('drops unknown or non-positive links with one warning, and skips nodes left without links', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = new SankeyRenderer({ options: STILL, theme: catppuccin.theme });
    const data = {
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'lonely' }],
      links: [
        { source: 'a', target: 'b', value: 4 },
        { source: 'a', target: 'ghost', value: 2 },
        { source: 'a', target: 'lonely', value: 0 },
        { source: 'b', target: 'lonely', value: Number.NaN },
        { source: 'b', target: 'lonely', value: '3' },
      ],
    };
    r.setData(data);
    r.setData({ ...data, links: [...data.links, { source: 'a', target: 'lonely', value: -1 }] });
    renderOnce(r);

    expect(frameOf(r).nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(frameOf(r).links).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('sankey: skipping 4 links (first: a → ghost (value 2))');

    warn.mockRestore();
  });

  it('merges links with the same source and target', () => {
    const r = new SankeyRenderer({ options: STILL, theme: catppuccin.theme });
    r.setData({
      nodes: [{ id: 'a' }, { id: 'b' }],
      links: [
        { source: 'a', target: 'b', value: 4 },
        { source: 'a', target: 'b', value: 6 },
      ],
    });

    expect(r.getTotalLength()).toBe(1);
    r.setHoverIndex(2);
    expect(r.getHoverInfo(catppuccin.theme)?.value).toBe(10);
  });

  it('ignores a fresh copy of the same graph', () => {
    const r = new SankeyRenderer({ options: STILL, theme: catppuccin.theme });
    let fired = 0;
    r.onDataChanged(() => {
      fired++;
    });

    r.setData(FUNNEL);
    r.setData(structuredClone(FUNNEL));
    expect(fired).toBe(1);

    const links = FUNNEL.links.map((link) => ({ ...link }));
    links[0].value = 31;
    r.setData({ nodes: FUNNEL.nodes, links });
    expect(fired).toBe(2);
  });
});

describe('SankeyRenderer — paint', () => {
  it('colors links by the source node at the link opacity, or by their own color', () => {
    const r = new SankeyRenderer({ options: { ...STILL, linkOpacity: 0.4 }, theme: catppuccin.theme });
    r.setData({
      nodes: [{ id: 'a', color: '#ff0000' }, { id: 'b' }, { id: 'c' }],
      links: [
        { source: 'a', target: 'b', value: 3 },
        { source: 'a', target: 'c', value: 2, color: '#00ff00' },
      ],
    });
    const { spy } = renderOnce(r);

    // Bands draw first, under the nodes.
    const bands = spy.callsOf('fill').slice(0, 2);
    expect(bands.map((call) => call.fillStyle).sort()).toEqual(['#00ff00', '#ff0000']);
    for (const band of bands) {
      expect(band.globalAlpha).toBeCloseTo(0.4);
    }
    expect(spy.countOf('bezierCurveTo')).toBe(4);
  });

  it('colors nodes by their own color, then options.colors, then the theme palette', () => {
    const theme = catppuccin.theme;
    const r = new SankeyRenderer({ options: { ...STILL, colors: ['#111111'] }, theme });
    r.setData({
      nodes: [{ id: 'a' }, { id: 'b', color: '#222222' }, { id: 'c' }],
      links: [
        { source: 'a', target: 'b', value: 1 },
        { source: 'b', target: 'c', value: 1 },
      ],
    });
    renderOnce(r);

    const colors = frameOf(r).nodes.map((node) => node.color);
    expect(colors).toEqual(['#111111', '#222222', theme.seriesColors[2]]);
  });

  it('labels each node with `label · value` on a backdrop, beside the node facing the center', () => {
    for (const theme of [catppuccin.theme, githubLight.theme]) {
      const r = new SankeyRenderer({ options: { entryMs: 0, updateMs: 0 }, theme });
      r.setData({
        nodes: [
          { id: 'a', label: 'Ads' },
          { id: 'b', label: 'Signup' },
        ],
        links: [{ source: 'a', target: 'b', value: 1240 }],
      });
      const { ctx, spy } = buildRenderContext({ theme });
      r.render(ctx);

      const texts = spy.callsOf('fillText');
      expect(texts.map((call) => call.args[0])).toEqual(['Ads · 1240', 'Signup · 1240']);
      for (const text of texts) {
        expect(text.fillStyle).toBe(theme.tooltip.textColor);
      }

      // The backdrop paints right before its text, from the theme background.
      const backdrops = spy.calls.filter(
        (call, i) => call.method === 'fill' && spy.calls[i + 1]?.method === 'fillText',
      );
      expect(backdrops).toHaveLength(2);
      expect(backdrops[0].fillStyle).toBe(hexToRgba(theme.background, 0.8));

      const frame = frameOf(r);
      expect(texts[0].args[1]).toBeGreaterThan(nodeOf(frame, 'a').x1);
      expect(texts[1].args[1]).toBeLessThan(nodeOf(frame, 'b').x0);
    }
  });

  it('formats label values through labels.format, else whole numbers plain and the rest compact', () => {
    const data: SankeyData = {
      nodes: [{ id: 'a' }, { id: 'b' }],
      links: [{ source: 'a', target: 'b', value: 1.5 }],
    };
    const plain = new SankeyRenderer({ options: { entryMs: 0, updateMs: 0 }, theme: catppuccin.theme });
    plain.setData(data);
    const formatted = new SankeyRenderer({
      options: { entryMs: 0, updateMs: 0, labels: { format: (v) => `$${v}`, color: '#123456', background: '#abcdef' } },
      theme: catppuccin.theme,
    });
    formatted.setData(data);

    const plainTexts = renderOnce(plain).spy.callsOf('fillText');
    const formattedTexts = renderOnce(formatted).spy.callsOf('fillText');

    expect(plainTexts[0].args[0]).toBe('a · 1.50');
    expect(formattedTexts[0].args[0]).toBe('a · $1.5');
    expect(formattedTexts[0].fillStyle).toBe('#123456');
  });

  it('skips a label that would overlap the one above it, and hides all with labels: false', () => {
    const sinks = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}` }));
    const data: SankeyData = {
      nodes: [{ id: 'root' }, ...sinks],
      links: sinks.map((sink) => ({ source: 'root', target: sink.id, value: 1 })),
    };
    const r = new SankeyRenderer({ options: { entryMs: 0, updateMs: 0, nodePadding: 1 }, theme: catppuccin.theme });
    r.setData(data);
    const texts = renderOnce(r, { mediaHeight: 80 }).spy.callsOf('fillText');

    const sinkLabels = texts.filter((call) => String(call.args[0]).startsWith('s'));
    expect(sinkLabels.length).toBeGreaterThan(0);
    expect(sinkLabels.length).toBeLessThan(8);

    r.updateOptions({ labels: false });
    expect(renderOnce(r, { mediaHeight: 80 }).spy.countOf('fillText')).toBe(0);
  });

  it('gives a label collision to the larger node', () => {
    const r = new SankeyRenderer({ options: { entryMs: 0, updateMs: 0, nodePadding: 1 }, theme: catppuccin.theme });
    r.setData({
      nodes: [{ id: 'src' }, { id: 'tiny' }, { id: 'big' }],
      links: [
        { source: 'src', target: 'tiny', value: 1 },
        { source: 'src', target: 'big', value: 60 },
      ],
    });
    const texts = renderOnce(r, { mediaHeight: 40 })
      .spy.callsOf('fillText')
      .map((call) => call.args[0]);

    expect(texts).toContain('big · 60');
    expect(texts).not.toContain('tiny · 1');
  });

  it('moves a label that would cover the next column to the free side, inside the canvas', () => {
    // The padding leaves a1 and a2 clear of b's middle, so b's left side is free.
    const r = new SankeyRenderer({ options: { entryMs: 0, updateMs: 0, nodePadding: 40 }, theme: catppuccin.theme });
    r.setData({
      nodes: [{ id: 'a1' }, { id: 'a2' }, { id: 'b', label: 'Checkout started' }, { id: 'c' }],
      links: [
        { source: 'a1', target: 'b', value: 10 },
        { source: 'a2', target: 'b', value: 10 },
        { source: 'b', target: 'c', value: 20 },
      ],
    });
    const texts = renderOnce(r, { mediaWidth: 300 }).spy.callsOf('fillText');
    const frame = frameOf(r);

    const checkout = texts.find((call) => call.args[0] === 'Checkout started · 20');
    expect(checkout?.args[1]).toBeLessThan(nodeOf(frame, 'b').x0);
    expect(texts.map((call) => call.args[0])).toContain('c · 20');
    for (const call of texts) {
      // The recording context measures 6 px per character; the backdrop pads 5 px each side.
      const left = (call.args[1] as number) - 5;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + String(call.args[0]).length * 6 + 10).toBeLessThanOrEqual(300);
    }
  });
});

/** The background share band `rank` of `count` from one source mixes in. */
function shadeAmount(rank: number, count: number): number {
  return count > 1 ? rank * Math.min(SHADE_STEP_MAX, SHADE_SPREAD / (count - 1)) : 0;
}

describe('SankeyRenderer — band shades', () => {
  /** `count` bands of equal value out of node `a`, colored `color`. */
  function fan(args: { count: number; color: string; own?: string }): SankeyData {
    const targets = Array.from({ length: args.count }, (_, i) => ({ id: `t${i}` }));

    return {
      nodes: [{ id: 'a', color: args.color }, ...targets],
      links: targets.map((target, i) => ({
        source: 'a',
        target: target.id,
        value: 1,
        color: i === 1 ? args.own : undefined,
      })),
    };
  }

  /** Band fills in top-to-bottom order at the source, with the frame link each one drew. */
  function bandsTopDown(args: { data: SankeyData; theme?: typeof catppuccin.theme }) {
    const theme = args.theme ?? catppuccin.theme;
    const r = new SankeyRenderer({ options: STILL, theme });
    r.setData(args.data);
    const { spy } = renderOnce(r, { theme });
    const frame = frameOf(r);
    const fills = spy.callsOf('fill').slice(0, frame.links.length);
    const bands = frame.links.map((link, i) => ({ link, fill: fills[i].fillStyle }));
    bands.sort((p, q) => p.link.sy - q.link.sy);

    return { r, bands };
  }

  /** The fills `count` bands from a red node should get, top to bottom. */
  function expectedShades(count: number): string[] {
    const background = catppuccin.theme.background;

    return Array.from({ length: count }, (_, k) => {
      const amount = shadeAmount(k, count);

      return amount === 0 ? '#ff0000' : mixColors('#ff0000', background, amount);
    });
  }

  it('keeps a single band in the node color', () => {
    const { bands } = bandsTopDown({ data: fan({ count: 1, color: '#ff0000' }) });

    expect(bands.map((band) => band.fill)).toEqual(['#ff0000']);
  });

  it('steps the shades down from the top band, finer for more bands', () => {
    for (const count of [2, 3, 8]) {
      const { bands } = bandsTopDown({ data: fan({ count, color: '#ff0000' }) });

      expect(bands.map((band) => band.fill)).toEqual(expectedShades(count));
    }

    expect(shadeAmount(1, 8)).toBeLessThan(shadeAmount(1, 2));
  });

  it('draws a link with its own color as is', () => {
    const { bands } = bandsTopDown({ data: fan({ count: 3, color: '#ff0000', own: '#00ff00' }) });

    expect(bands.map((band) => band.fill)).toContain('#00ff00');
  });

  it('pales the shades toward a light background', () => {
    const theme = githubLight.theme;
    const { bands } = bandsTopDown({ data: fan({ count: 2, color: '#ff0000' }), theme });

    const second = bands[1].fill;
    expect(second).toBe(mixColors('#ff0000', theme.background, shadeAmount(1, 2)));
    // Toward #fafbfc the green and blue channels rise from 0.
    expect(Number.parseInt(second.slice(3, 5), 16)).toBeGreaterThan(0);
  });

  it('reports the shaded band color in the hover info', () => {
    const { r, bands } = bandsTopDown({ data: fan({ count: 2, color: '#ff0000' }) });

    r.setHoverIndex(bands[1].link.index);
    expect(r.getHoverInfo(catppuccin.theme)?.color).toBe(bands[1].fill);
  });

  it('shades a color mixColors cannot take through color-mix, so no band turns into the background', () => {
    for (const theme of [catppuccin.theme, githubLight.theme]) {
      for (const color of ['tomato', 'rgb(255 0 0)', '#ff000080']) {
        const { bands } = bandsTopDown({ data: fan({ count: 3, color }), theme });
        const fills = bands.map((band) => band.fill);

        expect(fills[0]).toBe(color);
        for (const fill of fills.slice(1)) {
          expect(fill.startsWith(`color-mix(in srgb, ${color}, ${theme.background} `)).toBe(true);
        }
        expect(fills).not.toContain(theme.background);
      }
    }
  });

  it('shades a named color through color-mix without throwing', () => {
    const background = catppuccin.theme.background;
    const { bands } = bandsTopDown({ data: fan({ count: 2, color: 'tomato' }) });

    const percent = Math.round(shadeAmount(1, 2) * 100);
    expect(bands.map((band) => band.fill)).toEqual(['tomato', `color-mix(in srgb, tomato, ${background} ${percent}%)`]);
  });
});

describe('SankeyRenderer — hover', () => {
  function hoverable(options: Partial<SankeySeriesOptions> = STILL) {
    const r = new SankeyRenderer({ options, theme: catppuccin.theme });
    r.setData(FUNNEL);
    renderOnce(r);

    return r;
  }

  it('hit-tests a node first, then a link band', () => {
    const r = hoverable();
    const frame = frameOf(r);
    const c = nodeOf(frame, 'c');
    expect(r.hitTest((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, 800, 400)).toBe(2);

    // Middle of the a → c band (link 0): the curve passes the midpoint of its two ends.
    const band = frame.links[0];
    const midX = (band.x0 + band.x1) / 2;
    const midY = (band.sy + band.ty) / 2;
    expect(r.hitTest(midX, midY, 800, 400)).toBe(FUNNEL.nodes.length);
    expect(r.hitTest(midX, midY + band.width, 800, 400)).not.toBe(FUNNEL.nodes.length);
  });

  it('reports a node as label, throughput and share of the source outflow', () => {
    const r = hoverable();
    r.setHoverIndex(2);

    // Sources a (40) and b (25) send out 65 in all; c carries 50.
    const info = r.getHoverInfo(catppuccin.theme);
    expect(info).toMatchObject({ label: 'c', value: 50, color: catppuccin.theme.seriesColors[2] });
    expect(info?.percent).toBeCloseTo((50 / 65) * 100);
  });

  it('reports a link as source → target, value and share of the source outflow', () => {
    const r = hoverable();
    r.setHoverIndex(FUNNEL.nodes.length);

    const info = r.getHoverInfo(catppuccin.theme);
    expect(info).toMatchObject({ label: 'a → c', value: 30, color: catppuccin.theme.seriesColors[0] });
    expect(info?.percent).toBeCloseTo(75);
  });

  it('dims everything but the hovered node, its links and their end nodes', () => {
    const r = hoverable();
    r.setHoverIndex(2);
    renderOnce(r);

    const { spy } = renderOnce(r);
    const fills = spy.callsOf('fill');
    const bands = fills.slice(0, FUNNEL.links.length).map((call) => call.globalAlpha);
    // c's four links stay at the link opacity; a → e and b → f dim.
    expect(bands.slice(0, 4).every((alpha) => alpha === 0.35)).toBe(true);
    expect(bands[4]).toBeCloseTo(0.35 * 0.25);
    expect(bands[5]).toBeCloseTo(0.35 * 0.25);

    const nodes = fills.slice(FUNNEL.links.length, FUNNEL.links.length + FUNNEL.nodes.length);
    expect(nodes.slice(0, 5).map((call) => call.globalAlpha)).toEqual([1, 1, 1, 1, 1]);
    expect(nodes[5].globalAlpha).toBeCloseTo(0.4);
  });

  it('dims all but a hovered link and its two nodes', () => {
    const r = hoverable();
    r.setHoverIndex(FUNNEL.nodes.length + 4);

    const fills = renderOnce(r).spy.callsOf('fill');
    const bands = fills.slice(0, FUNNEL.links.length).map((call) => call.globalAlpha);
    expect(bands[4]).toBe(0.35);
    expect(bands.filter((alpha) => alpha < 0.35)).toHaveLength(5);

    const nodes = fills.slice(FUNNEL.links.length, FUNNEL.links.length + FUNNEL.nodes.length);
    const lit = nodes.map((call) => call.globalAlpha === 1);
    expect(lit).toEqual([true, false, false, false, true, false]);
  });

  it('keeps the hovered element across a data change and reports its new values', () => {
    const r = hoverable();
    r.setHoverIndex(2);

    const links = FUNNEL.links.map((link) =>
      link.source === 'a' && link.target === 'c' ? { ...link, value: 60 } : link,
    );
    r.setData({ nodes: [{ id: 'z' }, ...FUNNEL.nodes], links: [{ source: 'z', target: 'c', value: 1 }, ...links] });

    expect(r.getHoverInfo(catppuccin.theme)).toMatchObject({ label: 'c', value: 81 });
  });
});

/** The global test setup reports `prefers-reduced-motion: reduce`; tween tests swap in a motion-allowing one. */
const reducedMotionStub = globalThis.matchMedia;

function allowMotion(): void {
  globalThis.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof globalThis.matchMedia;
}

/** Tweens run on `performance.now()`; the tests stub the clock and step it. */
describe('SankeyRenderer — animation', () => {
  let now = 0;

  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    allowMotion();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.matchMedia = reducedMotionStub;
  });

  const palette = catppuccin.theme.seriesColors;
  const fillsIn = (spy: ReturnType<typeof renderOnce>['spy'], color: string) =>
    spy.calls.filter((call) => (call.method === 'fill' || call.method === 'fillRect') && call.fillStyle === color);

  it('cascades from the sources to the last column over entryMs, then goes idle', () => {
    const r = new SankeyRenderer({ options: { entryMs: 1400, updateMs: 0, labels: false }, theme: catppuccin.theme });
    r.setData(FUNNEL);
    expect(r.needsAnimation).toBe(true);
    renderOnce(r);

    // A third in: the sources are drawn and their bands run with a soft head; d, e, f (palette 3-5) are not.
    now += 450;
    const { spy } = renderOnce(r);
    expect(fillsIn(spy, palette[0]).length).toBeGreaterThan(0);
    expect(spy.countOf('createLinearGradient')).toBeGreaterThan(0);
    for (const color of palette.slice(3, 6)) {
      expect(fillsIn(spy, color)).toHaveLength(0);
    }
    expect(r.needsAnimation).toBe(true);

    now += 1000;
    const settled = renderOnce(r).spy;
    for (const color of palette.slice(0, 6)) {
      expect(fillsIn(settled, color).length).toBeGreaterThan(0);
    }
    expect(settled.countOf('createLinearGradient')).toBe(0);
    expect(r.needsAnimation).toBe(false);
  });

  it('shows a label only once its node is full', () => {
    const r = new SankeyRenderer({ options: { entryMs: 1400, updateMs: 0 }, theme: catppuccin.theme });
    r.setData(FUNNEL);
    renderOnce(r);
    const labelsNow = () =>
      renderOnce(r)
        .spy.callsOf('fillText')
        .map((call) => String(call.args[0]));

    // The sources are still growing.
    now += 100;
    expect(labelsNow()).toEqual([]);

    // a and b are full; d is still filling.
    now += 600;
    const mid = labelsNow();
    expect(mid).toEqual(expect.arrayContaining(['a · 40', 'b · 25']));
    expect(mid).not.toContain('d · 35');

    now += 800;
    expect(labelsNow()).toContain('d · 35');
  });

  it('does not hit-test a node the cascade has not reached', () => {
    const r = new SankeyRenderer({ options: { entryMs: 1400, updateMs: 0, labels: false }, theme: catppuccin.theme });
    r.setData(FUNNEL);
    renderOnce(r);
    const frame = frameOf(r);
    const centerOf = (id: string) => {
      const node = nodeOf(frame, id);

      return [(node.x0 + node.x1) / 2, (node.y0 + node.y1) / 2] as const;
    };

    expect(r.hitTest(...centerOf('a'), 800, 400)).toBe(-1);

    now += 450;
    expect(r.hitTest(...centerOf('a'), 800, 400)).toBe(0);
    expect(r.hitTest(...centerOf('d'), 800, 400)).toBe(-1);

    now += 1000;
    renderOnce(r);
    expect(r.hitTest(...centerOf('d'), 800, 400)).toBe(3);
  });

  /** A two-band graph with the values `big` / `small`, so a swap changes every node height. */
  const swapGraph = (big: number, small: number): SankeyData => ({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    links: [
      { source: 'a', target: 'c', value: big },
      { source: 'b', target: 'd', value: small },
    ],
  });
  const CASCADE_OPTIONS = { entryMs: 1400, updateMs: 500, labels: false } as const;

  /** Render every 10 ms for `ms`, calling `at(elapsed)` before each frame. */
  function runFrames(args: { r: SankeyRenderer; ms: number; at?: (elapsed: number) => void }): SankeyFrame[] {
    const frames: SankeyFrame[] = [];
    for (let elapsed = 10; elapsed <= args.ms; elapsed += 10) {
      now += 10;
      args.at?.(elapsed);
      renderOnce(args.r);
      frames.push(frameOf(args.r));
    }

    return frames;
  }

  function settledFrame(data: SankeyData): SankeyFrame {
    const settled = new SankeyRenderer({ options: STILL, theme: catppuccin.theme });
    settled.setData(data);
    renderOnce(settled);

    return frameOf(settled);
  }

  it('holds data that arrives mid-entrance, then morphs to it once the cascade ends', () => {
    const r = new SankeyRenderer({ options: CASCADE_OPTIONS, theme: catppuccin.theme });
    r.setData(swapGraph(9, 1));
    renderOnce(r);
    const startA = nodeOf(frameOf(r), 'a');

    const frames = runFrames({ r, ms: 2200, at: (elapsed) => elapsed === 700 && r.setData(swapGraph(1, 9)) });
    const heights = frames.map((frame) => nodeOf(frame, 'a').y1 - nodeOf(frame, 'a').y0);

    // Unchanged while the cascade runs (it ends at 1400 ms, frame 140).
    for (const height of heights.slice(0, 140)) {
      expect(height).toBeCloseTo(startA.y1 - startA.y0);
    }

    const finalA = nodeOf(settledFrame(swapGraph(1, 9)), 'a');
    const change = startA.y1 - startA.y0 - (finalA.y1 - finalA.y0);
    let largestStep = 0;
    for (let i = 1; i < heights.length; i++) {
      largestStep = Math.max(largestStep, Math.abs(heights[i] - heights[i - 1]));
    }
    expect(change).toBeGreaterThan(200);
    expect(largestStep).toBeLessThan(0.1 * change);
    expect(heights.at(-1)).toBeCloseTo(finalA.y1 - finalA.y0);
    expect(r.needsAnimation).toBe(false);
  });

  it('keeps a link removed late in the entrance until the end, then fades it out without a flash', () => {
    const r = new SankeyRenderer({ options: CASCADE_OPTIONS, theme: catppuccin.theme });
    r.setData(FUNNEL);
    renderOnce(r);
    const withoutBF: SankeyData = { nodes: FUNNEL.nodes, links: FUNNEL.links.filter((link) => link.target !== 'f') };

    const frames = runFrames({ r, ms: 2200, at: (elapsed) => elapsed === 1300 && r.setData(withoutBF) });
    const alphas = frames.map((frame) => frame.links.find((link) => link.key === 'b\u0000f')?.alpha ?? 0);

    expect(alphas.slice(0, 140).every((alpha) => alpha === 1)).toBe(true);
    for (let i = 1; i < alphas.length; i++) {
      expect(alphas[i]).toBeLessThanOrEqual(alphas[i - 1]);
    }
    expect(alphas.at(-1)).toBe(0);
  });

  it('rejects a cycle that arrives mid-entrance and keeps both the drawn and the held data', () => {
    const r = new SankeyRenderer({ options: CASCADE_OPTIONS, theme: catppuccin.theme });
    r.setData(swapGraph(9, 1));
    renderOnce(r);
    const cyclic: SankeyData = {
      nodes: [{ id: 'a' }, { id: 'b' }],
      links: [
        { source: 'a', target: 'b', value: 1 },
        { source: 'b', target: 'a', value: 1 },
      ],
    };

    now += 300;
    r.setData(swapGraph(1, 9));
    now += 200;
    expect(() => r.setData(cyclic)).toThrow('Sankey links form a cycle: a → b → a');
    renderOnce(r);
    expect(nodeOf(frameOf(r), 'a').y1 - nodeOf(frameOf(r), 'a').y0).toBeGreaterThan(200);

    runFrames({ r, ms: 1800 });
    const finalA = nodeOf(settledFrame(swapGraph(1, 9)), 'a');
    expect(nodeOf(frameOf(r), 'a').y0).toBeCloseTo(finalA.y0);
    expect(nodeOf(frameOf(r), 'a').y1).toBeCloseTo(finalA.y1);
  });

  it('ends several updates during the entrance in one morph to the newest', () => {
    const r = new SankeyRenderer({ options: CASCADE_OPTIONS, theme: catppuccin.theme });
    let notified = 0;
    r.onDataChanged(() => {
      notified++;
    });
    r.setData(swapGraph(9, 1));
    renderOnce(r);

    const updates: Record<number, SankeyData> = { 300: swapGraph(5, 5), 600: swapGraph(3, 7), 900: swapGraph(2, 8) };
    runFrames({ r, ms: 1400, at: (elapsed) => updates[elapsed] && r.setData(updates[elapsed]) });
    expect(notified).toBe(1);

    runFrames({ r, ms: 800 });
    expect(notified).toBe(2);
    const finalA = nodeOf(settledFrame(swapGraph(2, 8)), 'a');
    expect(nodeOf(frameOf(r), 'a').y1).toBeCloseTo(finalA.y1);
    expect(r.needsAnimation).toBe(false);
  });

  it('fades the band head for a color that is not hex', () => {
    const r = new SankeyRenderer({ options: { entryMs: 1400, updateMs: 0, labels: false }, theme: catppuccin.theme });
    r.setData({
      nodes: [{ id: 'a', color: 'red' }, { id: 'b' }],
      links: [{ source: 'a', target: 'b', value: 1 }],
    });
    renderOnce(r);

    now += 500;
    const head = renderOnce(r)
      .spy.calls.map((call) => call.fillStyle)
      .find((style) => style.startsWith('gradient(linear;'));
    if (head === undefined) throw new Error('no running band');

    const alphas = [...head.matchAll(/color-mix\(in srgb, red (\d+)%, transparent\)/g)].map((match) =>
      Number(match[1]),
    );
    expect(alphas).toHaveLength(9);
    expect(alphas[0]).toBe(100);
    expect(alphas.at(-1)).toBe(0);
    for (let i = 1; i < alphas.length; i++) {
      expect(alphas[i]).toBeLessThan(alphas[i - 1]);
    }
  });

  it('fades the band head for the space-separated rgb() forms through color-mix', () => {
    for (const color of ['rgb(255 0 0)', 'rgb(255 0 0 / 50%)']) {
      const r = new SankeyRenderer({ options: { entryMs: 1400, updateMs: 0, labels: false }, theme: catppuccin.theme });
      r.setData({
        nodes: [{ id: 'a', color }, { id: 'b' }],
        links: [{ source: 'a', target: 'b', value: 1 }],
      });
      renderOnce(r);

      now += 500;
      const head = renderOnce(r)
        .spy.calls.map((call) => call.fillStyle)
        .find((style) => style.startsWith('gradient(linear;'));
      if (head === undefined) throw new Error('no running band');

      expect(head).not.toContain('rgba(255 0 0');
      expect(head.match(/color-mix\(in srgb, rgb\(255 0 0[^)]*\) \d+%, transparent\)/g)).toHaveLength(9);
    }
  });

  it('fills a node taller than its inflow up to its full height', () => {
    // b carries 100 out but only 10 in: its one inflow slot spans all of b.
    const r = new SankeyRenderer({ options: { entryMs: 1400, updateMs: 0, labels: false }, theme: catppuccin.theme });
    r.setData({
      nodes: [{ id: 'a' }, { id: 'b', color: '#00ff00' }, { id: 'c' }, { id: 'd' }],
      links: [
        { source: 'a', target: 'b', value: 10 },
        { source: 'b', target: 'c', value: 100 },
        { source: 'a', target: 'd', value: 90 },
      ],
    });
    renderOnce(r);
    const b = nodeOf(frameOf(r), 'b');
    const fillOfB = (spy: ReturnType<typeof renderOnce>['spy']) =>
      spy.callsOf('fillRect').filter((call) => call.fillStyle === '#00ff00');

    let lastFill = 0;
    let completed = false;
    for (let elapsed = 0; elapsed < 1400 && !completed; elapsed += 5) {
      now += 5;
      const rects = fillOfB(renderOnce(r).spy);
      if (rects.length === 0) {
        completed = lastFill > 0;
        continue;
      }

      lastFill = rects[0].args[3] as number;
    }

    // Just before the fill completes it is nearly the whole node; just after, the full node draws.
    expect(completed).toBe(true);
    expect(lastFill).toBeGreaterThan(0.9 * (b.y1 - b.y0));
    expect(lastFill).toBeLessThanOrEqual(b.y1 - b.y0);
  });

  it('paints at once with entryMs 0', () => {
    const r = new SankeyRenderer({ options: { entryMs: 0, updateMs: 0 }, theme: catppuccin.theme });
    r.setData(FUNNEL);
    expect(r.needsAnimation).toBe(false);

    const { spy } = renderOnce(r);
    expect(spy.countOf('fillText')).toBe(FUNNEL.nodes.length);
    expect(spy.countOf('createLinearGradient')).toBe(0);
  });

  it('morphs kept nodes from the drawn layout to the new one, fading new and removed ones', () => {
    const r = new SankeyRenderer({ options: { entryMs: 0, updateMs: 500, labels: false }, theme: catppuccin.theme });
    r.setData(FUNNEL);
    renderOnce(r);
    const before = nodeOf(frameOf(r), 'd');

    const next: SankeyData = {
      nodes: [...FUNNEL.nodes.filter((node) => node.id !== 'f'), { id: 'g' }],
      links: [
        ...FUNNEL.links.filter((link) => link.target !== 'f').map((link) => ({ ...link, value: link.value * 2 })),
        { source: 'b', target: 'g', value: 30 },
      ],
    };
    r.setData(next);
    expect(r.needsAnimation).toBe(true);

    renderOnce(r);
    expect(nodeOf(frameOf(r), 'd').y0).toBeCloseTo(before.y0);

    now += 250;
    renderOnce(r);
    const mid = frameOf(r);
    expect(nodeOf(mid, 'g').alpha).toBeGreaterThan(0);
    expect(nodeOf(mid, 'g').alpha).toBeLessThan(1);
    expect(nodeOf(mid, 'f')).toMatchObject({ index: -1 });
    expect(nodeOf(mid, 'f').alpha).toBeLessThan(1);

    now += 300;
    renderOnce(r);
    const settled = new SankeyRenderer({
      options: { entryMs: 0, updateMs: 0, labels: false },
      theme: catppuccin.theme,
    });
    settled.setData(next);
    renderOnce(settled);
    expect(nodeOf(frameOf(r), 'd').y0).toBeCloseTo(nodeOf(frameOf(settled), 'd').y0);
    expect(r.needsAnimation).toBe(false);
  });

  it('eases a band shade with the morph when its rank at the source changes', () => {
    const fan = (count: number): SankeyData => ({
      nodes: [{ id: 'a', color: '#ff0000' }, { id: 't0' }, { id: 't1' }, { id: 't2' }],
      links: Array.from({ length: count }, (_, i) => ({ source: 'a', target: `t${i}`, value: 1 })),
    });
    const r = new SankeyRenderer({ options: { entryMs: 0, updateMs: 500, labels: false }, theme: catppuccin.theme });
    r.setData(fan(3));
    renderOnce(r);
    const shadeOfT1 = () => frameOf(r).links.find((link) => link.key === 'a\u0000t1')?.shade ?? 0;
    const before = shadeAmount(1, 3);
    const after = shadeAmount(1, 2);
    expect(shadeOfT1()).toBeCloseTo(before);

    // Without t2, t1 is the bottom band of two: its shade eases from one step to the other.
    r.setData(fan(2));
    now += 150;
    renderOnce(r);
    expect(shadeOfT1()).toBeGreaterThan(Math.min(before, after));
    expect(shadeOfT1()).toBeLessThan(Math.max(before, after));

    now += 400;
    renderOnce(r);
    expect(shadeOfT1()).toBeCloseTo(after);
  });

  it('starts an update mid-morph from what is drawn', () => {
    const r = new SankeyRenderer({ options: { entryMs: 0, updateMs: 500, labels: false }, theme: catppuccin.theme });
    r.setData(FUNNEL);
    renderOnce(r);

    const bigger = FUNNEL.links.map((link) => ({ ...link, value: link.value * (link.target === 'd' ? 3 : 1) }));
    r.setData({ nodes: FUNNEL.nodes, links: bigger });
    now += 200;
    renderOnce(r);
    const drawn = nodeOf(frameOf(r), 'd');

    r.setData(FUNNEL);
    renderOnce(r);
    expect(nodeOf(frameOf(r), 'd').y0).toBeCloseTo(drawn.y0);
    expect(nodeOf(frameOf(r), 'd').y1).toBeCloseTo(drawn.y1);
  });

  it('snaps with updateMs 0', () => {
    const r = new SankeyRenderer({ options: STILL, theme: catppuccin.theme });
    r.setData(FUNNEL);
    renderOnce(r);

    r.setData({ nodes: FUNNEL.nodes, links: FUNNEL.links.map((link) => ({ ...link, value: link.value + 1 })) });
    expect(r.needsAnimation).toBe(false);
  });

  it('eases the hover dim over updateMs and goes idle after it', () => {
    const r = new SankeyRenderer({ options: { entryMs: 0, updateMs: 300, labels: false }, theme: catppuccin.theme });
    r.setData(FUNNEL);
    renderOnce(r);
    expect(r.needsAnimation).toBe(false);

    r.setHoverIndex(2);
    expect(r.needsAnimation).toBe(true);
    const dimmedBand = () => renderOnce(r).spy.callsOf('fill')[5].globalAlpha;

    expect(dimmedBand()).toBeCloseTo(0.35);
    now += 150;
    const easing = dimmedBand();
    expect(easing).toBeLessThan(0.35);
    expect(easing).toBeGreaterThan(0.35 * 0.25);

    now += 200;
    expect(dimmedBand()).toBeCloseTo(0.35 * 0.25);
    expect(r.needsAnimation).toBe(false);
    expect(r.setHoverIndex(2)).toBe(false);
    expect(r.needsAnimation).toBe(false);
  });

  it('skips the reveal and the morph under prefers-reduced-motion', () => {
    globalThis.matchMedia = reducedMotionStub;
    const r = new SankeyRenderer({ options: { entryMs: 800, updateMs: 500 }, theme: catppuccin.theme });
    r.setData(FUNNEL);
    expect(r.needsAnimation).toBe(false);

    renderOnce(r);
    r.setData({ nodes: FUNNEL.nodes, links: FUNNEL.links.map((link) => ({ ...link, value: link.value + 1 })) });
    expect(r.needsAnimation).toBe(false);
  });

  it('settles every tween when nothing fits the pane', () => {
    const r = new SankeyRenderer({ options: { entryMs: 800, updateMs: 300 }, theme: catppuccin.theme });
    r.setData(FUNNEL);
    renderOnce(r, { mediaHeight: 40, padding: { top: 30, bottom: 30 } });

    expect(r.needsAnimation).toBe(false);
  });
});

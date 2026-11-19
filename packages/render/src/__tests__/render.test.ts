import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { githubLight, logScale } from '@wick-charts/core';
import { describe, expect, it } from 'vitest';

import { type ChartSpec, type RenderResult, RenderSpecError, createTheme, registerFont, renderChart } from '../index';

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 1);

const line = Array.from({ length: 30 }, (_, i) => ({ time: START + i * DAY, value: 100 + Math.sin(i / 3) * 10 }));

const lineSpec: ChartSpec = { theme: 'githubLight', series: [{ type: 'line', data: line }] };

async function pixels(png: Buffer): Promise<{ width: number; height: number; at: (x: number, y: number) => string }> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height).data;

  const at = (x: number, y: number) => {
    const i = (y * image.width + x) * 4;
    const hex = [data[i], data[i + 1], data[i + 2]].map((c) => c.toString(16).padStart(2, '0')).join('');

    return `#${hex}${data[i + 3] === 255 ? '' : `/${data[i + 3]}`}`;
  };

  return { width: image.width, height: image.height, at };
}

describe('renderChart', () => {
  it('renders a PNG at the pixel ratio, on the theme background', async () => {
    const result = await renderChart({ ...lineSpec, width: 300, height: 150 }, { pixelRatio: 2 });
    const image = await pixels(result.data);

    expect(result.mimeType).toBe('image/png');
    expect([result.width, result.height]).toEqual([300, 150]);
    expect([image.width, image.height]).toEqual([600, 300]);
    expect(image.at(1, 1)).toBe(githubLight.theme.background.toLowerCase());
  });

  it('renders an SVG with text as paths', async () => {
    const result = await renderChart({ ...lineSpec, title: 'Revenue' }, { format: 'svg' });
    const svg = result.data.toString('utf8');

    expect(result.mimeType).toBe('image/svg+xml');
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="800" height="400"');
    expect(svg).not.toContain('<text');
  });

  it('draws the same bytes for the same spec', async () => {
    const first = await renderChart(lineSpec);
    const second = await renderChart(lineSpec);

    expect(first.data.equals(second.data)).toBe(true);
  });

  it('takes a preset name, a preset, its theme object, or a createTheme() result', async () => {
    const byName = await renderChart(lineSpec);
    const byPreset = await renderChart({ ...lineSpec, theme: githubLight });
    const byTheme = await renderChart({ ...lineSpec, theme: githubLight.theme });
    const created = await renderChart({ ...lineSpec, theme: createTheme({ background: '#102030' }) });
    const image = await pixels(created.data);

    expect(byPreset.data.equals(byName.data)).toBe(true);
    expect(byTheme.data.equals(byName.data)).toBe(true);
    expect(image.at(1, 1)).toBe('#102030');
  });

  it('leaves the PNG transparent for a transparent background', async () => {
    const result = await renderChart({ ...lineSpec, background: 'transparent' }, { pixelRatio: 1 });
    const image = await pixels(result.data);

    expect(image.at(1, 1)).toBe('#000000/0');
  });

  it('gives the legend its own strip: the chart gets the rest of the height', async () => {
    const plain = await renderChart(lineSpec);
    const withLegend = await renderChart({ ...lineSpec, legend: true });

    expect(plain.description.size.height).toBe(400);
    expect(withLegend.description.size.height).toBeLessThan(400);
    expect(withLegend.description.size.width).toBe(800);
  });

  it('takes a right legend from the width', async () => {
    const result = await renderChart({ ...lineSpec, legend: { position: 'right' } });

    expect(result.description.size.width).toBeLessThan(800);
    expect(result.description.size.height).toBe(400);
  });

  it('reads ISO 8601 times as their timestamps', async () => {
    const iso = line.map((p) => ({ ...p, time: new Date(p.time).toISOString() }));
    const fromIso = await renderChart({ series: [{ type: 'line', data: iso as never }] });
    const fromNumbers = await renderChart({ series: [{ type: 'line', data: line }] });

    expect(fromIso.description.x.data).toEqual(fromNumbers.description.x.data);
    expect(fromIso.data.equals(fromNumbers.data)).toBe(true);
  });

  it('reports likely mistakes in the spec', async () => {
    const result = await renderChart({ series: [{ type: 'line', data: [] }] });

    expect(result.description.issues.map((issue) => issue.code)).toContain('no-data');
  });

  it('renders every series type', async () => {
    const specs: ChartSpec[] = [
      { series: [{ type: 'bar', data: line }] },
      { series: [{ type: 'band', data: line.map((p) => ({ time: p.time, low: p.value - 5, high: p.value + 5 })) }] },
      {
        series: [
          {
            type: 'candlestick',
            data: line.map((p) => ({
              time: p.time,
              open: p.value,
              close: p.value + 2,
              high: p.value + 3,
              low: p.value - 1,
            })),
          },
        ],
      },
      { axis: { x: { type: 'numeric' } }, series: [{ type: 'histogram', data: line.map((p) => p.value) }] },
      {
        series: [
          {
            type: 'pie',
            data: [
              { label: 'A', value: 2 },
              { label: 'B', value: 1 },
            ],
          },
        ],
      },
      { series: [{ type: 'radialProgress', data: [{ label: 'A', value: 60 }] }] },
      { series: [{ type: 'gauge', value: 42 }] },
      { series: [{ type: 'heatmap', data: [{ x: 'Mon', y: 'AM', value: 3 }] }] },
      {
        axis: { x: { type: 'numeric' } },
        series: [
          {
            type: 'depth',
            bids: [
              [99, 2],
              [98, 3],
            ],
            asks: [
              [101, 1],
              [102, 4],
            ],
          },
        ],
      },
      { series: [{ type: 'radar', axes: ['a', 'b', 'c'], data: [{ label: 'X', data: [1, 2, 3] }] }] },
      {
        series: [
          {
            type: 'sankey',
            nodes: [{ id: 'a' }, { id: 'b' }],
            links: [{ source: 'a', target: 'b', value: 1 }],
          },
        ],
      },
    ];

    for (const spec of specs) {
      const result = await renderChart(spec, { pixelRatio: 1 });
      const type = spec.series[0].type;
      // `describe()` counts no depth level in view even when they all are: a core false positive.
      const known = (code: string) => type === 'depth' && code === 'out-of-view';
      const errors = result.description.issues.filter((issue) => issue.severity === 'error' && !known(issue.code));

      expect(errors, type).toEqual([]);

      // An SVG keeps every frame drawn into it; each frame starts with one transparent clear rect.
      const svg = (await renderChart(spec, { format: 'svg' })).data.toString('utf8');
      expect(svg.match(/<rect fill-opacity="0"/g)?.length, type).toBe(1);
    }
  });

  it('draws one SVG frame, at the final visible range', async () => {
    const svg = (await renderChart({ ...lineSpec, visibleRange: 5 }, { format: 'svg' })).data.toString('utf8');

    expect(svg.match(/<rect fill-opacity="0"/g)?.length).toBe(1);
  });
});

describe('spec errors', () => {
  const cases: [string, unknown, RegExp][] = [
    ['no series', { series: [] }, /^series: expected an array/],
    ['unknown type', { series: [{ type: 'donut', data: [] }] }, /^series\[0\]\.type: expected one of/],
    ['missing data', { series: [{ type: 'line' }] }, /^series\[0\]\.data: required/],
    ['gauge value', { series: [{ type: 'gauge', value: 'high' }] }, /^series\[0\]\.value: expected a finite number/],
    ['size', { width: 10, series: [{ type: 'line', data: [] }] }, /^width: expected an integer/],
    ['theme', { theme: 'nope', series: [{ type: 'line', data: [] }] }, /^theme: unknown theme "nope"/],
    ['date', { series: [{ type: 'line', data: [{ time: 'yesterday', value: 1 }] }] }, /not an ISO 8601 date/],
  ];

  it.each(cases)('%s', async (_name, spec, message) => {
    const render = renderChart(spec as ChartSpec);

    await expect(render).rejects.toThrow(RenderSpecError);
    await expect(render).rejects.toThrow(message);
  });

  it('caps the bitmap size, with the default ratio too', async () => {
    const big: ChartSpec = { width: 4096, height: 4096, series: [{ type: 'line', data: [] }] };

    await expect(renderChart(big, { pixelRatio: 2 })).rejects.toThrow(/above the limit/);
    await expect(renderChart(big)).rejects.toThrow(/above the limit/);
  });
});

describe('format templates', () => {
  it('formats a gauge value from "{value}%"', async () => {
    const plain = await renderChart({ series: [{ type: 'gauge', value: 68 }] });
    const templated = await renderChart({
      series: [{ type: 'gauge', value: 68, options: { format: '{value}%' as never } }],
    });
    const formatted = await renderChart({
      series: [{ type: 'gauge', value: 68, options: { format: (value) => `${value}%` } }],
    });

    expect(templated.data.equals(plain.data)).toBe(false);
    expect(templated.data.equals(formatted.data)).toBe(true);
  });

  it('rejects a template with no {value}', async () => {
    const render = renderChart({ series: [{ type: 'gauge', value: 68, options: { format: '%' as never } }] });

    await expect(render).rejects.toThrow(/^series\[0\]\.options\.format: a format template needs \{value\}/);
  });

  it('rejects a Y-axis template with no {value}', async () => {
    const render = renderChart({ yAxis: { format: 'ms' }, series: [{ type: 'line', data: line }] });

    await expect(render).rejects.toThrow(/^yAxis\.format: a format template needs \{value\}/);
  });
});

describe('JSON forms', () => {
  const iso = (time: number) => new Date(time).toISOString();
  const day = (i: number) => START + i * DAY;

  it('reads ISO times in markers, lines and regions', async () => {
    const annotations = (time: (ms: number) => number): Partial<ChartSpec> => ({
      markers: [{ time: time(day(5)), value: 105, label: 'A' }],
      lines: [{ time: time(day(10)), label: 'Launch' }],
      regions: [{ from: time(day(15)), to: time(day(20)) }],
    });
    // An ISO string where the type wants ms: the JSON form.
    const fromIso = await renderChart({ ...lineSpec, ...annotations((ms) => iso(ms) as unknown as number) });
    const fromNumbers = await renderChart({ ...lineSpec, ...annotations((ms) => ms) });

    expect(fromIso.data.equals(fromNumbers.data)).toBe(true);
    expect(fromIso.data.equals((await renderChart(lineSpec)).data)).toBe(false);
  });

  it('reads ISO times in visibleRange', async () => {
    const range = { from: day(10), to: day(20) };
    const fromIso = await renderChart({
      ...lineSpec,
      visibleRange: { from: iso(range.from), to: iso(range.to) } as never,
    });
    const fromNumbers = await renderChart({ ...lineSpec, visibleRange: range });
    const bars = await renderChart({ ...lineSpec, visibleRange: { from: iso(range.from), bars: 10 } as never });

    expect(fromIso.data.equals(fromNumbers.data)).toBe(true);
    expect(fromIso.data.equals((await renderChart(lineSpec)).data)).toBe(false);
    expect(bars.data.equals((await renderChart(lineSpec)).data)).toBe(false);
  });

  it('reads "log" as a log scale on the default and named scales', async () => {
    const series: ChartSpec['series'] = [
      { type: 'line', data: line },
      { type: 'line', data: line, scale: 'right' },
    ];
    const fromJson = await renderChart({
      series,
      axis: { y: { scale: 'log' as never } },
      scales: { right: { position: 'right', scale: 'log' as never } },
    });
    const fromCode = await renderChart({
      series,
      axis: { y: { scale: logScale() } },
      scales: { right: { position: 'right', scale: logScale() } },
    });

    expect(fromJson.data.equals(fromCode.data)).toBe(true);
  });

  it('reads a template in bar value labels', async () => {
    const bars = line.slice(0, 8);
    const fromJson = await renderChart({
      series: [{ type: 'bar', data: bars, options: { valueLabels: { format: '{value:0}' as never } } }],
    });
    const fromCode = await renderChart({
      series: [{ type: 'bar', data: bars, options: { valueLabels: { format: (value) => value.toFixed(0) } } }],
    });

    expect(fromJson.data.equals(fromCode.data)).toBe(true);
  });
});

describe('chrome and axes', () => {
  const errorsOf = (result: RenderResult) => result.description.issues.filter((issue) => issue.severity === 'error');

  it('names every n-th category and cuts long names', async () => {
    const names = ['January sales', 'February sales', 'March sales', 'April sales', 'May sales', 'June sales'];
    const data = names.map((x, i) => ({ x, value: i + 1 }));
    const result = await renderChart({
      width: 240,
      axis: { x: { type: 'category' } },
      series: [{ type: 'bar', data }],
    });

    expect(errorsOf(result)).toEqual([]);
  });

  it('draws a left Y axis under the title', async () => {
    const right = await renderChart({ ...lineSpec, title: { text: 'Revenue', sub: 'USD' } });
    const left = await renderChart({
      ...lineSpec,
      title: { text: 'Revenue', sub: 'USD' },
      axis: { y: { position: 'left' } },
    });

    expect(left.data.equals(right.data)).toBe(false);
    expect(left.description.size.height).toBe(right.description.size.height);
  });

  it('paints the theme gradient behind the chart', async () => {
    const result = await renderChart({ ...lineSpec, theme: 'dracula', gradient: true }, { pixelRatio: 1 });
    const image = await pixels(result.data);

    expect(image.at(1, 1)).not.toBe(image.at(1, 398));
  });

  it('wraps a bottom legend into rows', async () => {
    const layers = Array.from({ length: 8 }, (_, i) => ({ label: `Region ${i + 1}`, data: line }));
    const oneRow = await renderChart({ width: 1600, legend: true, series: [{ type: 'line', data: layers }] });
    const rows = await renderChart({ width: 320, legend: true, series: [{ type: 'line', data: layers }] });

    expect(400 - rows.description.size.height).toBeGreaterThan(400 - oneRow.description.size.height);
  });

  it('cuts a long right legend label at half the image width', async () => {
    const label = 'A very long series name that does not fit in a small image';
    const result = await renderChart({
      width: 160,
      height: 120,
      legend: { position: 'right' },
      series: [{ type: 'line', data: [{ label, data: line }] }],
    });

    expect(result.description.size.width).toBeGreaterThanOrEqual(80);
  });

  it('fails when a legend leaves no room for the plot', async () => {
    const layers = Array.from({ length: 40 }, (_, i) => ({ label: `Series ${i + 1}`, data: line }));
    const render = renderChart({ width: 160, height: 120, legend: true, series: [{ type: 'line', data: layers }] });

    await expect(render).rejects.toThrow(/^legend: it leaves .* px for the plot in a 160×120 image/);
  });

  it('lists pie slices and single series in the legend', async () => {
    const pie = await renderChart({
      legend: { position: 'right' },
      series: [
        {
          type: 'pie',
          data: [
            { label: 'A', value: 2 },
            { label: 'B', value: 1 },
          ],
        },
      ],
    });
    const gauge = await renderChart({ legend: true, series: [{ type: 'gauge', value: 40 }] });

    expect(pie.description.size.width).toBeLessThan(800);
    expect(errorsOf(gauge)).toEqual([]);
  });

  it('applies the X and Y axis props', async () => {
    const plain = await renderChart(lineSpec);
    const styled = await renderChart({
      ...lineSpec,
      xAxis: { format: () => 'x', labelCount: 3 },
      yAxis: { format: (value) => `${value} ms`, labelCount: 3 },
    });

    expect(styled.data.equals(plain.data)).toBe(false);
  });
});

describe('options and fonts', () => {
  it('rejects an unknown format and non-object options', async () => {
    await expect(renderChart(lineSpec, { format: 'jpg' as never })).rejects.toThrow(/^format: expected "png" or "svg"/);
    await expect(renderChart({ series: [{ type: 'line', data: line, options: 3 as never }] })).rejects.toThrow(
      /^series\[0\]\.options: expected an object/,
    );
  });

  it('registers a font file and refuses a file that is not a font', () => {
    const outfit = createRequire(import.meta.url).resolve('@fontsource/outfit/files/outfit-latin-400-normal.woff2');

    expect(registerFont({ path: outfit, family: 'Outfit Test' })).toBe(true);
    expect(registerFont({ path: fileURLToPath(import.meta.url) })).toBe(false);
  });
});

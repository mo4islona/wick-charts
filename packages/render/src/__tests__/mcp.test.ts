import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { serveMcp } from '../mcp';

type Message = { id: number | null; result?: Record<string, unknown>; error?: { code: number; message: string } };

/** Send `requests` one per line (a string goes as is), close the input, and collect the answers by id. */
async function session(requests: unknown[]): Promise<Map<number | null, Message>> {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', (chunk: Buffer) => chunks.push(chunk));

  const served = serveMcp({ input, output, version: '0.0.0-test' });
  for (const request of requests) {
    const line = typeof request === 'string' ? request : JSON.stringify(request);
    input.write(`${line}\n`);
  }
  input.end();
  await served;

  const lines = Buffer.concat(chunks).toString('utf8').trim().split('\n');
  const messages = lines.map((line) => JSON.parse(line) as Message);

  return new Map(messages.map((message) => [message.id, message]));
}

const spec = {
  series: [
    {
      type: 'line',
      data: [
        { time: '2026-01-01', value: 1 },
        { time: '2026-01-02', value: 3 },
      ],
    },
  ],
};

function call(id: number, args: Record<string, unknown>) {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'render_chart', arguments: args } };
}

describe('serveMcp', () => {
  it('answers initialize and lists the render_chart tool', async () => {
    const answers = await session([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {} } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]);

    expect(answers.get(1)?.result).toMatchObject({
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'wick-charts-render', version: '0.0.0-test' },
    });
    const tools = answers.get(2)?.result?.tools as { name: string; inputSchema: unknown }[];
    expect(tools.map((tool) => tool.name)).toEqual(['render_chart']);
    expect(answers.size).toBe(2);
  });

  it('returns a PNG inline with the chart description', async () => {
    const answers = await session([call(1, { spec })]);
    const content = answers.get(1)?.result?.content as { type: string; mimeType?: string; text?: string }[];

    expect(content[0]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    expect(content[1].text).toContain('Chart: line');
  });

  it('writes the image to `output`', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wick-render-'));
    const output = join(dir, 'chart.svg');

    try {
      const answers = await session([call(1, { spec, format: 'svg', output })]);
      const content = answers.get(1)?.result?.content as { text: string }[];

      expect(content[0].text).toContain(`Wrote ${output}`);
      expect(await readFile(output, 'utf8')).toContain('<svg');
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('returns a spec mistake as a tool error the model can act on', async () => {
    const answers = await session([call(1, { spec: { series: [{ type: 'donut', data: [] }] } })]);

    expect(answers.get(1)?.result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: expect.stringMatching(/^series\[0\]\.type: expected one of/) }],
    });
  });

  it('returns an SVG inline as text', async () => {
    const answers = await session([call(1, { spec, format: 'svg' })]);
    const content = answers.get(1)?.result?.content as { type: string; text: string }[];

    expect(content.map((item) => item.type)).toEqual(['text', 'text']);
    expect(content[1].text).toContain('<svg');
  });

  it('answers ping, and a line that is not JSON with a parse error', async () => {
    const answers = await session([{ jsonrpc: '2.0', id: 1, method: 'ping' }, '{not json', '']);

    expect(answers.get(1)?.result).toEqual({});
    expect(answers.get(null)?.error?.code).toBe(-32700);
  });

  it('answers an unknown method with a JSON-RPC error', async () => {
    const answers = await session([{ jsonrpc: '2.0', id: 1, method: 'resources/list' }]);

    expect(answers.get(1)?.error?.code).toBe(-32601);
  });
});

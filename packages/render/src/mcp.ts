import { writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { createInterface } from 'node:readline';

import type { ChartDescription } from '@wick-charts/core';

import { RenderSpecError } from './errors';
import { type RenderFormat, renderChart } from './render';
import { chartSpecSchema } from './schema';
import type { ChartSpec } from './spec';

/** Protocol versions this server speaks, newest first. */
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const TOOL_NAME = 'render_chart';

const TOOL = {
  name: TOOL_NAME,
  title: 'Render a chart',
  description:
    'Render a Wick Charts chart to a PNG or an SVG image, for a Slack message, a pull request, a report or an email. ' +
    'The spec takes the props of the Wick Charts components as JSON, so the image matches the chart an app draws ' +
    'from the same data. Give `output` to write the file and get its path back; without it the image comes inline. ' +
    'The result also lists likely mistakes in the spec, such as a series with no data or data out of view.',
  inputSchema: {
    type: 'object',
    required: ['spec'],
    properties: {
      spec: chartSpecSchema,
      format: { type: 'string', enum: ['png', 'svg'], description: 'Default "png".' },
      pixelRatio: { type: 'number', description: 'PNG pixels per CSS px. Default 2.' },
      output: {
        type: 'string',
        description: 'File path to write the image to. A relative path resolves against the server working directory.',
      },
    },
  },
};

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface ToolResult {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  isError?: boolean;
}

/** JSON-RPC error codes the server answers with. */
const ERROR = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602 } as const;

export interface McpServerOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  version: string;
}

/**
 * Serve the `render_chart` tool over MCP on stdio: one JSON-RPC message per line.
 * Resolves when the input closes.
 */
export async function serveMcp(options: McpServerOptions): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });

  const send = (message: unknown) => {
    output.write(`${JSON.stringify(message)}\n`);
  };

  const pending: Promise<void>[] = [];
  for await (const line of lines) {
    if (line.trim() === '') continue;

    pending.push(handleLine({ line, send, version: options.version }));
  }

  await Promise.all(pending);
}

async function handleLine(params: { line: string; send: (message: unknown) => void; version: string }): Promise<void> {
  const { line, send } = params;

  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: ERROR.parse, message: 'Parse error' } });

    return;
  }

  // A notification has no id and gets no answer.
  const isNotification = request.id === undefined;
  if (isNotification) return;

  try {
    const result = await dispatch({ request, version: params.version });
    send({ jsonrpc: '2.0', id: request.id, result });
  } catch (error) {
    const rpc = error instanceof RpcError ? error : new RpcError(ERROR.invalidRequest, String(error));
    send({ jsonrpc: '2.0', id: request.id, error: { code: rpc.code, message: rpc.message } });
  }
}

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

async function dispatch(params: { request: JsonRpcRequest; version: string }): Promise<unknown> {
  const { request, version } = params;

  switch (request.method) {
    case 'initialize': {
      const requested = request.params?.protocolVersion;
      const supported = typeof requested === 'string' && PROTOCOL_VERSIONS.includes(requested);

      return {
        protocolVersion: supported ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'wick-charts-render', version },
      };
    }

    case 'ping':
      return {};

    case 'tools/list':
      return { tools: [TOOL] };

    case 'tools/call':
      return callTool(request.params ?? {});

    default:
      throw new RpcError(ERROR.methodNotFound, `Method not found: ${request.method}`);
  }
}

async function callTool(params: Record<string, unknown>): Promise<ToolResult> {
  if (params.name !== TOOL_NAME) throw new RpcError(ERROR.invalidParams, `Unknown tool: ${String(params.name)}`);

  const args = (params.arguments ?? {}) as Record<string, unknown>;

  try {
    return await renderTool(args);
  } catch (error) {
    // A spec mistake goes back to the model as a tool error, so it can fix the spec and call again.
    const known = error instanceof RenderSpecError;
    const text = known ? error.message : `Render failed: ${error instanceof Error ? error.message : String(error)}`;

    return { content: [{ type: 'text', text }], isError: true };
  }
}

async function renderTool(args: Record<string, unknown>): Promise<ToolResult> {
  if (typeof args.spec !== 'object' || args.spec === null) throw new RenderSpecError('spec: expected an object.');

  const format = (args.format ?? 'png') as RenderFormat;
  const pixelRatio = typeof args.pixelRatio === 'number' ? args.pixelRatio : undefined;
  const result = await renderChart(args.spec as ChartSpec, { format, pixelRatio });
  const summary = describeResult({ description: result.description, width: result.width, height: result.height });

  if (typeof args.output === 'string' && args.output !== '') {
    const path = isAbsolute(args.output) ? args.output : resolve(args.output);
    await writeFile(path, result.data);

    return { content: [{ type: 'text', text: `Wrote ${path}.\n${summary}` }] };
  }

  if (format === 'svg') {
    return {
      content: [
        { type: 'text', text: summary },
        { type: 'text', text: result.data.toString('utf8') },
      ],
    };
  }

  return {
    content: [
      { type: 'image', data: result.data.toString('base64'), mimeType: result.mimeType },
      { type: 'text', text: summary },
    ],
  };
}

/** The chart's own text description, likely mistakes included. */
function describeResult(params: { description: ChartDescription; width: number; height: number }): string {
  const { description, width, height } = params;

  return `${width}×${height} CSS px. ${description.text}`;
}

import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import { parseArgs } from 'node:util';

import { RenderSpecError } from './errors';
import { serveMcp } from './mcp';
import { type RenderFormat, renderChart } from './render';
import type { ChartSpec } from './spec';

const USAGE = `Usage:
  wick-charts-render <spec.json | -> -o <chart.png | chart.svg> [--format png|svg] [--pixel-ratio 2]
  wick-charts-render mcp      Serve the render_chart tool over MCP on stdio.`;

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

async function readSpec(source: string): Promise<ChartSpec> {
  const text = source === '-' ? await readStdin() : await readFile(source, 'utf8');

  return JSON.parse(text) as ChartSpec;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

function formatOf(params: { flag: string | undefined; output: string }): RenderFormat {
  const format = params.flag ?? extname(params.output).slice(1).toLowerCase();
  if (format !== 'png' && format !== 'svg') throw new RenderSpecError(`format: expected png or svg, got "${format}".`);

  return format;
}

/** Run the CLI with `args` (no node or script path) and return the exit code. */
export async function runCli(args: string[]): Promise<number> {
  try {
    return await run(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);

    return 1;
  }
}

async function run(args: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' },
      format: { type: 'string' },
      'pixel-ratio': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (values.version) {
    console.log(version);

    return 0;
  }

  const [command] = positionals;
  if (command === 'mcp') {
    await serveMcp({ version });

    return 0;
  }

  if (values.help || command === undefined || values.output === undefined) {
    console.log(USAGE);

    return values.help ? 0 : 1;
  }

  const format = formatOf({ flag: values.format, output: values.output });
  const ratio = values['pixel-ratio'];
  const pixelRatio = ratio === undefined ? undefined : Number(ratio);
  const result = await renderChart(await readSpec(command), { format, pixelRatio });
  await writeFile(values.output, result.data);

  // Likely mistakes in the spec go to stderr; the image is still written.
  for (const issue of result.description.issues) {
    console.error(`${issue.severity}: ${issue.message}`);
  }

  return 0;
}

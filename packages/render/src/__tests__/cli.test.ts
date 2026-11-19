import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runCli } from '../run-cli';

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

describe('runCli', () => {
  let dir = '';
  let log: MockInstance<typeof console.log>;
  let error: MockInstance<typeof console.error>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wick-cli-'));
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true });
  });

  it('renders a spec file to the format of the output extension', async () => {
    const input = join(dir, 'spec.json');
    const output = join(dir, 'chart.svg');
    await writeFile(input, JSON.stringify(spec));

    expect(await runCli([input, '-o', output])).toBe(0);
    expect(await readFile(output, 'utf8')).toContain('<svg');
  });

  it('takes the format and the pixel ratio from flags', async () => {
    const input = join(dir, 'spec.json');
    const output = join(dir, 'chart.out');
    await writeFile(input, JSON.stringify(spec));

    expect(await runCli([input, '-o', output, '--format', 'png', '--pixel-ratio', '1'])).toBe(0);
    expect((await readFile(output)).subarray(1, 4).toString()).toBe('PNG');
  });

  it('writes the image and reports likely mistakes on stderr', async () => {
    const input = join(dir, 'spec.json');
    await writeFile(input, JSON.stringify({ series: [{ type: 'line', data: [] }] }));

    expect(await runCli([input, '-o', join(dir, 'chart.png')])).toBe(0);
    expect(error.mock.calls.flat().join('\n')).toMatch(/^warning: |^error: /m);
  });

  it('prints the version and the usage', async () => {
    expect(await runCli(['--version'])).toBe(0);
    expect(log.mock.calls[0][0]).toMatch(/^\d+\.\d+\.\d+/);

    expect(await runCli(['--help'])).toBe(0);
    expect(await runCli([])).toBe(1);
    expect(log.mock.calls[2][0]).toContain('Usage:');
  });

  it('fails with the message of a spec mistake', async () => {
    const input = join(dir, 'spec.json');
    await writeFile(input, JSON.stringify({ series: [] }));

    expect(await runCli([input, '-o', join(dir, 'chart.png')])).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^series: expected an array/));
  });

  it('rejects an unknown output format', async () => {
    expect(await runCli(['spec.json', '-o', join(dir, 'chart.jpg')])).toBe(1);
    expect(error).toHaveBeenCalledWith('format: expected png or svg, got "jpg".');
  });
});

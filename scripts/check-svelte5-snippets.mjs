#!/usr/bin/env node
// Renders snippets passed as props (`children={snippet}`, `sub={snippet}`) through the shipped
// `SnippetSlot` on Svelte 5: on the server, in the DOM and on hydration. A legacy `<slot>` alone
// renders only nested `{#snippet}` blocks. Run after `pnpm build`.

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { JSDOM } from 'jsdom';
import { compile } from 'svelte5/compiler';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'packages/svelte/dist');
const SVELTE5 = resolve(ROOT, 'node_modules/svelte5');
const EXPORTS = JSON.parse(readFileSync(join(SVELTE5, 'package.json'), 'utf8')).exports;

// The same pattern as every shipped component with a slot.
const SLOTTED = `<script>
  import SnippetSlot from './SnippetSlot.svelte';
  export let sub = undefined;
  export let children = undefined;
  export let value = 1;
</script>
<p><slot {value}><SnippetSlot snippet={children} props={{ value }} /></slot></p>
<p><slot name="sub"><SnippetSlot snippet={sub} /></slot></p>`;

const RUNES_PARENT = `<svelte:options runes />
<script>
  import Slotted from './Slotted.svelte';
  let value = $state(1);
  export function bump() { value += 1; }
</script>
{#snippet mainSnippet(props)}<b>prop {props.value}</b>{/snippet}
{#snippet subSnippet()}<i>prop sub</i>{/snippet}
<section id="prop"><Slotted {value} children={mainSnippet} sub={subSnippet} /></section>
<section id="nested"><Slotted {value}>{#snippet children(props)}<b>nested {props.value}</b>{/snippet}{#snippet sub()}<i>nested sub</i>{/snippet}</Slotted></section>`;

const LEGACY_PARENT = `<script>
  import Slotted from './Slotted.svelte';
  let value = 1;
  export function bump() { value += 1; }
</script>
<section id="let"><Slotted {value} let:value={v}>let {v}<i slot="sub">let sub</i></Slotted></section>`;

const EXPECTED = {
  RunesParent: { prop: 'prop VALUE prop sub', nested: 'nested VALUE nested sub' },
  LegacyParent: { let: 'let VALUE let sub' },
};

/** `svelte/...` imports of the compiled code, pointed at the Svelte 5 install. */
function linkSvelte(code) {
  return code
    .replace(/(from |import )'svelte\/([^']+)'/g, (_, keyword, path) => {
      const entry = EXPORTS[`./${path}`];
      const target = typeof entry === 'string' ? entry : entry.default;

      return `${keyword}'${pathToFileURL(join(SVELTE5, target))}'`;
    })
    .replace(/\.svelte'/g, ".svelte.js'");
}

function build(dir, generate) {
  mkdirSync(dir);
  copyFileSync(join(DIST, 'snippet-host.js'), join(dir, 'snippet-host.js'));

  const sources = {
    SnippetSlot: readFileSync(join(DIST, 'SnippetSlot.svelte'), 'utf8'),
    Slotted: SLOTTED,
    RunesParent: RUNES_PARENT,
    LegacyParent: LEGACY_PARENT,
  };
  for (const [name, source] of Object.entries(sources)) {
    const { js } = compile(source, { filename: `${name}.svelte`, generate });
    writeFileSync(join(dir, `${name}.svelte.js`), linkSvelte(js.code));
  }
}

function text(element) {
  return element.textContent.replace(/\s+/g, ' ').trim();
}

const problems = [];

function expect(args) {
  const { label, actual, wanted } = args;
  if (actual !== wanted) problems.push(`${label}: got "${actual}", wanted "${wanted}"`);
}

function expectSections(args) {
  const { label, document, root, value } = args;

  for (const [id, template] of Object.entries(EXPECTED[root])) {
    const section = document.getElementById(id);
    const actual = section === null ? '(missing)' : text(section);
    expect({ label: `${label} ${root} #${id}`, actual, wanted: template.replace('VALUE', String(value)) });
  }
}

const work = mkdtempSync(join(tmpdir(), 'wick-svelte5-snippets-'));

try {
  build(join(work, 'server'), 'server');
  build(join(work, 'client'), 'client');

  const { render } = await import(pathToFileURL(join(SVELTE5, EXPORTS['./server'].default)));
  const html = {};
  for (const root of Object.keys(EXPECTED)) {
    const { default: Root } = await import(pathToFileURL(join(work, 'server', `${root}.svelte.js`)));
    html[root] = render(Root, { props: {} }).body;

    const { document } = new JSDOM(html[root]).window;
    expectSections({ label: 'server', document, root, value: 1 });
  }

  const { window } = new JSDOM('<!doctype html><body></body>');
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Text', 'Comment', 'DocumentFragment']) {
    globalThis[key] = window[key];
  }

  const { mount, hydrate, flushSync } = await import(pathToFileURL(join(SVELTE5, EXPORTS['.'].browser)));
  for (const root of Object.keys(EXPECTED)) {
    const { default: Root } = await import(pathToFileURL(join(work, 'client', `${root}.svelte.js`)));

    for (const [label, start] of [
      ['client', mount],
      ['hydrate', hydrate],
    ]) {
      const target = window.document.createElement('div');
      target.innerHTML = label === 'hydrate' ? html[root] : '';
      window.document.body.append(target);

      const exports = start(Root, { target, props: {} });
      flushSync();
      expectSections({ label, document: window.document, root, value: 1 });

      exports.bump();
      flushSync();
      expectSections({ label: `${label} after an update`, document: window.document, root, value: 2 });

      target.remove();
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log('✓ Snippets passed as props render on Svelte 5: server, client and hydration.');

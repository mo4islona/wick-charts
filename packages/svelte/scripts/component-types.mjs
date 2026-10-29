// svelte-package on Svelte 4 emits `class X extends SvelteComponent`: not a Svelte 5 `Component`, and its constructor
// types `children` as `any`. Rewrites each `*.svelte.d.ts` to the shape in `src/component-types.ts`.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const helpers = join(dist, 'component-types.js');

const IMPORT = 'import { SvelteComponent } from "svelte";\n';
const CLASS = /^export default class (\w+) extends SvelteComponent<\1Props, \1Events, \1Slots> \{\n\}$/m;

function rewrite(file) {
  const source = readFileSync(file, 'utf8');
  const name = CLASS.exec(source)?.[1];
  const props = `export type ${name}Props = typeof __propDef.props;`;

  if (name === undefined || !source.includes(IMPORT) || !source.includes(props)) {
    throw new Error(`${relative(dist, file)}: not the svelte-package shape this script rewrites`);
  }

  const specifier = relative(dirname(file), helpers).replace(/^(?!\.)/, './');
  const component = [
    `declare const ${name}: IsomorphicComponent<${name}Props, ${name}Events, ${name}Slots>;`,
    `type ${name} = InstanceType<typeof ${name}>;`,
    `export default ${name};`,
  ].join('\n');

  const rewritten = source
    .replace(IMPORT, `import type { IsomorphicComponent, WithSnippets } from '${specifier}';\n`)
    .replace(props, `export type ${name}Props = WithSnippets<typeof __propDef.props, typeof __propDef.slots>;`)
    .replace(CLASS, component);

  writeFileSync(file, rewritten);
}

const files = readdirSync(dist, { recursive: true })
  .filter((path) => path.endsWith('.svelte.d.ts'))
  .map((path) => join(dist, path));

for (const file of files) {
  rewrite(file);
}

console.log(`✓ ${files.length} component declarations rewritten for Svelte 4 and 5.`);

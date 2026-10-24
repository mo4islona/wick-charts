// Markdown API reference for llms-full.txt, built from docs/data/api-manifest.json
// (`pnpm api:extract` writes it from the type declarations). The wick-charts skill
// lists no props or options and points here and at the installed `.d.ts` instead.

const REACT_ONLY = new Set(['Sparkline', 'EdgeLoader']);

/** `text` with every line after the first moved right by `indent` spaces; blank lines stay empty. */
function indentContinuation(text, indent) {
  const pad = ' '.repeat(indent);

  return text
    .split('\n')
    .map((line, i) => (i === 0 || line === '' ? line : `${pad}${line}`))
    .join('\n');
}

/** One prop as a list item, its nested fields as sub-items. Only top-level props can be required. */
function propLines(prop, depth) {
  const facts = [`\`${prop.type}\``];
  if (depth === 0 && !prop.optional) facts.push('required');

  // A default written as prose with inline code (`{ min: 500ms, … }`) would nest backticks.
  if (prop.defaultValue !== null) facts.push(`default \`${prop.defaultValue.replaceAll('`', '')}\``);

  const notes = [];
  if (prop.deprecated !== null) notes.push(`**Deprecated:** ${prop.deprecated}`);
  if (prop.description) notes.push(prop.description);

  const indent = depth * 2;
  const head = `${' '.repeat(indent)}- \`${prop.name}\` (${facts.join(', ')})`;
  const item = notes.length > 0 ? `${head}: ${notes.join(' ')}` : head;
  const lines = [indentContinuation(item, indent + 2)];

  for (const field of prop.nested?.props ?? []) {
    lines.push(...propLines(field, depth + 1));
  }

  return lines;
}

/** The reference as one Markdown document: a section per component, in manifest order. */
export function buildApiReference(manifest) {
  const sections = [
    [
      '# API reference',
      '',
      'Every component prop and every series option, generated from the type declarations of the',
      'published packages. The props are the same in React, Vue and Svelte unless a component says',
      'otherwise. A series takes `Partial<…Options>` in `options`.',
    ].join('\n'),
  ];

  for (const [name, component] of Object.entries(manifest.components)) {
    const alias = component.alias === null ? '' : ` (alias \`<${component.alias}>\`)`;
    const lines = [`## \`<${name}>\`${alias}`, ''];

    if (REACT_ONLY.has(name)) lines.push('React only.', '');
    if (component.description) lines.push(component.description, '');

    for (const prop of component.props) {
      lines.push(...propLines(prop, 0));
    }

    sections.push(lines.join('\n').trimEnd());
  }

  return sections.join('\n\n');
}

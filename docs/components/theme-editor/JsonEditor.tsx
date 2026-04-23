import { type CSSProperties, Fragment, type ReactNode } from 'react';

import { ColorLeaf, isColorString } from './ColorLeaf';
import { BoolLeaf, NullLeaf, NumberLeaf, SelectLeaf, StringLeaf } from './leaves';

const ENUM_BY_KEY: Record<string, readonly string[]> = {
  style: ['solid', 'dashed', 'dotted'] as const,
};

/** Arrays that are actually tuples — fixed length, no add/remove. */
const FIXED_ARRAY_KEYS = new Set(['chartGradient', 'body']);

function Line({ depth, children }: { depth: number; children: ReactNode }) {
  return (
    <div className="json-line" style={{ paddingLeft: depth * 18 }}>
      {children}
    </div>
  );
}

function Key({ name }: { name: string }) {
  return (
    <>
      <span className="json-punct">"</span>
      <span className="json-key">{name}</span>
      <span className="json-punct">": </span>
    </>
  );
}

/** Guess a default value to append when `+ add` is pressed. */
function defaultForArray(arr: unknown[]): unknown {
  if (arr.length === 0) return '';
  const sample = arr[arr.length - 1];

  if (typeof sample === 'string') {
    return isColorString(sample) ? '#ffffff' : '';
  }
  if (typeof sample === 'number') return 0;
  if (typeof sample === 'boolean') return false;
  if (Array.isArray(sample)) return [];
  if (sample && typeof sample === 'object') {
    // Clone shape with empty/zero values.
    return Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, resetLeaf(v)]));
  }

  return null;
}

function resetLeaf(v: unknown): unknown {
  if (typeof v === 'string') return isColorString(v) ? '#ffffff' : '';
  if (typeof v === 'number') return 0;
  if (typeof v === 'boolean') return false;
  if (Array.isArray(v)) return [];
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resetLeaf(x)]));

  return null;
}

function renderLeaf({
  value,
  pathKey,
  onChange,
  pickerSurface,
}: {
  value: unknown;
  pathKey: string | undefined;
  onChange: (v: unknown) => void;
  pickerSurface: CSSProperties | undefined;
}): ReactNode {
  if (value === null) return <NullLeaf />;
  if (typeof value === 'boolean') return <BoolLeaf value={value} onChange={onChange as (v: boolean) => void} />;
  if (typeof value === 'number') return <NumberLeaf value={value} onChange={onChange as (v: number) => void} />;
  if (typeof value === 'string') {
    if (isColorString(value)) {
      return <ColorLeaf value={value} onChange={onChange as (v: string) => void} pickerSurface={pickerSurface} />;
    }
    if (pathKey && ENUM_BY_KEY[pathKey]?.includes(value)) {
      return <SelectLeaf value={value} options={ENUM_BY_KEY[pathKey]} onChange={onChange as (v: string) => void} />;
    }

    return <StringLeaf value={value} onChange={onChange as (v: string) => void} />;
  }

  return null;
}

interface RenderArgs {
  value: unknown;
  depth: number;
  prefix: ReactNode;
  trailingComma: boolean;
  onChange: (v: unknown) => void;
  pathKey: string | undefined;
  pickerSurface: CSSProperties | undefined;
  trailing?: ReactNode;
  keyPrefix: string;
}

function renderValue(args: RenderArgs): ReactNode[] {
  const { value, depth, prefix, trailingComma, onChange, pathKey, pickerSurface, trailing, keyPrefix } = args;
  const comma = trailingComma ? <span className="json-punct">,</span> : null;

  if (Array.isArray(value)) {
    const fixed = pathKey ? FIXED_ARRAY_KEYS.has(pathKey) : false;
    const lines: ReactNode[] = [];

    lines.push(
      <Line key={`${keyPrefix}/open`} depth={depth}>
        {prefix}
        <span className="json-punct">[</span>
      </Line>,
    );

    value.forEach((v, i) => {
      const childLines = renderValue({
        value: v,
        depth: depth + 1,
        prefix: null,
        trailingComma: i < value.length - 1,
        onChange: (nv) => {
          const next = value.slice();
          next[i] = nv;
          onChange(next);
        },
        pathKey: undefined,
        pickerSurface,
        trailing: fixed ? undefined : (
          <button
            type="button"
            className="json-arr-remove"
            title="Remove"
            aria-label="Remove item"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        ),
        keyPrefix: `${keyPrefix}/${i}`,
      });
      lines.push(...childLines);
    });

    if (!fixed) {
      lines.push(
        <Line key={`${keyPrefix}/add`} depth={depth + 1}>
          <button type="button" className="json-arr-add" onClick={() => onChange([...value, defaultForArray(value)])}>
            ＋ add
          </button>
        </Line>,
      );
    }

    lines.push(
      <Line key={`${keyPrefix}/close`} depth={depth}>
        <span className="json-punct">]</span>
        {comma}
        {trailing}
      </Line>,
    );

    return lines;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const lines: ReactNode[] = [];

    lines.push(
      <Line key={`${keyPrefix}/open`} depth={depth}>
        {prefix}
        <span className="json-punct">{'{'}</span>
      </Line>,
    );

    entries.forEach(([k, v], i) => {
      const childLines = renderValue({
        value: v,
        depth: depth + 1,
        prefix: <Key name={k} />,
        trailingComma: i < entries.length - 1,
        onChange: (nv) => onChange({ ...(value as Record<string, unknown>), [k]: nv }),
        pathKey: k,
        pickerSurface,
        keyPrefix: `${keyPrefix}/${k}`,
      });
      lines.push(...childLines);
    });

    lines.push(
      <Line key={`${keyPrefix}/close`} depth={depth}>
        <span className="json-punct">{'}'}</span>
        {comma}
        {trailing}
      </Line>,
    );

    return lines;
  }

  // primitive leaf — one line
  return [
    <Line key={`${keyPrefix}/leaf`} depth={depth}>
      {prefix}
      {renderLeaf({ value, pathKey, onChange, pickerSurface })}
      {comma}
      {trailing}
    </Line>,
  ];
}

export function JsonEditor({
  value,
  onChange,
  pickerSurface,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  pickerSurface?: CSSProperties;
}) {
  const lines = renderValue({
    value,
    depth: 0,
    prefix: null,
    trailingComma: false,
    onChange,
    pathKey: undefined,
    pickerSurface,
    keyPrefix: 'root',
  });

  return (
    <div className="json-edit">
      {lines.map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
    </div>
  );
}

import { type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Click-to-edit string leaf. Renders as quoted token in read mode; clicking
 * swaps to an inline text input that commits on blur / Enter and reverts on
 * Escape. Width auto-sizes to content.
 */
export function StringLeaf({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (text !== value) onChange(text);
  };

  if (editing) {
    return (
      <span className="leaf-str editing">
        <span className="q">"</span>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setText(value);
              setEditing(false);
            }
          }}
          spellCheck={false}
          style={{ width: `${Math.max(4, text.length + 1)}ch` }}
        />
        <span className="q">"</span>
      </span>
    );
  }

  return (
    <span className="leaf-str" onClick={() => setEditing(true)} role="presentation">
      <span className="q">"</span>
      <span className="txt">{value}</span>
      <span className="q">"</span>
    </span>
  );
}

/** Click-to-edit numeric leaf. */
export function NumberLeaf({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(String(value));
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const n = Number(text);
    if (Number.isFinite(n) && n !== value) onChange(n);
    else setText(String(value));
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="leaf-num editing"
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(String(value));
            setEditing(false);
          }
        }}
        spellCheck={false}
        style={{ width: `${Math.max(3, text.length + 1)}ch` }}
      />
    );
  }

  return (
    <span className="leaf-num" onClick={() => setEditing(true)} role="presentation">
      {value}
    </span>
  );
}

/** Inline boolean toggle rendered as `true` / `false` text. */
export function BoolLeaf({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className={`leaf-bool ${value ? 'on' : 'off'}`} onClick={() => onChange(!value)}>
      {String(value)}
    </button>
  );
}

/** Null renders as muted `null` text. Not editable for v1. */
export function NullLeaf(): ReactNode {
  return <span className="leaf-null">null</span>;
}

/** Dropdown for enum-like string leaves. */
export function SelectLeaf({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <span className="leaf-select">
      <span className="q">"</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <span className="q">"</span>
    </span>
  );
}

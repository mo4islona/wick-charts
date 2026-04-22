import { type CSSProperties, useEffect, useRef, useState } from 'react';

import {
  HexAlphaColorPicker,
  HslStringColorPicker,
  HslaStringColorPicker,
  RgbStringColorPicker,
  RgbaStringColorPicker,
} from 'react-colorful';
import { createPortal } from 'react-dom';

const PICKER_H = 220;

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
const HEX_SHORT_RE = /^#[0-9a-fA-F]{3}$/;
const HEX_SHORT4_RE = /^#[0-9a-fA-F]{4}$/;

type ColorFormat = 'hex' | 'rgb' | 'rgba' | 'hsl' | 'hsla';

function detectColorFormat(v: string): ColorFormat | null {
  const t = v.trim().toLowerCase();
  if (HEX_RE.test(t)) return 'hex';
  if (t.startsWith('rgba(') && t.endsWith(')')) return 'rgba';
  if (t.startsWith('rgb(') && t.endsWith(')')) return 'rgb';
  if (t.startsWith('hsla(') && t.endsWith(')')) return 'hsla';
  if (t.startsWith('hsl(') && t.endsWith(')')) return 'hsl';

  return null;
}

function expandHex(v: string): string {
  if (HEX_SHORT_RE.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  if (HEX_SHORT4_RE.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}${v[4]}${v[4]}`.toLowerCase();
  }

  return v.toLowerCase();
}

/** Whether a string is editor-renderable as a color swatch. */
export function isColorString(v: unknown): v is string {
  if (typeof v !== 'string') return false;

  return detectColorFormat(v) !== null;
}

function Picker({ format, value, onChange }: { format: ColorFormat; value: string; onChange: (v: string) => void }) {
  switch (format) {
    case 'hex':
      return <HexAlphaColorPicker color={value} onChange={onChange} />;
    case 'rgb':
      return <RgbStringColorPicker color={value} onChange={onChange} />;
    case 'rgba':
      return <RgbaStringColorPicker color={value} onChange={onChange} />;
    case 'hsl':
      return <HslStringColorPicker color={value} onChange={onChange} />;
    case 'hsla':
      return <HslaStringColorPicker color={value} onChange={onChange} />;
  }
}

/**
 * Inline color leaf — swatch + editable text + format-aware picker. The
 * picker is portaled to `document.body` so it escapes any `overflow: hidden`
 * ancestor, and anchored with `fixed` to the trigger's bounding rect.
 *
 * Picker variant is chosen from the detected CSS color format so the output
 * always round-trips in the user's original format (hex stays hex, rgba stays
 * rgba, etc.) — no drift through an internal normalization layer.
 */
export function ColorLeaf({
  value,
  onChange,
  pickerSurface,
}: {
  value: string;
  onChange: (v: string) => void;
  pickerSurface?: CSSProperties;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const format = detectColorFormat(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;

    const updatePos = () => {
      const el = wrapRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < PICKER_H + 12 ? Math.max(8, rect.top - PICKER_H - 6) : rect.bottom + 6;
      const left = Math.max(8, Math.min(window.innerWidth - 8, rect.right));
      setPos({ top, left });
    };

    updatePos();

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', updatePos);
    document.addEventListener('scroll', updatePos, true);

    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', updatePos);
      document.removeEventListener('scroll', updatePos, true);
    };
  }, [open]);

  const commit = () => {
    const trimmed = text.trim();
    const nextFmt = detectColorFormat(trimmed);
    if (!nextFmt) {
      // Invalid/unsupported — revert.
      setText(value);
      return;
    }
    const normalized = nextFmt === 'hex' ? expandHex(trimmed) : trimmed;
    if (normalized !== value) onChange(normalized);
    setText(normalized);
  };

  // Input auto-sizes to content so `#abc` stays compact and `rgba(…)` fits.
  const inputWidth = `${Math.max(7.2, text.length + 1)}ch`;

  return (
    <span ref={wrapRef} className="color-ctrl">
      <span className={`color-trigger ${open ? 'open' : ''}`} onClick={() => setOpen(true)} role="presentation">
        <span className="color-swatch" style={{ background: value }} />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setText(value);
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          spellCheck={false}
          style={{ width: inputWidth }}
        />
      </span>
      {open &&
        pos &&
        format &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popRef}
            className="color-picker-pop"
            style={{
              ...(pickerSurface ?? {}),
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: 'translateX(-100%)',
              zIndex: 1000,
            }}
          >
            <Picker format={format} value={value} onChange={onChange} />
          </div>,
          document.body,
        )}
    </span>
  );
}

import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  type NumberFlowFormat,
  type NumberFlowHandle,
  mountNumberFlow,
  resolveNumberFlowFormat,
} from '@wick-charts/core';

export interface NumberFlowProps {
  /** Numeric value to display. Each digit that changes between renders animates with a vertical spin. */
  value: number;
  /**
   * Value-to-string formatter. Defaults to `formatSignificant`: leading zeros
   * collapse into a count (`0.0₅8123`), large values take a suffix (`1.235B`).
   * Pass `formatCompact` / `formatPriceAdaptive` or your own function to customize.
   *
   * `Intl.NumberFormatOptions` is also accepted (legacy) — it's routed
   * through the built-in `Intl.NumberFormat` for back-compat with callers
   * from before this prop was a function.
   */
  format?: NumberFlowFormat;
  /**
   * BCP 47 locale tag. Gives the decimal separator of the formatted text; a
   * locale other than `'en-US'` without `format` formats with
   * `Intl.NumberFormat`. Defaults to `'en-US'`.
   */
  locale?: string;
  /**
   * Per-digit spin animation duration in milliseconds. A value that arrives
   * sooner than this after the previous one snaps instead. Defaults to `350`.
   */
  spinDuration?: number;
  /**
   * How long a character that left keeps its width before the number
   * shrinks, in milliseconds. A value that moves back and forth across
   * `99.99` / `100.01` then holds its width. Defaults to `0`.
   */
  shrinkDelay?: number;
  /** Extra class on the root `<span>`. */
  className?: string;
  /** Inline style on the root `<span>`. */
  style?: CSSProperties;
}

export function NumberFlow({
  value,
  format,
  locale = 'en-US',
  spinDuration = 350,
  shrinkDelay = 0,
  className,
  style,
}: NumberFlowProps) {
  const { format: effectiveFormat, decimal } = useMemo(() => resolveNumberFlowFormat(format, locale), [format, locale]);
  const text = effectiveFormat(value);
  // Server HTML and hydration show this text; React never updates it, so it cannot overwrite the slots.
  const [initialText] = useState(text);

  const rootRef = useRef<HTMLSpanElement | null>(null);
  const flowRef = useRef<NumberFlowHandle | null>(null);
  const optionsRef = useRef({ spinDuration, shrinkDelay, decimal });
  optionsRef.current = { spinDuration, shrinkDelay, decimal };

  // The engine owns the root's children once mounted.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) return;

    const flow = mountNumberFlow(root, optionsRef.current);
    flowRef.current = flow;

    return () => {
      flow.destroy();
      flowRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    flowRef.current?.setOptions({ spinDuration, shrinkDelay, decimal });
  }, [spinDuration, shrinkDelay, decimal]);

  useLayoutEffect(() => {
    flowRef.current?.update(text, value);
  }, [text, value]);

  // A value that ticked between the server render and hydration must not fail hydration.
  return (
    <span
      ref={rootRef}
      className={className}
      suppressHydrationWarning
      style={{
        display: 'inline-flex',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {initialText}
    </span>
  );
}

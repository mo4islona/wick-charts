import { type CSSProperties, useEffect, useMemo, useRef } from 'react';

export interface NumberFlowProps {
  /** Numeric value to display. Each digit that changes between renders animates with a vertical spin. */
  value: number;
  /**
   * Value-to-string formatter. Defaults to the current locale's
   * `Intl.NumberFormat` when omitted. Pass the shared `formatCompact` /
   * `formatPriceAdaptive` helpers or your own function to customize.
   *
   * `Intl.NumberFormatOptions` is also accepted (legacy) — it's routed
   * through the built-in `Intl.NumberFormat` for back-compat with callers
   * from before this prop was a function.
   */
  format?: ((value: number) => string) | Intl.NumberFormatOptions;
  /** BCP 47 locale tag used by the default formatter. Defaults to `'en-US'`. */
  locale?: string;
  /**
   * Per-digit spin animation duration in milliseconds. A value that arrives
   * sooner than this after the previous one snaps instead. Defaults to `350`.
   */
  spinDuration?: number;
  /** Extra class on the root `<span>`. */
  className?: string;
  /** Inline style on the root `<span>`. Useful for `fontVariantNumeric: 'tabular-nums'`. */
  style?: CSSProperties;
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

interface CharPart {
  type: 'digit' | 'symbol';
  value: string;
}

function decompose(formatted: string): CharPart[] {
  const parts: CharPart[] = [];
  for (const char of formatted) {
    if (char >= '0' && char <= '9') {
      parts.push({ type: 'digit', value: char });
    } else {
      parts.push({ type: 'symbol', value: char });
    }
  }
  return parts;
}

export function NumberFlow({ value, format, locale = 'en-US', spinDuration = 350, className, style }: NumberFlowProps) {
  const effectiveFormat = useMemo<(v: number) => string>(() => {
    if (typeof format === 'function') return format;
    const nf = new Intl.NumberFormat(locale, typeof format === 'object' ? format : undefined);
    return (v: number) => nf.format(v);
  }, [format, locale]);

  const formatted = effectiveFormat(value);
  const parts = decompose(formatted);

  // A spin retargeted mid-turn shows two half digits, so values faster than a spin snap.
  const spin = useRef({ formatted, changedAt: Number.NEGATIVE_INFINITY, duration: spinDuration });
  if (spin.current.formatted !== formatted) {
    const now = performance.now();
    const tooFast = now - spin.current.changedAt < spinDuration;
    spin.current = { formatted, changedAt: now, duration: tooFast ? 0 : spinDuration };
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.2,
        ...style,
      }}
    >
      {parts.map((part, i) =>
        part.type === 'digit' ? (
          <DigitSlot key={`d${i}`} digit={parseInt(part.value, 10)} duration={spin.current.duration} />
        ) : (
          <span key={`s${i}`} style={{ display: 'inline-block' }}>
            {part.value}
          </span>
        ),
      )}
    </span>
  );
}

interface DigitSlotProps {
  digit: number;
  duration: number;
}

function DigitSlot({ digit, duration }: DigitSlotProps) {
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  return (
    <span
      style={{
        display: 'inline-block',
        height: '1.2em',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          transform: `translateY(${-digit * 1.2}em)`,
          transition:
            mountedRef.current && duration > 0 ? `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)` : 'none',
        }}
      >
        {DIGITS.map((d) => (
          <span
            key={d}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '1.2em',
            }}
          >
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

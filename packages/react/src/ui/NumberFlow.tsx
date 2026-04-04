import { type CSSProperties, useEffect, useMemo, useRef } from 'react';

export interface NumberFlowProps {
  value: number;
  format?: Intl.NumberFormatOptions;
  locale?: string;
  spinDuration?: number;
  className?: string;
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
  const formatter = useMemo(() => new Intl.NumberFormat(locale, format), [locale, format]);

  const formatted = formatter.format(value);
  const parts = decompose(formatted);

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
          <DigitSlot key={`d${i}`} digit={parseInt(part.value)} duration={spinDuration} />
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
          transition: mountedRef.current ? `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)` : 'none',
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

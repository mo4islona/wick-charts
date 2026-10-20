import { useEffect, useState } from 'react';

import { type ChartTheme, NumberFlow } from '@wick-charts/react';

import { hexToRgba } from '../utils';
import { Button } from './kit';

const MIN_EXPONENT = -9;
const MAX_EXPONENT = 12;
// Slower than the 350 ms spin, so every step animates instead of snapping.
const STEP_MS = 900;

interface Sweep {
  value: number;
  direction: 1 | -1;
}

/** Next value: about half a decade toward the current end, turning around at 1e-9 and 1e12. */
function advance({ value, direction }: Sweep): Sweep {
  const exponent = Math.log10(value);
  let next = direction;
  if (exponent >= MAX_EXPONENT) next = -1;
  if (exponent <= MIN_EXPONENT) next = 1;

  const decades = 0.3 + Math.random() * 0.4;

  return { value: value * 10 ** (next * decades), direction: next };
}

/** Live NumberFlow demo for the API page: one value sweeping from 1e-9 to 1e12 and back. */
export function NumberFlowSweep({ theme }: { theme: ChartTheme }) {
  const [sweep, setSweep] = useState<Sweep>({ value: 8.123e-9, direction: 1 });
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;

    const timer = setInterval(() => setSweep(advance), STEP_MS);

    return () => clearInterval(timer);
  }, [playing]);

  const text = theme.tooltip.textColor;

  return (
    <div
      style={{
        border: `1px solid ${hexToRgba(text, 0.14)}`,
        borderRadius: 8,
        padding: '28px 20px 16px',
        margin: '16px 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18,
      }}
    >
      <NumberFlow
        value={sweep.value}
        style={{ fontSize: 44, fontWeight: 600, fontFamily: theme.typography.fontFamily, color: text }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <code style={{ fontSize: 12, color: hexToRgba(text, 0.6) }}>{sweep.value.toExponential(3)}</code>
        <Button theme={theme} onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </Button>
      </div>
    </div>
  );
}

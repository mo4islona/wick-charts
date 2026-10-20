/** What a character of a formatted number is. */
export type NumberPartType =
  | 'sign'
  | 'integer'
  | 'group'
  | 'decimal'
  | 'fraction'
  /** A digit of the collapsed zero count: the `5` in `0.0₅8`. */
  | 'zeros'
  /** The `×10` of `5.4×10¹⁵`. */
  | 'base'
  /** A digit or the minus of a superscript power: the `15` in `5.4×10¹⁵`. */
  | 'exponent'
  /** A K / M / B / T magnitude suffix. */
  | 'suffix'
  | 'literal';

export interface NumberPart {
  readonly type: NumberPartType;
  /** Display character. Subscript and superscript digits come back as plain `0`–`9`. */
  readonly char: string;
  /** `0`–`9` for a digit, `null` for any other character. */
  readonly digit: number | null;
  /** Only places the value: zeros before the first significant digit, the zero count, the `×10` power. */
  readonly muted: boolean;
  /**
   * Stable within one notation: integer digits and group separators by their
   * distance from the decimal point, fraction digits by their place after it.
   */
  readonly key: string;
  /**
   * Position among the digits that carry the value, from the left: `0` for
   * the `9` of `987.6M`. Stable across a change of notation (`987.6M` →
   * `1.012B`); `null` for a muted digit and any other character.
   */
  readonly sig: number | null;
}

export interface ParseNumberOptions {
  /** Decimal separator of the text. Default `'.'`. */
  decimal?: string;
}

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const GROUP_CHARS = [',', '.', ' ', ' ', ' ', "'", '’'];
const SUFFIXES = 'KMBT';

interface RawPart {
  type: NumberPartType;
  char: string;
  digit: number | null;
}

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9';
}

function classify(chars: readonly string[], decimal: string): RawPart[] {
  const parts: RawPart[] = [];
  let afterDecimal = false;
  let seenDigit = false;
  let baseLeft = 0;

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const prev = parts[parts.length - 1];

    if (baseLeft > 0 && isDigit(c)) {
      baseLeft--;
      parts.push({ type: 'base', char: c, digit: null });
      continue;
    }

    if (isDigit(c)) {
      seenDigit = true;
      parts.push({ type: afterDecimal ? 'fraction' : 'integer', char: c, digit: Number(c) });
      continue;
    }

    const sub = SUBSCRIPT.indexOf(c);
    if (sub >= 0) {
      parts.push({ type: 'zeros', char: String(sub), digit: sub });
      continue;
    }

    const sup = SUPERSCRIPT.indexOf(c);
    if (sup >= 0 || c === '⁻') {
      const digit = sup >= 0 ? sup : null;
      parts.push({ type: 'exponent', char: sup >= 0 ? String(sup) : '−', digit });
      continue;
    }

    if (c === '×' && chars[i + 1] === '1' && chars[i + 2] === '0') {
      baseLeft = 2;
      parts.push({ type: 'base', char: c, digit: null });
      continue;
    }

    const betweenDigits = isDigit(chars[i - 1]) && isDigit(chars[i + 1]);

    if (c === decimal && !afterDecimal && isDigit(chars[i + 1])) {
      afterDecimal = true;
      parts.push({ type: 'decimal', char: c, digit: null });
      continue;
    }

    if (GROUP_CHARS.includes(c) && c !== decimal && !afterDecimal && betweenDigits) {
      parts.push({ type: 'group', char: c, digit: null });
      continue;
    }

    if ((c === '-' || c === '−' || c === '+') && !seenDigit) {
      parts.push({ type: 'sign', char: c, digit: null });
      continue;
    }

    const afterNumber = prev !== undefined && (prev.type === 'integer' || prev.type === 'fraction');
    if (SUFFIXES.includes(c) && afterNumber) {
      parts.push({ type: 'suffix', char: c, digit: null });
      continue;
    }

    parts.push({ type: 'literal', char: c, digit: null });
  }

  return parts;
}

/** Index of the first nonzero integer or fraction digit, `-1` when the number is all zeros. */
function firstSignificant(parts: readonly RawPart[]): number {
  return parts.findIndex((p) => (p.type === 'integer' || p.type === 'fraction') && p.digit !== 0);
}

function isMuted(part: RawPart, index: number, significantAt: number): boolean {
  if (part.type === 'zeros' || part.type === 'base' || part.type === 'exponent') return true;
  if (significantAt < 0 || index >= significantAt) return false;

  const placesValue = part.type === 'integer' || part.type === 'fraction';

  return placesValue || part.type === 'decimal' || part.type === 'group';
}

function keyOf(part: RawPart, place: { integer: number; fraction: number; zeros: number; exponent: number }): string {
  switch (part.type) {
    case 'integer':
      return `i${place.integer}`;
    case 'group':
      return `g${place.integer}`;
    case 'fraction':
      return `f${place.fraction}`;
    case 'zeros':
      return `z${place.zeros}`;
    case 'exponent':
      return part.digit === null ? 'e-' : `e${place.exponent}`;
    case 'decimal':
      return 'dp';
    default:
      return part.type;
  }
}

/**
 * Splits a formatted number into typed characters, so a renderer can style
 * each kind (mute the zeros that only place the value, shrink the zero count)
 * and key digit slots by place. Unknown characters come back as `literal`.
 */
export function parseNumberParts(text: string, opts: ParseNumberOptions = {}): NumberPart[] {
  const raw = classify(Array.from(text), opts.decimal ?? '.');
  const significantAt = firstSignificant(raw);

  // Places count from the right of each run, so the ones digit keeps its key when a digit is added.
  const place = {
    integer: raw.filter((p) => p.type === 'integer').length,
    fraction: 0,
    zeros: raw.filter((p) => p.type === 'zeros').length,
    exponent: raw.filter((p) => p.type === 'exponent' && p.digit !== null).length,
  };
  const literalCounts = new Map<NumberPartType, number>();
  let sig = 0;

  return raw.map((part, index) => {
    if (part.type === 'integer') place.integer--;
    if (part.type === 'fraction') place.fraction++;
    if (part.type === 'zeros') place.zeros--;
    if (part.type === 'exponent' && part.digit !== null) place.exponent--;

    let key = keyOf(part, place);
    if (part.type === 'literal' || part.type === 'base' || part.type === 'sign' || part.type === 'suffix') {
      const seen = literalCounts.get(part.type) ?? 0;
      literalCounts.set(part.type, seen + 1);
      key = `${part.type}${seen}`;
    }

    const muted = isMuted(part, index, significantAt);
    const carriesValue = (part.type === 'integer' || part.type === 'fraction') && !muted;

    return { ...part, muted, key, sig: carriesValue ? sig++ : null };
  });
}

import type { ValueFormatter } from '@wick-charts/core';

import { RenderSpecError } from './errors';

/** `{value}`, or `{value:2}` for a fixed count of fraction digits. */
const PLACEHOLDER = /\{value(?::(\d))?\}/g;

/** Fraction digits `{value}` shows at most. */
const DEFAULT_MAX_FRACTION_DIGITS = 2;

/**
 * A number formatter from a template, for a spec in JSON: `"{value}%"` gives
 * `68%`, `"€{value:2}"` gives `€1,234.50`. Digits are grouped for `locale`.
 */
export function templateFormatter(params: {
  template: string;
  locale: string | undefined;
  path: string;
}): ValueFormatter {
  const { template, locale, path } = params;
  const hasPlaceholder = template.match(PLACEHOLDER) !== null;
  if (!hasPlaceholder) {
    throw new RenderSpecError(`${path}: a format template needs {value}, such as "{value}%", got "${template}".`);
  }

  const formatters = new Map<string, Intl.NumberFormat>();
  const formatterFor = (digits: string | undefined): Intl.NumberFormat => {
    const key = digits ?? '';
    const cached = formatters.get(key);
    if (cached !== undefined) return cached;

    const fixed = digits === undefined ? null : Number(digits);
    const options: Intl.NumberFormatOptions =
      fixed === null
        ? { maximumFractionDigits: DEFAULT_MAX_FRACTION_DIGITS }
        : { minimumFractionDigits: fixed, maximumFractionDigits: fixed };
    const formatter = new Intl.NumberFormat(locale, options);
    formatters.set(key, formatter);

    return formatter;
  };

  return (value) => template.replace(PLACEHOLDER, (_match, digits?: string) => formatterFor(digits).format(value));
}

import type { Cents } from './types';

export function dollars(cents: Cents): number {
  return cents / 100;
}

export function fromDollars(amount: number): Cents {
  return Math.round(amount * 100);
}

/** '$189' / '$12,800' — whole dollars, which is how home costs are talked about. */
export function formatMoney(cents: Cents): string {
  const rounded = Math.round(cents / 100);
  return `$${rounded.toLocaleString('en-US')}`;
}

/** '$189.50' — used where cents actually matter (a scanned invoice total). */
export function formatMoneyExact(cents: Cents): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** '~$3,200' — signals the number is a projection, not a receipt. */
export function formatApprox(cents: Cents): string {
  return `~${formatMoney(roundToSignificant(cents))}`;
}

export function formatRange([low, high]: [Cents, Cents]): string {
  return `${formatMoney(low)}–${formatMoney(high)}`;
}

/**
 * Rounds a projection to a precision a human would actually quote, so the UI shows
 * "~$11,500" rather than "~$11,483". Small numbers round to $10, larger ones to
 * $100 — false precision in a five-year forecast reads as a promise it can't keep.
 */
export function roundToSignificant(cents: Cents): Cents {
  const d = cents / 100;
  if (d < 100) return Math.round(d / 10) * 1000;
  if (d < 1000) return Math.round(d / 50) * 5000;
  if (d < 10000) return Math.round(d / 100) * 10000;
  return Math.round(d / 500) * 50000;
}

export function sumCents(values: (Cents | undefined)[]): Cents {
  return values.reduce<Cents>((acc, v) => acc + (v ?? 0), 0);
}

export const EMPTY_CELL = "\u2014";

export function formatCurrency(value: number | null | undefined, symbol: string): string {
  if (value === null || value === undefined) return EMPTY_CELL;
  return `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** A shekel amount in whole shekels, like every other amount in the app; the dialogs keep the exact value. */
export function formatWholeCurrency(value: number | null | undefined, symbol: string): string {
  if (value === null || value === undefined) return EMPTY_CELL;
  return `${symbol}${Math.round(value).toLocaleString()}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return EMPTY_CELL;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

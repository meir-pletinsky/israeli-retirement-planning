export const EMPTY_CELL = "\u2014";

export function formatCurrency(value: number | null | undefined, symbol: string): string {
  if (value === null || value === undefined) return EMPTY_CELL;
  return `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return EMPTY_CELL;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

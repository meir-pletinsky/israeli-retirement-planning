/** Rounds to one decimal below 10 ("1.5", "2") and to a whole number from 10 up ("12"). */
function compact(value: number): string {
  return value < 10 ? String(Number(value.toFixed(1))) : String(Math.round(value));
}

/** Short money label for a chart axis: ₪950, ₪2.5k, ₪10k, ₪1.5M. */
export function formatAxisMoney(value: number, currencySymbol: string): string {
  const sign = value < 0 ? "-" : "";
  const amount = Math.abs(value);

  if (amount >= 999_500) return `${sign}${currencySymbol}${compact(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `${sign}${currencySymbol}${compact(amount / 1_000)}k`;
  return `${sign}${currencySymbol}${Math.round(amount)}`;
}

import { isIsoDate, type StockHistoryFile } from "./format";

/**
 * How many of today's shares one share bought on `date` has become: the product of the ratios of
 * every split after that date. A split on `date` itself does not count, because that day already
 * trades at the new share count. 1 when the stock never split, the splits are unknown or the date
 * is not a date.
 */
export function splitFactorSince(history: StockHistoryFile | undefined, date: string | null): number {
  if (!history?.splits || !isIsoDate(date)) return 1;
  let factor = 1;
  for (const split of history.splits) {
    if (split.date > date) factor *= split.ratio;
  }
  return factor;
}

/** Share counts and prices that come out of the multiplication have no more digits than they need. */
export function roundQuantity(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function roundPrice(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Shares as reported at the time, restated in today's shares. */
export function adjustQuantityForSplits(quantity: number, factor: number): number {
  return roundQuantity(quantity * factor);
}

/** A share price as reported at the time, restated per today's share. */
export function adjustPriceForSplits(price: number, factor: number): number {
  return roundPrice(price / factor);
}

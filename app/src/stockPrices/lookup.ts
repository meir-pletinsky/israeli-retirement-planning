import {
  isIsoDate,
  normalizeSymbol,
  type StockHistoryFile,
  type StockIndexEntry,
  type StockIndexFile,
} from "./format";

export interface PricePoint {
  date: string;
  close: number;
}

/**
 * A price older than this many days before the asked date is not used: it would mean the
 * history ends long before that date (a delisted stock, or data that stopped updating).
 * Weekends and market holidays are never longer than this.
 */
const MAX_GAP_DAYS = 10;

const MS_PER_DAY = 86_400_000;

function daysBetween(earlier: string, later: string): number {
  return (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / MS_PER_DAY;
}

/**
 * Closing price on `date`, or on the last trading day before it when the market was closed
 * (weekend, holiday). Null when the date is invalid, before the first price, or too far past
 * the last one.
 */
export function priceOnOrBefore(history: StockHistoryFile, date: string): PricePoint | null {
  if (!isIsoDate(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null;
  const { dates, close } = history;

  let low = 0;
  let high = dates.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (dates[middle] <= date) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found < 0 || daysBetween(dates[found], date) > MAX_GAP_DAYS) return null;
  return { date: dates[found], close: close[found] };
}

/** The newest closing price in the history. */
export function latestPrice(history: StockHistoryFile): PricePoint | null {
  const last = history.dates.length - 1;
  return last < 0 ? null : { date: history.dates[last], close: history.close[last] };
}

export function findSymbol(index: StockIndexFile, raw: string): StockIndexEntry | undefined {
  const symbol = normalizeSymbol(raw);
  return symbol ? index.symbols.find((entry) => entry.symbol === symbol) : undefined;
}

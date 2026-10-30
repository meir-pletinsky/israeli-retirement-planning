/**
 * The shape of the stock price files. The daily data job (`scripts/stock-data`) writes them and the
 * app reads them, so both import this file. It must stay free of app code, because Node runs the
 * job directly on the TypeScript sources.
 */

/** Folder, next to the app's own files, that holds the generated price files. */
export const STOCK_DATA_DIR = "stock-data";

export const INDEX_FILE_NAME = "_index.json";

/**
 * Closing prices are adjusted for later stock splits and for dividends ("adjusted close"). Today's
 * price is exact, but an older price can be lower than the price actually quoted that day, by about
 * the dividends paid since. A source with real closing prices could replace this later.
 */
export const PRICE_BASIS = "adjusted-close";

export interface StockIndexEntry {
  symbol: string;
  name: string;
  firstDate: string;
  lastDate: string;
}

/** `_index.json`: every symbol that has a price file, for the suggestions in the entry form. */
export interface StockIndexFile {
  generatedAtUtc: string;
  source: string;
  symbols: StockIndexEntry[];
}

/** `<SYMBOL>.json`: one closing price per trading day, as two parallel lists sorted by date. */
export interface StockHistoryFile {
  symbol: string;
  name: string;
  /** Date of the newest price. */
  asOf: string;
  priceBasis: typeof PRICE_BASIS;
  /** ISO dates (YYYY-MM-DD), oldest first. */
  dates: string[];
  close: number[];
}

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

/** File name of a symbol's price file; characters that are not safe in a file name become "_". */
export function symbolFileName(symbol: string): string {
  return `${normalizeSymbol(symbol).replace(/[^A-Z0-9._-]/g, "_")}.json`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

/** Guards against a missing file that the host answers with an HTML page. */
export function isStockIndexFile(value: unknown): value is StockIndexFile {
  if (typeof value !== "object" || value === null) return false;
  const { symbols } = value as { symbols?: unknown };
  return (
    Array.isArray(symbols) &&
    symbols.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as StockIndexEntry).symbol === "string" &&
        typeof (entry as StockIndexEntry).name === "string",
    )
  );
}

export function isStockHistoryFile(value: unknown): value is StockHistoryFile {
  if (typeof value !== "object" || value === null) return false;
  const { symbol, dates, close } = value as Partial<StockHistoryFile>;
  return (
    typeof symbol === "string" &&
    isStringArray(dates) &&
    isFiniteNumberArray(close) &&
    dates.length === close.length
  );
}

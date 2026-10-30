import {
  PRICE_BASIS,
  normalizeSymbol,
  symbolFileName,
  type StockHistoryFile,
  type StockIndexFile,
} from "../../src/stockPrices/format.ts";

// Only `format.ts` is imported from the app: Node runs this script on the TypeScript sources, and
// that file has no imports of its own.

export interface PriceSeries {
  dates: string[];
  close: number[];
}

/** Position of each wanted column in the header row, matched without regard to case. */
export function findColumns<Name extends string>(
  header: readonly string[],
  names: readonly Name[],
  fileName: string,
): Record<Name, number> {
  const lowered = header.map((column) => column.trim().toLowerCase());
  const positions = {} as Record<Name, number>;
  for (const name of names) {
    const position = lowered.indexOf(name);
    if (position < 0) throw new Error(`Column '${name}' not found in '${fileName}'.`);
    positions[name] = position;
  }
  return positions;
}

/** Prices have four decimals: enough for a share price, and it keeps the files small. */
function roundPrice(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export interface PriceCollector {
  addRecord(record: string[]): void;
  readonly rowCount: number;
  /** Sorted by date, one price per day (the last row wins), only symbols that have a price. */
  finish(): Map<string, PriceSeries>;
}

/** Collects the rows of `sp500_stocks.csv` per symbol. The first record passed in is the header. */
export function createPriceCollector(fileName = "sp500_stocks.csv"): PriceCollector {
  let columns: Record<"date" | "symbol" | "close", number> | null = null;
  let maxColumn = 0;
  let rowCount = 0;
  const series = new Map<string, PriceSeries & { sorted: boolean }>();
  // Each date is read once per symbol; sharing one string per date keeps millions of rows small.
  const dates = new Map<string, string>();

  return {
    addRecord(record) {
      if (!columns) {
        columns = findColumns(record, ["date", "symbol", "close"] as const, fileName);
        maxColumn = Math.max(columns.date, columns.symbol, columns.close);
        return;
      }
      if (record.length <= maxColumn) return;

      const symbol = normalizeSymbol(record[columns.symbol]);
      const day = record[columns.date].trim().slice(0, 10);
      const close = Number(record[columns.close]);
      if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(close) || close <= 0) return;
      if (record[columns.close].trim() === "") return;

      let entry = series.get(symbol);
      if (!entry) {
        entry = { dates: [], close: [], sorted: true };
        series.set(symbol, entry);
      }
      let shared = dates.get(day);
      if (shared === undefined) {
        shared = day;
        dates.set(day, day);
      }
      const last = entry.dates.length - 1;
      if (last >= 0 && entry.dates[last] > shared) entry.sorted = false;
      entry.dates.push(shared);
      entry.close.push(roundPrice(close));
      rowCount += 1;
    },

    get rowCount() {
      return rowCount;
    },

    finish() {
      const result = new Map<string, PriceSeries>();
      for (const [symbol, entry] of series) {
        let order = entry.dates.map((_, position) => position);
        if (!entry.sorted) order.sort((a, b) => (entry.dates[a] < entry.dates[b] ? -1 : entry.dates[a] > entry.dates[b] ? 1 : a - b));
        const sortedDates: string[] = [];
        const sortedClose: number[] = [];
        for (const position of order) {
          const date = entry.dates[position];
          if (sortedDates[sortedDates.length - 1] === date) {
            sortedClose[sortedClose.length - 1] = entry.close[position];
          } else {
            sortedDates.push(date);
            sortedClose.push(entry.close[position]);
          }
        }
        order = [];
        if (sortedDates.length > 0) result.set(symbol, { dates: sortedDates, close: sortedClose });
      }
      return result;
    },
  };
}

/** Company names from `sp500_companies.csv` (first record is the header), by symbol. */
export function readCompanyNames(
  records: readonly string[][],
  fileName = "sp500_companies.csv",
): Map<string, string> {
  const names = new Map<string, string>();
  if (records.length === 0) return names;
  const header = records[0].map((column) => column.trim().toLowerCase());
  const symbolColumn = header.indexOf("symbol");
  const nameColumn = ["company", "name", "shortname", "longname"]
    .map((name) => header.indexOf(name))
    .find((position) => position >= 0);
  if (symbolColumn < 0 || nameColumn === undefined) {
    throw new Error(`'${fileName}' needs a 'symbol' column and a company name column.`);
  }
  for (const record of records.slice(1)) {
    const symbol = normalizeSymbol(record[symbolColumn] ?? "");
    const name = (record[nameColumn] ?? "").trim();
    if (symbol && name) names.set(symbol, name);
  }
  return names;
}

export interface DatasetOutput {
  index: StockIndexFile;
  /** Price files by file name. */
  files: Map<string, StockHistoryFile>;
}

export function buildOutput(
  series: ReadonlyMap<string, PriceSeries>,
  names: ReadonlyMap<string, string>,
  source: string,
  generatedAtUtc: string,
): DatasetOutput {
  const files = new Map<string, StockHistoryFile>();
  const index: StockIndexFile = { generatedAtUtc, source, symbols: [] };

  for (const symbol of [...series.keys()].sort()) {
    const { dates, close } = series.get(symbol)!;
    if (dates.length === 0) continue;
    const name = names.get(symbol) ?? symbol;
    const fileName = symbolFileName(symbol);
    if (files.has(fileName)) throw new Error(`Two symbols map to the file name '${fileName}'.`);

    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    files.set(fileName, { symbol, name, asOf: lastDate, priceBasis: PRICE_BASIS, dates, close });
    index.symbols.push({ symbol, name, firstDate, lastDate });
  }
  return { index, files };
}

/** A problem that should stop the data from being published, or null when it looks fine. */
export function findProblem(
  output: DatasetOutput,
  { now, maxAgeDays, minSymbols }: { now: Date; maxAgeDays: number; minSymbols: number },
): string | null {
  const count = output.index.symbols.length;
  if (count < minSymbols) {
    return `Only ${count} symbols have prices; at least ${minSymbols} are expected.`;
  }
  if (maxAgeDays > 0) {
    const newest = output.index.symbols.reduce((best, entry) => (entry.lastDate > best ? entry.lastDate : best), "");
    const ageDays = (now.getTime() - Date.parse(`${newest}T00:00:00Z`)) / 86_400_000;
    if (ageDays > maxAgeDays) {
      return `The newest price is from ${newest}, ${Math.floor(ageDays)} days ago; the source looks stale (limit ${maxAgeDays} days).`;
    }
  }
  return null;
}

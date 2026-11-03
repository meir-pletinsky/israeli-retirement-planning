import { parseDate } from "../../domain/dates";
import type { InvestmentCategory } from "../../types";

export interface HoldingCsvRow {
  /** 1-based line number in the pasted text. */
  line: number;
  /** ISO date. */
  date: string;
  /** Upper-case symbol; null for ESOP and ESPP, whose symbol is entered once beside the text. */
  symbol: string | null;
  quantity: number;
  /** Null when the price is missing or zero, so it still has to be estimated or provided. */
  priceUsd: number | null;
}

export interface HoldingCsvResult {
  rows: HoldingCsvRow[];
  /** Lines that could not be read; they are left out of `rows`. */
  ignored: number;
}

type Column = "date" | "symbol" | "quantity" | "price";

const HEADER_ALIASES: Record<Column, readonly string[]> = {
  date: ["date", "purchasedate", "grantdate", "tradedate", "buydate", "acquired"],
  symbol: ["symbol", "ticker", "stock", "security"],
  quantity: ["quantity", "qty", "shares", "units", "numberofshares"],
  price: [
    "price",
    "shareprice",
    "pricepershare",
    "purchaseprice",
    "cost",
    "costbasis",
    "grantprice",
    "fmv",
  ],
};

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

/** The separator most lines use; on a tie tab beats semicolon beats comma. */
function detectDelimiter(lines: readonly string[]): string {
  let best = ",";
  let bestCount = 0;
  for (const delimiter of ["\t", ";", ","]) {
    const count = lines.filter((line) => line.includes(delimiter)).length;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

function columnOf(cell: string): Column | null {
  const name = cell.toLowerCase().replace(/[^a-z]/g, "");
  for (const column of Object.keys(HEADER_ALIASES) as Column[]) {
    if (HEADER_ALIASES[column].includes(name)) return column;
  }
  return null;
}

/** The column each cell of a first line names, or null when that line is not a header. */
function readHeader(cells: readonly string[]): (Column | null)[] | null {
  const columns = cells.map(columnOf);
  return columns.includes("date") && columns.includes("quantity") ? columns : null;
}

function parseSymbol(text: string): string | null {
  const symbol = text.trim().replace(/^\$/, "").toUpperCase();
  return /^[A-Z0-9][A-Z0-9.\-_]{0,14}$/.test(symbol) ? symbol : null;
}

/** Numbers use a dot as the decimal point whatever the locale; a comma only groups thousands. */
function parsePositiveNumber(text: string): number | null {
  const cleaned = text.replace(/[$\s\u00a0]/g, "");
  let value: number;
  if (/^(\d+(\.\d+)?|\.\d+)$/.test(cleaned)) value = Number(cleaned);
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) value = Number(cleaned.replace(/,/g, ""));
  else return null;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Reads pasted purchases: one per line with a date, a quantity, an optional share price and, for
 * private purchases, a symbol. Lines that cannot be read are counted and skipped.
 */
export function parseHoldingCsv(text: string, category: InvestmentCategory): HoldingCsvResult {
  const withSymbol = category === "personalBrokeragePurchase";
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\r|\n/)
    .map((content, index) => ({ content: content.trim(), line: index + 1 }))
    .filter(({ content }) => content.trim() !== "");
  if (lines.length === 0) return { rows: [], ignored: 0 };

  const delimiter = detectDelimiter(lines.map(({ content }) => content));
  const table = lines.map(({ content, line }) => ({ line, cells: splitLine(content, delimiter) }));

  const header = readHeader(table[0].cells);
  const body = header ? table.slice(1) : table;
  const order: readonly (Column | null)[] =
    header ?? (withSymbol ? ["date", "symbol", "quantity", "price"] : ["date", "quantity", "price"]);

  const rows: HoldingCsvRow[] = [];
  let ignored = 0;
  for (const { line, cells } of body) {
    const cell = (column: Column) => {
      const at = order.indexOf(column);
      return at === -1 ? "" : (cells[at] ?? "");
    };
    // Spreadsheets often leave a blank cell before the price; take the next filled cell that
    // no other column claims.
    const priceText = () => {
      const at = order.indexOf("price");
      if (at === -1) return "";
      for (let i = at; i < cells.length; i++) {
        if (i > at && order[i]) break;
        if (cells[i] !== "") return cells[i];
      }
      return "";
    };
    const date = parseDate(cell("date"), { twoDigitYear: true });
    const quantity = parsePositiveNumber(cell("quantity"));
    const symbol = withSymbol ? parseSymbol(cell("symbol")) : null;
    if (date === null || quantity === null || (withSymbol && symbol === null)) {
      ignored++;
      continue;
    }
    rows.push({ line, date, symbol, quantity, priceUsd: parsePositiveNumber(priceText()) });
  }
  return { rows, ignored };
}

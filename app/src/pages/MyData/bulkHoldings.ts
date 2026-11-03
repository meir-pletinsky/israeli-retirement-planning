import type { StockHistoryFile } from "../../stockPrices/format";
import { latestPrice, priceOnOrBefore } from "../../stockPrices/lookup";
import type { InvestmentCategory, StockHolding, VestingSchedule } from "../../types";
import { createEmptyStockHolding } from "../../types";
import type { HoldingCsvRow } from "./holdingCsv";
import { entryDatePatch, entryPricePatch, withVestingTranches } from "./holdingEntry";

export interface BulkHoldingsInput {
  category: InvestmentCategory;
  rows: readonly HoldingCsvRow[];
  /** The single symbol of an ESOP or ESPP bulk entry; private purchases take theirs from each row. */
  symbol: string;
  /** Vesting schedule shared by every ESOP row. */
  vestingSchedule: VestingSchedule;
  histories: ReadonlyMap<string, StockHistoryFile>;
}

/** The share price a row was given, or the closing price on its date when the stock's history has one. */
export function rowPrice(
  row: HoldingCsvRow,
  symbol: string,
  histories: ReadonlyMap<string, StockHistoryFile>,
): { price: number | null; estimated: boolean } {
  if (row.priceUsd !== null) return { price: row.priceUsd, estimated: false };
  const history = histories.get(symbol);
  const close = history ? priceOnOrBefore(history, row.date)?.close : undefined;
  return close === undefined ? { price: null, estimated: false } : { price: close, estimated: true };
}

/** One new holding per row. Prices left empty stay null for the person to provide later. */
export function buildBulkHoldings({
  category,
  rows,
  symbol,
  vestingSchedule,
  histories,
}: BulkHoldingsInput): StockHolding[] {
  return rows.map((row) => {
    const rowSymbol = (category === "personalBrokeragePurchase" ? row.symbol : symbol) ?? "";
    const history = histories.get(rowSymbol);
    let holding: StockHolding = {
      ...createEmptyStockHolding(),
      investmentCategory: category,
      tickerSymbol: rowSymbol,
      quantity: row.quantity,
    };
    holding = { ...holding, ...entryDatePatch(holding, row.date) };
    holding = { ...holding, ...entryPricePatch(holding, rowPrice(row, rowSymbol, histories).price) };
    if (history) {
      const current = latestPrice(history)?.close ?? null;
      holding = {
        ...holding,
        currentMarketPriceUSD: current,
        companyName: history.name !== history.symbol ? history.name : "",
      };
    }
    if (category === "employerGrantedStock") {
      holding = withVestingTranches({
        ...holding,
        employerGrantDetails: { ...holding.employerGrantDetails, vestingSchedule },
      });
    }
    return holding;
  });
}

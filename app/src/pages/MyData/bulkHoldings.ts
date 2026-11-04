import type { StockHistoryFile } from "../../stockPrices/format";
import { latestPrice, priceOnOrBefore } from "../../stockPrices/lookup";
import {
  adjustPriceForSplits,
  adjustQuantityForSplits,
  splitFactorSince,
} from "../../stockPrices/splits";
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
  /** True when the rows give shares and prices as reported at the time, before later splits. */
  asReported: boolean;
}

export interface ResolvedRow {
  quantity: number;
  /** Per today's share; null when the row has none and the stock's history has no price for the date. */
  price: number | null;
  estimated: boolean;
  /** How many of today's shares one share of the row's date has become; 1 when no split applies. */
  factor: number;
}

/**
 * What a row becomes: its quantity and price restated in today's shares when `asReported`, and the
 * closing price on its date (already split-adjusted) when it gave no price.
 */
export function resolveRow(
  row: HoldingCsvRow,
  symbol: string,
  histories: ReadonlyMap<string, StockHistoryFile>,
  asReported: boolean,
): ResolvedRow {
  const history = histories.get(symbol);
  const factor = asReported ? splitFactorSince(history, row.date) : 1;
  const quantity = factor === 1 ? row.quantity : adjustQuantityForSplits(row.quantity, factor);
  if (row.priceUsd !== null) {
    const price = factor === 1 ? row.priceUsd : adjustPriceForSplits(row.priceUsd, factor);
    return { quantity, price, estimated: false, factor };
  }
  const close = history ? priceOnOrBefore(history, row.date)?.close : undefined;
  return { quantity, price: close ?? null, estimated: close !== undefined, factor };
}

/** One new holding per row. Prices left empty stay null for the person to provide later. */
export function buildBulkHoldings({
  category,
  rows,
  symbol,
  vestingSchedule,
  histories,
  asReported,
}: BulkHoldingsInput): StockHolding[] {
  return rows.map((row) => {
    const rowSymbol = (category === "personalBrokeragePurchase" ? row.symbol : symbol) ?? "";
    const history = histories.get(rowSymbol);
    const resolved = resolveRow(row, rowSymbol, histories, asReported);
    let holding: StockHolding = {
      ...createEmptyStockHolding(),
      investmentCategory: category,
      tickerSymbol: rowSymbol,
      quantity: resolved.quantity,
    };
    holding = { ...holding, ...entryDatePatch(holding, row.date) };
    holding = { ...holding, ...entryPricePatch(holding, resolved.price) };
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
